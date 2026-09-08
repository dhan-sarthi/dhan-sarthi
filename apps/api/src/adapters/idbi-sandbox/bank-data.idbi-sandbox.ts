/**
 * BankDataPort over IDBI's sandbox: the anti-corruption layer, now over the real catalogue.
 *
 * Every read goes out through `IdbiGateway`, which composes the twenty-four operations into
 * whole domain objects, and nothing above this file sees a Finacle key, an amount string or a
 * date in one of the sandbox's six formats.
 *
 * Three things this adapter is honest about, because a real feed forces it to be.
 *
 * The clock is simulated, and that is a property of the data rather than a demo convenience.
 * IDBI's sandbox holds twenty transactions spanning 2025-05-01 to 2025-05-20 and nothing since;
 * asked for a window in 2026 it answers zero rows, correctly. Reporting today as today would
 * therefore render every screen empty — a three-month spend analysis over a ledger that ended
 * sixteen months ago is empty by construction. So `ledgerHorizon` discovers what the bank
 * actually holds by asking for a wide window and reading the rows back, and the session runs
 * as-of that date with the clock control visible.
 *
 * Holdings are still not the bank's to give: the catalogue has no mutual fund, deposit book or
 * insurance endpoint, and a consented Account Aggregator pull returns deposit accounts rather
 * than investments. `getHoldings` refuses, and the composite fills the block from the app's own
 * holdings store with the provenance saying so.
 *
 * The declared facts are not the bank's either. Income, employment, dependents, marital status,
 * language, risk profile and tax regime come from `DeclaredProfileStore`, and a customer with
 * no date of birth anywhere — which one of the three sandbox customers genuinely is — surfaces
 * as an incomplete profile naming the field to ask for, rather than as a guessed date.
 */
import type { Account, Customer, CustomerFile, Holding, Liability, Transaction } from '@dhan/core'
import type { Consent, CustomerSummary, IsoDate, LedgerHorizon } from '@dhan/contracts'
import {
  ConsentInactive,
  Forbidden,
  NotAvailableFromBank,
  NotFound,
  Unavailable,
  isDomainError,
} from '../../application/errors.ts'
import { BreakerOpenError } from '../../infra/circuit.ts'
import { isTimeout } from '../../infra/timeout.ts'
import { silentLogger } from '../../infra/logger.ts'
import type { Logger } from '../../infra/logger.ts'
import type { BankDataDescription, BankDataPort, LoadedCustomerFile } from '../../ports/index.ts'
import type { DeclaredProfileStore } from '../../ports/declared-profile.port.ts'
import { IDBI_SANDBOX_CUSTOMERS, pickableCustomers, sandboxCustomer } from './api/customers.ts'
import type { IdbiSandboxCustomer } from './api/customers.ts'
import type { IdbiGateway } from './api/gateway.ts'
import { IdbiScalarError } from './api/scalars.ts'
import { ProfileIncomplete, newReport } from './api/to-domain.ts'
import type { DeclaredProfile as GatewayDeclared, MappingReport } from './api/to-domain.ts'
import { EnvelopeShapeError } from './api/envelope.ts'
import { IdbiCallError, IdbiNotAllowlistedError } from './api/transport.ts'

export interface IdbiSandboxOptions {
  gateway: IdbiGateway
  profiles: DeclaredProfileStore
  logger?: Logger | undefined
  /**
   * How long a discovered horizon is trusted before it is asked for again. The sandbox's
   * ledger does not move, so this is generous; a live feed would want it short.
   */
  horizonTtlMs?: number | undefined
}

/** What the bank answered, with the report of everything that did not map cleanly. */
export interface BankBlocksLoaded {
  file: CustomerFile
  report: MappingReport
  /** The window the bank actually holds data for. */
  horizon: LedgerHorizon
}

const DEFAULT_HORIZON_TTL_MS = 5 * 60_000

/**
 * The window `ledgerHorizon` asks over to discover what the bank holds.
 *
 * Wide on purpose and not a guess about the data: 393 honours the dates it is given, so asking
 * across four years and reading the rows back is how the real span is found. A narrower window
 * would risk mistaking its own edges for the ledger's.
 */
