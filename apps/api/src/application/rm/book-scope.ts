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
 */
import { NotFound, NotInBook } from '../errors.ts'
import type { BankDataPort, RmDeskPort } from '../../ports/index.ts'
import type { RmCaller } from './caller.ts'

/** How long the population is trusted in process. A reseed shows up within it. */
const POPULATION_TTL_MS = 60_000

export interface RmBookScopeDeps {
  desk: RmDeskPort
  bank: BankDataPort
  /** Wall clock for the cache. Never domain time. */
  now?: () => number
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

  /** Throws `NotInBook` (403) or `NotFound` (404); returns quietly for a customer in the book. */
  async assertInBook(rm: RmCaller, cif: string): Promise<void> {
    const [owner, held] = await Promise.all([
      this.deps.desk.assignmentOf(cif),
      this.populationCifs(),
    ])
    if (!held.has(cif)) throw new NotFound(`No customer with cif ${cif}.`)
    if (owner !== rm.rmId) throw new NotInBook()
  }

  /** The RM a customer is assigned to, for a page that shows "assigned RM". */
  async ownerOf(cif: string): Promise<string | null> {
    return this.deps.desk.assignmentOf(cif)
  }
}
