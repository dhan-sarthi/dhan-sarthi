/**
 * Who is calling: a reviewer session by bearer, an operator by header, or nobody.
 *
 * The bearer is resolved once per request into a `Principal` the route handler receives; a
 * store method never sees a token. The operator key is compared in constant time, and its
 * absence at boot turns the operator routes into 404s rather than into open doors.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import type { RouteAuth } from '@dhan/contracts'
import { NotFound, Unauthorized } from '../application/errors.ts'
import type { SessionService } from '../application/session.service.ts'
import type { Session } from '../ports/index.ts'

export type Principal =
  { kind: 'none' } | { kind: 'session'; session: Session } | { kind: 'operator' }

export interface Authenticator {
  authenticate(auth: RouteAuth, request: FastifyRequest): Promise<Principal>
}

export interface AuthDeps {
  sessions: SessionService
  operatorKey: string | undefined
}

/** Length-hiding compare: hash both sides so `timingSafeEqual` always sees equal buffers. */
function sameSecret(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export function makeAuthenticator(deps: AuthDeps): Authenticator {
  return {
    async authenticate(auth, request) {
      switch (auth) {
        case 'none':
          return { kind: 'none' }

        case 'session': {
          const header = request.headers.authorization
          const match = typeof header === 'string' ? /^Bearer\s+(\S+)$/i.exec(header) : null
          const token = match?.[1]
          if (!token) throw new Unauthorized()
          const session = await deps.sessions.authenticate(token)
          if (!session) throw new Unauthorized('This session is not valid any more.')
          return { kind: 'session', session }
        }

        case 'operator': {
          if (!deps.operatorKey) throw new NotFound('Not found.')
          const given = request.headers['x-operator-key']
          if (typeof given !== 'string' || !sameSecret(given, deps.operatorKey)) {
            throw new Unauthorized('A valid operator key is required.')
          }
          return { kind: 'operator' }
        }
      }
    },
  }
}