const DISCOVERY_WINDOW = { from: '2023-01-01' as IsoDate, to: '2027-12-31' as IsoDate }

/** Where a customer's ledger sits when the bank holds no transactions for them at all. */
const NO_LEDGER_FALLBACK_MONTHS = 1

export class IdbiSandboxBankData implements BankDataPort {
  private readonly gateway: IdbiGateway
  private readonly profiles: DeclaredProfileStore
  private readonly log: Logger
  private readonly horizonTtlMs: number
  private readonly horizons = new Map<string, { at: number; horizon: LedgerHorizon }>()
  private report: MappingReport | null = null
  private freshness: IsoDate | null = null

  constructor(options: IdbiSandboxOptions) {
    this.gateway = options.gateway
    this.profiles = options.profiles
    this.log = options.logger ?? silentLogger
    this.horizonTtlMs = options.horizonTtlMs ?? DEFAULT_HORIZON_TTL_MS
  }

  /* BankDataPort -------------------------------------------------------- */

  /**
   * The three customers the sandbox holds, with what each one demonstrates.
   *
   * Not a fixture list: each entry's coverage was established by asking the bank and reading
   * which keys it said it could not place.
   */
  async listCustomers(): Promise<CustomerSummary[]> {
    const asOf = this.freshness ?? DISCOVERY_WINDOW.to
    const profiles = await this.profiles.list()
    return pickableCustomers().map((c) => {
      const dob = c.reportedDateOfBirth ?? profiles.find((p) => p.cif === c.cif)?.dateOfBirth
      return {
        cif: c.cif,
        slug: c.slug,
        name: c.name,
        age: dob === undefined ? 0 : yearsBetween(dob as IsoDate, asOf),
        city: c.city,
        pitch: c.pitch,
        demonstrates: c.story,
      }
    })
  }

  async getCustomer(cif: string): Promise<Customer> {
    const customer = this.customerOr404(cif)
    return this.guarded(cif, async () => {
      const declared = await this.declaredFor(customer)
      const { customer: mapped, report } = await this.gateway.customer(customer, declared)
      this.report = report
      return mapped
    })
  }

  async getAccounts(cif: string, asOf: IsoDate): Promise<Account[]> {
    const customer = this.customerOr404(cif)
    return this.guarded(cif, async () => {
      const { accounts, report, unenriched } = await this.gateway.accounts(customer)
      this.report = report
      if (unenriched.length > 0) {
        this.log.warn(
          { cif, accounts: unenriched.map((u) => u.acctId) },
          'some accounts could not be enriched with an account enquiry',
        )
      }
      // Balances are as-of whenever the bank last posted; the sandbox has one position per
      // account and no history of them, so `asOf` cannot narrow this and is not pretended to.
      void asOf
      return accounts
    })
  }

  /**
   * A statement window.
   *
   * Two feeds, and which one answers is a fact about the customer rather than a preference.
   * 393 is IDBI's own statement and exists for one of the three sandbox customers; the others
   * have no own-bank statement at all, so their transactions come from a consented Account
   * Aggregator pull or not at all. The consented feed is the better one where both exist — it
   * carries a payment mode on every row, which is what the categoriser needs — but it is only
   * reachable under a live consent, so 393 is preferred when the customer has it and the AA
   * path is the fallback rather than the other way round.
   */
  async getTransactions(
    cif: string,
    range: { from: IsoDate; to: IsoDate },
  ): Promise<Transaction[]> {
    const customer = this.customerOr404(cif)
    return this.guarded(cif, async () => {
      const rows = await this.readTransactions(customer, range)
      return rows
        .filter((t) => t.txnDate >= range.from && t.txnDate <= range.to)
        .sort((a, b) => (a.txnDate < b.txnDate ? -1 : a.txnDate > b.txnDate ? 1 : 0))
    })
  }

