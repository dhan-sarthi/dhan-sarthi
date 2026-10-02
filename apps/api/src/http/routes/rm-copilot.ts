/**
 * Owned by the copilot builder.
 *
 * The meeting brief and "Ask about this customer", registered against `RmCopilotService`. Both
 * are checked against the caller's book here, before the service is called.
 */
import { routeById } from '@dhan/contracts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function rmCopilotRoutes(r: Registrar, s: AppServices): void {
  r(routeById('rmBrief'), async ({ rm, params }) => {
    await s.rmScope.assertInBook(rm, params.cif)
    return s.rmCopilot.brief(rm, params.cif)
  })

  r(routeById('rmAsk'), async ({ rm, params, body }) => {
    await s.rmScope.assertInBook(rm, params.cif)
    return s.rmCopilot.ask(rm, params.cif, body)
  })
}
