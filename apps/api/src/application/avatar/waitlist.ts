/**
 * The queue for the single Tier-1 slot.
 *
 * FIFO tickets, one per session. When a slot frees, the head is made claimable for a short hold
 * window; a grant request carrying that ticket wins the slot ahead of anyone else, and an
 * unclaimed ticket expires so the next moves up. The estimate is honest arithmetic over the
 * held lease's remaining cap, not a promise.
 *
 * A ticket is only ever made claimable when a slot is actually free. Promoting the head on every
 * look, whatever the leases said, sent "your turn" to a reviewer while the call was still on,
 * and a re-ask from the head of the line dequeued them and put them at the back.
 */
import type { WaitlistStatus, WaitlistTicket } from '@dhan/contracts'
import { Forbidden, NotFound } from '../errors.ts'
import type { Clock, LeaseStore, Session, WaitlistEntry } from '../../ports/index.ts'

export interface WaitlistOptions {
  /** How long a promoted ticket holds the slot before it is passed on. */
  holdSeconds: number
  /** The per-call cap, the worst case for one position in the queue. */
  capSeconds: number
}

export class Waitlist {
  private readonly leases: LeaseStore
  private readonly clock: Clock
  private readonly opts: WaitlistOptions
  /** Tickets issued by this task, so the operator view can list them through the port. */
  private readonly issued = new Set<string>()
  /** Credentials in the pool. The session service binds it; one is the Tier-1 default. */
  private slots = 1

  constructor(leases: LeaseStore, clock: Clock, opts: WaitlistOptions) {
    this.leases = leases
    this.clock = clock
    this.opts = opts
  }

  bindSlots(count: number): void {
    this.slots = Math.max(1, count)
  }

  private isClaimable(entry: WaitlistEntry): boolean {
    return (
      entry.claimableUntil !== null &&
      new Date(entry.claimableUntil).getTime() > this.clock.now().getTime()
    )
  }

  private async freeSlots(): Promise<number> {
    const held = await this.leases.listHeld()
    return Math.max(0, this.slots - held.length)
  }

  async estimate(position: number): Promise<number> {
    const held = await this.leases.listHeld()
    const now = this.clock.now().getTime()
    const remaining = held
      .map((l) => Math.max(0, Math.round((new Date(l.expiresAt).getTime() - now) / 1000) - 45))
      .sort((a, b) => a - b)[0]
    const first = remaining ?? this.opts.capSeconds
    return first + Math.max(0, position - 1) * this.opts.capSeconds
  }

  /** Idempotent per session: a re-ask returns the ticket already held and its current position. */
  async join(sessionId: string): Promise<WaitlistTicket> {
    const entry = await this.leases.enqueue(sessionId)
    this.issued.add(entry.ticket)
    const position = (await this.leases.position(entry.ticket)) ?? 1
    return { ticket: entry.ticket, position, estimatedWaitSeconds: await this.estimate(position) }
  }

  async status(session: Session, ticket: string): Promise<WaitlistStatus> {
    // A poll moves the line along: a lapsed hold passes the slot on even if nobody asked for it.
    await this.promote()
    const entry = await this.leases.get(ticket)
    if (!entry) throw new NotFound('No such waitlist ticket.')
    if (entry.sessionId !== session.id) throw new Forbidden()

    const position = await this.leases.position(ticket)
    const claimable = position !== null && this.isClaimable(entry)
    // Still queued but the hold lapsed: expired from the customer's point of view, since the
    // next promote() passes the slot on and no request with this ticket can win it.
    const lapsed = position === null || (entry.claimableUntil !== null && !this.isClaimable(entry))
    return {
      ticket,
      state: lapsed ? 'expired' : claimable ? 'claimable' : 'waiting',
      position: lapsed ? 0 : position,
      estimatedWaitSeconds: lapsed || claimable ? 0 : await this.estimate(position),
      claimable,
      holdUntil: claimable ? entry.claimableUntil : null,
    }
  }

  async leave(session: Session, ticket: string): Promise<void> {
    const entry = await this.leases.get(ticket)
    if (!entry) return
    if (entry.sessionId !== session.id) throw new Forbidden()
    await this.leases.dequeue(ticket)
    this.issued.delete(ticket)
  }

  /**
   * Expire a head whose hold lapsed, then — only when a slot is free — make the new head
   * claimable for the hold window. Called on every release and before every claim.
   */
  async promote(): Promise<void> {
    const free = await this.freeSlots()
    for (;;) {
      const head = await this.leases.peek()
      if (!head) return
      if (head.claimableUntil !== null && !this.isClaimable(head)) {
        await this.leases.expire(head.ticket)
        this.issued.delete(head.ticket)
        continue
      }
      if (head.claimableUntil === null && free > 0) {
        const holdUntil = new Date(
          this.clock.now().getTime() + this.opts.holdSeconds * 1000,
        ).toISOString()
        await this.leases.markClaimable(head.ticket, holdUntil)
      }
      return
    }
  }

  /**
   * May this session try for the slot now? Yes when the queue is empty or this session is at
   * its head; otherwise the caller waits. The head keeps its place until `granted()` — a try
   * that finds every credential held costs it nothing.
   */
  async claim(sessionId: string, ticket?: string): Promise<'go' | 'wait'> {
    await this.promote()
    const head = await this.leases.peek()
    if (!head) return 'go'
    if (head.sessionId === sessionId && (ticket === undefined || ticket === head.ticket)) {
      return 'go'
    }
    return 'wait'
  }

  /** The head of the line took the slot; its ticket is spent. */
  async granted(sessionId: string): Promise<void> {
    const head = await this.leases.peek()
    if (head?.sessionId !== sessionId) return
    await this.leases.dequeue(head.ticket)
    this.issued.delete(head.ticket)
  }

  async length(): Promise<number> {
    return this.leases.queueLength()
  }

  async list(): Promise<
    {
      ticket: string
      sessionId: string
      position: number
      claimable: boolean
      holdUntil: string | null
    }[]
  > {
    const out = []
    for (const ticket of this.issued) {
      const entry = await this.leases.get(ticket)
      const position = entry ? await this.leases.position(ticket) : null
      if (!entry || position === null) {
        this.issued.delete(ticket)
        continue
      }
      out.push({
        ticket,
        sessionId: entry.sessionId,
        position,
        claimable: this.isClaimable(entry),
        holdUntil: this.isClaimable(entry) ? entry.claimableUntil : null,
      })
    }
    return out.sort((a, b) => a.position - b.position)
  }
}
