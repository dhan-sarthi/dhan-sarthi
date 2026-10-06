/**
 * RmDeskPort in process: the desk's users, their sessions and the book assignment, in Maps.
 *
 * Seeded by `generatedRmDesk` (generated-source.ts) from the fixtures' desk, with the demo
 * passwords already hashed; this class never sees a password. Sessions live only as long as
 * the process, which is what a memory source means.
 */
import { randomUUID } from 'node:crypto'
import type { Timestamp } from '@dhan/contracts'
import type { Clock, NewRmSession, RmDeskPort, RmSession, RmUser } from '../../ports/index.ts'

export class InMemoryRmDesk implements RmDeskPort {
  private readonly users = new Map<string, RmUser>()
  private readonly byEmployeeNo = new Map<string, string>()
  private readonly assignments = new Map<string, string>()
  private readonly sessions = new Map<string, RmSession>()
  private readonly idByToken = new Map<string, string>()
  private readonly clock: Clock

  /** `assignments` is cif → rmId, one entry per customer. */
  constructor(
    users: readonly RmUser[],
    assignments: Readonly<Record<string, string>>,
    clock: Clock,
  ) {
    for (const u of users) {
      this.users.set(u.rmId, u)
      this.byEmployeeNo.set(u.employeeNo, u.rmId)
    }
    for (const [cif, rmId] of Object.entries(assignments)) this.assignments.set(cif, rmId)
    this.clock = clock
  }

  async userByEmployeeNo(employeeNo: string): Promise<RmUser | null> {
    const id = this.byEmployeeNo.get(employeeNo)
    return id === undefined ? null : (this.users.get(id) ?? null)
  }

  async userById(rmId: string): Promise<RmUser | null> {
    return this.users.get(rmId) ?? null
  }

  async createSession(input: NewRmSession): Promise<RmSession> {
    const now = this.clock.now().toISOString()
    const session: RmSession = {
      id: randomUUID(),
      rmId: input.rmId,
      tokenHash: input.tokenHash,
      createdAt: now,
      lastActiveAt: now,
      expiresAt: input.expiresAt,
      revokedAt: null,
    }
    this.sessions.set(session.id, session)
    this.idByToken.set(session.tokenHash, session.id)
    return session
  }

  async sessionByTokenHash(tokenHash: string): Promise<RmSession | null> {
    const id = this.idByToken.get(tokenHash)
    return id === undefined ? null : (this.sessions.get(id) ?? null)
  }

  async touchSession(
    id: string,
    at: { lastActiveAt: Timestamp; expiresAt: Timestamp },
  ): Promise<void> {
    const current = this.sessions.get(id)
    if (current) this.sessions.set(id, { ...current, ...at })
  }

  async revokeSession(id: string, at: Timestamp): Promise<void> {
    const current = this.sessions.get(id)
    if (current && current.revokedAt === null) this.sessions.set(id, { ...current, revokedAt: at })
  }

  async assignmentOf(cif: string): Promise<string | null> {
    return this.assignments.get(cif) ?? null
  }

  async bookOf(rmId: string): Promise<string[]> {
    return [...this.assignments]
      .filter(([, owner]) => owner === rmId)
      .map(([cif]) => cif)
      .sort()
  }
}
