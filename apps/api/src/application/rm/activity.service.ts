/**
 * Owned by the activity builder.
 *
 * What happened behind the book: each customer's journey, their record, the handoffs, the RM's
 * notes and reveals, and the access log. Two kinds of caller read it:
 *
 * - **The console's own reads** (`facts`, `handoffs`, `refusalItems`, `monthlyActivity`) feed
 *   the Book, Today and Insights pages, which `console.service.ts` assembles. Those four must
 *   never throw: a customer with nothing on record answers `NO_ACTIVITY`, and a book whose
 *   journeys are still being simulated answers what exists so far. A page that fails because a
 *   journey is late is worse than a page that says "no activity yet".
 * - **The activity routes** (`journey` … `accessLog`), registered in
 *   `http/routes/rm-activity.ts`. Every `:cif` route has already been checked against the book
 *   in its handler before it reaches a method here; `updateHandoff` names no cif in its path,
 *   so it checks the handoff's customer itself with `scope.assertInBook`.
 *
 * Everything is read fresh from the customer's own record on every call: every session the
 * customer has had (`SessionStore.listByCif`, reviewer sessions and the simulator's journey
 * session alike), each session's advice chain and decisions, its plan versions, and the desk's
 * own append-only notes, handoff statuses and access log. Nothing is cached that a tap in the
 * mobile app could make stale, which is what lets a reviewer's "Talk to your relationship
 * manager" reach Meera's inbox on her next read. Reads only, apart from the three writes the
 * routes ask for (a note, a handoff's status, a reveal), each of which is also an access entry.
 *
 * What a handoff is. Every `talk_to_rm` decided `did_it`, on any session. Seeded history writes
 * those too (`history.service.ts` decides one most months, as "the customer spoke to somebody"),
 * so a request the desk never touched counts as open only for `HISTORY_RESOLVED_DAYS` after it
 * was made: older than that, it is history's own claim that the conversation happened, and it is
 * shown as resolved. The simulator's recent handoffs and a reviewer's own tap are inside the
 * window, and they are the requests a desk should see. Where the history is known the line is
 * drawn exactly rather than by age (`Request.history`): on a journey session the simulator's walk
 * ends on the session's `lastSeen` (its completion marker), and every request on or before it is
 * the history's own; on a reviewer's session every request before the day it opened on was
 * seeded. Only a request made after those (the fixtures' recent one, a reviewer's tap) can be
 * open.
 *
 * One history per customer (`oneHistory`). A hero the simulator walked on a memory boot and a
 * reviewer then opened has two sessions over the same months, each with its own decisions on the
 * same snapshots, and two reviewers on one hero each seeded the same months. The most recent
 * reviewer's is what the customer was shown, so in the months it covers every other session's
 * seeded rows are left out of the journey, the activity facts, the monthly counts and the
 * handoffs. The record is not: `customerRecord`, the refusals and the chain walks read every row
 * on every chain, because a record with rows hidden proves nothing.
 */
import {
  SIGNAL_LABELS,
  addMonths,
  dateLabel,
  daysBetween,
  findInsights,
  goalLabel,
  monthName,
  plural,
  refusalsByRule,
  revoice,
  ruleBook,
  ruleLabel,
  toSignals,
} from '@dhan/core'
import type { Insight, Signal } from '@dhan/core'
import type {
  AdviceItem,
  AdviceRecord,
  AvatarSessionRecord,
  DecisionKind,
  DecisionRecord,
  Handoff,
  HandoffStatus,
  IsoDate,
  JourneyDiff,
  JourneyEvent,
  RmAccessLog as RmAccessLogResponse,
  RmBookVerification,
  RmCustomerRecord,
  RmCustomerVerification,
  RmHandoffPatch,
  RmHandoffResponse,
  RmJourney,
  RmNoteRequest,
  RmNoteResponse,
  RmRefusals,
  RmRevealRequest,
  RmRevealResponse,
  Timestamp,
} from '@dhan/contracts'
import { FIRST_PLAN_REASON } from '../advisory.service.ts'
import { NotFound } from '../errors.ts'
import type { Logger } from '../../infra/logger.ts'
import type {
  AuditStore,
  AuditTrail,
  BankDataPort,
  Clock,
  HandoffStatusChange,
  ProductShelfPort,
  RmActivityPort,
  RmDeskPort,
  RmNote,
  RoadmapVersion,
  Session,
  SessionStore,
  SnapshotStore,
} from '../../ports/index.ts'
import type { RmAccessLog } from './access-log.ts'
import type { RmBookScope } from './book-scope.ts'
import type { RmBookService } from './book.service.ts'
import type { RmCaller } from './caller.ts'
import { isJourney } from './simulator.ts'

/** What the book row, the strength badge and the attrition watch need to know per customer. */
export interface ActivityFacts {
  /**
   * The latest simulated date of anything the customer or the desk did, on the customer's one
   * history: a decision, a product question, a call, a note, a contact, or the day a reviewer's
   * session stands at (a person has the app open on that day). Null where nothing is on record.
   */
  lastActivityAt: IsoDate | null
  /** A SIP the customer paused (an accepted `pause_sip`), for the attrition watch. */
  sipPaused: boolean
  /** Advice records with verdict BLOCKED across every session the customer has had. */
  refusals: number
  /** A request to talk to the RM that nobody has contacted or resolved yet. */
  openHandoff: boolean
  /** Real avatar calls only; calls are never simulated. */
  udayCalls: number
  lastCallAt: Timestamp | null
}

export const NO_ACTIVITY: ActivityFacts = {
  lastActivityAt: null,
  sipPaused: false,
  refusals: 0,
  openHandoff: false,
  udayCalls: 0,
  lastCallAt: null,
}

/**
 * A request nobody at the desk has touched counts as open for this long, and as resolved after.
 *
 * Seeded history decides a `talk_to_rm` most months and records it as done, so without a cut-off
 * every customer would carry a year of "open" requests that history itself says were dealt with.
 * Thirty days is under the month between two history decisions, so the most recent of them,
 * a month before the RM clock, is already history; a request made in the app this month is not.
 */
