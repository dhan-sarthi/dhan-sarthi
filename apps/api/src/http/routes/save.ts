/**
 * The savings pot.
 *
 * All three answer with the whole `SaveView` rather than the thing they touched, and that is
 * not laziness. The pot accrues lazily — the hacks are replayed over the simulated days since
 * they were last paid for at the moment somebody looks — so a request that changed one hack has
 * almost certainly moved the deposits, the interest and the projected monthly inflow as well,
 * and a client left to patch its own copy from a narrower answer would draw a pot that
 * disagrees with the next refresh.
 */
import { routeById } from '@dhan/contracts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function saveRoutes(r: Registrar, s: AppServices): void {
  r(routeById('getSave'), async ({ session }) => s.save.view(session))

  r(routeById('setSaveHack'), async ({ session, body }) => s.save.setHack(session, body))

  r(routeById('addSaveDeposit'), async ({ session, body }) => s.save.deposit(session, body.amount))
}
