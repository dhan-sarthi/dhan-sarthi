import { routeById } from '@dhan/contracts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function avatarRoutes(r: Registrar, s: AppServices): void {
  r(routeById('avatarAvailability'), async () => s.avatar.availability())

  // The client sends nothing but its bearer; the brief is built here and is not editable.
  r(routeById('startAvatarSession'), async ({ session, headers }) =>
    s.avatar.start(session, headers['x-waitlist-ticket']),
  )

  r(routeById('getWaitlist'), async ({ session, params }) =>
    s.avatar.waitlistStatus(session, params.ticket),
  )

  r(routeById('leaveWaitlist'), async ({ session, params }) => {
    await s.avatar.leaveWaitlist(session, params.ticket)
    return undefined
  })

  r(routeById('endAvatarSession'), async ({ session, params }) => {
    await s.avatar.end(session, params.runwaySessionId)
    return undefined
  })

  r(routeById('getAvatarCallRecord'), async ({ session, params }) =>
    s.avatar.record(session, params.runwaySessionId),
  )
}