export const HISTORY_RESOLVED_DAYS = 30

/** How many access entries the log page reads. */
const ACCESS_LOG_LIMIT = 200
/** How long the population's names and ledger ends are trusted in process. A reseed shows up within it. */
const NAMES_TTL_MS = 60_000
/** Insights per snapshot, kept because a snapshot never changes once written. */
const INSIGHT_MEMO_SIZE = 512

const DECIDED: Readonly<Record<DecisionKind, string>> = {
  did_it: 'Did it',
  declined: 'Declined',
  deferred: 'Put off',
  pushed_back: 'Pushed back',
}

const STATUS_WORD: Readonly<Record<HandoffStatus, string>> = {
  open: 'Open',
  contacted: 'Contacted',
  resolved: 'Resolved',
}

/** Every session a customer has had, with what each one's record holds. */
interface CustomerRecordSet {
  cif: string
  sessions: Session[]
  /** One per session, in the same order. */
  trails: AuditTrail[]
}

/** A session's plan versions, oldest first, read at most once per call. */
type VersionsReader = (sessionId: string) => Promise<RoadmapVersion[]>

/** A `talk_to_rm` the customer said yes to, and the session it is on. */
interface Request {
  cif: string
  session: Session
  decision: DecisionRecord
  /**
   * Laid down as the customer's past, not asked: on a journey session, on or before the day its
   * walk ended (`lastSeen`, the completion marker); on a reviewer's session, before the day it
   * was opened on (its seeded months). History's own claim that the conversation happened, so
   * never open.
   */
  history: boolean
}

/**
 * The customer's one history: the record set with the simulated rows that another session also
 * covers left out (`oneHistory`), and the same test for plan versions, which are read apart.
 */
interface History extends CustomerRecordSet {
  /** Every row on every session, for what counts the record (refusals). */
  record: CustomerRecordSet
  /** Whether a row dated `atSim` on `sessionId` is on the one history. */
  keeps: (sessionId: string, atSim: IsoDate) => boolean
  /** The day `create` opens a session for this customer on: a reviewer's rows before it are seeded. */
  home: IsoDate
}

export interface RmActivityDeps {
  bank: BankDataPort
  sessions: SessionStore
  snapshots: SnapshotStore
  audit: AuditStore
  activity: RmActivityPort
  scope: RmBookScope
  book: RmBookService
  accessLog: RmAccessLog
  /** Product names for the record: the advice row carries the id. */
  shelf: ProductShelfPort
  /** RM names for notes and contacts written by someone other than the caller. */
  desk: RmDeskPort
  clock: Clock
  log: Logger
}

/**
 * A handoff's status: its last change at the desk, else open while it is recent and resolved by
 * history once it is older than `HISTORY_RESOLVED_DAYS` before the RM clock. A request laid down
 * as history (`fromHistory`, `Request.history`) is resolved whatever its age: the simulator's
 * months now land on the customer's own day, and the last of them is inside thirty days.
 */
