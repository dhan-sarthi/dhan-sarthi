/**
 * A customer's investments, which IDBI has no endpoint for.
 *
 * The catalogue has no mutual fund, no deposit book, no NPS and no insurance operation, and a
 * consented Account Aggregator pull does not close the gap either — it returns deposit
 * accounts held at other banks, which is other people's savings rather than this customer's
 * portfolio. So there is no bank read that answers "what do they already own", and a wealth
 * advisory app that cannot answer it can only recommend into a vacuum: it would suggest an
 * equity fund to someone already holding three.
 *
 * This port is where that answer lives until a real feed exists. It is the app's own record —
 * `/api/v1/holdings` reads and writes it, Record → Your data marks the block as declared
 * rather than `idbi`, and every screen that spends the number says where it came from. The
 * moment IDBI exposes a holdings API, or an AA consent reaches `fiType: MUTUAL_FUNDS`, an
 * adapter implements this port over that and nothing above it moves.
 *
 * Term deposits are the exception worth knowing about: an FD held *at IDBI* arrives as an
 * account on 394 and 365, so it is already in the accounts block and must not be recorded here
 * as well, or a net-worth figure counts it twice.
 */
import type { Holding } from '@dhan/core'

/** One stored investment, with the id the API addresses it by. */
export interface HoldingRecord extends Holding {
  holdingId: string
}

export interface CustomerHoldings {
  /** Funds, deposits held elsewhere, NPS, PPF — anything that accrues value. */
  holdings: HoldingRecord[]
  /** Protection: term and health cover. Separate because suitability reads them differently. */
  policies: HoldingRecord[]
  updatedAt: string
}

/** A new or replacement record. `holdingId` is assigned on create. */
export type HoldingDraft = Omit<HoldingRecord, 'holdingId'>

export interface HoldingsStore {
  /**
   * Whether this source's holdings are the app's to change.
   *
   * False where the source brings its own portfolio, in which case the writes below refuse.
   * Declared by the adapter rather than inferred from `BankDataPort.describe().source`, so the
   * route does not have to know which sources own what.
   */
  editable(): boolean
  /** Empty rather than a throw: a customer who owns nothing is a real customer. */
  get(cif: string): Promise<CustomerHoldings>
  add(cif: string, draft: HoldingDraft): Promise<HoldingRecord>
  /** Throws NotFound where the customer does not hold that record. */
  remove(cif: string, holdingId: string): Promise<void>
  replace(cif: string, holdingId: string, draft: HoldingDraft): Promise<HoldingRecord>
}
