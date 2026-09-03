import { routeById } from '@dhan/contracts'
import type { ProvenanceMap } from '@dhan/contracts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

/** What to report when there is no customer to read a provenance map from. */
const NO_CUSTOMER: ProvenanceMap = {
  PROFILE: 'fixture',
  ACCOUNTS: 'fixture',
  TXN: 'fixture',
  LIABILITIES: 'fixture',
  HOLDINGS: 'fixture',
}

export function operatorRoutes(r: Registrar, s: AppServices): void {
  r(routeById('operatorAvatarStatus'), async () => s.avatar.operatorStatus())

  r(routeById('operatorReleaseAll'), async () => ({
    released: await s.avatar.releaseAll('release_all'),
  }))

  r(routeById('operatorSeed'), async () => {
    const description = s.bank.describe()
    // The provenance map is stamped per file; one small load on the first customer reads it.
    const [first] = await s.bank.listCustomers()
    const provenance = first
      ? (await s.bank.loadCustomerFile(first.cif, description.dataFreshnessDate, 1)).provenance
      : NO_CUSTOMER
    const [seedRun, drift] = await Promise.all([s.seed.provenance(), s.seed.drift()])
    return { seedRun, drift, bankSource: description.source, provenance }
  })
}
