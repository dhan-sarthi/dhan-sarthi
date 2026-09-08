/**
 * The holdings store, in process.
 *
 * Seeded so the advice engine has a portfolio to reason against on first run, and owned by
 * whoever edits it after that. Ids are assigned here rather than by the caller, so two clients
 * adding a fund at once cannot collide on one.
 *
 * The seeds are deliberately shaped to exercise the suitability rules rather than to flatter
 * them: one customer already holds an equity fund with an active SIP and a term policy, so a
 * recommendation to start another equity SIP has something to collide with, and the other
 * holds only a PPF, so the protection gap is real.
 */
import { randomUUID } from 'node:crypto'
import { NotFound, ReadOnlyBlock } from '../../application/errors.ts'
import type { BankDataPort, Clock } from '../../ports/index.ts'
import type {
  CustomerHoldings,
  HoldingDraft,
  HoldingRecord,
  HoldingsStore,
} from '../../ports/holdings.port.ts'

export interface SeededHoldings {
  cif: string
  holdings: readonly HoldingDraft[]
  policies: readonly HoldingDraft[]
}

interface Row {
  holdings: HoldingRecord[]
  policies: HoldingRecord[]
  updatedAt: string
}

export class InMemoryHoldings implements HoldingsStore {
  private readonly rows = new Map<string, Row>()
  private readonly clock: Clock

  constructor(seeds: readonly SeededHoldings[], clock: Clock) {
    this.clock = clock
    const at = clock.now().toISOString()
    for (const seed of seeds) {
      this.rows.set(seed.cif, {
        holdings: seed.holdings.map((h) => ({ ...h, holdingId: randomUUID() })),
        policies: seed.policies.map((p) => ({ ...p, holdingId: randomUUID() })),
        updatedAt: at,
      })
    }
  }

  editable(): boolean {
    return true
  }

  async get(cif: string): Promise<CustomerHoldings> {
    const row = this.rows.get(cif)
    if (row === undefined) {
      return { holdings: [], policies: [], updatedAt: this.clock.now().toISOString() }
    }
    return {
      holdings: row.holdings.map((h) => ({ ...h })),
      policies: row.policies.map((p) => ({ ...p })),
      updatedAt: row.updatedAt,
    }
  }

  async add(cif: string, draft: HoldingDraft): Promise<HoldingRecord> {
    const row = this.ensure(cif)
    const record: HoldingRecord = { ...draft, holdingId: randomUUID() }
    // Protection products live in `policies` because suitability reads the two lists
    // differently: cover is not capital, and a term policy is not a fund to switch out of.
    if (isProtection(draft)) row.policies.push(record)
    else row.holdings.push(record)
    row.updatedAt = this.clock.now().toISOString()
    return { ...record }
  }

  async remove(cif: string, holdingId: string): Promise<void> {
    const row = this.rows.get(cif)
    if (row === undefined) throw new NotFound(`No holdings for cif ${cif}.`)
    const before = row.holdings.length + row.policies.length
    row.holdings = row.holdings.filter((h) => h.holdingId !== holdingId)
    row.policies = row.policies.filter((p) => p.holdingId !== holdingId)
    if (row.holdings.length + row.policies.length === before) {
      throw new NotFound(`No holding ${holdingId} for cif ${cif}.`)
    }
    row.updatedAt = this.clock.now().toISOString()
  }

  async replace(cif: string, holdingId: string, draft: HoldingDraft): Promise<HoldingRecord> {
    await this.remove(cif, holdingId)
    const row = this.ensure(cif)
    const record: HoldingRecord = { ...draft, holdingId }
    if (isProtection(draft)) row.policies.push(record)
    else row.holdings.push(record)
    row.updatedAt = this.clock.now().toISOString()
    return { ...record }
  }

  private ensure(cif: string): Row {
    const existing = this.rows.get(cif)
    if (existing !== undefined) return existing
    const row: Row = { holdings: [], policies: [], updatedAt: this.clock.now().toISOString() }
    this.rows.set(cif, row)
    return row
  }
}

function isProtection(draft: HoldingDraft): boolean {
  return draft.holdingType === 'INSURANCE' || draft.assetClass === 'Protection'
}

/**
 * A read-only `HoldingsStore` over a `BankDataPort` that already has holdings of its own.
 *
 * The fixtures generator and the seeded database both produce a portfolio per customer, so
 * under those sources the app does not own the block and should not pretend to: reads come
 * from the same place the view does, and a write says plainly that this source is not
 * editable rather than accepting an edit the view would then ignore. Only the IDBI source
 * genuinely owns holdings, because only there does no bank feed for them exist.
 */
export class BankBackedHoldings implements HoldingsStore {
  private readonly bank: BankDataPort
  private readonly clock: Clock

  constructor(bank: BankDataPort, clock: Clock) {
    this.bank = bank
    this.clock = clock
  }

  editable(): boolean {
    return false
  }

  async get(cif: string): Promise<CustomerHoldings> {
    const asOf = this.bank.describe().dataFreshnessDate
    const held = await this.bank.getHoldings(cif, asOf)
    // Ids are derived from position so a GET is stable between calls; nothing addresses them
    // for a write on this source anyway.
    return {
      holdings: held.holdings.map((h, i) => ({ ...h, holdingId: `bank-h${i}` })),
      policies: held.policies.map((p, i) => ({ ...p, holdingId: `bank-p${i}` })),
      updatedAt: this.clock.now().toISOString(),
    }
  }

  async add(): Promise<HoldingRecord> {
    throw this.refuse()
  }

  async remove(): Promise<void> {
    throw this.refuse()
  }

  async replace(): Promise<HoldingRecord> {
    throw this.refuse()
  }

  private refuse(): ReadOnlyBlock {
    return new ReadOnlyBlock('holdings', this.bank.describe().source)
  }
}
