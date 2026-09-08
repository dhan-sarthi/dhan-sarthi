/**
 * The declared profile store, in process.
 *
 * Seeded so the product is usable on first run and then owned by whoever edits it: a `patch`
 * moves only the fields it names and stamps `updatedAt`, which is what lets the UI say when a
 * customer last told us their income rather than implying it is a live bank fact.
 *
 * A Postgres sibling belongs beside this one — `app.declared_profiles`, keyed on cif, with the
 * same three operations — and nothing above the port would move.
 */
import type { Customer } from '@dhan/core'
import { NotFound } from '../../application/errors.ts'
import type { Clock } from '../../ports/index.ts'
import type {
  DeclaredFacts,
  DeclaredFactsPatch,
  DeclaredProfile,
  DeclaredProfileStore,
} from '../../ports/declared-profile.port.ts'

export interface SeededDeclaredProfile extends DeclaredFacts {
  cif: string
}

/**
 * The declared half of a generated customer file, as seeds.
 *
 * Under the fixtures and Postgres sources the generator already produced every declared field,
 * so the profile store starts as a mirror of them and the profile API behaves the same way it
 * does over the bank feed. Under the IDBI source there is nothing to mirror and the seeds are
 * written by hand, because the catalogue carries none of these fields.
 */
export function declaredSeedsFrom(
  customers: readonly { customer: Customer }[],
): SeededDeclaredProfile[] {
  return customers.map(({ customer }) => ({
    cif: customer.cif,
    maritalStatus: customer.maritalStatus,
    dependents: customer.dependents,
    employmentType: customer.employmentType,
    declaredAnnualIncome: customer.declaredAnnualIncome,
    preferredLanguage: customer.preferredLanguage,
    riskProfile: customer.riskProfile,
    taxRegime: customer.taxRegime,
    dateOfBirth: customer.dateOfBirth,
  }))
}

export class InMemoryDeclaredProfiles implements DeclaredProfileStore {
  private readonly rows = new Map<string, DeclaredProfile>()
  private readonly clock: Clock

  constructor(seeds: readonly SeededDeclaredProfile[], clock: Clock) {
    this.clock = clock
    const at = clock.now().toISOString()
    for (const seed of seeds) {
      const { cif, ...facts } = seed
      this.rows.set(cif, { cif, ...facts, updatedAt: at })
    }
  }

  async get(cif: string): Promise<DeclaredProfile> {
    const row = this.rows.get(cif)
    if (row === undefined) throw new NotFound(`No declared profile for cif ${cif}.`)
    return { ...row }
  }

  async find(cif: string): Promise<DeclaredProfile | null> {
    const row = this.rows.get(cif)
    return row === undefined ? null : { ...row }
  }

  async list(): Promise<DeclaredProfile[]> {
    return [...this.rows.values()].map((r) => ({ ...r })).sort((a, b) => a.cif.localeCompare(b.cif))
  }

  async patch(cif: string, patch: DeclaredFactsPatch): Promise<DeclaredProfile> {
    const current = this.rows.get(cif)
    if (current === undefined) throw new NotFound(`No declared profile for cif ${cif}.`)
    // Only the keys actually present move: an absent key is "leave it", not "clear it", which
    // is the difference between a partial edit and a form that silently wipes what it omits.
    const next: DeclaredProfile = { ...current, updatedAt: this.clock.now().toISOString() }
    for (const [key, value] of Object.entries(patch) as [keyof DeclaredFacts, unknown][]) {
      if (value === undefined) continue
      Object.assign(next, { [key]: value })
    }
    this.rows.set(cif, next)
    return { ...next }
  }
}
