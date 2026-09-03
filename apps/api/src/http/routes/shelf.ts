import { routeById } from '@dhan/contracts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function shelfRoutes(r: Registrar, s: AppServices): void {
  r(routeById('getShelf'), async () => s.shelf.list())
}
