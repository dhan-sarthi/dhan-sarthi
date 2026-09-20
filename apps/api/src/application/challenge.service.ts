/**
 * Spending challenges: the one that is running, and everything the wizard needs to start another.
 *
 * Almost nothing is stored. The row carries five scalars — the target, the limit, the length and
 * the day it started — and every figure on the screen is read back off the statement on each
 * request by `challengeProgress`. That is the whole design decision in this file, and it is
 * worth the recomputation: a stored `spent` would be a second opinion about the transactions it
 * was derived from, and the moment the reviewer winds the clock back a week the two would
 * disagree, with the stored one insisting the customer had lost a challenge they had not yet
 * run. Nothing persisted means nothing to fall out of step.
 *
 * The view answers the running challenge and the wizard's four steps together, always. That
 * looks wasteful and is not: the targets, the lengths and the running challenge's progress all
 * fall out of the same single pass over the same statement, and a wizard that fetched per step
 * would trade one computed answer for four round trips and three loading states.
 *
 * The written check-in — what Cleo calls the Challenge tip — is composed here rather than on the
 * client, for the same reason the challenge's name is: two clients deciding independently
 * whether somebody is ahead is two definitions of ahead, and this one is arguable enough to be
 * worth having exactly once. It compares what has been spent against the share of the limit the
 * elapsed days have earned, not against the limit itself.
 */
import { randomUUID } from 'node:crypto'
import {
  CHALLENGE_WINDOW_DAYS,
  addDays,
  baselineFor,
  challengeProgress,
  repeatedSaving,
  suggestLimits,
  topSpendTargets,
} from '@dhan/core'
import type { ChallengeProgress, SpendTarget, TargetSpend, Transaction } from '@dhan/core'
import type {
  ActiveChallenge,
  ChallengeDraft,
  ChallengeQuote,
  ChallengeQuoteQuery,
  ChallengeView,
  TargetSpend as WireTargetSpend,
} from '@dhan/contracts'
import type { AdvisoryService, ServerView } from './advisory.service.ts'
import {
  ChallengeAlreadyRunning,
  ChallengeNotFound,
  NothingToChallenge,
  StaleClock,
} from './errors.ts'
import type { Clock, Session, SessionStore, StoredChallenge } from '../ports/index.ts'

/**
 * The lengths on offer, and why the middle one is the recommendation.
 *
 * A week is too short to change a habit and long enough only to prove the customer can hold
 * their breath. Three weeks is the one that actually moves a habit, and is also the one most
 * people abandon on day nine. Two weeks is the one that finishes while the decision to start
 * it is still remembered, which is why it is the recommendation.
 *
 * All three are multiples of seven, and that is not a coincidence: the day grid on the
 * challenge card is seven columns wide, so a length that is not a whole number of weeks draws
 * a ragged last row and makes the customer count dots to work out where they are.
 *
 * The labels say how hard it will be rather than how long it is — the day count is printed
 * beside them anyway, and "21 days" tells a customer nothing they cannot already see.
 */
const LENGTHS: readonly { days: number; label: string; recommended: boolean }[] = [
  { days: 7, label: 'A gentle start', recommended: false },
  { days: 14, label: 'Long enough to count', recommended: true },
  { days: 21, label: 'Properly hard', recommended: false },
]

/** The lines behind the limit, as many as a screen can be scrolled through without paging. */
const MAX_LISTED_TRANSACTIONS = 20

export interface ChallengeServiceDeps {
  sessions: SessionStore
  advisory: AdvisoryService
  /** Wall clock, for the audit stamp on a started challenge. The simulated date is `startDate`. */
  clock: Clock
}

export class ChallengeService {
  private readonly deps: ChallengeServiceDeps

  constructor(deps: ChallengeServiceDeps) {
    this.deps = deps
  }

  async view(session: Session): Promise<ChallengeView> {
    const server = await this.deps.advisory.view(session)
    return this.compose(session, server, session.challenge)
  }

  /**
   * What limits to offer for one target over one length.
   *
   * Pure: it reads the statement and writes nothing, which is why it rides on a query string.
   * A target with nothing behind it answers with no options rather than an error — the wizard
   * asks this again on every tap of a different length, and a 422 on a tap is a dialog over a
   * screen the customer is still making their mind up on. `start` is where refusing belongs.
   */
  async quote(session: Session, q: ChallengeQuoteQuery): Promise<ChallengeQuote> {
    const server = await this.deps.advisory.view(session)
    const target: SpendTarget = { kind: q.kind, name: q.name }
    const baseline = baselineFor(
      recentSpend(target, server.file.transactions, session.asOf),
      q.days,
    )
    const options = suggestLimits(baseline, q.days)
    const recommended = options.find((o) => o.recommended)

    return {
      target,
      days: q.days,
      baseline,
      options,
      repeated: repeatedSaving(recommended?.predictedSaving ?? 0, q.days),
    }
  }

