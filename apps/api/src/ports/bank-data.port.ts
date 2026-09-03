/**
 * Where a customer's bank data comes from.
 *
 * Implemented by: `adapters/postgres/bank-data.postgres.ts` (the demo's source of truth: seeded
 * rows up to `asOf`, as-of facts through `@dhan/core`'s `asof` module), `adapters/memory/
 * bank-data.memory.ts` (the same generator output held in process; tests, CI and
 * `BANK_SOURCE=memory`), `adapters/idbi-sandbox/*` (a stub anti-corruption layer over IDBI's
 * catalogue; `simulatedClock` false; holdings and policies not available from the bank) and the
 * composite that answers each block from whichever of those has it, stamping provenance.
 *
 * Every read is bounded by `asOf`. Nothing dated after it may be returned, because the
 * simulated clock is a session fact and the future is revealed one row at a time.
 */
import type { Account, Customer, CustomerFile, Holding, Liability, Transaction } from '@dhan/core'
import type {
  BankSource,
  Consent,
  ConsentScope,
  CustomerSummary,
  IsoDate,
  LedgerHorizon,
  ProvenanceMap,
} from '@dhan/contracts'

/** The five blocks of a customer file, which are also the five consent scopes. */
export type Block = ConsentScope

export interface BankDataDescription {
  source: BankSource
  /** False under a real feed, where today is today. The UI hides the clock control. */
  simulatedClock: boolean
  /** The last date the source has data for. */
  dataFreshnessDate: IsoDate
}

export interface LoadedCustomerFile {
  file: CustomerFile
  /** Where each block came from, for Record → Your data. */
  provenance: ProvenanceMap
}

export interface BankDataPort {
  /** The picker. Empty under an adapter where the host app names the customer. */
  listCustomers(): Promise<CustomerSummary[]>
  getCustomer(cif: string): Promise<Customer>
  getAccounts(cif: string, asOf: IsoDate): Promise<Account[]>
  getTransactions(cif: string, range: { from: IsoDate; to: IsoDate }): Promise<Transaction[]>
  getLiabilities(cif: string, asOf: IsoDate): Promise<Liability[]>
  getHoldings(cif: string, asOf: IsoDate): Promise<{ holdings: Holding[]; policies: Holding[] }>
  /** Block 08: the consent artefact echoed on every advice record. */
  getConsent(cif: string): Promise<Consent>
  /** The whole file the engine derives from: `windowMonths` of history ending at `asOf`. */
  loadCustomerFile(cif: string, asOf: IsoDate, windowMonths: number): Promise<LoadedCustomerFile>
  /** The dates the ledger spans. The clock may not be advanced past `to`. */
  ledgerHorizon(cif: string): Promise<LedgerHorizon>
  describe(): BankDataDescription
  health(): Promise<{ ok: boolean; latencyMs: number }>
}
