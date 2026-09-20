import { routeById } from '@dhan/contracts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function operatorRoutes(r: Registrar, s: AppServices): void {
  r(routeById('operatorAvatarStatus'), async () => s.avatar.operatorStatus())

  r(routeById('operatorReleaseAll'), async () => ({
    released: await s.avatar.releaseAll('release_all'),
  }))

  r(routeById('operatorSeed'), async () => s.operator.seedStatus())

  r(routeById('operatorMappingReport'), async () => s.operator.mapping())
}
