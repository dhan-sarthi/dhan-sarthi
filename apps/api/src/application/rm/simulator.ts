/**
 * Owned by the activity builder.
 *
 * The activity simulator: a journey for every book customer, laid down through the real
 * services and never by writing rows by hand (docs/product/rm-console.md, "Activity behind the
 * book"). A dedicated session per customer whose token nobody holds, `HistoryService.seed` over
 * the months behind the RM clock, the fixtures' product enquiries through the same
 * `evaluateProduct` path text chat uses, and a recent `talk_to_rm` for the customers the
 * fixtures name. Deterministic by cif, idempotent (a customer whose journey exists is skipped),
 * started in the background after boot, and awaitable by tests through `ready()`.
 *
 * The default below simulates nothing and is ready at once, so the console boots and every
 * page renders with an honest empty state until the real one replaces it. `composition/
 * rm-activity.ts` constructs it and calls `start()` when `RM_SIMULATE` is on.
 */
import type { Logger } from '../../infra/logger.ts'
import type { Clock, SessionStore } from '../../ports/index.ts'
import type { RmBookService } from './book.service.ts'

export interface ActivitySimulatorDeps {
  sessions: SessionStore
  book: RmBookService
  clock: Clock
  log: Logger
}

export class ActivitySimulator {
  private readonly deps: ActivitySimulatorDeps
  private running: Promise<void> = Promise.resolve()

  constructor(deps: ActivitySimulatorDeps) {
    this.deps = deps
  }

  /** Begin in the background. Never throws: a failure is logged and the book shows less. */
  start(): void {
    this.running = Promise.resolve()
  }

  /** Resolves when the run `start()` began has finished (at once when nothing was started). */
  ready(): Promise<void> {
    return this.running
  }

  /** Stop between customers on shutdown, so a closing process does not keep writing. */
  stop(): void {
    void this.deps
  }
}
