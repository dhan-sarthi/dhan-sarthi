/**
 * Owned by the activity builder.
 *
 * The activity simulator: a journey for every book customer, laid down through the real
 * services and never by writing rows by hand (docs/product/rm-console.md, "Activity behind the
 * book"). A book customer has no reviewer, so nothing else would ever give them a record, a plan
 * history or a request to talk to their RM, and a console over fifty empty files proves nothing.
 *
 * Per customer, in simulated time order:
 *
 * 1. A dedicated session, opened through `SessionService.create` with a marker in `clientHint`
 *    (`JOURNEY_HINT`). The bearer `create` hands back is dropped on the floor here, so nobody
 *    ever holds it: the session can be written to by this file and read by the console, and
 *    opened by no one.
 * 2. Twelve months of `HistoryService.seed`, which decides each month's card through
 *    `DecisionService` exactly as a reviewer session's history does.
 * 3. The fixtures' product enquiries, each through `ConversationService.evaluateProduct` with
 *    source `text`, the call text chat makes when a customer names a product, at the month it
 *    was asked. The verdict is whatever the rules say on that day's snapshot.
 * 4. Where the fixtures say so, a `talk_to_rm` decided `did_it` through `DecisionService`, a few
 *    days before the RM clock, which is what puts a request in the RM's inbox.
 *
 * The enquiries are asked *inside* the twelve months, not after them. The record is one hash
 * chain per session in the order rows were written, and every roadmap version is cut against the
 * one before it: asking February's question after August's decisions would chain a February
 * record behind an August one and cut a plan version that steps back six months. So the history
 * is walked in segments that stop at each month a question was asked, the question is asked
 * there, and the walk carries on. Every month is still decided exactly once, by `HistoryService`.
 *
 * The four heroes are not book customers: reviewers open them in the app, and each reviewer
 * session seeds its own history. Where a hero has no session at all yet, which is every boot of
 * the memory source, they get the same journey minus the enquiries and the handoff, so the
 * demo's own RM never opens an empty file. A hero a reviewer has opened is left alone, and
 * nothing here ever writes to a session it did not open. Where a reviewer opens a hero after the
 * journey was laid, both histories exist, and the console shows one of them: the reviewer's for
 * the months they overlap (`activity.service.ts`, `oneHistory`).
 *
 * The months after the last question land on the customer's own day of the month
 * (`journeyDay`), not on the 1st. Every customer deciding on the 1st made the whole book "last
 * active 4 weeks ago"; a day per cif, spread across the month, reads like people. Only the
 * simulator moves its days: `HistoryService` is called exactly as a reviewer's session calls it,
 * from a clock the simulator set, so a reviewer's seeded history is untouched.
 *
 * Deterministic by cif: every input is the customer's own ledger at a fixed date and the
 * fixtures' activity, so two processes lay down the same journey (ids and wall-clock stamps
 * apart). Done means finished: the last write of a journey moves the clock home with `lastSeen`
 * on the walk's last day (`JourneyPlan.lastDay`), and only a session in that state is skipped. A
 * journey cut off part way (a process killed mid-customer) is resumed on the next boot from the
 * last row it wrote, each step skipped where its rows are already there, so a restart over
 * Postgres adds nothing to a finished journey and finishes an unfinished one. Background:
 * `start()` returns at once, the walk yields to the event loop between months as well as between
 * customers, and `ready()` resolves when it has finished. `stop()` lets the customer in hand
 * finish, within `STOP_WAIT_MS`.
 */
import { addDays, addMonths } from '@dhan/core'
import type { IsoDate } from '@dhan/contracts'
import type { AdvisoryService } from '../advisory.service.ts'
import type { ConversationService } from '../conversation.service.ts'
import type { DecisionService } from '../decision.service.ts'
import { HistoryService } from '../history.service.ts'
import type { SessionService } from '../session.service.ts'
import type { Logger } from '../../infra/logger.ts'
import type {
  AuditStore,
  BankDataPort,
  Clock,
  RmDeskPort,
  Session,
  SessionStore,
  SnapshotStore,
} from '../../ports/index.ts'
import type { RmBookService } from './book.service.ts'

/**
 * What a journey session carries in `clientHint`, so the console and a restart can tell it from a
 * reviewer's. A reviewer's hint is sixteen hex characters of a hash, which this can never be.
 */
export const JOURNEY_HINT = 'rm-simulator:journey'

/** The months of history behind the RM clock: the twelve every console chart draws. */
export const JOURNEY_MONTHS = 12

/** "Since you were away" trails the clock by six days, as `create` and the history set it. */
const LAST_SEEN_OFFSET_DAYS = -6