  /**
   * Start a challenge on one target, beginning today.
   *
   * One at a time, and the check is against whether the stored one has *finished* rather than
   * against whether the row is there: a completed challenge nobody has dismissed should not
   * stand in the way of the next one, which is the whole habit the feature is trying to build.
   */
  async start(session: Session, draft: ChallengeDraft): Promise<ChallengeView> {
    const server = await this.deps.advisory.view(session)
    const txns = server.file.transactions

    const running = session.challenge
    if (running !== null && !progressOf(running, txns, session.asOf).complete) {
      throw new ChallengeAlreadyRunning(running.name)
    }

    // Nothing to challenge is a real answer, not a validation failure: the target is well formed
    // and the customer has simply not spent anything there in four weeks, so there is no
    // baseline to set a limit against and no saving to predict.
    const recent = recentSpend(draft.target, txns, session.asOf)
    if (recent.spent <= 0) throw new NothingToChallenge(draft.target.name)

    const started: StoredChallenge = {
      id: `ch_${randomUUID()}`,
      kind: draft.target.kind,
      name: draft.target.name,
      limit: Math.round(draft.limit),
      days: draft.days,
      startDate: session.asOf,
      createdAt: this.deps.clock.now().toISOString(),
    }

    const updated = await this.patch(session, { challenge: started })
    return this.compose(updated, server, started)
  }

  /**
   * Give up on the running challenge.
   *
   * The id is checked rather than "end whatever is running". A customer who left the screen open
   * while the challenge completed and then tapped the button would otherwise end the one they
   * started afterwards, and a 404 is the honest answer — the thing they were looking at is not
   * there any more.
   */
  async end(session: Session, challengeId: string): Promise<void> {
    if (session.challenge === null || session.challenge.id !== challengeId) {
      throw new ChallengeNotFound(challengeId)
    }
    await this.patch(session, { challenge: null })
  }

  /** The whole screen from one pass over the statement. No I/O. */
  private compose(
    session: Session,
    server: ServerView,
    running: StoredChallenge | null,
  ): ChallengeView {
    const asOf = session.asOf
    const txns = server.file.transactions
    const found = topSpendTargets(txns, asOf, CHALLENGE_WINDOW_DAYS)

    /*
     * Exactly one target across both lists carries `recommended`, and it is the biggest merchant
     * where there is one.
     *
     * A merchant beats a category because a challenge is kept by recognising the moment you are
     * about to break it: "₹2,400 on Swiggy" is a decision the customer makes with their thumb
     * over the order button, and "₹2,400 on Eating out" is one they can only audit afterwards.
     * The category list is the fallback for the customer whose narrations nothing recognised.
     */
    const pick = found.merchants[0]?.target ?? found.categories[0]?.target ?? null

    return {
      active: running === null ? null : this.active(running, txns, asOf),
      targets: {
        merchants: found.merchants.map((t) => toWireTarget(t, pick)),
        categories: found.categories.map((t) => toWireTarget(t, pick)),
      },
      lengths: LENGTHS.map((l) => ({ ...l })),
      windowDays: CHALLENGE_WINDOW_DAYS,
      asOf,
    }
  }

  private active(
    running: StoredChallenge,
    txns: readonly Transaction[],
    asOf: string,
  ): ActiveChallenge {
    const target: SpendTarget = { kind: running.kind, name: running.name }
    const p = progressOf(running, txns, asOf)
    const baseline = baselineFor(recentSpend(target, txns, asOf), p.days)
    const byId = new Map(txns.map((t) => [t.txnId, t]))

    return {
      id: running.id,
      target,
      // Built here so both clients say the same thing over the same challenge.
      name: `${running.name} Challenge`,
      limit: p.limit,
      days: p.days,
      startDate: running.startDate,
      endDate: p.endDate,
      dayIndex: p.dayIndex,
      spent: p.spent,
      remaining: p.remaining,
      overspent: p.overspent,
      daily: p.daily,
      zeroDays: p.zeroDays,
      longestZeroStreak: p.longestZeroStreak,
      complete: p.complete,
      won: p.won,
      predictedSaving: Math.max(0, baseline - p.limit),
      transactions: p.txnIds
        .map((id) => byId.get(id))
        .filter((t): t is Transaction => t !== undefined)
        .slice(0, MAX_LISTED_TRANSACTIONS),
      tip: tipFor(target, p),
    }
  }

