import { routeById } from '@dhan/contracts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function customerRoutes(r: Registrar, s: AppServices): void {
  r(routeById('listCustomers'), async () => s.sessions.pickable())
}
