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
 * demo's own RM never opens an empty file. A hero who already has any session is left alone,
 * and nothing here ever writes to a session it did not open.
 *
 * Deterministic by cif: every input is the customer's own ledger at a fixed date and the
 * fixtures' activity, so two processes lay down the same journey (ids and wall-clock stamps
 * apart). Idempotent: a customer whose journey session exists is skipped, so a restart over
 * Postgres adds nothing. Background: `start()` returns at once, the walk yields to the event loop
 * between months as well as between customers, and `ready()` resolves when it has finished.
 */
import { addDays, addMonths } from '@dhan/core'
import type { IsoDate } from '@dhan/contracts'
import type { AdvisoryService } from '../advisory.service.ts'
import type { ConversationService } from '../conversation.service.ts'
import type { DecisionService } from '../decision.service.ts'
import { HistoryService } from '../history.service.ts'
import type { SessionService } from '../session.service.ts'
import type { Logger } from '../../infra/logger.ts'
import type { BankDataPort, Clock, RmDeskPort, Session, SessionStore } from '../../ports/index.ts'
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
  /** The population a book is drawn from. */
  bank: BankDataPort
  /** Whose book each customer is in: a customer in nobody's book is never simulated. */
  desk: RmDeskPort
  /** The store behind the session service, for reading and moving the journey session's clock. */
  sessionStore: SessionStore
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
  simulated: number
  skipped: number
  failed: number
  ms: number
}

/** Hand the event loop back once: queued requests, timers and I/O all run before the next step. */
const nextTick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

export class ActivitySimulator {
  private readonly deps: ActivitySimulatorDeps
  private running: Promise<void> | null = null
  private stopped = false
  private last: SimulationReport | null = null

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
   * in hand is finished first: a journey cut off half way would be skipped as done on the next
   * boot, because its session already exists.
   */
  stop(): void {
    this.stopped = true
  }

  private async run(): Promise<SimulationReport> {
    const started = performance.now()
    const report: SimulationReport = { simulated: 0, skipped: 0, failed: 0, ms: 0 }
    // Boot first: `start()` is called before the server listens, and nothing here should be
    // between the process and its first request.
    await nextTick()

    for (const cif of await this.targets()) {
      if (this.stopped) break
      try {
        const done = await this.journeyOf(cif)
        if (done) report.simulated += 1
        else report.skipped += 1
      } catch (err) {
        report.failed += 1
        this.deps.log.warn({ cif, err: (err as Error).message }, 'rm journey not simulated')
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

  /** Lay one customer's journey down. False where it was already there (or is a reviewer's). */
  private async journeyOf(cif: string): Promise<boolean> {
    const { sessionStore, sessions } = this.deps
    const activity = this.deps.activity.get(cif) ?? null
    const existing = await sessionStore.listByCif(cif)
    // A book customer is skipped once their journey exists. A hero is skipped once they have
    // any session at all: a reviewer's own history is their journey, and it is not ours to add to.
    if (activity ? existing.some(isJourney) : existing.length > 0) return false

    // The token is never kept: this session is written by the simulator and read by the console.
    const { session } = await sessions.create(cif, JOURNEY_HINT)
    const home = { asOf: session.asOf, lastSeen: session.lastSeen }
    // The RM clock, never past the session's own today (a source whose ledger stops early opens
    // its sessions at the ledger's end, and no simulated day may be after it).
    const anchor = this.deps.book.asOf < home.asOf ? this.deps.book.asOf : home.asOf

    let current = session
    let walked = JOURNEY_MONTHS // months still to decide, counted back from the anchor
    for (const [monthsAgo, asks] of byMonth(activity?.enquiries ?? [])) {
      const stop = Math.min(monthsAgo, JOURNEY_MONTHS)
      current = await this.walk(current, anchor, walked, stop)
      walked = Math.min(walked, stop)
      for (const enquiry of asks) current = await this.ask(current, enquiry)
    }
    current = await this.walk(current, anchor, walked, 0)

    if (activity?.recentHandoff) {
      current = await this.handoff(current, addDays(anchor, -(activity.handoffDaysAgo ?? 0)))
    }

    // Home, as `create` left it, so the session reads like every other at the RM clock.
    await this.moveTo(current, home.asOf, home.lastSeen)
    return true
  }

  /**
   * Decide the months from `from` back to just after `to` (both counted back from the anchor),
   * and leave the clock on the month `to`.
   *
   * `HistoryService.seed` walks back from wherever the session's clock is, so the clock is set to
   * the segment's end first and a history of exactly the segment's length is seeded from there.
   */
  private async walk(
    session: Session,
    anchor: IsoDate,
    from: number,
    to: number,
  ): Promise<Session> {
    const end = addMonths(anchor, -to)
    let current = await this.moveTo(session, end)
    if (from > to) current = await this.history(from - to).seed(current)
    return current
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
