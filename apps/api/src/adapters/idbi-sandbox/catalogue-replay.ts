import type { Account, Customer, Holding, Liability, Transaction } from '@dhan/core'
import type {
  Consent,
  CustomerSummary,
  IsoDate,
  LedgerHorizon,
  ProvenanceMap,
} from '@dhan/contracts'
import type { BankDataPort, BankDataDescription, LoadedCustomerFile } from '../../ports/index.ts'
import { replayCatalogueFile } from './catalogue-seed.ts'

const PROVENANCE: ProvenanceMap = {
  PROFILE: 'fixture',
  ACCOUNTS: 'fixture',
  TXN: 'fixture',
  LIABILITIES: 'fixture',
  HOLDINGS: 'fixture',
}

function requireFixtureProvenance(provenance: ProvenanceMap): void {
  const scopes = Object.keys(PROVENANCE) as (keyof ProvenanceMap)[]
  if (
    scopes.some((scope) => provenance[scope] !== 'fixture') ||
    Object.values(provenance).some((source) => source !== 'fixture')
  )
    throw new Error('Catalogue replay accepts only explicitly fixture-origin data.')
}

/** Catalogue-shaped synthetic replay. It has no live transport or bank credential. */
export class CatalogueReplayBankData implements BankDataPort {
  private readonly fixtures: BankDataPort

  constructor(fixtures: BankDataPort) {
    this.fixtures = fixtures
  }

  listCustomers(): Promise<CustomerSummary[]> {
    return this.fixtures.listCustomers()
  }
  getCustomer(cif: string): Promise<Customer> {
    return this.fixtures.getCustomer(cif)
  }
  getConsent(cif: string): Promise<Consent> {
    return this.fixtures.getConsent(cif)
  }
  ledgerHorizon(cif: string): Promise<LedgerHorizon> {
    return this.fixtures.ledgerHorizon(cif)
  }
  getLiabilities(cif: string, asOf: IsoDate): Promise<Liability[]> {
    return this.fixtures.getLiabilities(cif, asOf)
  }
  getHoldings(cif: string, asOf: IsoDate): Promise<{ holdings: Holding[]; policies: Holding[] }> {
    return this.fixtures.getHoldings(cif, asOf)
  }
  async getAccounts(cif: string, asOf: IsoDate): Promise<Account[]> {
    return (await this.loadCustomerFile(cif, asOf, 24)).file.accounts
  }
  async getTransactions(
    cif: string,
    range: { from: IsoDate; to: IsoDate },
  ): Promise<Transaction[]> {
    const [loaded, transactions] = await Promise.all([
      this.fixtures.loadCustomerFile(cif, range.to, 24),
      this.fixtures.getTransactions(cif, range),
    ])
    requireFixtureProvenance(loaded.provenance)
    return replayCatalogueFile({ ...loaded.file, transactions }, range.to).transactions
  }
  async loadCustomerFile(
    cif: string,
    asOf: IsoDate,
    windowMonths: number,
  ): Promise<LoadedCustomerFile> {
    const loaded = await this.fixtures.loadCustomerFile(cif, asOf, windowMonths)
    requireFixtureProvenance(loaded.provenance)
    return { file: replayCatalogueFile(loaded.file, asOf), provenance: PROVENANCE }
  }
  describe(): BankDataDescription {
    return { ...this.fixtures.describe(), source: 'idbi-sandbox', simulatedClock: false }
  }
  health(): Promise<{ ok: boolean; latencyMs: number }> {
    return this.fixtures.health()
  }
}
