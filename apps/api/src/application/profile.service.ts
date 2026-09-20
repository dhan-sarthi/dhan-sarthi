/**
 * The declared profile: read and write the facts no bank endpoint carries.
 *
 * These change the advice, so a write is not a preference save. Raising declared income moves
 * the surplus, the EMI-to-income ratio and every affordability answer that rests on them, and
 * changing the risk profile can turn a recommendation the gate allowed into one it refuses. So
 * the response is the profile as it now stands and the client is expected to reload the view.
 */
import type { DeclaredProfileResponse, ProfilePatch } from '@dhan/contracts'
import { IncompleteProfile, ValidationFailed } from './errors.ts'
import type {
  BankDataPort,
  DeclaredProfile,
  DeclaredProfileStore,
  Session,
} from '../ports/index.ts'

function present(profile: DeclaredProfile, missing: readonly string[]): DeclaredProfileResponse {
  return {
    cif: profile.cif,
    maritalStatus: profile.maritalStatus,
    dependents: profile.dependents,
    employmentType: profile.employmentType,
    declaredAnnualIncome: profile.declaredAnnualIncome,
    preferredLanguage: profile.preferredLanguage,
    riskProfile: profile.riskProfile,
    taxRegime: profile.taxRegime,
    ...(profile.dateOfBirth === undefined ? {} : { dateOfBirth: profile.dateOfBirth }),
    updatedAt: profile.updatedAt,
    missing: [...missing],
  }
}

export interface ProfileServiceDeps {
  profiles: DeclaredProfileStore
  bank: BankDataPort
}

export class ProfileService {
  private readonly deps: ProfileServiceDeps

  constructor(deps: ProfileServiceDeps) {
    this.deps = deps
  }

  async get(session: Session): Promise<DeclaredProfileResponse> {
    const [profile, missing] = await Promise.all([
      this.deps.profiles.get(session.cif),
      this.missing(session.cif),
    ])
    return present(profile, missing)
  }

  async patch(session: Session, patch: ProfilePatch): Promise<DeclaredProfileResponse> {
    // An empty patch is a client bug rather than a no-op worth accepting silently: it would
    // stamp `updatedAt` and tell the customer we recorded something we did not.
    if (Object.keys(patch).length === 0) {
      throw new ValidationFailed('The patch named no fields to change.')
    }
    const patched = await this.deps.profiles.patch(session.cif, patch)
    return present(patched, await this.missing(session.cif))
  }

  /**
   * What the app is still waiting on the customer for.
   *
   * Only the date of birth can actually be absent, and only for a customer the bank sends none
   * for — the other fields are seeded and the patch schema will not let them be cleared. It
   * matters because age gates every suitability rule.
   *
   * The bank is asked rather than the store, because the store is not where the answer lives:
   * 433 carries a date of birth and so does a consented pull, and reporting `dateOfBirth` as
   * missing whenever the *declared* copy is empty told the UI to ask a customer for something
   * the bank had already said. `getCustomer` is the only thing that knows whether any source
   * could supply it, so the emptiness of this list means "advice can run", which is the only
   * useful thing a client can do with it.
   *
   * The adapter names the fields in a typed error rather than only in its message: this used
   * to grep the sentence for 'dateOfBirth', so a reworded throw would have quietly reported
   * nothing missing.
   */
  private async missing(cif: string): Promise<string[]> {
    try {
      await this.deps.bank.getCustomer(cif)
      return []
    } catch (err) {
      if (err instanceof IncompleteProfile) return [...err.missing]
      throw err
    }
  }
}
