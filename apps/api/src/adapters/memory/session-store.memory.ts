/**
 * SessionStore in process. Rows in Maps; the same optimistic version the Postgres store keeps
 * as a column, so a stale tab gets the same 409 under either.
 */
import { randomUUID } from 'node:crypto'
import { EMPTY_SAVE_STATE } from '@dhan/core'
import type {
  Clock,
  IdempotentResponse,
  NewSession,
  Session,
  SessionPatch,
  SessionStore,
} from '../../ports/index.ts'

export class InMemorySessionStore implements SessionStore {
  private readonly byId = new Map<string, Session>()
  private readonly idByToken = new Map<string, string>()
  private readonly idempotent = new Map<string, IdempotentResponse>()
  private readonly clock: Clock

  constructor(clock: Clock) {
    this.clock = clock
  }

  async create(input: NewSession): Promise<Session> {
    const now = this.clock.now().toISOString()
    const session: Session = {
      id: randomUUID(),
      subjectId: randomUUID(),
      cif: input.cif,
      tokenHash: input.tokenHash,
      asOf: input.asOf,
      lastSeen: input.lastSeen,
      goalTarget: null,
      goalBasis: null,
      goalKind: null,
      caps: [],
      spendLimit: null,
      // A clone, not the const. Every session in this process would otherwise share one pot, and
      // the first deposit pushed onto it would appear in all of them — which Postgres, handing
      // each row its own parsed jsonb, would never do, and the divergence would only ever show
      // up in a test that ran two sessions.
      save: structuredClone(EMPTY_SAVE_STATE),
      challenge: null,
      scopeOverrides: [],
      version: 1,
      clientHint: input.clientHint ?? null,
      createdAt: now,
      lastActiveAt: now,
      expiresAt: input.expiresAt,
      revokedAt: null,
    }
    this.byId.set(session.id, session)
    this.idByToken.set(session.tokenHash, session.id)
    return session
  }

  async getByTokenHash(tokenHash: string): Promise<Session | null> {
    const id = this.idByToken.get(tokenHash)
    return id === undefined ? null : (this.byId.get(id) ?? null)
  }

  async getById(id: string): Promise<Session | null> {
    return this.byId.get(id) ?? null
  }

  async patch(id: string, patch: SessionPatch, expectedVersion: number): Promise<Session | null> {
    const current = this.byId.get(id)
    if (!current || current.version !== expectedVersion) return null

    const next: Session = {
      ...current,
      ...(patch.asOf === undefined ? {} : { asOf: patch.asOf }),
      ...(patch.lastSeen === undefined ? {} : { lastSeen: patch.lastSeen }),
      ...(patch.goalTarget === undefined ? {} : { goalTarget: patch.goalTarget }),
      ...(patch.goalBasis === undefined ? {} : { goalBasis: patch.goalBasis }),
      ...(patch.goalKind === undefined ? {} : { goalKind: patch.goalKind }),
      ...(patch.caps === undefined ? {} : { caps: patch.caps }),
      ...(patch.spendLimit === undefined ? {} : { spendLimit: patch.spendLimit }),
      ...(patch.save === undefined ? {} : { save: patch.save }),
      ...(patch.challenge === undefined ? {} : { challenge: patch.challenge }),
      ...(patch.scopeOverrides === undefined ? {} : { scopeOverrides: patch.scopeOverrides }),
      version: current.version + 1,
    }
    this.byId.set(id, next)
    return next
  }

  async touch(id: string, at: { lastActiveAt: string; expiresAt: string }): Promise<void> {
    const current = this.byId.get(id)
    if (current) this.byId.set(id, { ...current, ...at })
  }

  async erase(id: string): Promise<void> {
    const current = this.byId.get(id)
    if (!current) return
    this.byId.delete(id)
    this.idByToken.delete(current.tokenHash)
    for (const key of this.idempotent.keys()) {
      if (key.startsWith(`${id}:`)) this.idempotent.delete(key)
    }
  }

  async putIdempotent(sessionId: string, key: string, response: IdempotentResponse): Promise<void> {
    this.idempotent.set(`${sessionId}:${key}`, response)
  }

  async getIdempotent(sessionId: string, key: string): Promise<IdempotentResponse | null> {
    return this.idempotent.get(`${sessionId}:${key}`) ?? null
  }

  async expireIdle(days: number, now: Date): Promise<number> {
    const cutoff = now.getTime() - days * 86_400_000
    let expired = 0
    for (const s of [...this.byId.values()]) {
      if (new Date(s.lastActiveAt).getTime() < cutoff) {
        await this.erase(s.id)
        expired += 1
      }
    }
    return expired
  }
}
