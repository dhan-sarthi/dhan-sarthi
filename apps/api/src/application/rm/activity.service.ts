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
 *   so it must check the handoff's customer itself with `scope.assertInBook`.
 *
 * The bodies below are the safe defaults the core builder left: valid, empty answers per the
 * contract, so the route table is complete and every page renders before the journeys exist.
 * Replace them; keep the signatures, which `console.service.ts` and the routes compile against.
 *
 * Seeded history writes `talk_to_rm: did_it` decisions (`history.service.ts`), so a handoff is
 * not simply "every talk_to_rm decision": the simulator's `recentHandoff` and a reviewer's own
 * tap are the requests a desk should see. `monthsAgo` / `handoffDaysAgo` in the fixtures'
 * `BOOK_ACTIVITY` are measured back from the RM clock, `book.asOf`.
 */
import type {
  AdviceItem,
  Handoff,
  IsoDate,
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
import { NotFound } from '../errors.ts'
import type { Logger } from '../../infra/logger.ts'
import type {
  AuditStore,
  BankDataPort,
  Clock,
  RmActivityPort,
  SessionStore,
  SnapshotStore,
} from '../../ports/index.ts'
import type { RmAccessLog } from './access-log.ts'
import type { RmBookScope } from './book-scope.ts'
import type { RmBookService } from './book.service.ts'
import type { RmCaller } from './caller.ts'

/** What the book row, the strength badge and the attrition watch need to know per customer. */
export interface ActivityFacts {
  /**
   * The latest simulated date of anything the customer or the desk did: a decision, a plan
   * version, a call, a note. Null where nothing is on record.
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

export interface RmActivityDeps {
  bank: BankDataPort
  sessions: SessionStore
  snapshots: SnapshotStore
  audit: AuditStore
  activity: RmActivityPort
  scope: RmBookScope
  book: RmBookService
  accessLog: RmAccessLog
  clock: Clock
  log: Logger
}

export class RmActivityService {
  private readonly deps: RmActivityDeps

  constructor(deps: RmActivityDeps) {
    this.deps = deps
  }

  /* ---------------------------------------------------------------- *
   * Read by the console's own pages. Never throw.
   * ---------------------------------------------------------------- */

  /** One entry per cif asked for; a cif with nothing on record gets `NO_ACTIVITY`. */
  async facts(cifs: readonly string[]): Promise<Map<string, ActivityFacts>> {
    return new Map(cifs.map((cif) => [cif, NO_ACTIVITY]))
  }

  /** Handoffs on these customers that are not resolved yet (open and contacted), oldest first. */
  async handoffs(cifs: readonly string[]): Promise<Handoff[]> {
    void cifs
    return []
  }

  /** Every BLOCKED advice record on these customers, newest first. */
  async refusalItems(cifs: readonly string[]): Promise<AdviceItem[]> {
    void cifs
    return []
  }

  /**
   * Activity per calendar month across these customers, aligned to `months` (`YYYY-MM`, oldest
   * first). Empty until there is something to count.
   */
  async monthlyActivity(cifs: readonly string[], months: readonly string[]): Promise<number[]> {
    void cifs
    void months
    return []
  }

  /* ---------------------------------------------------------------- *
   * The activity routes. `:cif` is already in the caller's book.
   * ---------------------------------------------------------------- */

  async journey(rm: RmCaller, cif: string): Promise<RmJourney> {
    void rm
    void cif
    return { events: [] }
  }

  async customerRecord(rm: RmCaller, cif: string): Promise<RmCustomerRecord> {
    void rm
    void cif
    return { records: [], chains: 0 }
  }

  async verifyCustomerRecord(rm: RmCaller, cif: string): Promise<RmCustomerVerification> {
    void rm
    void cif
    return { checked: 0, chains: [], valid: true, checkedAt: this.deps.clock.now().toISOString() }
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
    return {
      event: {
        id: note.id,
        at: note.atSim,
        kind: note.kind,
        source: 'rm',
        title: note.kind === 'call' ? `Call logged by ${rm.name}` : `Note by ${rm.name}`,
        detail: note.text,
        diff: null,
        verdict: null,
        ruleId: null,
        amount: null,
      },
    }
  }

  /** 404 for a handoff nobody raised; 403 (`scope.assertInBook`) for one outside the book. */
  async updateHandoff(
    rm: RmCaller,
    handoffId: string,
    patch: RmHandoffPatch,
  ): Promise<RmHandoffResponse> {
    void rm
    void patch
    throw new NotFound(`No handoff with id ${handoffId}.`)
  }

  /** Writes a `revealed` access entry with the reason, then answers the one field asked for. */
  async reveal(rm: RmCaller, cif: string, body: RmRevealRequest): Promise<RmRevealResponse> {
    const customer = await this.deps.bank.getCustomer(cif)
    await this.deps.accessLog.record(rm, cif, 'revealed', body.reason, body.field)
    return { field: body.field, value: customer.dateOfBirth }
  }

  async refusals(rm: RmCaller): Promise<RmRefusals> {
    void rm
    return { items: [], byRule: [], total: 0 }
  }

  async verifyBook(rm: RmCaller): Promise<RmBookVerification> {
    void rm
    return { checked: 0, valid: true, broken: [], checkedAt: this.deps.clock.now().toISOString() }
  }

  async accessLog(rm: RmCaller): Promise<RmAccessLogResponse> {
    void rm
    return { entries: [] }
  }
}