export function handoffStatus(
  requestedOn: IsoDate,
  changes: readonly Pick<HandoffStatusChange, 'status' | 'note'>[],
  asOf: IsoDate,
  fromHistory = false,
): { status: HandoffStatus; note: string | null } {
  const last = changes[changes.length - 1]
  if (last) return { status: last.status, note: last.note }
  if (fromHistory || daysBetween(requestedOn, asOf) > HISTORY_RESOLVED_DAYS)
    return { status: 'resolved', note: null }
  return { status: 'open', note: null }
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/**
 * Why a plan version was cut, in the RM's words.
 *
 * The stored reason is the customer's ("Re-cut after you passed on …") and, for a version the
 * clock cut, quotes the simulated clock itself ("Re-cut after the clock moved to 1 August
 * 2026"), which is the demo's machinery, not a reason an RM would give. A version the clock cut
 * is a plan refreshed on newer statements, and says which: on the 1st, the month just closed
 * ("Plan refreshed for August 2026, with July's statements"); on any other day, the statements to
 * that day. A reason the customer gave is kept, after "Plan refreshed", and re-voiced. `isFirst`
 * is false for a first version that follows another history on the journey: on one history it is
 * a refresh, not a first plan.
 */
export function planReason(reason: string, atSim: IsoDate, isFirst: boolean): string {
  if (reason === FIRST_PLAN_REASON && isFirst) return reason
  if (reason === FIRST_PLAN_REASON || /^Re-cut after the clock moved to /.test(reason)) {
    return atSim.slice(8, 10) === '01'
      ? `Plan refreshed for ${monthName(atSim)} ${atSim.slice(0, 4)}, with ${monthName(addMonths(atSim, -1))}'s statements.`
      : `Plan refreshed with the statements to ${dateLabel(atSim)}.`
  }
  if (/^Re-cut on .* with the latest statements\.$/.test(reason)) {
    return 'Plan refreshed with the latest statements.'
  }
  const after = /^Re-cut after (.+)$/.exec(reason)
  if (after?.[1] !== undefined) return `Plan refreshed after ${revoice(after[1])}`
  // A reason this does not know is the customer's own words, re-voiced, with any spoken date
  // ("1 August 2026") left out rather than quoted.
  const spoken = new RegExp(
    String.raw`\b(on |to )?\d{1,2} (${[...MONTH_WORDS].join('|')}) \d{4}\b`,
    'g',
  )
  return revoice(
    reason
      .replace(spoken, '')
      .replace(/\s+([.,])/g, '$1')
      .replace(/\s{2,}/g, ' '),
  )
}

const MONTH_WORDS: ReadonlySet<string> = new Set([
  ...MONTHS_SHORT,
  'January',
  'February',
  'March',
  'April',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
])

/** What moved between two plan versions, in the four things an RM reads a plan by. */
export function planDiff(before: RoadmapVersion | null, after: RoadmapVersion): JourneyDiff[] {
  const read = (v: RoadmapVersion | null): Record<string, string | number | null> => {
    if (v === null) {
      return { Goal: null, 'Goal amount': null, 'Current stage': null, 'Monthly commitment': null }
    }
    const stage = v.roadmap.stages[v.roadmap.currentStageIndex]
    return {
      Goal: goalLabel(v.goal),
      'Goal amount': Math.round(v.goal.targetAmount),
      'Current stage': stage ? revoice(stage.label) : null,
      'Monthly commitment': Math.round(v.roadmap.monthlyCommitment),
    }
  }
  const was = read(before)
  const now = read(after)
  return Object.keys(now)
    .filter((field) => was[field] !== now[field])
    .map((field) => ({ field, before: was[field] ?? null, after: now[field] ?? null }))
}

const latestOf = (a: string | null, b: string | null): string | null =>
  a === null ? b : b === null ? a : a > b ? a : b

const monthOf = (iso: string): string => iso.slice(0, 7)

/** A journey event and where it came in: when it was written, and the order it was read in. */
interface Placed {
  event: JourneyEvent
  /** The real instant the row was written; empty for what has none (a ledger line, joining). */
  written: string
  seq: number
}

/**
 * Newest simulated day first. Within a day, the later write first: a decision's re-cut follows
 * the decision, a question asked on a call follows the call, whatever order they were read in.
 */
function newestFirst(a: Placed, b: Placed): number {
  if (a.event.at !== b.event.at) return a.event.at < b.event.at ? 1 : -1
  if (a.written !== b.written) return a.written < b.written ? 1 : -1
  return b.seq - a.seq
}

export class RmActivityService {
  private readonly deps: RmActivityDeps
  private names: { at: number; byCif: Promise<ReadonlyMap<string, string>> } | null = null
  private readonly rmNames = new Map<string, Promise<string>>()
  private readonly insightMemo = new Map<string, Insight[]>()
  private readonly homes = new Map<string, { at: number; home: Promise<IsoDate> }>()

  constructor(deps: RmActivityDeps) {
    this.deps = deps
  }

  /* ---------------------------------------------------------------- *
   * Read by the console's own pages. Never throw.
   * ---------------------------------------------------------------- */

  /** One entry per cif asked for; a cif with nothing on record gets `NO_ACTIVITY`. */
  async facts(cifs: readonly string[]): Promise<Map<string, ActivityFacts>> {
    const [changes, notes] = await Promise.all([
      this.statusChanges(cifs),
      this.deps.activity.listNotes(cifs).catch(() => [] as RmNote[]),
    ])
    const asOf = this.deps.book.asOf
    const entries = await Promise.all(
      cifs.map(async (cif): Promise<[string, ActivityFacts]> => {
        try {
          return [cif, factsOf(await this.historyOf(cif), changes, notes, asOf)]
        } catch (err) {
          this.deps.log.warn({ cif, err: (err as Error).message }, 'rm activity: facts not read')
          return [cif, NO_ACTIVITY]
        }
      }),
    )
    return new Map(entries)
  }

  /** Handoffs on these customers that are not resolved yet (open and contacted), oldest first. */
  async handoffs(cifs: readonly string[]): Promise<Handoff[]> {
    try {
      const [changes, names] = await Promise.all([this.statusChanges(cifs), this.nameMap()])
      const asOf = this.deps.book.asOf
      const versions = this.versionsReader()
      const out: Handoff[] = []
      for (const cif of cifs) {
        try {
          const history = await this.historyOf(cif)
          for (const request of requestsOf(history, history.home)) {
            // The status first: a year of history's resolved requests needs no reason read.
            const { status } = handoffStatus(
              request.decision.atSim,
              changesOf(request, changes),
              asOf,
              request.history,
            )
            if (status === 'resolved') continue
            out.push(await this.handoffOf(request, changes, names, versions))
          }
        } catch (err) {
          this.deps.log.warn({ cif, err: (err as Error).message }, 'rm activity: handoffs not read')
        }
      }
      return out.sort((a, b) =>
        a.requestedOn < b.requestedOn ? -1 : a.requestedOn > b.requestedOn ? 1 : 0,
      )
    } catch (err) {
      this.deps.log.warn({ err: (err as Error).message }, 'rm activity: handoffs not read')
      return []
    }
  }

  /** Every BLOCKED advice record on these customers, newest first. */
  async refusalItems(cifs: readonly string[]): Promise<AdviceItem[]> {
    try {
      return await this.adviceItems(cifs, (r) => r.verdict === 'BLOCKED')
    } catch (err) {
      this.deps.log.warn({ err: (err as Error).message }, 'rm activity: refusals not read')
      return []
    }
  }

  /**
   * Activity per calendar month across these customers, aligned to `months` (`YYYY-MM`, oldest
   * first): decisions, product questions, Uday calls, and the desk's notes and contacts. Plan
   * versions are left out, because the engine cuts those and nobody did anything. Empty until
   * there is something to count, rather than a row of zeros that claims to have looked.
   */
  async monthlyActivity(cifs: readonly string[], months: readonly string[]): Promise<number[]> {
    try {
      const index = new Map(months.map((m, i) => [m, i]))
      const counts = months.map(() => 0)
      let total = 0
      const count = (at: string): void => {
        const i = index.get(monthOf(at))
        if (i === undefined) return
        counts[i] = (counts[i] ?? 0) + 1
        total += 1
      }
      const [changes, notes] = await Promise.all([
        this.statusChanges(cifs),
        this.deps.activity.listNotes(cifs).catch(() => [] as RmNote[]),
      ])
      for (const n of notes) count(n.atSim)
      for (const c of changes) count(c.atSim)
      for (const cif of cifs) {
        const set = await this.historyOf(cif).catch(() => null)
        if (!set) continue
        set.trails.forEach((trail, i) => {
          for (const d of trail.decisions) count(d.atSim)
          for (const a of trail.adviceRecords) if (a.actionId === null) count(a.atSim)
          const session = set.sessions[i]
          if (session) for (const call of callsOf(trail)) count(callDate(call, trail, session))
        })
      }
      return total === 0 ? [] : counts
    } catch (err) {
      this.deps.log.warn({ err: (err as Error).message }, 'rm activity: monthly activity not read')
      return []
    }
  }

  /* ---------------------------------------------------------------- *
   * The activity routes. `:cif` is already in the caller's book.
   * ---------------------------------------------------------------- */

  /**
   * The customer's timeline, newest first, merged from every session they have had and the
   * desk's own rows. Customer-facing sentences (a plan's reason, a button's label, what Uday
   * said) are re-voiced to the third person; the record route keeps them verbatim.
   */
  async journey(rm: RmCaller, cif: string): Promise<RmJourney> {
    void rm
    const [history, changes, notes, products] = await Promise.all([
      this.historyOf(cif),
      this.statusChanges([cif]),
      this.deps.activity.listNotes([cif]),
      this.productNames(),
    ])
    const state = await this.deps.book.state(cif).catch(() => null)
    const names = new Map([[cif, state?.file.customer.custName ?? cif]])
    const placed: Placed[] = []
    const push = (event: JourneyEvent, written = ''): void => {
      placed.push({ event, written, seq: placed.length })
    }

    if (state) {
      push({
        id: `joined:${cif}`,
        at: state.file.customer.customerSince,
        kind: 'joined',
        source: 'customer',
        title: 'Became an IDBI customer',
        detail: null,
        diff: null,
        verdict: null,
        ruleId: null,
        amount: null,
      })
    }

    // Plan versions across the one history, oldest first. Each is read against the version before
    // it on its own session, or, for a session's first, against the one history's version before
    // it: a reviewer's first plan that follows the simulator's months is a refresh of that plan,
    // not a first plan, and its diff is what moved since.
    const versionsOf = this.versionsReader()
    const kept: { sessionId: string; version: RoadmapVersion }[] = []
    for (const session of history.sessions) {
      for (const version of await versionsOf(session.id)) {
        if (history.keeps(session.id, version.atSim)) kept.push({ sessionId: session.id, version })
      }
    }
    kept.sort(
      (a, b) =>
        a.version.atSim.localeCompare(b.version.atSim) ||
        a.version.createdAt.localeCompare(b.version.createdAt),
    )
    const lastOn = new Map<string, RoadmapVersion>()
    let lastAny: RoadmapVersion | null = null
    for (const { sessionId, version } of kept) {
      const before = lastOn.get(sessionId) ?? lastAny
      lastOn.set(sessionId, version)
      lastAny = version
      const diff = planDiff(before, version)
      // A re-cut that moved none of the four things is the record's business, not the
      // timeline's: every decision re-cuts the plan, and a dozen "nothing changed" rows a
      // year would bury the ones that did.
      if (before !== null && diff.length === 0) continue
      push(
        {
          id: version.id,
          at: version.atSim,
          kind: 'plan',
          source: 'engine',
          title: before === null ? 'First plan' : 'Plan updated',
          detail: planReason(version.reasonForChange, version.atSim, before === null),
          diff,
          verdict: null,
          ruleId: null,
          amount: null,
        },
        version.createdAt,
      )
    }

    for (const [i, session] of history.sessions.entries()) {
      const trail = history.trails[i]
      if (!trail) continue
      const adviceById = new Map(trail.adviceRecords.map((r) => [r.id, r]))
      for (const d of trail.decisions) {
        if (isHandoff(d)) continue
        const advice = d.adviceRecordId === null ? null : (adviceById.get(d.adviceRecordId) ?? null)
        push(
          {
            id: d.id,
            at: d.atSim,
            kind: 'decision',
            source: 'customer',
            title: `${DECIDED[d.kind]}: ${revoice(d.shown)}`,
            detail: advice ? revoice(advice.recorded) : null,
            diff: null,
            verdict: advice?.verdict ?? null,
            ruleId: advice?.ruleId ?? null,
            amount: d.amount > 0 ? d.amount : null,
          },
          d.createdAt,
        )
      }

      // Advice behind a decision is on that decision's row; the rest are questions the customer
      // asked (in text, or on a call), each with the verdict the rules gave.
      for (const a of trail.adviceRecords) {
        if (a.actionId !== null) continue
        const product = a.productId === null ? null : (products.get(a.productId) ?? a.productId)
        push(
          {
            id: a.id,
            at: a.atSim,
            kind: 'advice',
            source: 'uday',
            title: adviceTitle(a, product),
            detail: a.spoken === null ? revoice(a.recorded) : revoice(a.spoken),
            diff: null,
            verdict: a.verdict,
            ruleId: a.ruleId,
            amount: a.amount,
          },
          a.createdAt,
        )
      }

      for (const call of callsOf(trail)) {
        push(
          {
            id: `call:${call.runwaySessionId}`,
            at: callDate(call, trail, session),
            kind: 'call',
            source: 'uday',
            title: 'Call with Uday',
            detail:
              call.minutesCharged === null
                ? null
                : `${Math.max(1, Math.round(call.minutesCharged))} min on a live call`,
            diff: null,
            verdict: null,
            ruleId: null,
            amount: null,
          },
          call.openedAt,
        )
      }
    }

    for (const request of requestsOf(history, history.home)) {
      const handoff = await this.handoffOf(request, changes, names, versionsOf)
      push(
        {
          id: handoff.id,
          at: handoff.requestedOn,
          kind: 'handoff',
          source: 'customer',
          title: 'Asked to talk to their RM',
          detail: `${handoff.reason}. ${STATUS_WORD[handoff.status]}${handoffSince(handoff)}.`,
          diff: null,
          verdict: null,
          ruleId: null,
          amount: null,
        },
        request.decision.createdAt,
      )
    }

    for (const change of changes) {
      push(
        {
          id: change.id,
          at: change.atSim,
          kind: 'contact',
          source: 'rm',
          title: `${STATUS_WORD[change.status]} by ${await this.rmName(change.rmId)}`,
          detail: change.note,
          diff: null,
          verdict: null,
          ruleId: null,
          amount: null,
        },
        change.createdAt,
      )
    }

    for (const note of notes) {
      const by = await this.rmName(note.rmId)
      push(noteEvent(note, by), note.createdAt)
    }

    for (const e of state?.ledgerEvents ?? []) {
      push({
        id: e.id,
        at: e.at,
        kind: 'ledger',
        source: 'ledger',
        title: e.title,
        detail: e.detail,
        diff: null,
        verdict: null,
        ruleId: null,
        amount: e.amount,
      })
    }

    return { events: placed.sort(newestFirst).map((p) => p.event) }
  }

  /** Every advice record the customer has, newest first, across every chain. */
  async customerRecord(rm: RmCaller, cif: string): Promise<RmCustomerRecord> {
    void rm
    const set = await this.recordOf(cif)
    const [names, products] = await Promise.all([this.nameMap(), this.productNames()])
    const records = adviceItemsOf(set, () => true, names, products)
    return {
      records,
      chains: set.trails.filter((t) => t.adviceRecords.length > 0).length,
    }
  }

  /** The real chain walk, once per session that holds a record. */
  async verifyCustomerRecord(rm: RmCaller, cif: string): Promise<RmCustomerVerification> {
    void rm
    const sessions = await this.deps.sessions.listByCif(cif)
    const chains = []
    let checked = 0
    for (const session of sessions) {
      const result = await this.deps.audit.verifyChain(session.id)
      if (result.length === 0) continue
      checked += result.length
      chains.push({
        chainId: session.id,
        records: result.length,
        valid: result.ok,
        brokenAt: result.ok ? null : (result.brokenAt ?? null),
      })
    }
    return {
      checked,
      chains,
      valid: chains.every((c) => c.valid),
      checkedAt: this.deps.clock.now().toISOString(),
    }
  }

  /** Writes the note and a `noted` access entry; answers with the journey event it made. */
  async addNote(rm: RmCaller, cif: string, body: RmNoteRequest): Promise<RmNoteResponse> {
    const note = await this.deps.activity.appendNote({
      rmId: rm.rmId,
      cif,
      kind: body.kind,
      text: body.text,
      atSim: this.deps.book.asOf,
    })
    await this.deps.accessLog.record(
      rm,
      cif,
      'noted',
      body.kind === 'call' ? 'Logged a call' : 'Added a note',
    )
    return { event: noteEvent(note, rm.name) }
  }

  /**
   * Move a request to talk to the RM on. 404 for an id that is no handoff anywhere; 403
   * (`scope.assertInBook`) for one on a customer outside the caller's book.
   *
   * The id is a decision id and names no customer, so the caller's own book is searched first
   * (the case that matters) and then the rest of the population, so that someone else's handoff
   * is refused as not yours rather than reported as not there.
   */
  async updateHandoff(
    rm: RmCaller,
    handoffId: string,
    patch: RmHandoffPatch,
  ): Promise<RmHandoffResponse> {
    const request = await this.findRequest(rm, handoffId)
    if (!request) throw new NotFound(`No handoff with id ${handoffId}.`)
    await this.deps.scope.assertInBook(rm, request.cif, {
      purpose: `Mark a request to talk as ${patch.status}`,
      detail: patch.note ?? null,
    })

    await this.deps.activity.appendHandoffStatus({
      handoffId,
      cif: request.cif,
      rmId: rm.rmId,
      status: patch.status,
      note: patch.note ?? null,
      atSim: this.deps.book.asOf,
    })
    await this.deps.accessLog.record(
      rm,
      request.cif,
      'contacted',
      patch.status === 'contacted'
        ? 'Marked a request to talk as contacted'
        : 'Marked a request to talk as resolved',
      patch.note ?? null,
    )
    const [changes, names] = await Promise.all([this.statusChanges([request.cif]), this.nameMap()])
    return { handoff: await this.handoffOf(request, changes, names) }
  }

  /** Writes a `revealed` access entry with the reason, then answers the one field asked for. */
  async reveal(rm: RmCaller, cif: string, body: RmRevealRequest): Promise<RmRevealResponse> {
    const customer = await this.deps.bank.getCustomer(cif)
    await this.deps.accessLog.record(rm, cif, 'revealed', body.reason, body.field)
    return { field: body.field, value: customer.dateOfBirth }
  }

  /**
   * Mis-sales prevented across the caller's book: every BLOCKED record, and the count by rule
   * with the rule book's own sentence as the label, since this is the page that has to say what
   * each rule is. (Insights charts the same counts under core's short labels.)
   */
  async refusals(rm: RmCaller): Promise<RmRefusals> {
    const cifs = await this.deps.scope.book(rm)
    const items = await this.adviceItems(cifs, (r) => r.verdict === 'BLOCKED')
    const described = new Map(ruleBook.map((r) => [r.id, r.description]))
    return {
      items,
      byRule: refusalsByRule(items).map((r) => ({
        ruleId: r.ruleId,
        label: described.get(r.ruleId) ?? ruleLabel(r.ruleId),
        count: r.count,
      })),
      total: items.length,
    }
  }

  /** Every chain in the book, walked; each one that breaks is listed with where. */
  async verifyBook(rm: RmCaller): Promise<RmBookVerification> {
    const cifs = await this.deps.scope.book(rm)
    let checked = 0
    const broken: RmBookVerification['broken'] = []
    for (const cif of cifs) {
      for (const session of await this.deps.sessions.listByCif(cif)) {
        const result = await this.deps.audit.verifyChain(session.id)
        checked += result.length
        if (!result.ok && result.brokenAt !== undefined) {
          broken.push({ cif, chainId: session.id, brokenAt: result.brokenAt })
        }
      }
    }
    return {
      checked,
      valid: broken.length === 0,
      broken,
      checkedAt: this.deps.clock.now().toISOString(),
    }
  }

  async accessLog(rm: RmCaller): Promise<RmAccessLogResponse> {
    const [entries, names] = await Promise.all([
      this.deps.accessLog.list(rm, ACCESS_LOG_LIMIT),
      this.nameMap(),
    ])
    return {
      entries: entries.map((e) => ({
        id: e.id,
        at: e.at,
        cif: e.cif,
        // A refused attempt was on a customer outside the book: the log does not hand the RM
        // the name the 403 withheld.
        name: e.action === 'denied' ? e.cif : (names.get(e.cif) ?? e.cif),
        action: e.action,
        purpose: e.purpose,
        detail: e.detail,
      })),
    }
  }

  /* ---------------------------------------------------------------- *
   * Reading the record
   * ---------------------------------------------------------------- */

  /** Every row on every session: what the record, the refusals and the chain walks read. */
  private async recordOf(cif: string): Promise<CustomerRecordSet> {
    const sessions = await this.deps.sessions.listByCif(cif)
    const trails = await Promise.all(sessions.map((s) => this.deps.audit.listForSession(s.id)))
    return { cif, sessions, trails }
  }

  /** The customer's one history: what the journey, the facts, the counts and the handoffs read. */
  private async historyOf(cif: string): Promise<History> {
    const [record, home] = await Promise.all([this.recordOf(cif), this.homeOf(cif)])
    return oneHistory(record, home)
  }

  /**
   * The day `create` opens a session for this customer on, as `SessionService.create` works it
   * out: the RM clock (the session anchor), or the end of the ledger where it stops first.
   * Cached briefly; a source that cannot say answers the RM clock.
   */
  private homeOf(cif: string): Promise<IsoDate> {
    const now = this.deps.clock.now().getTime()
    const held = this.homes.get(cif)
    if (held && now - held.at < NAMES_TTL_MS) return held.home
    const asOf = this.deps.book.asOf
    const home = this.deps.bank.ledgerHorizon(cif).then(
      (h) => (asOf > h.to ? h.to : asOf),
      () => asOf,
    )
    this.homes.set(cif, { at: now, home })
    return home
  }

  private statusChanges(cifs: readonly string[]): Promise<HandoffStatusChange[]> {
    return this.deps.activity.listHandoffStatuses(cifs).catch(() => [])
  }

  private async adviceItems(
    cifs: readonly string[],
    keep: (r: AdviceRecord) => boolean,
  ): Promise<AdviceItem[]> {
    const [names, products] = await Promise.all([this.nameMap(), this.productNames()])
    const sets = await Promise.all(cifs.map((cif) => this.recordOf(cif)))
    return sets
      .flatMap((set) => adviceItemsOf(set, keep, names, products))
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  }

  /** The decision `handoffId` names, if it is a handoff: the caller's book first, then the rest. */
  private async findRequest(rm: RmCaller, handoffId: string): Promise<Request | null> {
    const mine = await this.deps.scope.book(rm)
    const everyone = [...(await this.deps.scope.populationCifs())]
    const rest = everyone.filter((cif) => !mine.includes(cif)).sort()
    for (const cif of [...mine, ...rest]) {
      const set = await this.recordOf(cif)
      const found = requestsOf(set, await this.homeOf(cif)).find((r) => r.decision.id === handoffId)
      if (found) return found
    }
    return null
  }

  /**
   * The wire handoff for a request: status from the desk's last change (or the history rule),
   * the reason, and what the customer was looking at when they asked.
   */
  private async handoffOf(
    request: Request,
    changes: readonly HandoffStatusChange[],
    names: ReadonlyMap<string, string>,
    versions: VersionsReader = this.versionsReader(),
  ): Promise<Handoff> {
    const asOf = this.deps.book.asOf
    const requestedOn = request.decision.atSim
    const { status, note } = handoffStatus(
      requestedOn,
      changesOf(request, changes),
      asOf,
      request.history,
    )
    const { reason, context } = await this.reasonOf(request, versions)
    return {
      id: request.decision.id,
      cif: request.cif,
      name: names.get(request.cif) ?? request.cif,
      requestedOn,
      waitingDays: Math.max(0, daysBetween(requestedOn, asOf)),
      status,
      reason,
      context,
      note,
    }
  }

  /**
   * Why the customer asked, read off the plan they were looking at when they did.
   *
   * The action id carries the insight that put "Talk to your relationship manager" on the plan
   * (`<date>:<insight>:talk_to_rm`, `dailyplan.ts`). Where that is a real concern (a missed
   * repayment puts it there), it is the reason. Where it is the engine's standing escape hatch,
   * the one on every plan, the reason is the first concern on the plan that day, because that is
   * what was in front of the customer when they asked. The snapshot is the one the plan version
   * cut on that decision was built from, so the reason is the engine's reading on the day, not
   * today's; failing that, today's reading at the RM clock.
   */
  private async reasonOf(
    request: Request,
    versions: VersionsReader,
  ): Promise<{ reason: string; context: string[] }> {
    const on = request.decision.atSim
    let insights: readonly Insight[] | null = null
    let plan: string | null = null
    try {
      const cut = [...(await versions(request.session.id))].reverse().find((v) => v.atSim <= on)
      if (cut) {
        insights = await this.insightsOf(cut.snapshotId)
        const stage = cut.roadmap.stages[cut.roadmap.currentStageIndex]
        if (stage) plan = `On their plan that day: ${revoice(stage.label)}`
      }
    } catch {
      insights = null
    }
    if (insights === null) {
      insights = await this.deps.book
        .state(request.cif)
        .then((s) => s.insights)
        .catch(() => [])
    }

    const signals = toSignals(insights)
    const raisedBy = request.decision.actionId.split(':')[1] ?? ''
    const own = raisedBy in SIGNAL_LABELS ? signals.find((s) => s.kind === raisedBy) : undefined
    const top: Signal | undefined = own ?? signals[0]
    const reason = top ? top.title : 'Asked from the app, with nothing pressing on their plan'
    const context = [
      ...signals
        .filter((s) => s !== top)
        .slice(0, 2)
        .map((s) => s.title),
      ...(plan ? [plan] : []),
    ]
    return { reason, context }
  }

  /** Each session's plan versions, read once for the length of one call. */
  private versionsReader(): VersionsReader {
    const held = new Map<string, Promise<RoadmapVersion[]>>()
    return (sessionId) => {
      let versions = held.get(sessionId)
      if (!versions) {
        versions = this.deps.snapshots.listRoadmaps(sessionId)
        held.set(sessionId, versions)
      }
      return versions
    }
  }

  /** The engine's insights on a stored snapshot, memoised: a snapshot never changes. */
  private async insightsOf(snapshotId: string): Promise<Insight[] | null> {
    const held = this.insightMemo.get(snapshotId)
    if (held) return held
    const stored = await this.deps.snapshots.getById(snapshotId)
    if (!stored) return null
    const insights = findInsights(stored.snapshot)
    this.insightMemo.set(snapshotId, insights)
    if (this.insightMemo.size > INSIGHT_MEMO_SIZE) {
      const oldest = this.insightMemo.keys().next().value
      if (oldest !== undefined) this.insightMemo.delete(oldest)
    }
    return insights
  }

  /** cif → customer name, for every customer the source holds. Cached briefly. */
  private nameMap(): Promise<ReadonlyMap<string, string>> {
    const held = this.names
    const now = this.deps.clock.now().getTime()
    if (held && now - held.at < NAMES_TTL_MS) return held.byCif
    const byCif = this.deps.bank
      .listPopulation()
      .then((all): ReadonlyMap<string, string> => new Map(all.map((c) => [c.cif, c.name])))
    this.names = { at: now, byCif }
    byCif.catch(() => {
      if (this.names?.byCif === byCif) this.names = null
    })
    return byCif.catch(() => new Map())
  }

  private async productNames(): Promise<ReadonlyMap<string, string>> {
    const products = await this.deps.shelf.list().catch(() => [])
    return new Map(products.map((p) => [p.productId, p.name]))
  }

  /** An RM's name for a note or a contact; their id where the desk no longer knows them. */
  private rmName(rmId: string): Promise<string> {
    let held = this.rmNames.get(rmId)
    if (!held) {
      held = this.deps.desk
        .userById(rmId)
        .then((u) => u?.name ?? rmId)
        .catch(() => rmId)
      this.rmNames.set(rmId, held)
    }
    return held
  }
}

/* ------------------------------------------------------------------ *
 * Pure helpers over one customer's record
 * ------------------------------------------------------------------ */

/**
 * One history per customer, out of every session they have had.
 *
 * Seeded months overlap: a hero the simulator walked on a memory boot and a reviewer then opened
 * has both sessions over the same months, each with its own decisions on the same snapshots, and
 * two reviewers who opened the same hero each seeded the same months behind their day one. The
 * rule is a claim on months. Sessions are read most trusted first: reviewers' sessions, newest
 * first (what the customer was last shown), then the simulator's. A session's seeded rows (every
 * row on a journey session; a reviewer's rows dated before `home`, the day it opened on) claim
 * the months from the first to the last of them, and a seeded row in a month a more trusted
 * session has already claimed is left out. What a reviewer did on or after `home` is never left
 * out: it is not seeded, it happened.
 *
 * Calls are kept whole: a call is a real instant, never seeded. The record keeps every row; this
 * is the view the journey, the activity facts, the monthly counts and the handoffs read.
 */
export function oneHistory(record: CustomerRecordSet, home: IsoDate): History {
  const seeded = (session: Session, atSim: IsoDate): boolean => isJourney(session) || atSim < home
  const order = record.sessions
    .map((session, i) => ({ session, trail: record.trails[i] }))
    .sort(
      (a, b) =>
        Number(isJourney(a.session)) - Number(isJourney(b.session)) ||
        b.session.createdAt.localeCompare(a.session.createdAt),
    )

  const claimed: { from: string; to: string }[] = []
  const lost = new Map<string, { from: string; to: string }[]>()
  for (const { session, trail } of order) {
    lost.set(session.id, [...claimed])
    let from: string | null = null
    let to: string | null = null
    for (const at of [
      ...(trail?.decisions ?? []).map((d) => d.atSim),
      ...(trail?.adviceRecords ?? []).map((a) => a.atSim),
    ]) {
      if (!seeded(session, at)) continue
      const month = monthOf(at)
      if (from === null || month < from) from = month
      if (to === null || month > to) to = month
    }
    if (from !== null && to !== null) claimed.push({ from, to })
  }

  const keeps = (sessionId: string, atSim: IsoDate): boolean => {
    const session = record.sessions.find((s) => s.id === sessionId)
    if (!session || !seeded(session, atSim)) return true
    const month = monthOf(atSim)
    return !(lost.get(sessionId) ?? []).some((c) => month >= c.from && month <= c.to)
  }
  const trails = record.trails.map((trail, i) => {
    const id = record.sessions[i]?.id ?? ''
    return {
      ...trail,
      decisions: trail.decisions.filter((d) => keeps(id, d.atSim)),
      adviceRecords: trail.adviceRecords.filter((a) => keeps(id, a.atSim)),
    }
  })
  return { cif: record.cif, sessions: record.sessions, trails, record, keeps, home }
}

/** The desk's changes to one request, oldest first. */
function changesOf(
  request: Request,
  changes: readonly HandoffStatusChange[],
): HandoffStatusChange[] {
  return changes.filter((c) => c.handoffId === request.decision.id)
}

function isHandoff(d: DecisionRecord): boolean {
  return d.actionKind === 'talk_to_rm' && d.kind === 'did_it'
}

/**
 * Every request to talk to the RM on these rows, oldest first, each marked where it is history's
 * own (`Request.history`): `home` is the day the customer's sessions open on.
 */
function requestsOf(set: CustomerRecordSet, home: IsoDate): Request[] {
  const out: Request[] = []
  set.trails.forEach((trail, i) => {
    const session = set.sessions[i]
    if (!session) return
    for (const d of trail.decisions) {
      if (!isHandoff(d)) continue
      const history = isJourney(session) ? d.atSim <= session.lastSeen : d.atSim < home
      out.push({ cif: set.cif, session, decision: d, history })
    }
  })
  return out.sort((a, b) =>
    a.decision.atSim < b.decision.atSim ? -1 : a.decision.atSim > b.decision.atSim ? 1 : 0,
  )
}

/** Calls that reached the customer. A session that never got its grant was not a call. */
function callsOf(trail: AuditTrail): AvatarSessionRecord[] {
  return trail.avatarSessions.filter((s) => s.grantedAt !== null)
}

/**
 * The simulated day a real call happened on: the day its first verdict was recorded, which is
 * the session's clock at the time; else the session's clock now. A call is a real instant, but
 * the journey and the activity counts are in simulated days like everything beside them.
 */
function callDate(call: AvatarSessionRecord, trail: AuditTrail, session: Session): IsoDate {
  let at: IsoDate | null = null
  for (const a of trail.adviceRecords) {
    if (a.runwaySessionId === call.runwaySessionId && (at === null || a.atSim < at)) at = a.atSim
  }
  return at ?? session.asOf
}

/**
 * What the book row needs, off the customer's one history. The latest activity is the true
 * latest event on it: the newest decision, question, call, note or contact, and for a reviewer's
 * session the day its clock stands on (somebody has the app open on that day; `lastSeen` is
 * where "since you were away" opens, a week back, and is not a visit). Refusals are counted on
 * the record, every chain, because the Record page lists every one of them.
 */
function factsOf(
  set: History,
  changes: readonly HandoffStatusChange[],
  notes: readonly RmNote[],
  asOf: IsoDate,
): ActivityFacts {
  let last: string | null = null
  let udayCalls = 0
  let lastCallAt: string | null = null
  const sipMoves: { at: string; paused: boolean }[] = []
  const refusals = set.record.trails.reduce(
    (n, t) => n + t.adviceRecords.filter((a) => a.verdict === 'BLOCKED').length,
    0,
  )

  set.trails.forEach((trail, i) => {
    const session = set.sessions[i]
    if (!session) return
    // A person opened the app: a reviewer's session says so. The simulator's never did.
    if (!isJourney(session)) last = latestOf(last, session.asOf)
    for (const d of trail.decisions) {
      last = latestOf(last, d.atSim)
      if (d.kind !== 'did_it') continue
      if (d.actionKind === 'pause_sip') sipMoves.push({ at: d.atSim, paused: true })
      if (d.actionKind === 'start_sip' || d.actionKind === 'increase_sip') {
        sipMoves.push({ at: d.atSim, paused: false })
      }
    }
    for (const a of trail.adviceRecords) last = latestOf(last, a.atSim)
    for (const call of callsOf(trail)) {
      udayCalls += 1
      last = latestOf(last, callDate(call, trail, session))
      lastCallAt = latestOf(lastCallAt, call.grantedAt ?? call.openedAt)
    }
  })

  for (const n of notes) if (n.cif === set.cif) last = latestOf(last, n.atSim)
  const mine = changes.filter((c) => c.cif === set.cif)
  for (const c of mine) last = latestOf(last, c.atSim)

  const openHandoff = requestsOf(set, set.home).some(
    (r) =>
      handoffStatus(
        r.decision.atSim,
        mine.filter((c) => c.handoffId === r.decision.id),
        asOf,
        r.history,
      ).status === 'open',
  )
  sipMoves.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))

  return {
    lastActivityAt: last,
    sipPaused: sipMoves[sipMoves.length - 1]?.paused ?? false,
    refusals,
    openHandoff,
    udayCalls,
    lastCallAt,
  }
}