  async getLiabilities(cif: string, asOf: IsoDate): Promise<Liability[]> {
    const customer = this.customerOr404(cif)
    return this.guarded(cif, async () => {
      const { liabilities, report } = await this.gateway.liabilities(customer)
      this.report = report
      void asOf
      return liabilities
    })
  }

  async getHoldings(): Promise<{ holdings: Holding[]; policies: Holding[] }> {
    throw new NotAvailableFromBank(
      'holdings or policies: the catalogue has no mutual fund, deposit-book or insurance ' +
        'endpoint, and a consented pull returns deposit accounts rather than investments',
    )
  }

  async getConsent(cif: string): Promise<Consent> {
    const customer = this.customerOr404(cif)
    return this.guarded(cif, async () => {
      const horizon = await this.ledgerHorizon(cif)
      const { consent, report } = await this.gateway.consent(customer, {
        validFrom: horizon.from,
        validTo: horizon.to,
      })
      this.report = report
      if (consent === null) {
        throw new Forbidden(
          `The bank holds no Account Aggregator consent for cif ${cif}, so no advice may be recorded against one.`,
        )
      }
      return consent
    })
  }

  async loadCustomerFile(
    cif: string,
    asOf: IsoDate,
    windowMonths: number,
  ): Promise<LoadedCustomerFile> {
    const { file } = await this.loadBankBlocks(cif, asOf, windowMonths)
    return {
      file,
      provenance: {
        PROFILE: 'idbi',
        ACCOUNTS: 'idbi',
        TXN: 'idbi',
        LIABILITIES: 'idbi',
        HOLDINGS: 'idbi',
      },
    }
  }

  /**
   * The window the bank actually holds, discovered rather than assumed.
   *
   * A wide statement request comes back with whatever the bank has, and the first and last row
   * are the answer. The sandbox holds 2025-05-01 to 2025-05-20 for the one customer with a
   * statement — twenty rows, one a day — and answers a 2026 window with zero rows, which is
   * the correct behaviour and the reason this cannot be inferred from today's date.
   */
  async ledgerHorizon(cif: string): Promise<LedgerHorizon> {
    const cached = this.horizons.get(cif)
    if (cached !== undefined && Date.now() - cached.at < this.horizonTtlMs) return cached.horizon
    const customer = this.customerOr404(cif)
    const horizon = await this.guarded(cif, async () => {
      const rows = await this.readTransactions(customer, DISCOVERY_WINDOW)
      if (rows.length === 0) {
        // No ledger for this customer. The horizon is still needed — a session has to sit
        // somewhere — so it is a single month ending at whatever the other customers' data
        // reaches, and the empty state on every screen is the honest consequence.
        const fallbackTo = this.freshness ?? DISCOVERY_WINDOW.to
        return { from: monthsBefore(fallbackTo, NO_LEDGER_FALLBACK_MONTHS), to: fallbackTo }
      }
      const dates = rows.map((r) => r.txnDate).sort()
      const from = dates[0] as IsoDate
      const to = dates[dates.length - 1] as IsoDate
      this.freshness = this.freshness === null || to > this.freshness ? to : this.freshness
      return { from, to }
    })
    this.horizons.set(cif, { at: Date.now(), horizon })
    return horizon
  }

  /**
   * `simulatedClock` is true, and that is a statement about the data rather than the demo.
   *
   * The sandbox's ledger ends on 2025-05-20. Reporting today as today would leave every screen
   * empty and every derived figure zero, so the session runs as-of the date the bank's data
   * actually reaches and the UI keeps its clock control. A feed with data up to yesterday would
   * flip this to false and nothing else here would move.
   */
  describe(): BankDataDescription {
    return {
      source: 'idbi-sandbox',
      simulatedClock: true,
      dataFreshnessDate: this.freshness ?? DISCOVERY_WINDOW.to,
    }
  }

