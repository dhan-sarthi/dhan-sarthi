/**
 * The facts about a customer that no bank endpoint carries.
 *
 * Income, employment, dependents, marital status, preferred language, risk profile and tax
 * regime are not the bank's to send — they are what a customer tells an adviser, and IDBI's
 * twenty-four APIs contain nothing resembling any of them. 433 comes closest, returning a
 * hundred and six keys of one customer's record, and it carries none.
 *
 * That leaves two honest options and one dishonest one. The dishonest one is to default them,
 * which is how a demo ends up advising on an income nobody stated. The honest ones are to
 * refuse to advise until they are known, or to hold them ourselves and say so. This port is
 * the second: the app owns these fields, `/api/v1/profile` reads and writes them, and the
 * provenance shown on Record → Your data says `declared` rather than `idbi` for every one.
 *
 * A date of birth is here for a narrower reason. The bank does send one, for the customers it
 * holds a record or a consented pull for — but not for all of them, and age gates suitability.
 * So it is accepted as a declared fallback and the bank's own value always wins.
 *
 * One adapter today, `InMemoryDeclaredProfiles`: built for the generated sources inside
 * `adapters/memory/generated-source.ts` and, for IDBI's hand-written seeds, in
 * composition/profiles.ts. The second is a Postgres sibling — composition/profiles.ts already
 * says where it goes, and apps/api/migrations/0005_bank.sql already has the columns
 * (`declared_annual_income`, `risk_profile`, `marital_status`). Until it lands the interface is
 * still load-bearing, because two of its three callers are forbidden from naming the class:
 * application/profile.service.ts by `application-never-imports-adapters-or-http`, and
 * adapters/idbi-sandbox/bank-data.idbi-sandbox.ts by `adapters-do-not-import-each-other`
 * (.dependency-cruiser.cjs).
 */
import type { Customer } from '@dhan/core'
import type { IsoDate } from '@dhan/contracts'

/** What the customer has told us. Everything is required except the date of birth. */
export interface DeclaredFacts {
  maritalStatus: string
  dependents: number
  employmentType: Customer['employmentType']
  declaredAnnualIncome: number
  preferredLanguage: string
  riskProfile: Customer['riskProfile']
  taxRegime: Customer['taxRegime']
  /** Only used where the bank sends none. */
  dateOfBirth?: IsoDate | undefined
}

export interface DeclaredProfile extends DeclaredFacts {
  cif: string
  /** When the customer last changed any of this, so the UI can say how stale it is. */
  updatedAt: string
}

/**
 * A partial edit.
 *
 * `| undefined` is explicit on every field because `exactOptionalPropertyTypes` is on and a
 * JSON body parsed by zod produces keys whose value may be `undefined`. The store treats an
 * undefined value the same way it treats an absent key — leave it alone — so the two spellings
 * mean the same thing here, and neither of them clears a field.
 */
export type DeclaredFactsPatch = { [K in keyof DeclaredFacts]?: DeclaredFacts[K] | undefined }

export interface DeclaredProfileStore {
  /** Throws NotFound for a cif the app holds no profile for. */
  get(cif: string): Promise<DeclaredProfile>
  /** Null rather than a throw, for the paths that can proceed without one. */
  find(cif: string): Promise<DeclaredProfile | null>
  list(): Promise<DeclaredProfile[]>
  /** Returns the profile as it now stands. Only the fields present in the patch move. */
  patch(cif: string, patch: DeclaredFactsPatch): Promise<DeclaredProfile>
}
