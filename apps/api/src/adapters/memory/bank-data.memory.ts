/**
 * BankDataPort over seed bundles held in process.
 *
 * The same rows the seed CLI writes to Postgres, shaped for a date by the same `@dhan/core`
 * as-of functions the generator uses — so `BANK_SOURCE=memory` and `BANK_SOURCE=postgres` agree
 * to the rupee by construction. Every read is bounded by `asOf`: the ledger is the whole seeded
 * span, and the clock reveals it one row at a time.
 *
 * The history window is measured back from the ledger anchor, exactly as the generator's
 * `months` option is, so the file at any clock position is a prefix of one continuous ledger
 * rather than a sliding window whose first months keep changing.
 */
import { accountFactsAsOf, addMonths, liabilityAsOf, sipHoldingAsOf, ymd } from '@dhan/core'
import type { Account, Customer, CustomerFile, Holding, Liability, Transaction } from '@dhan/core'
import type {
  Consent,
  CustomerSummary,
  IsoDate,
  LedgerHorizon,
  ProvenanceMap,
  SeedProvenance,
} from '@dhan/contracts'
import type { SeedBundle } from '@dhan/fixtures'
import { NotFound } from '../../application/errors.ts'
import { hashOf } from '../../application/hash.ts'
import type { DriftCheck, SeedInfo } from '../../application/seed-info.ts'
import type { BankDataDescription, BankDataPort, LoadedCustomerFile } from '../../ports/index.ts'

const PROVENANCE: ProvenanceMap = {
  PROFILE: 'memory',
  ACCOUNTS: 'memory',
  TXN: 'memory',
  LIABILITIES: 'memory',
  HOLDINGS: 'memory',
}

export interface InMemoryBankDataOptions {
  /** Stamped on the provenance row. The fixtures package version. */
  generatorVersion: string
  /** When the bundles were built, for the provenance row. */
  ranAt: string
  /** Rebuild the bundles for the drift check. Absent means the check reports unchecked. */
  regenerate?: () => SeedBundle[]
}

function ageOn(dob: string, asOf: string): number {
  const b = ymd(dob)
  const a = ymd(asOf)
  let age = a.year - b.year
  if (a.month < b.month || (a.month === b.month && a.day < b.day)) age -= 1
  return age
}

/** What the seed hash covers: the rows, not the picker copy. */
export function seedContentHash(bundles: readonly SeedBundle[]): string {
  return hashOf(
    bundles.map((b) => ({
      slug: b.slug,
      customer: b.customer,
      consent: b.consent,
      accounts: b.accounts,
      transactions: b.transactions,
      liabilityContracts: b.liabilityContracts,
      sipContracts: b.sipContracts,
      holdings: b.holdings,
      policies: b.policies,
      horizon: b.horizon,
    })),
  )
}

export class InMemoryBankData implements BankDataPort, SeedInfo {
  private readonly bundles = new Map<string, SeedBundle>()
  private readonly seedRun: SeedProvenance
  private readonly regenerate: (() => SeedBundle[]) | undefined

  constructor(bundles: readonly SeedBundle[], options: InMemoryBankDataOptions) {
    for (const b of bundles) this.bundles.set(b.customer.cif, b)
    this.regenerate = options.regenerate

    const first = bundles[0]
    const contentSha256 = seedContentHash(bundles)
    this.seedRun = {
      seedRunId: `memory-${contentSha256.slice(0, 12)}`,
      generatorVersion: options.generatorVersion,
      anchor: first?.horizon.anchor ?? '1970-01-01',
      historyFrom: first?.horizon.from ?? '1970-01-01',
      horizonTo: first?.horizon.to ?? '1970-01-01',
      personas: bundles.map((b) => b.slug),
      contentSha256,
      ranAt: options.ranAt,
    }
  }

  private bundle(cif: string): SeedBundle {
    const found = this.bundles.get(cif)
    if (!found) throw new NotFound(`No customer with cif ${cif}.`)
    return found
  }

  async listCustomers(): Promise<CustomerSummary[]> {
    // The bundle carries the picker's order; insertion order is a coincidence, not a contract.
    return [...this.bundles.values()]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((b) => ({
        cif: b.customer.cif,
        slug: b.slug,
        name: b.customer.custName,
        age: ageOn(b.customer.dateOfBirth, b.horizon.anchor),
        city: b.customer.city,
        pitch: b.pitch,
        demonstrates: b.demonstrates,
      }))
  }

  async getCustomer(cif: string): Promise<Customer> {
    return this.bundle(cif).customer
  }