  /** A patch against the version the caller holds; a stale caller is told to refetch. */
  private async patch(
    session: Session,
    patch: Parameters<SessionStore['patch']>[1],
  ): Promise<Session> {
    const updated = await this.deps.sessions.patch(session.id, patch, session.version)
    if (!updated) {
      const current = await this.deps.sessions.getById(session.id)
      throw new StaleClock(current?.version ?? session.version)
    }
    return updated
  }
}

function progressOf(
  running: StoredChallenge,
  txns: readonly Transaction[],
  asOf: string,
): ChallengeProgress {
  return challengeProgress(
    {
      target: { kind: running.kind, name: running.name },
      limit: running.limit,
      days: running.days,
      startDate: running.startDate,
    },
    txns,
    asOf,
  )
}

/**
 * What one target cost over the last four weeks.
 *
 * Asked by running `challengeProgress` over a four-week window ending today rather than by
 * counting the transactions here. `topSpendTargets` only answers for the three biggest of each
 * kind, and the wizard can be pointed at any target the customer has already picked — but the
 * rules about which debits count, which are self-transfers and where the window's edges fall
 * live in exactly one place, and reimplementing three lines of them beside it is how the
 * baseline on the quote screen and the spend on the progress screen come to differ by a day.
 */
function recentSpend(target: SpendTarget, txns: readonly Transaction[], asOf: string): TargetSpend {
  const p = challengeProgress(
    {
      target,
      limit: 0,
      days: CHALLENGE_WINDOW_DAYS,
      startDate: addDays(asOf, -(CHALLENGE_WINDOW_DAYS - 1)),
    },
    txns,
    asOf,
  )
  return { target, spent: p.spent, occurrences: p.txnIds.length }
}

function toWireTarget(spend: TargetSpend, pick: SpendTarget | null): WireTargetSpend {
  return {
    target: spend.target,
    spent: spend.spent,
    occurrences: spend.occurrences,
    recommended:
      pick !== null && pick.kind === spend.target.kind && pick.name === spend.target.name,
  }
}

const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`

/**
 * The written check-in.
 *
 * `ahead` and `behind` are measured against the share of the limit the elapsed days have earned
 * — `limit × dayIndex / days` — and not against the limit itself, because a customer three days
 * into a four-week challenge is under the limit by definition and telling them so says nothing.
 *
 * `early` is the first day with nothing on it yet, where there is no pace to be ahead or behind
 * of. A customer who spends half the limit on the morning of day one is not early, they are
 * behind, and the tone has to say so on the day it happened rather than wait for day two.
 */
function tipFor(target: SpendTarget, p: ChallengeProgress): ActiveChallenge['tip'] {
  const daysLeft = Math.max(0, p.days - p.dayIndex)

  if (p.complete) {
    return p.won === true
      ? {
          headline: 'You won it.',
          detail: `${inr(p.spent)} on ${target.name} against a ${inr(p.limit)} limit. That is ${inr(p.limit - p.spent)} that stayed where it was.`,
          tone: 'ahead',
        }
      : {
          headline: 'Not this one.',
          detail: `You finished ${inr(p.spent - p.limit)} over. ${p.zeroDays} of the ${p.days} days had nothing on ${target.name} at all, which is the part worth keeping.`,
          tone: 'behind',
        }
  }

  if (p.overspent) {
    return {
      headline: 'Over the limit.',
      detail: `${inr(p.spent)} on ${target.name} against ${inr(p.limit)}, with ${daysLeft} days still to run. Spending only goes one way, so this one is gone — but the streak is not.`,
      tone: 'behind',
    }
  }

  if (p.dayIndex <= 1 && p.spent === 0) {
    return {
      headline: 'Day one.',
      detail: `${inr(p.limit)} on ${target.name} to last ${p.days} days. Nothing on it yet.`,
      tone: 'early',
    }
  }

  const share = (p.limit * p.dayIndex) / p.days
  if (p.spent <= share) {
    return {
      headline: 'You are ahead.',
      detail: `Day ${p.dayIndex} of ${p.days} and ${inr(p.spent)} of ${inr(p.limit)} spent. ${inr(p.remaining)} left for the last ${daysLeft} days.`,
      tone: 'ahead',
    }
  }

  return {
    headline: 'Behind the pace.',
    detail: `Day ${p.dayIndex} of ${p.days} and ${inr(p.spent)} of ${inr(p.limit)} spent — ${inr(p.spent - share)} more than the pace. ${inr(p.remaining)} left for the last ${daysLeft} days.`,
    tone: 'behind',
  }
}