/**
 * The days of the month a journey's recent months can land on. From the 3rd, so the last one is
 * not the as-of date's payday neighbour; to the 28th, so every month, February included, has the
 * day. A recent request to talk keeps its place after the last month (`journeyPlan` moves the day
 * earlier for that customer where it has to).
 */
export const FIRST_DAY = 3
export const LAST_DAY = 28

/** How long `stop()` waits for the customer in hand before giving up on it. */
export const STOP_WAIT_MS = 10_000

/**
 * The day of the month a customer's months after their last question land on: deterministic by
 * cif (FNV-1a), spread from the 3rd to the 28th.
 */
export function journeyDay(cif: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < cif.length; i += 1) {
    h ^= cif.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return FIRST_DAY + (h % (LAST_DAY - FIRST_DAY + 1))
}

/** One step of a journey, in the order and on the day it is laid down. */
type Step =
  /** `months` months of `HistoryService`, counted back from `end` (the last one month before it). */
  | { kind: 'months'; months: number; end: IsoDate }
  | { kind: 'ask'; on: IsoDate; enquiry: ProductEnquiry }
  | { kind: 'handoff'; on: IsoDate }

/** Everything a journey will hold, decided before a row is written. */
export interface JourneyPlan {
  /** Where `create` leaves a session's clock, and where a finished journey's clock stands. */
  home: IsoDate
  /** The RM clock, never past `home`: every simulated date is measured back from it. */
  anchor: IsoDate
  /**
   * The walk's last decided day. A finished journey's `lastSeen` is this day: the marker written
   * last, and the line between the journey's seeded past and a request made after it.
   */
  lastDay: IsoDate
  steps: Step[]
}

/**
 * The journey for one customer: the twelve months, each enquiry in the month it was asked, the
 * recent request to talk, and the day the months after the last question land on.
 */
export function journeyPlan(
  cif: string,
  activity: BookActivity | null,
  home: IsoDate,
  rmClock: IsoDate,
): JourneyPlan {
  const anchor = rmClock < home ? rmClock : home
  const steps: Step[] = []
  let walked = JOURNEY_MONTHS // months still to decide, counted back from the anchor
  const groups = byMonth(activity?.enquiries ?? [])
  for (const [monthsAgo, asks] of groups) {
    if (monthsAgo === 0) continue // asked at the clock itself: after the walk, below
    const stop = Math.min(monthsAgo, JOURNEY_MONTHS)
    const on = addMonths(anchor, -stop)
    if (walked > stop) steps.push({ kind: 'months', months: walked - stop, end: on })
    walked = Math.min(walked, stop)
    for (const enquiry of asks) steps.push({ kind: 'ask', on, enquiry })
  }

  // The stretch after the last question, on the customer's own day. Its last month must stay
  // before a recent request to talk, or the record would step back in time to reach it.
  const handoffOn =
    activity?.recentHandoff === true ? addDays(anchor, -(activity.handoffDaysAgo ?? 0)) : null
  let day = journeyDay(cif)
  const lastOf = (d: number): IsoDate => addMonths(addDays(anchor, d - 1), -1)
  while (handoffOn !== null && day > 1 && lastOf(day) >= handoffOn) day -= 1
  const end = addDays(anchor, day - 1)
  steps.push({ kind: 'months', months: walked, end })
  const lastDay = addMonths(end, -1)

  for (const [monthsAgo, asks] of groups) {
    if (monthsAgo !== 0) continue
    for (const enquiry of asks) steps.push({ kind: 'ask', on: anchor, enquiry })
  }
  if (handoffOn !== null) steps.push({ kind: 'handoff', on: handoffOn })
  return { home, anchor, lastDay, steps }
}

/** Whether a journey session has been laid down to the end: its clock home, the marker set. */
export function journeyFinished(
  session: Pick<Session, 'asOf' | 'lastSeen'>,
  plan: JourneyPlan,
): boolean {
  return session.asOf === plan.home && session.lastSeen === plan.lastDay
}

/** A product a book customer asked about. The verdict is the rules', on the day it was asked. */
export interface ProductEnquiry {
  productId: string
  /** Rupees a month. */
  amount: number
  /** Months before the RM clock. */
  monthsAgo: number
}

/** What one book customer did, as the fixtures describe it. Data only: no verdict, no figure. */
export interface BookActivity {
  enquiries: readonly ProductEnquiry[]
  recentHandoff: boolean
  /** Days before the RM clock the handoff was asked for; null where there is none. */
  handoffDaysAgo: number | null
}

