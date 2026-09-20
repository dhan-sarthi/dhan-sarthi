/**
 * What the customer already owns, and the only place the app's own portfolio can be edited.
 *
 * The block exists at all because IDBI has no endpoint for it — no mutual fund, no deposit
 * book, no NPS, no insurance — and a wealth advisory app that cannot say what someone already
 * holds can only recommend into a vacuum. Under a source that serves its own holdings the app
 * owns nothing here and the store refuses a write rather than accepting and ignoring it; the
 * `editable` flag on the read says which world the caller is in.
 */
import type { HoldingDraftRequest, HoldingsResponse } from '@dhan/contracts'
import type { HoldingDraft, HoldingRecord, HoldingsStore, Session } from '../ports/index.ts'

/**
 * A parsed body into a draft.
 *
 * `exactOptionalPropertyTypes` is on, so zod's `sipAmount?: number | undefined` is not the
 * domain's `sipAmount?: number`: an explicitly-undefined key is a different thing from an
 * absent one. Dropping the undefined keys is the conversion, and it is the honest one — a
 * client that sends `sipAmount: undefined` means "no SIP", not "a SIP of nothing".
 */
function draftOf(body: object): HoldingDraft {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined) out[k] = v
  }
  return out as unknown as HoldingDraft
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export interface HoldingsViewDeps {
  holdings: HoldingsStore
}

export class HoldingsView {
  private readonly deps: HoldingsViewDeps

  constructor(deps: HoldingsViewDeps) {
    this.deps = deps
  }

  async view(session: Session): Promise<HoldingsResponse> {
    // The session's simulated today, not the bank's freshness date: under the fixtures source
    // those are eighteen months apart, and the Dashboard reads this beside figures the view
    // computes at `session.asOf`.
    const held = await this.deps.holdings.get(session.cif, session.asOf)
    return {
      holdings: held.holdings,
      policies: held.policies,
      updatedAt: held.updatedAt,
      // Policies carry cover in `investedAmount` and no capital, so they are excluded: a total
      // that added a ₹1 crore sum assured to a portfolio would be wrong by a crore.
      totalValue: round2(held.holdings.reduce((sum, h) => sum + h.currentValue, 0)),
      editable: this.deps.holdings.editable(),
    }
  }

  /* The three writes are thin by necessity: the store's refusals — `ReadOnlyBlock` under a
   * source that owns its own holdings, `NotFound` for a record this customer does not hold —
   * are what the route contracts declare, so they pass through untouched. */

  add(session: Session, body: HoldingDraftRequest): Promise<HoldingRecord> {
    return this.deps.holdings.add(session.cif, draftOf(body))
  }

  replace(session: Session, holdingId: string, body: HoldingDraftRequest): Promise<HoldingRecord> {
    return this.deps.holdings.replace(session.cif, holdingId, draftOf(body))
  }

  remove(session: Session, holdingId: string): Promise<void> {
    return this.deps.holdings.remove(session.cif, holdingId)
  }
}
