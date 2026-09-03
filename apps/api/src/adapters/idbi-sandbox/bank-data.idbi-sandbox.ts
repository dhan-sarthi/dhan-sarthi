/**
 * BankDataPort over IDBI's sandbox: the stub half of the anti-corruption layer.
 *
 * Every read goes out as block calls through `IdbiClient` and comes back through `mapping.ts`.
 * Nothing above this file sees a snake_case key or a DD-MM-YY date. What this adapter is
 * honest about, because a real feed is:
 *
 *   - `simulatedClock` is false. Today is today. `asOf` still travels as `data_period_to` on
 *     every call, so the same code path serves a session at any date the bank can answer, but
 *     the bank answers up to its own freshness date and no further.
 *   - Holdings and policies are not the bank's to give (schema README C.3: no MF, deposit-book
 *     or insurance endpoint in the catalogue). `getHoldings` throws `NotAvailableFromBank`;
 *     the composite fills the block from a secondary and says so in the provenance.
 *   - Identity is not the bank's either. `custId`, `custName` and `taxRegime` are app-held
 *     (`app.customers`), and the consent artefact was obtained by the app, so both come from a
 *     `CustomerDirectory` the composition root supplies. Under the demo that is the fixtures
 *     generator; under GO Mobile+ it is the host identity seam.
 */
import { addMonths, fromYmd, ymd } from '@dhan/core'
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
import type { BankDataDescription, BankDataPort, LoadedCustomerFile } from '../../ports/index.ts'
import { IdbiApiError, WireShapeError } from './client.ts'
import type { BlockRequest, BlockResult, IdbiClient } from './client.ts'
import {
  mapAccount,
  mapConsent,
  mapContext,
  mapCustomerFile,
  mapHorizon,
  mapLiability,
  mapProfile,
  mapSignals,
  mapTransaction,
  newReport,
} from './mapping.ts'
import type { BankSignals, CustomerIdentity, HeldConsent, MappingReport } from './mapping.ts'
import { WireFormatError } from './transforms.ts'
import type { AmountUnit } from './transforms.ts'
import type { WireMeta } from './wire.ts'

/** What the app knows before the bank is asked: who the customer is, and under which consent. */
export interface CustomerDirectory {
  /** The picker. The catalogue has no directory endpoint; a bank names its customer to us. */
  list(): Promise<CustomerSummary[]>
  /** Throws NotFound for a cif the app does not hold. */
  identity(cif: string): Promise<CustomerIdentity>
  heldConsent(cif: string): Promise<HeldConsent>
}

export interface IdbiSandboxOptions {
  client: IdbiClient
  directory: CustomerDirectory
  /** What `describe()` reports before the first response has said otherwise. */
  initialFreshness: IsoDate
  /**
   * The date the history window is measured back from. Unset, the window slides with `asOf`,
   * which is what a production deployment wants. The demo pins it to the persona anchor so a
   * file at any clock position is a prefix of one ledger — the convention the memory and
   * Postgres adapters follow and the port contract suite asserts.
   */
  windowAnchor?: IsoDate | undefined
  /** Months of history a lightweight call (consent, horizon, health) asks for. */
  windowMonths?: number
  amountUnit?: AmountUnit
  /** How long a profile response answers consent and horizon questions before it is refetched. */
  metaTtlMs?: number
}

/** The bank's four blocks as a file, before the secondary fills what the bank lacks. */
export interface BankBlocksLoaded {
  file: CustomerFile
  meta: WireMeta
  report: MappingReport
}

const DEFAULT_WINDOW_MONTHS = 24
const DEFAULT_META_TTL_MS = 2_000

export class IdbiSandboxBankData implements BankDataPort {
  private readonly client: IdbiClient
  private readonly directory: CustomerDirectory
  private readonly windowAnchor: IsoDate | undefined
  private readonly windowMonths: number
  private readonly amountUnit: AmountUnit
  private readonly metaTtlMs: number
  private freshness: IsoDate
  private report: MappingReport | null = null
  private readonly profiles = new Map<string, { at: number; result: BlockResult<'PROFILE'> }>()

  constructor(options: IdbiSandboxOptions) {
    this.client = options.client
    this.directory = options.directory
    this.windowAnchor = options.windowAnchor
    this.windowMonths = options.windowMonths ?? DEFAULT_WINDOW_MONTHS
    this.amountUnit = options.amountUnit ?? 'inr'
    this.metaTtlMs = options.metaTtlMs ?? DEFAULT_META_TTL_MS
    this.freshness = options.initialFreshness
  }

