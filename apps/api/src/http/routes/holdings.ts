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
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function holdingsRoutes(r: Registrar, s: AppServices): void {
  r(routeById('getHoldings'), async ({ session }) => s.holdingsView.view(session))

  r(routeById('addHolding'), async ({ session, body }) => s.holdingsView.add(session, body))

  r(routeById('replaceHolding'), async ({ session, params, body }) =>
    s.holdingsView.replace(session, params.holdingId, body),
  )

  r(routeById('removeHolding'), async ({ session, params }) => {
    await s.holdingsView.remove(session, params.holdingId)
    return undefined
  })
}
