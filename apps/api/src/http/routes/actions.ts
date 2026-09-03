import { routeById } from '@dhan/contracts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function actionRoutes(r: Registrar, s: AppServices): void {
  r(routeById('decideAction'), async ({ session, params, body }) =>
    s.decisions.decide(session, params.actionId, body.kind, body.note),
  )
}
