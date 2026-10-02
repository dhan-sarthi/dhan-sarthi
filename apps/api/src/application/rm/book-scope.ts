/**
 * The book as a boundary: which customers an RM may open, and the one answer for any other.
 *
 * Every route that names a cif asks this first, in the handler, before any service reads a
 * byte of the customer. Three outcomes and no fourth:
 *
 * - assigned to the caller and held by the source: allowed;
 * - held by the source but assigned to someone else, or to nobody: 403 `NotInBook`;
 * - not held by the source at all: 404.
 *
 * The book is the assignment intersected with the population the source holds, so an
 * assignment to a cif the source has never heard of shrinks the book rather than putting a row
 * on it that 404s when opened.
 *
 * A 403 is also an access entry (`denied`), written for the RM who tried, before the refusal is
 * thrown: a log of what an RM was allowed to see says nothing about what they tried to see, and
 * a refused attempt is the entry a data-protection review asks for first. A 404 is not logged:
 * there is no customer to log it against, only whatever string was typed.
 */
import { NotFound, NotInBook } from '../errors.ts'
import type { BankDataPort, RmDeskPort } from '../../ports/index.ts'
import type { RmCaller } from './caller.ts'

/** How long the population is trusted in process. A reseed shows up within it. */
const POPULATION_TTL_MS = 60_000

/** What an RM tried to do to a customer, in the access log's words. */
export interface Attempt {
  /** The purpose they gave, or what they tried: "Open the journey". */
  purpose: string
  detail: string | null
}

/** A route that names no attempt of its own still leaves an entry that says what was refused. */
export const OUTSIDE_THE_BOOK: Attempt = {
  purpose: 'Reach a customer outside their book',
  detail: null,
}

export interface RmBookScopeDeps {
  desk: RmDeskPort
  bank: BankDataPort
  /** Wall clock for the cache. Never domain time. */
  now?: () => number
  /**
   * Writes the `denied` entry for a refused attempt, before the 403 is thrown. Whatever it does,
   * the refusal stands: a failed write is the caller's to log, never a reason to let the RM in.
   */
  onDenied?: (rm: RmCaller, cif: string, attempt: Attempt) => Promise<void>
}

export class RmBookScope {
  private readonly deps: RmBookScopeDeps
  private readonly now: () => number
  private population: { at: number; cifs: Promise<ReadonlySet<string>> } | null = null

  constructor(deps: RmBookScopeDeps) {
    this.deps = deps
    this.now = deps.now ?? Date.now
  }

  /** Every cif the source holds. Cached briefly: the book page asks for it on every read. */
  async populationCifs(): Promise<ReadonlySet<string>> {
    const held = this.population
    if (held && this.now() - held.at < POPULATION_TTL_MS) return held.cifs
    const cifs = this.deps.bank
      .listPopulation()
      .then((all): ReadonlySet<string> => new Set(all.map((c) => c.cif)))
    this.population = { at: this.now(), cifs }
    // A failed read is not cached: the next request asks again rather than inheriting it.
    cifs.catch(() => {
      if (this.population?.cifs === cifs) this.population = null
    })
    return cifs
  }

  /** The caller's book, in cif order. */
  async book(rm: RmCaller): Promise<string[]> {
    const [assigned, held] = await Promise.all([
      this.deps.desk.bookOf(rm.rmId),
      this.populationCifs(),
    ])
    return assigned.filter((cif) => held.has(cif))
  }

  /**
   * Throws `NotInBook` (403) or `NotFound` (404); returns quietly for a customer in the book.
   * A 403 is logged first as `attempt`, for the caller.
   */
  async assertInBook(
    rm: RmCaller,
    cif: string,
    attempt: Attempt = OUTSIDE_THE_BOOK,
  ): Promise<void> {
    const [owner, held] = await Promise.all([
      this.deps.desk.assignmentOf(cif),
      this.populationCifs(),
    ])
    if (!held.has(cif)) throw new NotFound(`No customer with cif ${cif}.`)
    if (owner === rm.rmId) return
    try {
      await this.deps.onDenied?.(rm, cif, attempt)
    } catch {
      // The caller's hook logs its own failures; the 403 below is the answer either way.
    }
    throw new NotInBook()
  }

  /** The RM a customer is assigned to, for a page that shows "assigned RM". */
  async ownerOf(cif: string): Promise<string | null> {
    return this.deps.desk.assignmentOf(cif)
  }
}