  /* BankDataPort -------------------------------------------------------- */

  async listCustomers(): Promise<CustomerSummary[]> {
    return this.directory.list()
  }

  async getCustomer(cif: string): Promise<Customer> {
    const identity = await this.directory.identity(cif)
    return this.guarded(cif, async () => {
      const profile = await this.profile(cif)
      const ctx = this.context(this.freshness, this.period(this.freshness))
      return mapProfile(profile.data, cif, identity, ctx)
    })
  }

  async getAccounts(cif: string, asOf: IsoDate): Promise<Account[]> {
    return this.guarded(cif, async () => {
      const req = await this.request(cif, this.period(asOf))
      const res = await this.client.block('ACCOUNTS', req)
      this.noteMeta(res.meta)
      const ctx = this.context(asOf, req.period)
      return res.data.map((row) => mapAccount(row, ctx))
    })
  }

  async getTransactions(
    cif: string,
    range: { from: IsoDate; to: IsoDate },
  ): Promise<Transaction[]> {
    return this.guarded(cif, async () => {
      const req = await this.request(cif, range)
      const res = await this.client.block('TXN', req)
      this.noteMeta(res.meta)
      const ctx = this.context(range.to, range)
      return res.data
        .map((row) => mapTransaction(row, ctx))
        .sort((a, b) => (a.txnDate < b.txnDate ? -1 : a.txnDate > b.txnDate ? 1 : 0))
    })
  }

  async getLiabilities(cif: string, asOf: IsoDate): Promise<Liability[]> {
    return this.guarded(cif, async () => {
      const req = await this.request(cif, this.period(asOf))
      const res = await this.client.block('LIABILITIES', req)
      this.noteMeta(res.meta)
      const ctx = this.context(asOf, req.period)
      return res.data.map((row) => mapLiability(row, ctx))
    })
  }

  async getHoldings(): Promise<{ holdings: Holding[]; policies: Holding[] }> {
    throw new NotAvailableFromBank(
      'holdings or policies: the catalogue has no mutual fund, deposit-book or insurance endpoint',
    )
  }

  async getConsent(cif: string): Promise<Consent> {
    const held = await this.directory.heldConsent(cif)
    return this.guarded(cif, async () => {
      const profile = await this.profile(cif)
      const ctx = this.context(this.freshness, this.period(this.freshness))
      return mapConsent(profile.meta, held, ctx)
    })
  }