function adviceItemsOf(
  set: CustomerRecordSet,
  keep: (r: AdviceRecord) => boolean,
  names: ReadonlyMap<string, string>,
  products: ReadonlyMap<string, string>,
): AdviceItem[] {
  const rows = set.trails.flatMap((t) => t.adviceRecords.filter(keep))
  rows.sort((a, b) =>
    a.atSim < b.atSim
      ? 1
      : a.atSim > b.atSim
        ? -1
        : b.createdAt.localeCompare(a.createdAt) || b.seq - a.seq,
  )
  return rows.map((r) => ({
    id: r.id,
    at: r.atSim,
    cif: set.cif,
    name: names.get(set.cif) ?? set.cif,
    productId: r.productId,
    productName: r.productId === null ? null : (products.get(r.productId) ?? null),
    amount: r.amount,
    source: r.source,
    verdict: r.verdict,
    ruleId: r.ruleId,
    rulesPassed: r.rulesPassed,
    // What the customer heard, verbatim: a refusal's sentence. A pass says nothing of its own.
    spoken: r.verdict === 'PASS' ? null : r.spoken,
    recorded: r.recorded,
    hash: r.recordHash,
    prevHash: r.prevHash,
  }))
}

function adviceTitle(a: AdviceRecord, product: string | null): string {
  const name = product ?? 'a product'
  if (a.verdict === 'BLOCKED') return `Uday refused ${name}`
  if (a.verdict === 'UNKNOWN_PRODUCT') return `Asked about ${name}, which is not on the shelf`
  return `Uday checked ${name}: suitable`
}

function handoffSince(h: Handoff): string {
  if (h.status === 'open') {
    return h.waitingDays === 0 ? ', asked today' : `, waiting ${plural(h.waitingDays, 'day')}`
  }
  return h.note ? `: ${h.note}` : ''
}

function noteEvent(note: RmNote, by: string): JourneyEvent {
  return {
    id: note.id,
    at: note.atSim,
    kind: note.kind,
    source: 'rm',
    title: note.kind === 'call' ? `Call logged by ${by}` : `Note by ${by}`,
    detail: note.text,
    diff: null,
    verdict: null,
    ruleId: null,
    amount: null,
  }
}