  async getAccounts(cif: string, asOf: IsoDate): Promise<Account[]> {
    const b = this.bundle(cif)
    return this.accountsAsOf(b, this.ledgerUpTo(b, asOf, b.horizon.historyMonths), asOf)
  }

  async getTransactions(
    cif: string,
    range: { from: IsoDate; to: IsoDate },
  ): Promise<Transaction[]> {
    return this.bundle(cif).transactions.filter(
      (t) => t.txnDate >= range.from && t.txnDate <= range.to,
    )
  }

  async getLiabilities(cif: string, asOf: IsoDate): Promise<Liability[]> {
    return this.liabilitiesAsOf(this.bundle(cif), asOf)
  }

  async getHoldings(
    cif: string,
    asOf: IsoDate,
  ): Promise<{ holdings: Holding[]; policies: Holding[] }> {
    const b = this.bundle(cif)
    return {
      holdings: this.holdingsAsOf(b, asOf, b.horizon.historyMonths),
      policies: b.policies,
    }
  }

  async getConsent(cif: string): Promise<Consent> {
    return this.bundle(cif).consent
  }

  async loadCustomerFile(
    cif: string,
    asOf: IsoDate,
    windowMonths: number,
  ): Promise<LoadedCustomerFile> {
    const b = this.bundle(cif)
    const transactions = this.ledgerUpTo(b, asOf, windowMonths)

    const file: CustomerFile = {
      customer: b.customer,
      accounts: this.accountsAsOf(b, transactions, asOf),
      transactions,
      liabilities: this.liabilitiesAsOf(b, asOf),
      holdings: this.holdingsAsOf(b, asOf, windowMonths),
      policies: b.policies,
    }
    return { file, provenance: PROVENANCE }
  }

  async ledgerHorizon(cif: string): Promise<LedgerHorizon> {
    const { from, to } = this.bundle(cif).horizon
    return { from, to }
  }

  describe(): BankDataDescription {
    return {
      source: 'memory',
      simulatedClock: true,
      dataFreshnessDate: this.seedRun.horizonTo,
    }
  }

  async health(): Promise<{ ok: boolean; latencyMs: number }> {
    return { ok: this.bundles.size > 0, latencyMs: 0 }
  }

  /* SeedInfo ------------------------------------------------------------ */

  async provenance(): Promise<SeedProvenance | null> {
    return this.seedRun
  }

  async drift(): Promise<DriftCheck> {
    if (!this.regenerate) {
      return { checked: false, ok: null, expectedSha256: null, actualSha256: null }
    }
    const actual = seedContentHash(this.regenerate())
    return {
      checked: true,
      ok: actual === this.seedRun.contentSha256,
      expectedSha256: this.seedRun.contentSha256,
      actualSha256: actual,
    }
  }

  /* Shaping ------------------------------------------------------------- */

  private ledgerUpTo(b: SeedBundle, asOf: IsoDate, windowMonths: number): Transaction[] {
    const windowStart = addMonths(b.horizon.anchor, -(windowMonths - 1))
    const from = windowStart > b.horizon.from ? windowStart : b.horizon.from
    return b.transactions.filter((t) => t.txnDate >= from && t.txnDate <= asOf)
  }

  private accountsAsOf(b: SeedBundle, ledger: readonly Transaction[], asOf: IsoDate): Account[] {
    return b.accounts.map((row): Account => {
      const base = {
        accountNumberMasked: row.accountNumberMasked,
        accountType: row.accountType,
        accountOpeningDate: row.accountOpeningDate,
        ...(row.branchIfsc === undefined ? {} : { branchIfsc: row.branchIfsc }),
        ...(row.interestRate === undefined ? {} : { interestRate: row.interestRate }),
        ...(row.maturityDate === undefined ? {} : { maturityDate: row.maturityDate }),
      }
      if (row.isPrimary) {
        return {
          ...base,
          ...accountFactsAsOf(ledger, asOf, {
            ...(row.openingBalance === undefined ? {} : { openingBalance: row.openingBalance }),
          }),
        }
      }
      return { ...base, currentBalance: row.currentBalance ?? 0 }
    })
  }

  private liabilitiesAsOf(b: SeedBundle, asOf: IsoDate): Liability[] {
    return b.liabilityContracts
      .map((c) => liabilityAsOf(c, b.horizon.anchor, asOf))
      .filter((l): l is Liability => l !== null)
  }

  private holdingsAsOf(b: SeedBundle, asOf: IsoDate, windowMonths: number): Holding[] {
    return [
      ...b.sipContracts.map((c) => sipHoldingAsOf(c, b.horizon.anchor, asOf, windowMonths)),
      ...b.holdings,
    ]
  }
}
