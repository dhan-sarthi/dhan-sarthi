import { routeById } from '@dhan/contracts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function recordRoutes(r: Registrar, s: AppServices): void {
  r(routeById('getRecord'), async ({ session }) => s.records.record(session))

  r(routeById('verifyRecord'), async ({ session }) => s.records.verify(session))
}
