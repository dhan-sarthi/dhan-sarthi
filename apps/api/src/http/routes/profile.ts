/**
 * The declared profile: read and write the facts no bank endpoint carries.
 *
 * These change the advice, so a write is not a preference save. Raising declared income moves
 * the surplus, the EMI-to-income ratio and every affordability answer that rests on them, and
 * changing the risk profile can turn a recommendation the gate allowed into one it refuses. So
 * the response is the profile as it now stands and the client is expected to reload the view.
 */
import { routeById } from '@dhan/contracts'
import type { DeclaredProfileResponse } from '@dhan/contracts'
import { Forbidden, ValidationFailed } from '../../application/errors.ts'
import type { DeclaredProfile } from '../../ports/declared-profile.port.ts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

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
 */
async function missingFields(s: AppServices, cif: string): Promise<string[]> {
  try {
    await s.bank.getCustomer(cif)
    return []
  } catch (err) {
    if (err instanceof Forbidden) {
      // The adapter names the fields in the message; a date of birth is the only one the app
      // can be short of once the seeds are in place.
      return err.message.includes('dateOfBirth') ? ['dateOfBirth'] : []
    }
    throw err
  }
}

export function profileRoutes(r: Registrar, s: AppServices): void {
  r(routeById('getProfile'), async ({ session }) => {
    const [profile, missing] = await Promise.all([
      s.profiles.get(session.cif),
      missingFields(s, session.cif),
    ])
    return present(profile, missing)
  })

  r(routeById('patchProfile'), async ({ session, body }) => {
    // An empty patch is a client bug rather than a no-op worth accepting silently: it would
    // stamp `updatedAt` and tell the customer we recorded something we did not.
    if (Object.keys(body).length === 0) {
      throw new ValidationFailed('The patch named no fields to change.')
    }
    const patched = await s.profiles.patch(session.cif, body)
    return present(patched, await missingFields(s, session.cif))
  })
}
