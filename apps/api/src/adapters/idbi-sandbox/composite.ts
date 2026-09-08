/**
 * The composite: IDBI for what the catalogue exposes, a secondary for what it does not.
 *
 * Profile, accounts, transactions, liabilities and the consent artefact are the bank's, and
 * come from the sandbox. Holdings and policies come from the secondary, because the catalogue
 * has no mutual fund, deposit book or insurance endpoint — and a consented Account Aggregator
 * pull does not close that gap either: it returns deposit accounts at other banks, not
 * investments. Every block is tagged with where it came from and Record → Your data shows the
 * tag, so a reviewer is never told a fixture is a bank fact.
 *
 * The identity seam this used to carry is gone. It narrowed a `BankDataPort` down to `custId`,
 * `custName` and a consent id so the stub could be handed app-held identity without knowing it
 * was talking to fixtures — but the identity IDBI's operations actually need is a CIF, a
 * Finacle customer id, a branch and an account number, all four of which are now in
 * `api/customers.ts` where they were established by asking the bank. The declared half of a
 * profile moved to its own port for the same reason: it is the app's, and it says so.
 */
import type { Account, Customer, Holding, Liability, Transaction } from '@dhan/core'
import type { Consent, CustomerSummary, IsoDate, LedgerHorizon } from '@dhan/contracts'
import type { BankDataDescription, BankDataPort, LoadedCustomerFile } from '../../ports/index.ts'
import type { HoldingsStore } from '../../ports/holdings.port.ts'
import type { IdbiSandboxBankData } from './bank-data.idbi-sandbox.ts'

export class CompositeBankData implements BankDataPort {
  private readonly primary: IdbiSandboxBankData
  private readonly holdingsStore: HoldingsStore

  constructor(primary: IdbiSandboxBankData, holdings: HoldingsStore) {
    this.primary = primary
    this.holdingsStore = holdings
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

  /**
   * The app's own holdings record, not another bank adapter's.
   *
   * This used to read a secondary `BankDataPort` — in practice the fixtures generator — which
   * worked only for as long as both sides agreed on who the customers were. They do not: the
   * generator's customers are the personas and IDBI's are the three CIFs its sandbox holds, so
   * asking the generator for cif 98655854's holdings answered "no such customer" and took the
   * whole view down with it. A dedicated store keyed on the same CIFs the bank uses is the fix,
   * and it is also the thing a real holdings feed would replace one day.
   */
  async getHoldings(
    cif: string,
    asOf: IsoDate,
  ): Promise<{ holdings: Holding[]; policies: Holding[] }> {
    void asOf
    const held = await this.holdingsStore.get(cif)
    return { holdings: held.holdings, policies: held.policies }
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
      this.getHoldings(cif, asOf),
    ])
    return {
      file: { ...bank.file, holdings: held.holdings, policies: held.policies },
      provenance: {
        PROFILE: 'idbi',
        ACCOUNTS: 'idbi',
        TXN: 'idbi',
        LIABILITIES: 'idbi',
        // Declared, and labelled as such on Record → Your data. There is no holdings endpoint
        // in the catalogue, so calling this block `idbi` would be the one lie this app tells —
        // and calling it `fixture` was a smaller one, since the customer told us this.
        HOLDINGS: 'declared',
      },
    }
  }

  ledgerHorizon(cif: string): Promise<LedgerHorizon> {
    return this.primary.ledgerHorizon(cif)
  }

  describe(): BankDataDescription {
    return this.primary.describe()
  }

  /** The bank is the only thing that can be down; the holdings store is in this process. */
  health(): Promise<{ ok: boolean; latencyMs: number }> {
    return this.primary.health()
  }
}