  /** One account enquiry for the first sandbox customer: reachability and latency. */
  async health(): Promise<{ ok: boolean; latencyMs: number }> {
    const started = performance.now()
    const probe = IDBI_SANDBOX_CUSTOMERS[0]
    if (probe === undefined) return { ok: this.gateway.breakerState() !== 'open', latencyMs: 0 }
    try {
      await this.gateway.accounts(probe)
      return { ok: true, latencyMs: Math.round(performance.now() - started) }
    } catch (err) {
      this.log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'the IDBI health probe failed',
      )
      return { ok: false, latencyMs: Math.round(performance.now() - started) }
    }
  }

  /* Beyond the port ----------------------------------------------------- */

  /** Everything the bank can answer, as a file, with the report of what it could not. */
  async loadBankBlocks(
    cif: string,
    asOf: IsoDate,
    windowMonths: number,
  ): Promise<BankBlocksLoaded> {
    const customer = this.customerOr404(cif)
    return this.guarded(cif, async () => {
      const horizon = await this.ledgerHorizon(cif)
      const to = asOf < horizon.to ? asOf : horizon.to
      const from = maxDate(monthsBefore(to, windowMonths), horizon.from)
      const declared = await this.declaredFor(customer)

      const [profile, accounts, transactions, liabilities] = await Promise.all([
        this.gateway.customer(customer, declared),
        this.gateway.accounts(customer),
        this.getTransactions(cif, { from, to }),
        this.gateway.liabilities(customer),
      ])

      const report = mergeReports([profile.report, accounts.report, liabilities.report])
      this.report = report

      return {
        file: {
          customer: profile.customer,
          accounts: accounts.accounts,
          transactions,
          liabilities: liabilities.liabilities,
          holdings: [],
          policies: [],
        },
        report,
        horizon,
      }
    })
  }

  /** What the last read could not map cleanly. Operators read this in week one. */
  lastReport(): MappingReport | null {
    return this.report
  }

  /* ---------------------------------------------------------------- */

  private customerOr404(cif: string): IdbiSandboxCustomer {
    const found = sandboxCustomer(cif)
    if (found === null) throw new NotFound(`No customer with cif ${cif} at the bank.`)
    return found
  }

  /** The declared facts, or an incomplete-profile error naming what is still needed. */
  private async declaredFor(customer: IdbiSandboxCustomer): Promise<GatewayDeclared> {
    const profile = await this.profiles.find(customer.cif)
    if (profile === null) {
      throw new ProfileIncomplete(customer.cif, [
        'maritalStatus',
        'dependents',
        'employmentType',
        'declaredAnnualIncome',
        'preferredLanguage',
        'riskProfile',
        'taxRegime',
      ])
    }
    return {
      custId: customer.custId,
      custName: customer.name,
      ...(profile.dateOfBirth === undefined ? {} : { dateOfBirth: profile.dateOfBirth }),
      maritalStatus: profile.maritalStatus,
      dependents: profile.dependents,
      employmentType: profile.employmentType,
      declaredAnnualIncome: profile.declaredAnnualIncome,
      preferredLanguage: profile.preferredLanguage,
      riskProfile: profile.riskProfile,
      taxRegime: profile.taxRegime,
    }
  }

  /** 393 where the customer has it, a consented pull where they do not. */
  private async readTransactions(
    customer: IdbiSandboxCustomer,
    range: { from: IsoDate; to: IsoDate },
  ): Promise<Transaction[]> {
    if (customer.coverage.ownStatement) {
      const own = await this.gateway.transactions(customer, customer.primaryAcctId, range)
      this.report = own.report
      if (own.transactions.length > 0 || !customer.coverage.accountAggregator) {
        return own.transactions
      }
    }
    if (!customer.coverage.accountAggregator) return []
    return this.consentedTransactions(customer)
  }

  /**
   * Every consented account's transactions, through 595.
   *
   * The consent names its linked accounts and each one is pulled once. A refusal on one link
   * is not a failure of the read: the sandbox holds a statement for some of a consent's
   * accounts and not others, and the accounts it does answer for are still the customer's.
   */
  private async consentedTransactions(customer: IdbiSandboxCustomer): Promise<Transaction[]> {
    const report = newReport()
    const out: Transaction[] = []
    const seen = new Set<string>()
    for await (const pulled of this.gateway.aaStatements(customer, report)) {
      for (const txn of pulled.transactions) {
        // Each pull covers one linked account and the sandbox numbers their rows from one, so
        // the id alone collides across accounts; the link reference disambiguates them.
        const key = `${pulled.accounts[0]?.linkReferenceNumber ?? ''}#${txn.txnId}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push(txn)
      }
    }
    this.report = report
    return out
  }

  private async guarded<T>(cif: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (err) {
      throw toDomainError(err, cif)
    }
  }
}

/* ------------------------------------------------------------------ */

function monthsBefore(date: IsoDate, months: number): IsoDate {
  const [y, m] = date.split('-').map(Number) as [number, number]
  const total = y * 12 + (m - 1) - Math.max(0, months - 1)
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01` as IsoDate
}

function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a > b ? a : b
}

/** Whole years between two calendar dates, without constructing a Date. */
function yearsBetween(from: IsoDate, to: IsoDate): number {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number]
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number]
  const hadBirthday = tm > fm || (tm === fm && td >= fd)
  return Math.max(0, ty - fy - (hadBirthday ? 0 : 1))
}

