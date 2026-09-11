/**
 * Holdings: what the customer already owns.
 *
 * The block exists as an API because IDBI has no endpoint for it — no mutual fund, no deposit
 * book, no NPS, no insurance — and a wealth advisory app that cannot say what someone already
 * holds can only recommend into a vacuum. Every write changes the advice, since the
 * suitability gate reads the portfolio to refuse a duplicate and the protection rules read the
 * cover to spot a gap.
 *
 * Under a source that serves its own holdings — the fixtures generator, or the seeded database
 * — the app owns nothing here and a write is refused rather than accepted and ignored. The
 * `editable` flag on the read says which world the caller is in.
 */
import { routeById } from '@dhan/contracts'
import type { HoldingsResponse } from '@dhan/contracts'
import type { HoldingDraft } from '../../ports/holdings.port.ts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

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

export function holdingsRoutes(r: Registrar, s: AppServices): void {
  r(routeById('getHoldings'), async ({ session }): Promise<HoldingsResponse> => {
    // The session's simulated today, not the bank's freshness date: under the fixtures source
    // those are eighteen months apart, and the Dashboard reads this beside figures the view
    // computes at `session.asOf`.
    const held = await s.holdings.get(session.cif, session.asOf)
    return {
      holdings: held.holdings,
      policies: held.policies,
      updatedAt: held.updatedAt,
      // Policies carry cover in `investedAmount` and no capital, so they are excluded: a total
      // that added a ₹1 crore sum assured to a portfolio would be wrong by a crore.
      totalValue: round2(held.holdings.reduce((sum, h) => sum + h.currentValue, 0)),
      editable: s.holdings.editable(),
    }
  })

  r(routeById('addHolding'), async ({ session, body }) =>
    s.holdings.add(session.cif, draftOf(body)),
  )

  r(routeById('replaceHolding'), async ({ session, params, body }) =>
    s.holdings.replace(session.cif, params.holdingId, draftOf(body)),
  )

  r(routeById('removeHolding'), async ({ session, params }) => {
    await s.holdings.remove(session.cif, params.holdingId)
    return undefined
  })
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
