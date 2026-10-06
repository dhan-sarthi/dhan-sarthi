/**
 * Who is calling: a reviewer session by bearer, a relationship manager by bearer, an operator by
 * header, or nobody.
 *
 * The bearer is resolved once per request into a `Principal` the route handler receives; a
 * store method never sees a token. The operator key is compared in constant time, and its
 * absence at boot turns the operator routes into 404s rather than into open doors.
 *
 * The two bearers share a header and nothing else. An RM token opens a book of customers and a
 * session token opens one, so each kind refuses the other's prefix before any store is asked:
 * an `rm_` bearer on a customer route and a `ds_` bearer on an RM route are both a plain 401.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import type { RouteAuth } from '@dhan/contracts'
import { NotFound, Unauthorized } from '../application/errors.ts'
import type { RmCaller } from '../application/rm/caller.ts'
import { RM_TOKEN_PREFIX } from '../application/rm/rm-auth.service.ts'
import type { RmAuthService } from '../application/rm/rm-auth.service.ts'
import type { SessionService } from '../application/session.service.ts'
import type { Session } from '../ports/index.ts'

export type Principal =
  | { kind: 'none' }
  | { kind: 'session'; session: Session }
  | { kind: 'operator' }
  | { kind: 'rm'; rm: RmCaller }

export interface Authenticator {
  authenticate(auth: RouteAuth, request: FastifyRequest): Promise<Principal>
}

export interface AuthDeps {
  sessions: SessionService
  rm: RmAuthService
  operatorKey: string | undefined
}

/**
 * The token after `Bearer `, or null. The scheme is case-insensitive and the gap any run of
 * whitespace, so `bearer X`, `BEARER  X` and `Bearer\tX` are all the bearer X: anything keyed on
 * the caller (the per-session rate limits) keys on this, never on the raw header.
 */
export function bearerOf(request: FastifyRequest): string | null {
  const header = request.headers.authorization
  const match = typeof header === 'string' ? /^Bearer\s+(\S+)$/i.exec(header) : null
  return match?.[1] ?? null
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
          const token = bearerOf(request)
          if (!token) throw new Unauthorized()
          // An RM's bearer is never a customer's session, whatever a store might hold.
          if (token.startsWith(RM_TOKEN_PREFIX)) throw new Unauthorized()
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

        case 'rm': {
          const token = bearerOf(request)
          if (!token || !token.startsWith(RM_TOKEN_PREFIX)) {
            throw new Unauthorized('A relationship manager bearer is required.')
          }
          const rm = await deps.rm.authenticate(token)
          if (!rm) throw new Unauthorized('This sign-in is not valid any more.')
          return { kind: 'rm', rm }
        }
      }
    },
  }
}
