import { routeById } from '@dhan/contracts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function suitabilityRoutes(r: Registrar, s: AppServices): void {
  // The text tier and "Why?" are the callers, so the record says `text`; a machine caller
  // gets the same verdict and the same row.
  r(routeById('evaluateSuitability'), async ({ session, body }) =>
    s.conversation.evaluateProduct(session, body, 'text'),
  )
}
