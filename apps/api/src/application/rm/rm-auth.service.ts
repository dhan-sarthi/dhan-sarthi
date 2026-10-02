/**
 * RM sign-in: employee number and password in, an opaque `rm_` bearer out.
 *
 * The same design as a reviewer session (ADR-0008), on its own table and with its own prefix:
 * 256 random bits handed out once, only the sha256 kept, a sliding expiry. Twelve hours rather
 * than thirty days, because an RM's bearer opens a book of customers, not one, and a desk shift
 * is the natural life of a console left open.
 *
 * Every failure to sign in says the same thing. "No such employee" and "wrong password" are
 * different facts, and telling them apart would let anyone list the desk one number at a time;
 * the decoy hash makes the two take the same time as well as say the same words. The decoy is
 * made when the service is, not on the first unknown number: made then, that one request paid
 * for a synchronous scrypt on top of the async one and took twice as long as a wrong password.
 *
 * Guessing is limited twice: per address by the route, and per employee number here
 * (`sign-in-guard.ts`), which holds even where the address can be forged.
 */
import { randomBytes } from 'node:crypto'
import type { RmSignInResponse } from '@dhan/contracts'
import { RateLimited, Unauthorized } from '../errors.ts'
import { sha256Hex } from '../hash.ts'
import type { Clock, RmDeskPort } from '../../ports/index.ts'
import type { RmCaller } from './caller.ts'
import { rmProfile } from './caller.ts'
import { decoyHash, verifyPassword } from './password.ts'
import { SIGN_IN_FAILURES, SignInGuard } from './sign-in-guard.ts'

/** What tells the two bearers apart before any store is asked. */
export const RM_TOKEN_PREFIX = 'rm_'

const SESSION_TTL_MS = 12 * 60 * 60 * 1000
/** As for reviewer sessions: sliding the expiry by seconds on every call buys nothing. */
const TOUCH_INTERVAL_MS = 60_000

export const SIGN_IN_REFUSED = 'That employee number and password do not match.'

export interface RmAuthDeps {
  desk: RmDeskPort
  clock: Clock
}

export class RmAuthService {
  private readonly deps: RmAuthDeps
  private readonly guard: SignInGuard
  private readonly decoy: string

  constructor(deps: RmAuthDeps) {
    this.deps = deps
    this.guard = new SignInGuard(() => deps.clock.now().getTime())
    this.decoy = decoyHash()
  }

  private expiry(): string {
    return new Date(this.deps.clock.now().getTime() + SESSION_TTL_MS).toISOString()
  }

  async signIn(employeeNo: string, password: string): Promise<RmSignInResponse> {
    const number = employeeNo.trim()
    // Checked and counted with no await between, so guesses sent together cannot all get in.
    const wait = this.guard.retryAfterMs(number)
    if (wait > 0) throw new RateLimited(wait, SIGN_IN_FAILURES.max)
    this.guard.attempt(number)

    const user = await this.deps.desk.userByEmployeeNo(number)
    const ok = await verifyPassword(password, user?.passwordHash ?? this.decoy)
    if (!user || !ok) throw new Unauthorized(SIGN_IN_REFUSED)
    this.guard.succeeded(number)

    const token = `${RM_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
    const session = await this.deps.desk.createSession({
      rmId: user.rmId,
      tokenHash: sha256Hex(token),
      expiresAt: this.expiry(),
    })
    return { token, expiresAt: session.expiresAt, rm: rmProfile(user) }
  }

  /**
   * The RM a bearer belongs to, or null. A token without the `rm_` prefix is refused before the
   * store is asked, so a customer's `ds_` bearer cannot open a book even by accident.
   */
  async authenticate(token: string): Promise<RmCaller | null> {
    if (!token.startsWith(RM_TOKEN_PREFIX)) return null
    const session = await this.deps.desk.sessionByTokenHash(sha256Hex(token))
    if (!session || session.revokedAt !== null) return null

    const now = this.deps.clock.now()
    if (new Date(session.expiresAt).getTime() <= now.getTime()) return null

    const user = await this.deps.desk.userById(session.rmId)
    if (!user) return null

    if (now.getTime() - new Date(session.lastActiveAt).getTime() >= TOUCH_INTERVAL_MS) {
      await this.deps.desk.touchSession(session.id, {
        lastActiveAt: now.toISOString(),
        expiresAt: this.expiry(),
      })
    }
    return {
      rmId: user.rmId,
      employeeNo: user.employeeNo,
      name: user.name,
      desk: user.desk,
      city: user.city,
      sessionId: session.id,
    }
  }

  async signOut(rm: RmCaller): Promise<void> {
    await this.deps.desk.revokeSession(rm.sessionId, this.deps.clock.now().toISOString())
  }

  /** The signed-in RM's own profile, read fresh rather than from the bearer's moment. */
  async profile(rm: RmCaller): Promise<RmSignInResponse['rm']> {
    const user = await this.deps.desk.userById(rm.rmId)
    return rmProfile(user ?? rm)
  }
}