function mergeReports(reports: readonly MappingReport[]): MappingReport {
  const merged: MappingReport = { codeFallbacks: [], unmappedPaths: new Set(), notes: [] }
  for (const r of reports) {
    merged.codeFallbacks.push(...r.codeFallbacks)
    merged.notes.push(...r.notes)
    for (const p of r.unmappedPaths) merged.unmappedPaths.add(p)
  }
  return merged
}

/** Every failure the gateway can raise, as the error the route contracts declare. */
export function toDomainError(err: unknown, cif: string): Error {
  if (isDomainError(err)) return err

  if (err instanceof ProfileIncomplete) {
    // Not the bank's fault and not an outage: the app is missing something only the customer
    // can supply, and the route should say which field.
    return new Forbidden(
      `The profile for cif ${cif} is missing ${err.missing.join(', ')}. ` +
        'Advice needs it, so ask the customer and PATCH /api/v1/profile before retrying.',
    )
  }

  if (err instanceof IdbiNotAllowlistedError) {
    return new Unavailable(
      'IDBI refused the call at the edge. The sandbox allow-lists IP addresses and takes no ' +
        'credential, so this server is on the wrong network rather than missing a key.',
      { endpoint: err.operation },
    )
  }

  if (err instanceof IdbiCallError) {
    const code = err.errorCode ?? ''
    if (code === 'CONSENT_EXPIRED') return new ConsentInactive('EXPIRED')
    if (code === 'CONSENT_REVOKED') return new ConsentInactive('REVOKED')
    if (code.startsWith('CONSENT_')) {
      return new Forbidden(`The bank did not accept the consent artefact (${code}).`)
    }
    // "Data not found" names the key it could not place, which is a missing fixture rather
    // than a broken line, and is the difference between a 404 and a 503.
    if (err.sentKey !== null || err.httpStatus === 404) {
      return new NotFound(
        `The bank holds no record for ${err.sentKey ?? `cif ${cif}`} (${err.operation}).`,
      )
    }
    return new Unavailable(
      `The bank answered ${err.httpStatus}${code ? ` ${code}` : ''}${
        err.failedFields.length > 0 ? `: ${err.failedFields.join('; ')}` : ''
      }.`,
      { endpoint: err.operation, errorCode: err.errorCode },
    )
  }

  if (err instanceof EnvelopeShapeError || err instanceof IdbiScalarError) {
    return new Unavailable(`The bank sent something we could not read: ${err.message}`, {
      endpoint: err instanceof EnvelopeShapeError ? err.operation : err.field,
    })
  }

  if (err instanceof BreakerOpenError) {
    return new Unavailable('The bank line is down right now.', { retryAfterMs: err.retryAfterMs })
  }

  if (isTimeout(err)) {
    return new Unavailable('The bank did not answer in time.')
  }

  return err instanceof Error ? err : new Error(String(err))
}
