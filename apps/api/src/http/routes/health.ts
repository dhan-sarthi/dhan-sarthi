import { routeById } from '@dhan/contracts'
import { reply } from '../register.ts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function healthRoutes(r: Registrar, s: AppServices): void {
  // Same body on 503, so a reviewer sees which dependency is down rather than a bare status.
  r(routeById('getHealth'), async () => {
    const health = await s.health()
    return reply(health, { status: health.ok ? 200 : 503 })
  })

  r(routeById('getOpenApi'), async () => s.openapi)
}