export interface ActivitySimulatorDeps {
  /** The population a book is drawn from, and each customer's ledger horizon. */
  bank: BankDataPort
  /** Whose book each customer is in: a customer in nobody's book is never simulated. */
  desk: RmDeskPort
  /** The store behind the session service, for reading and moving the journey session's clock. */
  sessionStore: SessionStore
  /** Read only, to find how far an unfinished journey got before it was cut off. */
  audit: AuditStore
  snapshots: SnapshotStore
  sessions: SessionService
  advisory: AdvisoryService
  decisions: DecisionService
  conversation: ConversationService
  /** For `asOf`, the RM clock every simulated date is measured back from. */
  book: RmBookService
  /**
   * What each book customer did, by cif. A customer in a book but not in here is a hero: given
   * a journey only while they have no session at all, and never an enquiry or a handoff.
   */
  activity: ReadonlyMap<string, BookActivity>
  /** Restrict the run to these customers, in this order. For tests; absent means the whole book. */
  only?: readonly string[]
  clock: Clock
  log: Logger
}

/** What one run did, for the log line and the tests. */
export interface SimulationReport {
  /** Journeys laid down in this run, those finished after an earlier run was cut off included. */
  simulated: number
  /** Of `simulated`, journeys an earlier run had started and this one finished. */
  resumed: number
  skipped: number
  failed: number
  ms: number
}

/** What an unfinished journey already holds: its last day, and the questions and request on it. */
interface Progress {
  last: IsoDate | null
  /** `productId@date` of every question asked, with how many times. */
  asked: Map<string, number>
  /** The days a request to talk was decided on. */
  handoffs: Set<IsoDate>
}

/** Hand the event loop back once: queued requests, timers and I/O all run before the next step. */
const nextTick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

export class ActivitySimulator {
  private readonly deps: ActivitySimulatorDeps
  private running: Promise<void> | null = null
  private stopped = false
  private last: SimulationReport | null = null
  /** Settles when the customer in hand is finished; null between customers. */
  private inHand: Promise<unknown> | null = null

  constructor(deps: ActivitySimulatorDeps) {
    this.deps = deps
  }

  /** Begin in the background. Never throws: a failure is logged and the book shows less. */
  start(): void {
    if (this.running) return
    this.running = this.run().then(
      (report) => {
        this.last = report
        this.deps.log.info(report, 'rm activity simulated')
      },
      (err: Error) => this.deps.log.error({ err: err.message }, 'rm activity simulation failed'),
    )
  }

  /** Resolves when the run `start()` began has finished (at once when nothing was started). */
  ready(): Promise<void> {
    return this.running ?? Promise.resolve()
  }

  /** The last finished run, or null. */
  report(): SimulationReport | null {
    return this.last
  }

