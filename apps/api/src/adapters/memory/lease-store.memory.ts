/**
 * LeaseStore in process: today's credential Map, the waitlist, and the minute meter.
 *
 * `release()` is the single charging call — the reaper charges a reaped lease by releasing it
 * at the full cap, which the store tolerates after `reapExpired` has already removed the row.
 * A process restart forgets everything here, which is exactly why the Postgres store exists;
 * this one is for the no-database profile and for tests.
 */
import { randomUUID } from 'node:crypto'
import type { AvatarEndReason, IsoDate, Timestamp } from '@dhan/contracts'
import type { Clock, Lease, LeaseStore, WaitlistEntry } from '../../ports/index.ts'

const WAITLIST_KEEP = 200

export class InMemoryLeaseStore implements LeaseStore {
  private readonly leases = new Map<string, Lease>()
  private readonly charges = new Map<IsoDate, number>()
  private waitlist: WaitlistEntry[] = []
  private readonly clock: Clock

  constructor(clock: Clock) {
    this.clock = clock
  }

  private now(): Timestamp {
    return this.clock.now().toISOString()
  }

  async tryAcquire(
    credentialLabel: string,
    sessionId: string,
    expiresAt: Timestamp,
    taskId: string,
  ): Promise<Lease | null> {
    if (this.leases.has(credentialLabel)) return null
    const lease: Lease = {
      credentialLabel,
      sessionId,
      runwaySessionId: null,
      taskId,
      claimedAt: this.now(),
      expiresAt,
    }
    this.leases.set(credentialLabel, lease)
    return lease
  }

  async attach(credentialLabel: string, runwaySessionId: string): Promise<void> {
    const lease = this.leases.get(credentialLabel)
    if (lease) this.leases.set(credentialLabel, { ...lease, runwaySessionId })
  }

  async release(
    credentialLabel: string,
    minutesCharged: number,
    _reason: AvatarEndReason,
  ): Promise<void> {
    this.leases.delete(credentialLabel)
    const day = this.clock.today()
    this.charges.set(day, (this.charges.get(day) ?? 0) + Math.max(0, minutesCharged))
  }

  async reapExpired(now: Date): Promise<Lease[]> {
    const expired: Lease[] = []
    for (const [label, lease] of this.leases) {
      if (new Date(lease.expiresAt).getTime() > now.getTime()) continue
      this.leases.delete(label)
      expired.push(lease)
    }
    return expired
  }

  async listHeld(): Promise<Lease[]> {
    return [...this.leases.values()]
  }

  async minutesUsed(day: IsoDate): Promise<number> {
    return this.charges.get(day) ?? 0
  }

  /* The waitlist ---------------------------------------------------------- */

  private isActive(e: WaitlistEntry): boolean {
    return e.grantedAt === null && e.expiredAt === null
  }

  async enqueue(sessionId: string): Promise<WaitlistEntry> {
    const existing = this.waitlist.find((e) => e.sessionId === sessionId && this.isActive(e))
    if (existing) return existing
    const entry: WaitlistEntry = {
      ticket: randomUUID(),
      sessionId,
      enqueuedAt: this.now(),
      claimableUntil: null,
      grantedAt: null,
      expiredAt: null,
    }
    this.waitlist.push(entry)
    if (this.waitlist.length > WAITLIST_KEEP) {
      this.waitlist = this.waitlist.filter((e) => this.isActive(e)).concat()
    }
    return entry
  }

  async peek(): Promise<WaitlistEntry | null> {
    return this.waitlist.find((e) => this.isActive(e)) ?? null
  }

  async get(ticket: string): Promise<WaitlistEntry | null> {
    return this.waitlist.find((e) => e.ticket === ticket) ?? null
  }

  async markClaimable(ticket: string, holdUntil: Timestamp): Promise<void> {
    const entry = this.waitlist.find((e) => e.ticket === ticket)
    if (entry) entry.claimableUntil = holdUntil
  }

  async expire(ticket: string): Promise<void> {
    const entry = this.waitlist.find((e) => e.ticket === ticket)
    if (entry && this.isActive(entry)) entry.expiredAt = this.now()
  }

  async dequeue(ticket: string): Promise<void> {
    this.waitlist = this.waitlist.filter((e) => e.ticket !== ticket)
  }

  async position(ticket: string): Promise<number | null> {
    const active = this.waitlist.filter((e) => this.isActive(e))
    const index = active.findIndex((e) => e.ticket === ticket)
    return index === -1 ? null : index + 1
  }

  async queueLength(): Promise<number> {
    return this.waitlist.filter((e) => this.isActive(e)).length
  }
}
