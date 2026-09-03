/**
 * Reviewer sessions: create, authenticate, move the clock, change the goal, withdraw a scope,
 * erase.
 *
 * A session is a row, not a browser: fifteen reviewers get fifteen clocks. The bearer is 256
 * random bits handed out once; only its sha256 is stored, so a leaked store cannot mint one.
 * The simulated clock moves only through `advanceClock`, and only against the version the
 * caller last saw — two tabs pressing +1 month move it once.
 */
import { randomBytes } from 'node:crypto'
import { addDays } from '@dhan/core'
import type {
  AvatarProviderName,
  ClockRequest,
  ConsentScope,
  IsoDate,
  SessionState,
} from '@dhan/contracts'
import { BeyondHorizon, StaleClock } from './errors.ts'
import { sha256Hex } from './hash.ts'
import type { BankDataPort, Clock, Session, SessionStore } from '../ports/index.ts'

/** Six days before the anchor, so "since you were away" has a week to talk about. */
const LAST_SEEN_OFFSET_DAYS = -6
const SESSION_TTL_DAYS = 30

export interface SessionServiceDeps {
  sessions: SessionStore
  bank: BankDataPort
  clock: Clock
  /** The persona anchor every fixture window is measured from. */
  anchor: IsoDate
  avatarName: AvatarProviderName
}

export class SessionService {
  private readonly deps: SessionServiceDeps

  constructor(deps: SessionServiceDeps) {
    this.deps = deps
  }

  private expiry(): string {
    return new Date(this.deps.clock.now().getTime() + SESSION_TTL_DAYS * 86_400_000).toISOString()
  }

  async create(cif: string, clientHint?: string): Promise<{ token: string; session: Session }> {
    // Throws NotFound for an unknown cif, which is the 404 the route declares.
    await this.deps.bank.getCustomer(cif)

    const token = `ds_${randomBytes(32).toString('base64url')}`
    const session = await this.deps.sessions.create({
      cif,
      tokenHash: sha256Hex(token),
      asOf: this.deps.anchor,
      lastSeen: addDays(this.deps.anchor, LAST_SEEN_OFFSET_DAYS),
      expiresAt: this.expiry(),
      ...(clientHint === undefined ? {} : { clientHint }),
    })
    return { token, session }
  }

  /** The bearer to a session, or null. Slides the expiry on every successful call. */
  async authenticate(token: string): Promise<Session | null> {
    const session = await this.deps.sessions.getByTokenHash(sha256Hex(token))
    if (!session || session.revokedAt !== null) return null

    const now = this.deps.clock.now()
    if (new Date(session.expiresAt).getTime() <= now.getTime()) return null

    const touched = { lastActiveAt: now.toISOString(), expiresAt: this.expiry() }
    await this.deps.sessions.touch(session.id, touched)
    return { ...session, ...touched }
  }

  async state(session: Session): Promise<SessionState> {
    return {
      id: session.id,
      cif: session.cif,
      asOf: session.asOf,
      lastSeen: session.lastSeen,
      goalTarget: session.goalTarget,
      caps: session.caps,
      scopeOverrides: session.scopeOverrides,
      version: session.version,
      ledgerHorizon: await this.deps.bank.ledgerHorizon(session.cif),
      expiresAt: session.expiresAt,
      capabilities: {
        simulatedClock: this.deps.bank.describe().simulatedClock,
        avatar: this.deps.avatarName,
      },
    }
  }

  /**
   * Advance or reset. `lastSeen` moves to the old `asOf`, which is what makes "since you were
   * away" mean anything: jump a month and the app has a month of transactions to account for.
   */
  async advanceClock(session: Session, request: ClockRequest): Promise<Session> {
    const horizon = await this.deps.bank.ledgerHorizon(session.cif)

    const next =
      'reset' in request
        ? { asOf: this.deps.anchor, lastSeen: addDays(this.deps.anchor, LAST_SEEN_OFFSET_DAYS) }
        : { asOf: addDays(session.asOf, request.advanceDays), lastSeen: session.asOf }

    if (next.asOf > horizon.to) throw new BeyondHorizon(next.asOf, horizon.to)

    const updated = await this.deps.sessions.patch(session.id, next, request.expectedVersion)
    if (!updated) {
      const current = await this.deps.sessions.getById(session.id)
      throw new StaleClock(current?.version ?? session.version)
    }
    return updated
  }

  async setGoal(session: Session, targetAmount: number): Promise<Session> {
    return this.patch(session, { goalTarget: targetAmount })
  }

  async setConsent(session: Session, scope: ConsentScope, granted: boolean): Promise<Session> {
    const withdrawn = new Set(session.scopeOverrides)
    if (granted) withdrawn.delete(scope)
    else withdrawn.add(scope)
    return this.patch(session, { scopeOverrides: [...withdrawn] })
  }

  async erase(session: Session): Promise<void> {
    await this.deps.sessions.erase(session.id)
  }

  /** A patch against the version the caller holds; a stale caller is told to refetch. */
  private async patch(
    session: Session,
    patch: Parameters<SessionStore['patch']>[1],
  ): Promise<Session> {
    const updated = await this.deps.sessions.patch(session.id, patch, session.version)
    if (!updated) {
      const current = await this.deps.sessions.getById(session.id)
      throw new StaleClock(current?.version ?? session.version)
    }
    return updated
  }
}
