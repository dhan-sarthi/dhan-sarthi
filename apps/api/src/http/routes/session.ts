import { routeById } from '@dhan/contracts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function sessionRoutes(r: Registrar, s: AppServices): void {
  r(routeById('getSession'), async ({ session }) => s.sessions.state(session))

  r(routeById('eraseSession'), async ({ session }) => {
    await s.sessions.erase(session)
    return undefined
  })

  r(routeById('advanceClock'), async ({ session, body }) =>
    s.sessions.state(await s.sessions.advanceClock(session, body)),
  )

  r(routeById('setGoal'), async ({ session, body }) =>
    s.sessions.state(await s.sessions.setGoal(session, body.targetAmount)),
  )

  r(routeById('setConsent'), async ({ session, body }) =>
    s.sessions.state(await s.sessions.setConsent(session, body.scope, body.granted)),
  )
}
