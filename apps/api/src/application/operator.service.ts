/**
 * The two operator reads that go to the bank.
 *
 * Both are diagnostics rather than product: what the seed run wrote and whether it has drifted,
 * and what the last read off the bank could not map cleanly. Neither is reachable without
 * `OPERATOR_KEY`, and neither is a customer-facing answer.
 */
import type { MappingReportResponse, ProvenanceMap, SeedStatus } from '@dhan/contracts'
import type { SeedInfo } from './seed-info.ts'
import type { BankDataPort } from '../ports/index.ts'

/** What to report when there is no customer to read a provenance map from. */
const NO_CUSTOMER: ProvenanceMap = {
  PROFILE: 'fixture',
  ACCOUNTS: 'fixture',
  TXN: 'fixture',
  LIABILITIES: 'fixture',
  HOLDINGS: 'fixture',
}

export interface OperatorServiceDeps {
  bank: BankDataPort
  seed: SeedInfo
  /** Read at request time; null under a source with no mapping layer. */
  mappingReport: () => MappingReportResponse['report']
}

export class OperatorService {
  private readonly deps: OperatorServiceDeps

  constructor(deps: OperatorServiceDeps) {
    this.deps = deps
  }

  async seedStatus(): Promise<SeedStatus> {
    const description = this.deps.bank.describe()
    // The provenance map is stamped per file; one small load on the first customer reads it.
    const [first] = await this.deps.bank.listCustomers()
    const provenance = first
      ? (await this.deps.bank.loadCustomerFile(first.cif, description.dataFreshnessDate, 1))
          .provenance
      : NO_CUSTOMER
    const [seedRun, drift] = await Promise.all([
      this.deps.seed.provenance(),
      this.deps.seed.drift(),
    ])
    return { seedRun, drift, bankSource: description.source, provenance }
  }

  /** Named `mapping` and not `mappingReport`, so it cannot be confused with the dep it reads. */
  mapping(): MappingReportResponse {
    return { source: this.deps.bank.describe().source, report: this.deps.mappingReport() }
  }
}