  /**
   * Stop between customers on shutdown, so a closing process does not keep writing. The customer
   * in hand is finished first, waited for up to `waitMs`: a journey cut off half way is resumed on
   * the next boot rather than lost, but a finished one costs that boot nothing.
   */
  async stop(waitMs = STOP_WAIT_MS): Promise<void> {
    this.stopped = true
    const inHand = this.inHand
    if (!inHand) return
    let timer: NodeJS.Timeout | undefined
    const bound = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, waitMs)
      timer.unref()
    })
    try {
      await Promise.race([
        inHand.then(
          () => undefined,
          () => undefined,
        ),
        bound,
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  private async run(): Promise<SimulationReport> {
    const started = performance.now()
    const report: SimulationReport = { simulated: 0, resumed: 0, skipped: 0, failed: 0, ms: 0 }
    // Boot first: `start()` is called before the server listens, and nothing here should be
    // between the process and its first request.
    await nextTick()

    for (const cif of await this.targets()) {
      if (this.stopped) break
      const journey = this.journeyOf(cif)
      this.inHand = journey
      try {
        const outcome = await journey
        if (outcome === 'skipped') report.skipped += 1
        else report.simulated += 1
        if (outcome === 'resumed') report.resumed += 1
      } catch (err) {
        report.failed += 1
        this.deps.log.warn({ cif, err: (err as Error).message }, 'rm journey not simulated')
      } finally {
        this.inHand = null
      }
      await nextTick()
    }
    report.ms = Math.round(performance.now() - started)
    return report
  }

  /** Every customer in somebody's book, in the population's order (the heroes come first). */
  private async targets(): Promise<string[]> {
    const { bank, desk, only } = this.deps
    if (only) return [...only]
    const out: string[] = []
    for (const { cif } of await bank.listPopulation()) {
      if ((await desk.assignmentOf(cif)) !== null) out.push(cif)
    }
    return out
  }

  /**
   * Lay one customer's journey down, or finish one an earlier run was cut off in. Skipped where
   * it is already finished, and for a hero a reviewer has opened.
   */
  private async journeyOf(cif: string): Promise<'simulated' | 'resumed' | 'skipped'> {
    const { sessionStore, sessions } = this.deps
    const activity = this.deps.activity.get(cif) ?? null
    const existing = await sessionStore.listByCif(cif)
    // A hero is left alone once anyone has opened them: a reviewer's own history is their
    // journey, and it is not ours to add to.
    if (!activity && existing.some((s) => !isJourney(s))) return 'skipped'

    const started = existing.find(isJourney) ?? null
    const plan = journeyPlan(cif, activity, await this.homeOf(cif), this.deps.book.asOf)
    if (started && journeyFinished(started, plan)) return 'skipped'

    // The token is never kept: this session is written by the simulator and read by the console.
    let current = started ?? (await sessions.create(cif, JOURNEY_HINT)).session
    const progress = started
      ? await this.progressOf(started)
      : { last: null, asked: new Map<string, number>(), handoffs: new Set<IsoDate>() }

    for (const step of plan.steps) {
      if (step.kind === 'months') {
        current = await this.walk(current, step, progress.last)
      } else if (step.kind === 'ask') {
        const key = `${step.enquiry.productId}@${step.on}`
        const asked = progress.asked.get(key) ?? 0
        if (asked > 0) progress.asked.set(key, asked - 1)
        else current = await this.ask(await this.moveTo(current, step.on), step.enquiry)
      } else if (!progress.handoffs.has(step.on)) {
        current = await this.handoff(current, step.on)
      }
    }

    // Last, and only once everything above is on the record: the clock home, with `lastSeen` on
    // the walk's last day. A journey without this is unfinished, and the next boot resumes it.
    await this.moveTo(current, plan.home, plan.lastDay)
    return started ? 'resumed' : 'simulated'
  }

  /** Where `create` opens a session for this customer: the RM clock, or the ledger's end first. */
  private async homeOf(cif: string): Promise<IsoDate> {
    const horizon = await this.deps.bank.ledgerHorizon(cif)
    return this.deps.book.asOf > horizon.to ? horizon.to : this.deps.book.asOf
  }

  /** How far an unfinished journey got: the last day it wrote anything on, and what it asked. */
  private async progressOf(session: Session): Promise<Progress> {
    const [trail, versions] = await Promise.all([
      this.deps.audit.listForSession(session.id),
      this.deps.snapshots.listRoadmaps(session.id),
    ])
    let last: IsoDate | null = null
    const later = (at: IsoDate): void => {
      if (last === null || at > last) last = at
    }
    const asked = new Map<string, number>()
    const handoffs = new Set<IsoDate>()
    for (const d of trail.decisions) {
      later(d.atSim)
      if (d.actionKind === 'talk_to_rm' && d.kind === 'did_it') handoffs.add(d.atSim)
    }
    for (const a of trail.adviceRecords) {
      later(a.atSim)
      if (a.source === 'text' && a.actionId === null && a.productId !== null) {
        const key = `${a.productId}@${a.atSim}`
        asked.set(key, (asked.get(key) ?? 0) + 1)
      }
    }
    for (const v of versions) later(v.atSim)
    return { last, asked, handoffs }
  }

  /**
   * One stretch of months: `HistoryService` over `step.months` months counted back from
   * `step.end`, so the last is decided a month before it and the clock is left on `step.end`.
   *
   * `HistoryService.seed` walks back from wherever the session's clock is, so the clock is set to
   * the stretch's end first. Resuming, the months already on the record (dated before `last`) are
   * left out, and the rest are seeded from the same end: the history picks each month's card by
   * how far back from the end it is, so a month decided on resume is decided as it would have
   * been. The month dated `last` is decided again, which the record refuses as a repeat if it was
   * already done.
   */
  private async walk(
    session: Session,
    step: { months: number; end: IsoDate },
    last: IsoDate | null,
  ): Promise<Session> {
    let months = step.months
    if (last !== null) {
      months = 0
      for (let back = step.months; back >= 1; back -= 1) {
        if (addMonths(step.end, -back) >= last) months += 1
      }
    }
    if (months === 0) return session
    const current = await this.moveTo(session, step.end)
    return this.history(months).seed(current)
  }

  /** A history of `months`, over a store that takes turns with the rest of the process. */
  private history(months: number): HistoryService {
    return new HistoryService({
      advisory: this.deps.advisory,
      decisions: this.deps.decisions,
      sessions: takingTurns(this.deps.sessionStore),
      months,
      log: this.deps.log,
    })
  }

  /**
   * A product the customer asked about, through the call text chat makes for a named product.
   * A product the shelf no longer has is logged and skipped rather than ending the journey.
   */
  private async ask(session: Session, enquiry: ProductEnquiry): Promise<Session> {
    await nextTick()
    try {
      await this.deps.conversation.evaluateProduct(
        session,
        { productId: enquiry.productId, amount: enquiry.amount },
        'text',
      )
    } catch (err) {
      this.deps.log.warn(
        { cif: session.cif, productId: enquiry.productId, err: (err as Error).message },
        'rm journey: enquiry not recorded',
      )
    }
    return this.reread(session)
  }

  /**
   * "Talk to your relationship manager", tapped on the day it was asked for.
   *
   * The action is found on that day's plan, which always carries one (the engine's escape hatch
   * is on every customer's list), so the decision goes through `DecisionService.decide` with an
   * action id the engine itself issued, exactly as the button does.
   */
  private async handoff(session: Session, on: IsoDate): Promise<Session> {
    await nextTick()
    let current = await this.moveTo(session, on)
    try {
      const view = await this.deps.advisory.view(current)
      const action = [view.plan.primary, ...view.plan.secondary].find(
        (a) => a !== null && a.kind === 'talk_to_rm',
      )
      if (!action) {
        this.deps.log.warn({ cif: session.cif, on }, 'rm journey: no talk_to_rm on the plan')
        return current
      }
      await this.deps.decisions.decide(current, action.id, 'did_it')
    } catch (err) {
      this.deps.log.warn(
        { cif: session.cif, err: (err as Error).message },
        'rm journey: no handoff',
      )
    }
    current = await this.reread(current)
    return current
  }

  /**
   * The clock moved, through the store, the way `HistoryService` moves it. Against the version
   * just read, once more if a decision patched the row in between (accepting a cap does), so a
   * stale version never leaves the clock where it was without anyone noticing.
   */
  private async moveTo(session: Session, asOf: IsoDate, lastSeen?: IsoDate): Promise<Session> {
    await nextTick()
    const patch = { asOf, lastSeen: lastSeen ?? addDays(asOf, LAST_SEEN_OFFSET_DAYS) }
    const store = this.deps.sessionStore
    const patched = await store.patch(session.id, patch, session.version)
    if (patched) return patched
    const fresh = await this.reread(session)
    const again = await store.patch(fresh.id, patch, fresh.version)
    if (again) return again
    throw new Error(`could not move the clock of journey session ${session.id}`)
  }

  private async reread(session: Session): Promise<Session> {
    return (await this.deps.sessionStore.getById(session.id)) ?? session
  }
}

/** Whether a session is one this simulator opened. */
export function isJourney(session: Pick<Session, 'clientHint'>): boolean {
  return session.clientHint === JOURNEY_HINT
}

/** The enquiries grouped by month, oldest month first (most months ago first). */
function byMonth(enquiries: readonly ProductEnquiry[]): [number, ProductEnquiry[]][] {
  const months = new Map<number, ProductEnquiry[]>()
  for (const e of enquiries) {
    const at = Math.max(0, Math.round(e.monthsAgo))
    months.set(at, [...(months.get(at) ?? []), e])
  }
  return [...months].sort((a, b) => b[0] - a[0])
}

/**
 * The session store, with a turn handed back to the event loop before each clock move and each
 * re-read.
 *
 * `HistoryService` walks a month at a time and, over the memory store, every await in it settles
 * at once, so a whole year of derivations would run as one block and hold every other request
 * for seconds. Its clock moves and re-reads are the natural seams between months and between
 * decisions, and they all go through this store, so that is where the turns are taken.
 */
function takingTurns(store: SessionStore): SessionStore {
  return {
    create: (input) => store.create(input),
    getByTokenHash: (hash) => store.getByTokenHash(hash),
    getById: async (id) => {
      await nextTick()
      return store.getById(id)
    },
    listByCif: (cif) => store.listByCif(cif),
    patch: async (id, patch, expectedVersion) => {
      await nextTick()
      return store.patch(id, patch, expectedVersion)
    },
    touch: (id, at) => store.touch(id, at),
    erase: (id) => store.erase(id),
    putIdempotent: (sessionId, key, response) => store.putIdempotent(sessionId, key, response),
    getIdempotent: (sessionId, key) => store.getIdempotent(sessionId, key),
    expireIdle: (days, now) => store.expireIdle(days, now),
  }
}
