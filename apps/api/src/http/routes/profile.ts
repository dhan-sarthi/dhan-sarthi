/**
 * The declared profile: read and write the facts no bank endpoint carries.
 *
 * These change the advice, so a write is not a preference save. Raising declared income moves
 * the surplus, the EMI-to-income ratio and every affordability answer that rests on them, and
 * changing the risk profile can turn a recommendation the gate allowed into one it refuses. So
 * the response is the profile as it now stands and the client is expected to reload the view.
 */
import { routeById } from '@dhan/contracts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function profileRoutes(r: Registrar, s: AppServices): void {
  r(routeById('getProfile'), async ({ session }) => s.profile.get(session))

  r(routeById('patchProfile'), async ({ session, body }) => s.profile.patch(session, body))
}
