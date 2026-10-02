/**
 * The book's customers, each read once at the RM clock and held.
 *
 * `state(cif)` is the engine's whole reading of one customer (customer-state.ts), memoised per
 * (cif, as-of). The RM clock is the data anchor and never moves, and the ledger behind it is a
 * fixed seed, so a state computed once is the state for the life of the process; a reseed is a
 * restart. What changes while the console is open — a handoff, a note, a decision taken in the
 * app — is activity, and it is read fresh on every request by `activity.service.ts`, never
 * folded into the memo.
 *
 * `derive` is the cost (about 120 ms a customer, six seconds for the whole population), so the
 * memo is warmed in the background after boot (`RM_WARM`). A request that arrives before the
 * warm-up reaches a customer computes that customer itself, or waits on the same promise if the
 * warm-up has already started it, so nothing is derived twice.
 *
 * `derive` is synchronous CPU, so the derives themselves take turns: one at a time across the
 * whole service, each after a yield to the event loop. Started together, a cold Book page ran
 * thirty-eight of them back to back and held the process, the customer app, health checks and
 * the avatar's RPC host included, for four and a half seconds. Taking turns costs the page
 * nothing (the CPU is the same either way) and lets every other request in between them. The
 * reads from the bank still run concurrently; only the arithmetic waits its turn.
 *
 * Read-only by construction: the only ports here are the bank's reads and the shelf. It holds no
 * session store, snapshot store or audit store, so there is nothing it could write to.
 */
import type { IsoDate } from '@dhan/contracts'
import type { Logger } from '../../infra/logger.ts'
import type { BankDataPort, ProductShelfPort, RmDeskPort } from '../../ports/index.ts'
import { customerState, STATE_WINDOW_MONTHS } from './customer-state.ts'
import type { CustomerState } from './customer-state.ts'

export interface RmBookServiceDeps {
  bank: BankDataPort
  shelf: ProductShelfPort
  desk: RmDeskPort
  /** The RM clock: the data anchor, `SEED_ANCHOR`. */
  asOf: IsoDate
  log: Logger
}

/** Yield between customers so a warm-up never holds the event loop for the whole book. */
const nextTick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

export class RmBookService {
  private readonly deps: RmBookServiceDeps
  private readonly memo = new Map<string, Promise<CustomerState>>()
  /** The last derive queued: each waits on the one before it, so only one runs at a time. */
  private turn: Promise<unknown> = Promise.resolve()
  private stopped = false
  private warming: Promise<void> | null = null

  constructor(deps: RmBookServiceDeps) {
    this.deps = deps
  }

  /** The date every figure on the console is read at. */
  get asOf(): IsoDate {
    return this.deps.asOf
  }

  /** One customer at the RM clock. `NotFound` for a cif the source does not hold. */
  state(cif: string): Promise<CustomerState> {
    const key = `${cif}|${this.deps.asOf}`
    const held = this.memo.get(key)
    if (held) return held
    const built = this.build(cif)
    this.memo.set(key, built)
    // A failed read is not remembered: the next request tries again rather than inheriting it.
    built.catch(() => {
      if (this.memo.get(key) === built) this.memo.delete(key)
    })
    return built
  }

  /**
   * Many customers, in the order asked. A customer the source cannot load is logged and left
   * out, so one broken file costs the book one row rather than the whole page.
   */
  async states(cifs: readonly string[]): Promise<CustomerState[]> {
    const settled = await Promise.allSettled(cifs.map((cif) => this.state(cif)))
    const out: CustomerState[] = []
    settled.forEach((result, i) => {
      if (result.status === 'fulfilled') out.push(result.value)
      else {
        const reason = result.reason as Error
        this.deps.log.warn({ cif: cifs[i], err: reason.message }, 'rm book: customer not loaded')
      }
    })
    return out
  }

  /** Whether a customer's state is already in hand. For the warm-up's own log and the tests. */
  isWarm(cif: string): boolean {
    return this.memo.has(`${cif}|${this.deps.asOf}`)
  }

  /**
   * Every customer in somebody's book, one at a time. Customers the source holds but nobody is
   * assigned are skipped: no console will ever ask for them.
   */
  async warm(): Promise<{ customers: number; ms: number }> {
    const started = performance.now()
    const population = await this.deps.bank.listPopulation()
    let customers = 0
    for (const { cif } of population) {
      if (this.stopped) break
      if ((await this.deps.desk.assignmentOf(cif)) === null) continue
      await this.state(cif).then(
        () => {
          customers += 1
        },
        (err: Error) =>
          this.deps.log.warn({ cif, err: err.message }, 'rm warm-up: customer skipped'),
      )
      await nextTick()
    }
    return { customers, ms: Math.round(performance.now() - started) }
  }

  /** Start the warm-up and return at once. Never throws; the outcome is logged. */
  startWarm(): void {
    if (this.warming) return
    this.warming = this.warm().then(
      (r) => this.deps.log.info(r, 'rm book warmed'),
      (err: Error) => this.deps.log.error({ err: err.message }, 'rm warm-up failed'),
    )
  }

  /** Resolves when a started warm-up has finished; at once when none was started. */
  warmed(): Promise<void> {
    return this.warming ?? Promise.resolve()
  }

  /** Stop the warm-up between customers, so a closing process does not keep deriving. */
  stop(): void {
    this.stopped = true
  }

  private async build(cif: string): Promise<CustomerState> {
    const { bank, shelf, asOf } = this.deps
    const [loaded, consent, products] = await Promise.all([
      bank.loadCustomerFile(cif, asOf, STATE_WINDOW_MONTHS),
      bank.getConsent(cif),
      shelf.list(),
    ])
    const derived = this.turn.then(nextTick).then(() =>
      customerState({
        cif,
        asOf,
        file: loaded.file,
        provenance: loaded.provenance,
        consent,
        shelf: products,
      }),
    )
    // A derive that throws hands the turn on all the same; its caller still sees the error.
    this.turn = derived.catch(() => undefined)
    return derived
  }
}
