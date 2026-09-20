/**
 * Consent, applied before a single number is derived.
 *
 * A customer file has five blocks and consent is granted per block. Withdrawing "Loans" on
 * Record → Your data has to mean the advice is recomputed without the liabilities — not that a
 * toggle changed colour — so the file is scoped here, before `derive()` runs, and the scoped file
 * is what the snapshot's input hash covers. The engine never sees a block it was not allowed to.
 *
 * Profile is the one block that cannot be blanked outright: `derive()` needs a date of birth and
 * a risk profile to say anything. Withdrawing it leaves the identity fields and clears the rest.
 */
import type { CustomerFile } from '@dhan/core'
import type { Consent, ConsentScope } from '@dhan/contracts'

export type Scope = ConsentScope

/** Scopes the consent grants, less those the session has withdrawn. */
export function grantedScopes(consent: Consent, overrides: readonly Scope[]): ReadonlySet<Scope> {
  const withdrawn = new Set(overrides)
  return new Set(consent.scopes.filter((s) => !withdrawn.has(s)))
}

export function scopeFile(file: CustomerFile, granted: ReadonlySet<Scope>): CustomerFile {
  const has = (scope: Scope): boolean => granted.has(scope)

  return {
    customer: has('PROFILE')
      ? file.customer
      : {
          ...file.customer,
          gender: '',
          maritalStatus: '',
          dependents: 0,
          declaredAnnualIncome: 0,
          city: '',
          stateCode: '',
          kycStatus: '',
        },
    accounts: has('ACCOUNTS') ? file.accounts : [],
    transactions: has('TXN') ? file.transactions : [],
    liabilities: has('LIABILITIES') ? file.liabilities : [],
    holdings: has('HOLDINGS') ? file.holdings : [],
    policies: has('HOLDINGS') ? file.policies : [],
  }
}
