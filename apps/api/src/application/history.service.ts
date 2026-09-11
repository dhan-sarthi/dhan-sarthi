/**
 * The months behind today.
 *
 * A customer who opens this app has been a customer for years, and the app they open should look
 * like it. Everything else here already does — the ledger is twenty-four months long, the
 * commitments were found in it, the spending chart has eleven months to draw. The *advice* trail
 * was the one surface that started at zero: Record said "Nothing yet", Plan said "version 1", and
 * the roadmap's every stage began this morning. That is not a customer with a plan; it is an
 * install.
 *
 * So a new session is walked forward through the months it missed. For each one the clock is set
 * back, **the real engine runs** — derive, cut a roadmap, build the daily plan — and the decisions
 * that customer made go through `DecisionService.decide`, which is the same path the button on
 * Today takes: the same gate, the same advice record, the same hash chain. Nothing here writes a
 * row the app could not have written itself.
 *
 * Three rules keep it from becoming fiction.
 *
 * **Every figure is derived, none is asserted.** This file contains no rupee amounts, no product
 * ids and no sentences the customer was shown. It picks *which* action was decided and *what* was
 * decided about it; the engine supplies everything else, at the snapshot of the month in question.
 *
 * **A recorded acceptance has to be visible in today's state.** Accepting a term policy would put
 * "Accepted · ₹1 crore of cover" on the record beside a Holdings pane with no cover on it and a
 * plan whose first stage is still "Get covered" — three screens disagreeing about one fact. So the
 * money recommendations are deferred or declined, which is both true of this data and the more
 * useful story: the customer has been putting it off, and today's card is the fifth time of
 * asking. The one acceptance that *is* kept is the spending cap, because `decide` really does set
 * one and the cap really does show up on Spending afterwards.
 *
 * **It is the customer's history, not the reviewer's.** The clock ends where `create` left it and
 * `lastSeen` with it, so the session that comes back is the one the caller asked for, with a past
 * behind it.
 */
import { addDays, addMonths } from '@dhan/core'
import type { ActionKind, DecisionKind } from '@dhan/contracts'
import type { AdvisoryService } from './advisory.service.ts'
import type { DecisionService } from './decision.service.ts'
import { Conflict, NotFound } from './errors.ts'
import type { Session, SessionStore } from '../ports/index.ts'
import type { Logger } from '../infra/logger.ts'

/** Where the clock was set back to, relative to the session's own as-of, month by month. */
const MONTH_STEP = 1

/**
 * What the customer did about each kind of recommendation.
 *
 * Read the second rule at the top of this file before changing one of these to `did_it`: a
 * decision recorded here is a claim the rest of the app has to still agree with months later.
 */
const DECIDED: Record<ActionKind, DecisionKind> = {
  // Behavioural, and its effect is stored: `decide` writes the cap, and Spending draws it.
  set_category_cap: 'did_it',
  // Nothing in the app's state contradicts having spoken to somebody.
  talk_to_rm: 'did_it',
  // Still on the statement every month, which is exactly why it is still being suggested.
  cancel_subscription: 'declined',
  // Money. Every one of these would have to show up in the holdings block or the ledger.
  open_sweep_in: 'deferred',
  start_ssp: 'deferred',
  move_to_liquid_fund: 'deferred',
  start_sip: 'deferred',
  increase_sip: 'deferred',
  pause_sip: 'declined',
  buy_term_cover: 'pushed_back',
  enrol_pmjjby: 'deferred',
  buy_health_cover: 'deferred',
  pay_down_card: 'deferred',
}

export interface HistoryDeps {
  advisory: AdvisoryService
  decisions: DecisionService
  sessions: SessionStore
  /** How many months of use to lay down behind today. Zero means a session with no past. */
  months: number
  log: Logger
}

export class HistoryService {
  private readonly deps: HistoryDeps

  constructor(deps: HistoryDeps) {
    this.deps = deps
  }

  /**
   * Lay the months behind this session, and hand back the session as it stands afterwards.
   *
   * Never throws. A history that could not be written is a session with a thinner Record, and
   * failing session creation over it would take the whole app down for a cosmetic reason — so a
   * failure is logged and the caller gets the session it would have had.
   */
  async seed(session: Session): Promise<Session> {
    const { months, log } = this.deps
    if (months <= 0) return session

    const home = { asOf: session.asOf, lastSeen: session.lastSeen }
    let current = session
    try {
      for (let back = months; back >= MONTH_STEP; back -= MONTH_STEP) {
        const at = addMonths(home.asOf, -back)
        current = await this.moveTo(current, at)
        current = await this.decideAt(current, back)
      }
    } catch (err) {
      log.warn({ err, sessionId: session.id }, 'could not seed session history')
    }

    // Home again whatever happened above, so a half-written history never leaves the clock in
    // the past — every screen in the app reads `asOf`, and a session stuck in March is a bug
    // that would look like a data problem.
    try {
      return await this.moveTo(current, home.asOf, home.lastSeen)
    } catch {
      return current
    }
  }

  /** The clock, moved. `lastSeen` trails it by a week, as `create` and `advanceClock` both do. */
  private async moveTo(session: Session, asOf: string, lastSeen?: string): Promise<Session> {
    const patched = await this.deps.sessions.patch(
      session.id,
      { asOf, lastSeen: lastSeen ?? addDays(asOf, -6) },
      session.version,
    )
    return patched ?? (await this.reread(session))
  }

  /** One month's decisions, through the same service the button on Today calls. */
  private async decideAt(session: Session, back: number): Promise<Session> {
    const view = await this.deps.advisory.view(session)
    let current = session
    for (const action of chosen(view.plan.primary, view.plan.secondary, back)) {
      try {
        await this.deps.decisions.decide(current, action.id, DECIDED[action.kind])
      } catch (err) {
        // A decision the engine no longer offers, or one already on the record. Both are
        // ordinary here and neither is a reason to stop laying down the rest of the history.
        if (!(err instanceof NotFound) && !(err instanceof Conflict)) throw err
      }
      // `decide` can patch the session itself — accepting a cap writes one — so the version
      // this loop holds is stale from here on.
      current = await this.reread(current)
    }
    return current
  }

  private async reread(session: Session): Promise<Session> {
    return (await this.deps.sessions.getById(session.id)) ?? session
  }
}

/**
 * Which of the month's recommendations the customer engaged with.
 *
 * One a month, cycling through the cards that month offered. Two things fall out of that and both
 * matter more than they look. A person does not sit down and clear the whole list, so a month with
 * one decision on it reads as a person; and cycling means the trail is eight different sentences
 * rather than the same one deferred eight times, which reads as a loop rather than a history.
 *
 * The cycle is the month index, not a random draw, so the same customer opened twice has the same
 * past — the record is hash-chained and a trail that shuffled between reads would be the one thing
 * on this screen that cannot be checked.
 */
function chosen(
  primary: Decidable | null,
  secondary: readonly Decidable[],
  back: number,
): Decidable[] {
  const offered = [...(primary ? [primary] : []), ...secondary]
  if (offered.length === 0) return []
  const at = offered[back % offered.length]
  return at ? [at] : []
}

/** All this file needs of an action: which one it is, and what sort of thing it asks for. */
interface Decidable {
  id: string
  kind: ActionKind
}
