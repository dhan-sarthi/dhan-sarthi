/**
 * The composite: IDBI for what the catalogue exposes, a secondary for what it does not.
 *
 * Profile, accounts, transactions and liabilities come from the sandbox stub. Holdings and
 * policies come from the secondary — the fixtures generator today, an Account Aggregator
 * adapter one day (schema README C.3) — because IDBI's catalogue has no mutual fund, deposit
 * book or insurance endpoint. Every block is tagged with where it came from, and Record → Your
 * data shows the tag, so a reviewer is never told a fixture is a bank fact.
 *
 * The secondary also stands in as the app's own records: identity (`custId`, `custName`,
 * `taxRegime`) and the consent artefact the app obtained. `customerDirectory()` narrows a
 * `BankDataPort` down to exactly those, so the stub never learns it is talking to fixtures.
 */
import type { Account, Customer, Holding, Liability, Transaction } from '@dhan/core'
import type {
  BankSource,
  Consent,
  CustomerSummary,
  IsoDate,
  LedgerHorizon,
  Provenance,
} from '@dhan/contracts'
import type { BankDataDescription, BankDataPort, LoadedCustomerFile } from '../../ports/index.ts'
import type { CustomerDirectory, IdbiSandboxBankData } from './bank-data.idbi-sandbox.ts'

/**
 * What a secondary's blocks are called on the wire. In-process memory is the fixtures
 * generator, and "fixture" is what the reviewer should read; a Postgres secondary is seeded
 * from the same generator but the rows it serves are its own.
 */
const SECONDARY_LABEL: Readonly<Record<BankSource, Provenance>> = {
  memory: 'fixture',
  postgres: 'postgres',
  'idbi-sandbox': 'idbi',
}

export class CompositeBankData implements BankDataPort {
  private readonly primary: IdbiSandboxBankData
  private readonly secondary: BankDataPort

  constructor(primary: IdbiSandboxBankData, secondary: BankDataPort) {
    this.primary = primary
    this.secondary = secondary
  }

  listCustomers(): Promise<CustomerSummary[]> {
    return this.primary.listCustomers()
  }

  getCustomer(cif: string): Promise<Customer> {
    return this.primary.getCustomer(cif)
  }

  getAccounts(cif: string, asOf: IsoDate): Promise<Account[]> {
    return this.primary.getAccounts(cif, asOf)
  }

  getTransactions(cif: string, range: { from: IsoDate; to: IsoDate }): Promise<Transaction[]> {
    return this.primary.getTransactions(cif, range)
  }

  getLiabilities(cif: string, asOf: IsoDate): Promise<Liability[]> {
    return this.primary.getLiabilities(cif, asOf)
  }

  getHoldings(cif: string, asOf: IsoDate): Promise<{ holdings: Holding[]; policies: Holding[] }> {
    return this.secondary.getHoldings(cif, asOf)
  }

  getConsent(cif: string): Promise<Consent> {
    return this.primary.getConsent(cif)
  }

  async loadCustomerFile(
    cif: string,
    asOf: IsoDate,
    windowMonths: number,
  ): Promise<LoadedCustomerFile> {
    const [bank, held] = await Promise.all([
      this.primary.loadBankBlocks(cif, asOf, windowMonths),
      this.secondary.getHoldings(cif, asOf),
    ])
    return {
      file: { ...bank.file, holdings: held.holdings, policies: held.policies },
      provenance: {
        PROFILE: 'idbi',
        ACCOUNTS: 'idbi',
        TXN: 'idbi',
        LIABILITIES: 'idbi',
        HOLDINGS: SECONDARY_LABEL[this.secondary.describe().source],
      },
    }
  }

  ledgerHorizon(cif: string): Promise<LedgerHorizon> {
    return this.primary.ledgerHorizon(cif)
  }

  describe(): BankDataDescription {
    return this.primary.describe()
  }

  async health(): Promise<{ ok: boolean; latencyMs: number }> {
    const [bank, secondary] = await Promise.all([this.primary.health(), this.secondary.health()])
    return { ok: bank.ok && secondary.ok, latencyMs: bank.latencyMs }
  }
}

/** The app's records about a customer, read off a BankDataPort that holds them. */
export function customerDirectory(
  records: BankDataPort,
  overrides: { consentId?: string | undefined } = {},
): CustomerDirectory {
  return {
    list: () => records.listCustomers(),
    identity: async (cif) => {
      const c = await records.getCustomer(cif)
      return { custId: c.custId, custName: c.custName, taxRegime: c.taxRegime }
    },
    heldConsent: async (cif) => {
      const c = await records.getConsent(cif)
      // A sandbox usually issues one consent for its test customer; the override is that id.
      return {
        consentId: overrides.consentId ?? c.consentId,
        scopes: c.scopes,
        validFrom: c.validFrom,
      }
    },
  }
}
