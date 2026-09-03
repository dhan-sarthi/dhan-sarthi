import { ruleBook } from '@dhan/core'
import { routeById } from '@dhan/contracts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function rulesRoutes(r: Registrar, _s: AppServices): void {
  r(routeById('getRules'), async () => [...ruleBook])
}