  async loadCustomerFile(
    cif: string,
    asOf: IsoDate,
    windowMonths: number,
  ): Promise<LoadedCustomerFile> {
    const { file } = await this.loadBankBlocks(cif, asOf, windowMonths)
    // The bank answered every block it has. Holdings are empty because it has none to give;
    // compose with a secondary to fill them, and the provenance will say who did.
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

  async ledgerHorizon(cif: string): Promise<LedgerHorizon> {
    return this.guarded(cif, async () => mapHorizon((await this.profile(cif)).meta))
  }

  describe(): BankDataDescription {
    return { source: 'idbi-sandbox', simulatedClock: false, dataFreshnessDate: this.freshness }
  }

  /** One profile call for the first customer the directory names: latency and reachability, and a freshness refresh. */
  async health(): Promise<{ ok: boolean; latencyMs: number }> {
    const started = performance.now()
    const probe = (await this.directory.list())[0]?.cif ?? null
    if (probe === null) return { ok: this.client.breakerState() !== 'open', latencyMs: 0 }
    try {
      await this.profile(probe, { fresh: true })
      return { ok: true, latencyMs: Math.round(performance.now() - started) }
    } catch {
      return { ok: false, latencyMs: Math.round(performance.now() - started) }
    }
  }

  /* Beyond the port ----------------------------------------------------- */

  /** The four blocks the catalogue can answer, mapped, with the report of what fell through. */
  async loadBankBlocks(
    cif: string,
    asOf: IsoDate,
    windowMonths: number,
  ): Promise<BankBlocksLoaded> {
    const identity = await this.directory.identity(cif)
    return this.guarded(cif, async () => {
      const req = await this.request(cif, this.period(asOf, windowMonths))
      const [profile, accounts, transactions, liabilities] = await Promise.all([
        this.client.block('PROFILE', req),
        this.client.block('ACCOUNTS', req),
        this.client.block('TXN', req),
        this.client.block('LIABILITIES', req),
      ])
      this.noteMeta(profile.meta)
      this.profiles.set(cif, { at: Date.now(), result: profile })

      const ctx = this.context(asOf, req.period)
      const file = mapCustomerFile(
        {
          profile: profile.data,
          accounts: accounts.data,
          transactions: transactions.data,
          liabilities: liabilities.data,
        },
        cif,
        identity,
        ctx,
      )
      this.report = ctx.report
      return { file, meta: profile.meta, report: ctx.report }
    })
  }

  /** Block 07, parsed. Never an advice input; kept for the audit record beside the engine's own. */
  async getSignals(cif: string, asOf: IsoDate): Promise<BankSignals> {
    return this.guarded(cif, async () => {
      const req = await this.request(cif, this.period(asOf))
      const res = await this.client.block('SIGNALS', req)
      this.noteMeta(res.meta)
      return mapSignals(res.data, this.context(asOf, req.period))
    })
  }

  /** What the last file load could not map cleanly. Operators read this in week one. */
  lastReport(): MappingReport | null {
    return this.report
  }

  /* ---------------------------------------------------------------- */

  /** `windowMonths` of history ending at `asOf`, from the first of the month. */
  private period(asOf: IsoDate, windowMonths = this.windowMonths): { from: IsoDate; to: IsoDate } {
    const reference = this.windowAnchor ?? asOf
    const start = ymd(addMonths(reference, -(Math.max(1, windowMonths) - 1)))
    const from = fromYmd(start.year, start.month, 1)
    return { from: from < asOf ? from : asOf, to: asOf }
  }

  private context(asOf: IsoDate, period: { from: IsoDate; to: IsoDate }) {
    return mapContext({ asOf, period, amountUnit: this.amountUnit }, newReport())
  }

  private async request(
    cif: string,
    period: { from: IsoDate; to: IsoDate },
  ): Promise<BlockRequest> {
    const held = await this.directory.heldConsent(cif)
    return { customerId: cif, consentId: held.consentId, period }
  }

  /** The profile block, memoised briefly: consent, horizon and health all read its block 08. */
  private async profile(
    cif: string,
    opts: { fresh?: boolean } = {},
  ): Promise<BlockResult<'PROFILE'>> {
    const cached = this.profiles.get(cif)
    if (!opts.fresh && cached && Date.now() - cached.at < this.metaTtlMs) return cached.result
    const req = await this.request(cif, this.period(this.freshness))
    const result = await this.client.block('PROFILE', req)
    this.noteMeta(result.meta)
    this.profiles.set(cif, { at: Date.now(), result })
    return result
  }

  private noteMeta(meta: WireMeta): void {
    try {
      this.freshness = mapHorizon(meta).to
    } catch {
      // A malformed freshness date is reported by the mapping that reads it; keep the last good one.
    }
  }

  private async guarded<T>(cif: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (err) {
      throw toDomainError(err, cif)
    }
  }
}

/** Every failure the client can raise, as the error the route contracts declare. */
export function toDomainError(err: unknown, cif: string): Error {
  if (isDomainError(err)) return err
  if (err instanceof IdbiApiError) {
    const code = err.errorCode ?? ''
    if (code === 'CONSENT_EXPIRED') return new ConsentInactive('EXPIRED')
    if (code === 'CONSENT_REVOKED') return new ConsentInactive('REVOKED')
    if (code.startsWith('CONSENT_')) {
      return new Forbidden(`The bank did not accept the consent artefact (${code}).`)
    }
    if (code === 'CUSTOMER_NOT_FOUND' || err.status === 404) {
      return new NotFound(`No customer with cif ${cif} at the bank.`)
    }
    return new Unavailable(`The bank answered ${err.status}${code ? ` ${code}` : ''}.`, {
      endpoint: err.endpoint,
      errorCode: err.errorCode,
    })
  }
  if (err instanceof WireShapeError) {
    return new Unavailable('The bank feed did not match the contract.', {
      endpoint: err.endpoint,
      issues: err.issues,
    })
  }
  if (err instanceof WireFormatError) {
    return new Unavailable('The bank feed did not match the contract.', {
      field: err.field,
      message: err.message,
    })
  }
  if (err instanceof BreakerOpenError) {
    return new Unavailable('The bank line is down right now.', {
      retryAfterMs: err.retryAfterMs,
    })
  }
  if (isTimeout(err)) return new Unavailable('The bank did not answer in time.')
  return new Unavailable('The bank could not be reached.', {
    message: err instanceof Error ? err.message : String(err),
  })
}
