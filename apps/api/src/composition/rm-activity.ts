/**
 * Owned by the activity builder.
 *
 * The one place the activity side of the RM console is wired: the activity service the Book,
 * Today, Insights and activity routes read, and the simulator that lays down each book
 * customer's journey. `root.ts` calls `wireRmActivity` once, after every customer-side service
 * exists, and calls `start()` after the routes are registered and `stop()` on close; it never
 * names an activity class itself, so changing what is built here never touches root.ts.
 *
 * The context carries everything the activity side could need, ports and services both, so
 * adding a dependency is an edit to this file and to the class that takes it, not to the root.
 *
 * What each book customer did comes from the fixtures, which only `adapters/memory` may name, so
 * it is read from there (`generatedBookActivity`) under every source: it is part of the synthetic
 * persona, as the ledger the Postgres seed writes is.
 */
import { generatedBookActivity } from '../adapters/memory/book-activity.memory.ts'
import { ActivitySimulator } from '../application/rm/simulator.ts'
import { RmActivityService } from '../application/rm/activity.service.ts'
import type { AdvisoryService } from '../application/advisory.service.ts'
import type { ConversationService } from '../application/conversation.service.ts'
import type { DecisionService } from '../application/decision.service.ts'
import type { HistoryService } from '../application/history.service.ts'
import type { RecordService } from '../application/record.service.ts'
import type { SessionService } from '../application/session.service.ts'
import type { RmAccessLog } from '../application/rm/access-log.ts'
import type { RmBookScope } from '../application/rm/book-scope.ts'
import type { RmBookService } from '../application/rm/book.service.ts'
import type { Config } from '../config.ts'
import type { Logger } from '../infra/logger.ts'
import type {
  AuditStore,
  BankDataPort,
  Clock,
  ProductShelfPort,
  RmActivityPort,
  RmDeskPort,
  SessionStore,
  SnapshotStore,
} from '../ports/index.ts'

export interface RmActivityWiringContext {
  config: Config
  log: Logger
  clock: Clock
  ports: {
    bank: BankDataPort
    shelf: ProductShelfPort
    sessions: SessionStore
    snapshots: SnapshotStore
    audit: AuditStore
    desk: RmDeskPort
    activity: RmActivityPort
  }
  /** The customer-side services, for laying journeys down through the real paths. */
  services: {
    sessions: SessionService
    advisory: AdvisoryService
    decisions: DecisionService
    conversation: ConversationService
    history: HistoryService
    records: RecordService
  }
  rm: {
    scope: RmBookScope
    book: RmBookService
    accessLog: RmAccessLog
  }
}

export interface RmActivityWiring {
  activity: RmActivityService
  simulator: ActivitySimulator
  /** After the routes are registered. Starts the simulator when `RM_SIMULATE` is on. */
  start(): void
  /**
   * On close: stop between customers rather than mid-write, waiting (within the simulator's
   * bound) for the customer in hand to finish.
   */
  stop(): Promise<void>
}

export function wireRmActivity(ctx: RmActivityWiringContext): RmActivityWiring {
  const activity = new RmActivityService({
    bank: ctx.ports.bank,
    sessions: ctx.ports.sessions,
    snapshots: ctx.ports.snapshots,
    audit: ctx.ports.audit,
    activity: ctx.ports.activity,
    scope: ctx.rm.scope,
    book: ctx.rm.book,
    accessLog: ctx.rm.accessLog,
    shelf: ctx.ports.shelf,
    desk: ctx.ports.desk,
    clock: ctx.clock,
    log: ctx.log,
  })
  const simulator = new ActivitySimulator({
    bank: ctx.ports.bank,
    desk: ctx.ports.desk,
    sessionStore: ctx.ports.sessions,
    audit: ctx.ports.audit,
    snapshots: ctx.ports.snapshots,
    sessions: ctx.services.sessions,
    advisory: ctx.services.advisory,
    decisions: ctx.services.decisions,
    conversation: ctx.services.conversation,
    book: ctx.rm.book,
    activity: generatedBookActivity(),
    clock: ctx.clock,
    log: ctx.log,
  })
  return {
    activity,
    simulator,
    start: () => {
      if (ctx.config.RM_SIMULATE) simulator.start()
    },
    stop: () => simulator.stop(),
  }
}
