import { routeById } from '@dhan/contracts'
import { sha256Hex } from '../../application/hash.ts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

/** Hashed user agent plus the /24, for the operator view. Never the IP itself. */
function clientHint(userAgent: string | undefined, ip: string): string {
  const net = ip.includes(':')
    ? ip.split(':').slice(0, 4).join(':')
    : ip.split('.').slice(0, 3).join('.')
  return sha256Hex(`${userAgent ?? ''}|${net}`).slice(0, 16)
}

export function sessionsRoutes(r: Registrar, s: AppServices): void {
  r(routeById('createSession'), async ({ body, request }) => {
    const { token, session } = await s.sessions.create(
      body.cif,
      clientHint(request.headers['user-agent'], request.ip),
    )
    /*
     * A customer opening this app has been a customer for years, so the session opens with the
     * months behind it already advised on: the record, the plan versions and the caps are the
     * engine's own output at each of those months. `seed` never throws — a session with a thinner
     * past is a far better outcome than a sign-in that fails — and it hands back the row as it
     * stands, clock returned to where `create` put it.
     */
    const seeded = await s.history.seed(session)
    return { token, session: await s.sessions.state(seeded) }
  })
}
