/**
 * The avatar call, from tap to teardown.
 *
 * The grant runs in this order and no other: budget → reap → claim lease → brief →
 * createSession → awaitIssuable → RpcHost.open → issueGrant → persist → grant. The tool gate is
 * made answerable BEFORE the grant is ever issued, and the lifecycle state machine makes
 * issuing from any state but `gated` a thrown error. A rejected open cancels, releases and answers 502
 * `gate_unavailable`: an ungated session is never issued, and the text tier takes over.
 *
 * Three things this has to get right, none of them optional:
 *
 * **Concurrency.** Runway's Tier 1 allows one live session per credential, and judges will open
 * the link at the same moment as each other. Credentials are leased for the life of a call
 * through the LeaseStore, and a full pool answers 409 with a waitlist ticket — which the client
 * renders as "Uday is with another customer" with a working typed conversation behind it.
 *
 * **Failover.** The pool is an ordered chain of accounts across providers — Runway's first,
 * Anam's last — and a grant walks it: the first account that is free, not benched and on a line
 * that is up takes the call. If that account refuses (out of credits, busy with a session we do
 * not hold, a bad key, a provider having a bad minute) the attempt is torn down exactly as a
 * failed grant always was, the account is benched in `CredentialHealth`, and the next one is
 * tried inside the same request. The customer sees one slower "Connecting…", not an error.
 *
 * **Money.** Runway bills from the hand-over, not from creation — measured on 22 September 2026:
 * a session created, made READY and gated but never handed over cost nothing; handed over with
 * nobody joining, 2 credits; with a customer in the room, 2 more per six seconds. That is what
 * makes readying a call ahead of the tap (`prepare`) free, and it is why a hard-killed browser
 * still bills until the cap. So: a daily minute budget read from the store, a per-call cap never
 * longer than the budget or the account's balance has left, and a reaper that cancels anything
 * held past its lease.
 *
 * **Latency.** The customer's wait was 17 s from tap to first word, and 8 of those were Runway
 * creating the session, readying it and our gate joining it. `prepare` does that while the
 * customer is looking at the screen, and `start` hands the readied call over in one round trip:
 * 9 to 10 s on the same account, the rest being Runway's worker starting once the customer joins.
 *
 * **Teardown.** Every path that opens a session can close it, including the ones that throw.
 */
import { toolJsonSchemas } from '@dhan/contracts'
import type {
  AvatarAvailability,
  AvatarCallRecord,
  AvatarEndReason,
  AvatarGrant,
  AvatarPrepared,
  BreakerState,
  OperatorAvatarStatus,
  WaitlistStatus,
} from '@dhan/contracts'
import type { Logger } from '../../infra/logger.ts'
import type {
  AuditStore,
  AvatarCredential,
  AvatarProvider,
  AvatarRpcHost,
  AvatarVendor,
  Clock,
  Lease,
  LeaseStore,
  ProductShelfPort,
  Session,
} from '../../ports/index.ts'
import type { AdvisoryService, ServerView } from '../advisory.service.ts'
import { AvatarBusy, AvatarUnavailable, Forbidden, NotFound, isDomainError } from '../errors.ts'
import { type Brief, buildBrief } from './brief.builder.ts'
import {
  type CreditWatch,
  type CredentialHealth,
  affordableSeconds,
  classifyFailure,
} from './credential-health.ts'
import type { CredentialPool } from './credential-pool.ts'
import type { LeaseReaper } from './lease-reaper.ts'
import { Lifecycle } from './lifecycle.ts'
import type { LiveCall, LiveCalls } from './live-calls.ts'
import type { MinuteBudget } from './minute-budget.ts'
import { AvatarProviderError, isAvatarProviderFailure } from './provider-error.ts'
import { reconcile } from './reconciler.ts'
import { makeToolHandlers } from './tools/index.ts'
import { TranscriptService } from './transcript.service.ts'
import type { Waitlist } from './waitlist.ts'

export interface AvatarServiceDeps {
  provider: AvatarProvider
  rpc: AvatarRpcHost
  leases: LeaseStore
  audit: AuditStore
  shelf: ProductShelfPort
  advisory: AdvisoryService
  clock: Clock
  pool: CredentialPool
  /** Which accounts are benched, and the last balance read of each. */
  health: CredentialHealth
  /** Keeps those balances current, off the customer's path. */
  credits: CreditWatch
  budget: MinuteBudget
  reaper: LeaseReaper
  waitlist: Waitlist
  live: LiveCalls
  /** False under the kill switch. */
  enabled: boolean
  taskId: string
  maxSessionSeconds: number
  engineVersion: string
  log: Logger
  /** Backoff for the transcript fetch after a call. Overridable for tests. */
  transcriptDelaysMs?: readonly number[]
  /** How long a readied call stays worth handing over. Overridable for tests. */
  preparedUsableMs?: number
  /** How long a hung-up call gets to end itself before it is cancelled. */
  endGraceMs?: number
}

/** Past the cap, before the reaper cancels: room for the worker to wind down on its own. */
const LEASE_GRACE_SECONDS = 45
/**
 * How long one account gets to reach READY. It is normally one to three seconds; past twenty
 * something is wrong with that account or that provider, and with another account behind it in
 * the chain the customer is better served by moving on than by waiting out the old 45.
 */
const READY_TIMEOUT_MS = 20_000
/**
 * How long a queue that has not moved is tolerated when another account is there to try.
 * Runway raises `queued` on nearly every first poll and clears it within a second; six seconds of
 * it means this account's one slot is taken — or the platform is out of room, which the next
 * account may not be. On the last account in the chain the queue is waited out instead.
 */
const QUEUED_GIVE_UP_MS = 6_000
/** The worker needs about five seconds after READY before it publishes a decodable frame. */
const EXPECT_VIDEO_AFTER_MS = 5_000
/**
 * How long a readied call stays worth handing over, from READY.
 *
 * Measured on 22 September 2026: Runway fails a READY session nobody has joined about 21 s after
 * READY (`TALKING_AVATAR.NO_PARTICIPANT`), consumed or not. The hand-over and the browser's join
 * take about a second, so past sixteen the next start builds a fresh call rather than handing
 * over one that dies in the customer's hands.
 */
const PREPARED_USABLE_MS = 16_000
/**
 * How long a customer's hang-up gets to end the session on its own before it is cancelled.
 *
 * The client says END_CALL before it leaves, and Runway then completes the session itself — in
 * seven seconds for a short call, measured, and in more than ten for a ninety-second one — which
 * is the only ending that keeps its transcript and recording. A cancel on top of it, the old
 * behaviour, turned every call into `failed` with no turns. Billing stops when the customer
 * leaves, not when the session completes, so waiting costs nothing but the slot, which is held
 * until the session is really over. `AVATAR_END_GRACE_SECONDS` overrides it.
 */
const CLEAN_END_GRACE_MS = 20_000
/**
 * Sessions per account per day that readying ahead may not touch. Runway counts every create
 * against 50 a day, used or not, so a call screen opened often enough could spend the day's
 * sessions on calls nobody made; below this many left, only a real tap creates one.
 */
const PREPARE_DAILY_RESERVE = 15
/** How often live calls are checked for a call that ended under them. */
const DISCONNECT_SWEEP_MS = 2_000
/**
 * How long the evidence must keep saying `gone` before the call is torn down.
 *
 * Fifteen seconds rather than five, because the sweep is no longer a synchronous read of a
 * held connection: under Anam it is an HTTP round trip plus up to the transport's cache TTL of
 * staleness, and a transient disconnect Anam reports an outcome for would otherwise be enough
 * to kill a call that is reconnecting.
 */
const DISCONNECT_GRACE_MS = 15_000

const BUSY_MESSAGE = 'Uday is with another customer right now.'

/** Marks a failure of the RPC host so it maps to `gate_unavailable` whatever the SDK said. */
class GateFailure extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = 'GateFailure'
  }
}

/** A call made READY and gated, waiting for its customer's tap. */
interface Readied {
  call: LiveCall
  readyAt: string
  rpcConnectedAt: string
  /** Wall time of READY, which is when Runway starts counting down to failing an empty room. */
  readyAtMs: number
  ms: { brief: number; create: number; ready: number; gate: number }
}

interface Prepared {
  topic: string | null
  /** Set while the call is being built. Resolves to the readied call, or null if none could be. */
  pending: Promise<Readied | null> | null
  readied: Readied | null
  expiry: NodeJS.Timeout | null
}

export class AvatarSessionService {
  private readonly deps: AvatarServiceDeps
  private readonly transcripts: TranscriptService
  private readonly sweeper: NodeJS.Timeout | null
  /** First moment each live call's handle was seen disconnected, by runway session id. */
  private readonly disconnectedSince = new Map<string, number>()
  /**
   * Whether a sweep is still running. The interval fires unconditionally and the sweep now
   * blocks on network I/O under Anam — an HTTP round trip per call, up to eight seconds — so
   * without this a slow list endpoint has three sweeps in flight at once, each issuing its own
   * request against the endpoint whose rate limit the page cache exists to respect.
   */
  private sweeping = false
  private draining = false
  /**
   * Calls readied ahead of a tap, by customer session: created, READY and gated, not consumed.
   * On Runway that is free — only a consumed session is billed — so the call screen asks for one
   * while the customer is still looking at it, and the tap hands it over instead of building it.
   */
  private readonly prepared = new Map<string, Prepared>()

  constructor(deps: AvatarServiceDeps) {
    this.deps = deps
    deps.waitlist.bindSlots(deps.pool.size)
    this.transcripts = new TranscriptService({
      provider: deps.provider,
      audit: deps.audit,
      shelf: deps.shelf,
      log: deps.log,
      ...(deps.transcriptDelaysMs === undefined ? {} : { delaysMs: deps.transcriptDelaysMs }),
    })
    this.sweeper = this.configured
      ? setInterval(() => {
          if (this.sweeping) return
          this.sweeping = true
          this.sweepDisconnected()
            .catch((err: Error) => deps.log.error({ err: err.message }, 'disconnect sweep failed'))
            .finally(() => {
              this.sweeping = false
            })
        }, DISCONNECT_SWEEP_MS)
      : null
    this.sweeper?.unref()
  }

  get configured(): boolean {
    return this.deps.pool.size > 0
  }

  breakerState(): BreakerState {
    return this.deps.provider.breakerState()
  }

  rpcOpen(): number {
    return this.deps.rpc.openCount()
  }

  private assertUsable(): void {
    if (!this.configured) {
      throw new AvatarUnavailable(
        'not_configured',
        'The voice service is not configured in this build.',
      )
    }
    if (!this.deps.enabled) {
      throw new AvatarUnavailable(
        'disabled',
        'Uday is not taking calls right now. Let us continue in text.',
      )
    }
    if (this.draining) {
      throw new AvatarUnavailable(
        'provider_error',
        'The service is restarting. Try again shortly.',
        30,
      )
    }
    if (this.deps.provider.breakerState() === 'open') {
      throw new AvatarUnavailable(
        'breaker_open',
        "Uday's line is down right now. Let us continue in text.",
        30,
      )
    }
  }

  async availability(): Promise<AvatarAvailability> {
    const { provider, leases, pool, budget, waitlist, health, credits } = this.deps
    const enabled = this.deps.enabled && this.configured
    const breaker = provider.breakerState()
    // Someone is looking at the call button: a good moment to learn the balances, and never a
    // moment to make them wait for it.
    if (enabled) credits.sweepIfStale()
    const [held, minutesLeftToday, queueLength] = await Promise.all([
      leases.listHeld(),
      budget.left(),
      waitlist.length(),
    ])
    // An account holding only a readied call is free in every sense a customer cares about: its
    // own customer's tap hands it over, and anyone else's tap takes it back.
    const heldLabels = new Set(
      held
        .filter((l) => !this.prepared.has(l.sessionId) || this.deps.live.bySession(l.sessionId))
        .map((l) => l.credentialLabel),
    )
    // A benched account, or one whose provider's line is down, is not a free slot however
    // empty its lease is — offering the button on its behalf would be offering a refusal.
    const free = pool
      .list()
      .filter(
        (c) =>
          !heldLabels.has(c.label) &&
          !health.isBenched(c.label) &&
          provider.breakerState(c) !== 'open',
      ).length
    const available =
      enabled &&
      !this.draining &&
      breaker !== 'open' &&
      free > 0 &&
      minutesLeftToday >= 2 &&
      queueLength === 0

    return {
      available,
      enabled,
      minutesLeftToday: Math.round(minutesLeftToday * 10) / 10,
      queueLength,
      estimatedWaitSeconds: available || !enabled ? null : await waitlist.estimate(queueLength + 1),
      breaker,
    }
  }

  /* The grant ----------------------------------------------------------------- */

  /**
   * @param topic  The finding the customer tapped "Talk me through this" on, if any. Steers
   *               the opening line only — see `buildBrief`, where every figure still comes
   *               from the View or a tool result.
   */
  async start(session: Session, ticket?: string, topic?: string | null): Promise<AvatarGrant> {
    this.assertUsable()
    const startedAt = performance.now()
    const { budget, reaper, waitlist, live, health, log } = this.deps

    const minutesLeft = await budget.assertAvailable()
    await reaper.run()

    if (live.bySession(session.id)) {
      throw new AvatarBusy('pool_busy', 'This session already has a live call. End it first.', {
        ticket: null,
        position: null,
        estimatedWaitSeconds: null,
      })
    }

    // A call readied while the customer was looking at the screen: hand it over, and the tap
    // skips the create, the READY wait and the gate — seconds, on Runway. If it has gone stale
    // or cannot be handed over, it is torn down and the call is built from nothing as before.
    const readied = await this.takePrepared(session, topic ?? null)
    if (readied) {
      try {
        const grant = await this.handOver(session, readied, { startedAt, attempt: 0 })
        await waitlist.granted(session.id)
        return grant
      } catch (err) {
        log.warn(
          { label: readied.call.cred.label, err: err instanceof Error ? err.message : String(err) },
          'the readied call could not be handed over; building one now',
        )
      }
    }

    if ((await waitlist.claim(session.id, ticket)) === 'wait') throw await this.busy(session)

    // The brief is the same whichever account takes the call, so it is built once, and started
    // now so it overlaps the lease claim rather than queueing behind it.
    const briefing = this.briefFor(session, topic)
    briefing.catch(() => undefined)

    const tried = new Set<string>()
    /** Providers whose own line failed during this grant: none of their accounts would fare better. */
    const downVendors = new Set<AvatarVendor>()
    let lastFailure: unknown = null
    let claimedAny = false
    let preempted = false

    let lastResort = false
    for (;;) {
      const { claimed, held } = await this.acquire(session, tried, downVendors, false, lastResort)
      if (!claimed && !held && !lastResort && lastFailure === null) {
        // Every account is benched or down before anything was tried. A bench for being busy or
        // failing is a guess about the next minute, not a fact: rather than refuse outright, try
        // those once more, in order. Out of credits and refused keys stay benched.
        lastResort = true
        continue
      }
      if (!claimed) {
        // Someone only looking at the call screen holds an account for a call they have not
        // asked for. A customer who has asked comes first: take it, once, and look again.
        if (held && !preempted && (await this.preemptPrepared(session.id))) {
          preempted = true
          continue
        }
        if (lastFailure !== null) throw await this.mapFailure(session, lastFailure)
        // Nothing was even tried. Every usable account is on a call: that is a queue. Every
        // account is benched or its line is down: that is not a queue, and a ticket would be a
        // promise nobody can keep.
        if (held) throw await this.busy(session)
        throw new AvatarUnavailable(
          'provider_error',
          'Uday could not be reached just now. Let us continue in text.',
          60,
        )
      }
      const { cred } = claimed
      tried.add(cred.label)
      if (!claimedAny) {
        claimedAny = true
        await waitlist.granted(session.id)
      }

      try {
        // A queue that will not move is worth leaving only for another account. On the last one,
        // wait it out: a slow start beats "try again later".
        const elsewhere = this.hasAnother(tried, downVendors, cred)
        const ready = await this.readyOn(
          session,
          claimed,
          briefing,
          minutesLeft,
          startedAt,
          false,
          elsewhere ? QUEUED_GIVE_UP_MS : READY_TIMEOUT_MS,
        )
        return await this.handOver(session, ready, { startedAt, attempt: tried.size })
      } catch (err) {
        const verdict = classifyFailure(err, err instanceof GateFailure)
        if (!verdict) throw await this.mapFailure(session, err)
        const detail = err instanceof Error ? err.message : String(err)
        if (verdict.benchMs > 0) health.bench(cred.label, verdict.reason, verdict.benchMs, detail)
        if (verdict.scope === 'provider') downVendors.add(cred.provider)
        lastFailure = err
        log.warn(
          { label: cred.label, reason: verdict.reason, scope: verdict.scope, err: detail },
          'avatar account could not take the call; trying the next one',
        )
      }
    }
  }

  /**
   * Ready a call for this customer before they ask for one: claim an account, create, wait for
   * READY, open the gate — and stop there. Nothing is consumed, so on Runway nothing is billed
   * (measured: a READY, gated, unconsumed session cost 0 credits), and the next `start` hands it
   * over in one round trip. Runway fails an unjoined session about 21 s after READY, so a call
   * readied and not claimed is let go after `PREPARED_USABLE_MS`.
   *
   * Quiet by design: whatever stops it — the avatar off, no account free, the day's minutes
   * spent, a provider refusal — the answer is "nothing readied" and the tap builds its call from
   * nothing, as it always did. It never queues, and it never writes to the audit trail: a call
   * the customer never asked for is not a call.
   */
  async prepare(session: Session, topic?: string | null): Promise<AvatarPrepared> {
    const none: AvatarPrepared = { prepared: false, usableForSeconds: null }
    const { provider, budget, waitlist, live } = this.deps
    if (!this.configured || !this.deps.enabled || this.draining) return none
    if (provider.breakerState() === 'open' || live.bySession(session.id)) return none

    const want = topic ?? null
    const existing = this.prepared.get(session.id)
    if (existing && existing.topic === want) {
      const readied = existing.pending ? await existing.pending : existing.readied
      return readied && this.isFresh(readied) ? this.usable(readied) : none
    }
    if (existing) await this.discardPrepared(session.id)

    // A viewer never jumps a queue: with customers waiting, the free account is theirs.
    const [minutesLeft, queueLength] = await Promise.all([budget.left(), waitlist.length()])
    if (minutesLeft < 2 || queueLength > 0) return none

    const entry: Prepared = { topic: want, pending: null, readied: null, expiry: null }
    this.prepared.set(session.id, entry)
    entry.pending = this.readyAhead(session, want, minutesLeft).then((readied) => {
      entry.pending = null
      if (this.prepared.get(session.id) !== entry) {
        // Discarded while it was being built. Let it go now it exists.
        if (readied) void this.dropReadied(readied)
        return null
      }
      if (!readied) {
        this.prepared.delete(session.id)
        return null
      }
      entry.readied = readied
      const left = readied.readyAtMs + this.usableMs - Date.now()
      entry.expiry = setTimeout(() => void this.discardPrepared(session.id), Math.max(0, left))
      entry.expiry.unref()
      return readied
    })
    const readied = await entry.pending
    return readied ? this.usable(readied) : none
  }

  private get usableMs(): number {
    return this.deps.preparedUsableMs ?? PREPARED_USABLE_MS
  }

  private isFresh(readied: Readied): boolean {
    return Date.now() - readied.readyAtMs < this.usableMs
  }

  private usable(readied: Readied): AvatarPrepared {
    const left = readied.readyAtMs + this.usableMs - Date.now()
    return { prepared: true, usableForSeconds: Math.max(0, Math.floor(left / 1000)) }
  }

  /** The chain, as `start` walks it, stopping at `gated`. Null when no account could be readied. */
  private async readyAhead(
    session: Session,
    topic: string | null,
    minutesLeft: number,
  ): Promise<Readied | null> {
    const { health, log } = this.deps
    const startedAt = performance.now()
    const briefing = this.briefFor(session, topic)
    briefing.catch(() => undefined)
    const tried = new Set<string>()
    const downVendors = new Set<AvatarVendor>()
    for (;;) {
      const { claimed } = await this.acquire(session, tried, downVendors, true)
      if (!claimed) return null
      tried.add(claimed.cred.label)
      try {
        // Nobody is waiting on this one, so a queue is simply waited out.
        const readied = await this.readyOn(
          session,
          claimed,
          briefing,
          minutesLeft,
          startedAt,
          true,
          READY_TIMEOUT_MS,
        )
        log.info(
          {
            label: claimed.cred.label,
            runwaySessionId: readied.call.runwaySessionId,
            ms: readied.ms,
          },
          'avatar call readied ahead of the tap',
        )
        return readied
      } catch (err) {
        const verdict = classifyFailure(err, err instanceof GateFailure)
        const detail = err instanceof Error ? err.message : String(err)
        log.info(
          { label: claimed.cred.label, reason: verdict?.reason ?? 'other', err: detail },
          'readying a call ahead of the tap failed',
        )
        if (!verdict) return null
        // Only a fact about the account benches it from here — no credit, a refused key. A busy
        // or failing reading is a guess, and a guess made ahead of the tap must not cost the tap.
        if (verdict.reason === 'out_of_credits' || verdict.reason === 'refused') {
          health.bench(claimed.cred.label, verdict.reason, verdict.benchMs, detail)
        }
        if (verdict.scope === 'provider') downVendors.add(claimed.cred.provider)
      }
    }
  }

  /** This session's readied call, if it is still worth handing over. Anything else is let go. */
  private async takePrepared(session: Session, topic: string | null): Promise<Readied | null> {
    const entry = this.prepared.get(session.id)
    if (!entry) return null
    // Tapped while it was still being built: wait for it — it is further along than a fresh one.
    const readied = entry.pending ? await entry.pending : entry.readied
    if (this.prepared.get(session.id) !== entry) return null
    this.prepared.delete(session.id)
    if (entry.expiry) clearTimeout(entry.expiry)
    if (!readied) return null
    if (entry.topic !== topic || !this.isFresh(readied)) {
      await this.dropReadied(readied)
      return null
    }
    return readied
  }

  /** Let a readied call go: close the gate, cancel the session, free the account. Idempotent. */
  private async discardPrepared(sessionId: string): Promise<void> {
    const entry = this.prepared.get(sessionId)
    if (!entry) return
    this.prepared.delete(sessionId)
    if (entry.expiry) clearTimeout(entry.expiry)
    // Still being built: `prepare` sees it has been discarded and lets it go when it lands.
    if (entry.readied) await this.dropReadied(entry.readied)
  }

  /** Take the account another session only readied a call on. True if one was freed. */
  private async preemptPrepared(forSessionId: string): Promise<boolean> {
    for (const [sessionId, entry] of this.prepared) {
      if (sessionId === forSessionId || !entry.readied) continue
      this.deps.log.info(
        { label: entry.readied.call.cred.label, for: forSessionId },
        'a readied call made way for a customer who asked for one',
      )
      await this.discardPrepared(sessionId)
      return true
    }
    return false
  }

  private async dropReadied(readied: Readied): Promise<void> {
    await this.abortGrant(readied.call, null, { quiet: true })
  }

  /** The View and the brief built from it. Both are needed per attempt; neither changes. */
  private async briefFor(
    session: Session,
    topic: string | null | undefined,
  ): Promise<{ view: ServerView; brief: Brief }> {
    const { advisory, audit } = this.deps
    const [view, trail] = await Promise.all([
      advisory.view(session),
      audit.listForSession(session.id),
    ])
    return { view, brief: buildBrief(view, trail.decisions, view.shelfProducts, topic) }
  }

  /**
   * A provider whose breaker has half-opened gets one unbilled probe before anything is billed
   * on it. A failed probe reads as the line still being down, which the chain then skips.
   */
  private async probeIfHalfOpen(cred: AvatarCredential): Promise<void> {
    const { provider } = this.deps
    if (provider.breakerState(cred) !== 'half-open') return
    const probe = await provider.probe(cred)
    if (!probe.ok) {
      throw new AvatarProviderError('breaker_open', `${cred.provider} is still not answering.`)
    }
  }

  /**
   * One attempt, on one account, up to the gate: probe → brief → create → ready → gate. Every
   * step runs inside the teardown, so a lease claimed for this attempt is released however it
   * fails. `quiet` is a readied-ahead call: a failure of one is nobody's failed call.
   */
  private async readyOn(
    session: Session,
    claimed: { cred: AvatarCredential; lease: Lease },
    briefing: Promise<{ view: ServerView; brief: Brief }>,
    minutesLeft: number,
    startedAt: number,
    quiet: boolean,
    /** Give up on a queue that has not moved for this long: short only with somewhere to go. */
    queuedGiveUpMs: number,
  ): Promise<Readied> {
    const { provider, rpc, audit, shelf, clock, health, maxSessionSeconds, engineVersion, log } =
      this.deps
    const { cred, lease } = claimed
    // Never longer than the day's budget, and never longer than this account can pay for: a
    // call that runs its balance dry is cut off mid-sentence by the provider, not by us.
    const affordable = affordableSeconds(cred.provider, health.credits(cred.label))

    const call: LiveCall = {
      runwaySessionId: '',
      sessionId: session.id,
      cred,
      lease,
      handle: null,
      lifecycle: new Lifecycle('claimed'),
      openedAt: clock.now(),
      maxSeconds: Math.max(
        10,
        Math.min(maxSessionSeconds, Math.floor(minutesLeft * 60), affordable ?? Infinity),
      ),
    }
    const { lifecycle } = call
    const ms = { brief: 0, create: 0, ready: 0, gate: 0 }
    let mark = performance.now()
    const lap = (): number => {
      const now = performance.now()
      const took = Math.round(now - mark)
      mark = now
      return took
    }

    try {
      await this.probeIfHalfOpen(cred)
      const { view, brief } = await briefing
      mark = performance.now()
      ms.brief = Math.round(mark - startedAt)
      lifecycle.to('creating')
      const { runwaySessionId } = await provider.createSession(cred, {
        personality: brief.personality,
        startScript: brief.startScript,
        tools: toolJsonSchemas(),
        maxSeconds: call.maxSeconds,
      })
      ms.create = lap()
      call.runwaySessionId = runwaySessionId
      await this.deps.leases.attach(cred.label, runwaySessionId)

      await provider.awaitIssuable(cred, runwaySessionId, {
        timeoutMs: READY_TIMEOUT_MS,
        queuedGiveUpMs,
      })
      ms.ready = lap()
      const readyAtMs = Date.now()
      lifecycle.to('ready')
      const readyAt = clock.now().toISOString()

      // The gate is made answerable here. Only once it is may the browser be given anything.
      const handlers = makeToolHandlers({
        view,
        shelf,
        audit,
        session,
        runwaySessionId,
        engineVersion,
        clock,
        log,
      })
      try {
        call.handle = await rpc.open(runwaySessionId, cred, handlers)
      } catch (err) {
        throw new GateFailure(err)
      }
      ms.gate = lap()
      lifecycle.to('gated')
      return { call, readyAt, rpcConnectedAt: clock.now().toISOString(), readyAtMs, ms }
    } catch (err) {
      await this.abortGrant(call, err, { quiet })
      throw err
    }
  }

  /** Issue the grant on a gated call, record it, and make it live. Torn down if any step fails. */
  private async handOver(
    session: Session,
    readied: Readied,
    timing: { startedAt: number; attempt: number },
  ): Promise<AvatarGrant> {
    const { provider, audit, clock, live, taskId, log } = this.deps
    const { call } = readied
    const { cred, lifecycle } = call
    const began = performance.now()
    try {
      lifecycle.assertConsumable()
      const grant = await provider.issueGrant(cred, call.runwaySessionId)
      lifecycle.to('granted')
      const grantedAt = clock.now().toISOString()
      // The call opens at the tap, not when it was readied: the minutes charged are the call's.
      call.openedAt = clock.now()

      await audit.appendAvatarSession({
        runwaySessionId: call.runwaySessionId,
        sessionId: session.id,
        credentialLabel: cred.label,
        taskId,
        openedAt: call.openedAt.toISOString(),
        readyAt: readied.readyAt,
        rpcConnectedAt: readied.rpcConnectedAt,
        grantedAt,
      })
      live.set(call)

      log.info(
        {
          label: cred.label,
          provider: cred.provider,
          // 0: a call readied ahead of the tap; 1 and up: built now, on the nth account tried.
          attempt: timing.attempt,
          runwaySessionId: call.runwaySessionId,
          maxSeconds: call.maxSeconds,
          ms: {
            ...(timing.attempt === 0 ? {} : readied.ms),
            grant: Math.round(performance.now() - began),
            total: Math.round(performance.now() - timing.startedAt),
          },
        },
        'avatar session granted',
      )
      return {
        // The one provider fact the client is told, and the only reason it needs one: the two
        // providers speak different wire protocols. Everything else here is provider-agnostic.
        transport: grant.transport,
        url: grant.url,
        token: grant.token,
        runwaySessionId: call.runwaySessionId,
        expectVideoAfterMs: EXPECT_VIDEO_AFTER_MS,
        expiresInSeconds: call.maxSeconds,
      }
    } catch (err) {
      await this.abortGrant(call, err)
      throw err
    }
  }

  /**
   * The first account, in chain order, that has not been tried in this grant, is not benched,
   * is on a provider whose line is up, and whose lease this session can take. `held` says
   * whether any account was passed over only because somebody else is on it — the difference
   * between "wait your turn" and "there is no turn to wait for".
   */
  private async acquire(
    session: Session,
    tried: ReadonlySet<string>,
    downVendors: ReadonlySet<AvatarVendor>,
    ahead = false,
    /** Also consider accounts benched for a transient reason: busy, failing. */
    lastResort = false,
  ): Promise<{ claimed: { cred: AvatarCredential; lease: Lease } | null; held: boolean }> {
    const { leases, pool, clock, taskId, provider, health, maxSessionSeconds } = this.deps
    // A call readied ahead can sit for PREPARED_USABLE_MS before its tap, and its cap runs from
    // the tap, so its lease has to outlast both.
    const expiresAt = new Date(
      clock.now().getTime() +
        (maxSessionSeconds + LEASE_GRACE_SECONDS) * 1000 +
        (ahead ? this.usableMs : 0),
    ).toISOString()
    let held = false
    for (const cred of pool.list()) {
      if (tried.has(cred.label) || downVendors.has(cred.provider)) continue
      if (provider.breakerState(cred) === 'open') continue
      // Readying ahead spends one of the account's daily sessions; leave the last few for taps.
      const left = health.sessionsLeft(cred.label)
      if (ahead && left !== null && left < PREPARE_DAILY_RESERVE) continue
      if (health.isBenched(cred.label) && !(lastResort && health.isTransient(cred.label))) continue
      const lease = await leases.tryAcquire(cred.label, session.id, expiresAt, taskId)
      if (lease) return { claimed: { cred, lease }, held }
      held = true
    }
    return { claimed: null, held }
  }

  /** Whether the chain has a usable account after `current` for this grant to fall back on. */
  private hasAnother(
    tried: ReadonlySet<string>,
    downVendors: ReadonlySet<AvatarVendor>,
    current: AvatarCredential,
  ): boolean {
    const { pool, health, provider } = this.deps
    return pool
      .list()
      .some(
        (c) =>
          c.label !== current.label &&
          !tried.has(c.label) &&
          !downVendors.has(c.provider) &&
          !health.isBenched(c.label) &&
          provider.breakerState(c) !== 'open',
      )
  }

  private async busy(session: Session): Promise<AvatarBusy> {
    const ticket = await this.deps.waitlist.join(session.id)
    return new AvatarBusy('pool_busy', BUSY_MESSAGE, ticket)
  }

  /** Release the credential and stop the billing, whatever went wrong. */
  private async abortGrant(
    call: LiveCall,
    err: unknown,
    opts: { quiet?: boolean } = {},
  ): Promise<void> {
    const { provider, rpc, leases, audit, clock, waitlist, log } = this.deps
    call.lifecycle.tryTo('failed')

    if (call.handle) await rpc.close(call.handle).catch(() => {})
    if (call.runwaySessionId) {
      try {
        await provider.cancel(call.cred, call.runwaySessionId)
      } catch (cancelErr) {
        log.error(
          { runwaySessionId: call.runwaySessionId, err: (cancelErr as Error).message },
          'session left open after a failed grant',
        )
      }
    }

    if (opts.quiet) {
      // A readied call nobody claimed, or one that failed while being readied. Nothing was
      // consumed, so nothing was billed and nothing is charged; no customer asked for it, so
      // there is no call to record.
      await leases.release(call.cred.label, 0, 'failed_grant')
      await waitlist.promote()
      log.info(
        {
          label: call.cred.label,
          runwaySessionId: call.runwaySessionId || null,
          state: call.lifecycle.state,
          ...(err ? { err: err instanceof Error ? err.message : String(err) } : {}),
        },
        err
          ? 'a call being readied ahead of the tap was torn down'
          : 'a readied call went unclaimed',
      )
      return
    }

    const minutes = this.elapsedMinutes(call)
    await leases.release(call.cred.label, minutes, 'failed_grant')
    if (call.runwaySessionId) {
      await audit.appendAvatarSession({
        runwaySessionId: call.runwaySessionId,
        sessionId: call.sessionId,
        credentialLabel: call.cred.label,
        taskId: this.deps.taskId,
        openedAt: call.openedAt.toISOString(),
        readyAt: null,
        rpcConnectedAt: null,
        grantedAt: null,
      })
      await audit.markAvatarEnded(
        call.runwaySessionId,
        'failed_grant',
        minutes,
        clock.now().toISOString(),
      )
    }
    await waitlist.promote()

    log.error(
      {
        label: call.cred.label,
        runwaySessionId: call.runwaySessionId || null,
        state: call.lifecycle.state,
        err: err instanceof Error ? err.message : String(err),
        kind: isAvatarProviderFailure(err)
          ? err.kind
          : err instanceof GateFailure
            ? 'gate'
            : 'other',
      },
      'avatar session failed',
    )
  }

  private async mapFailure(session: Session, err: unknown): Promise<Error> {
    if (isDomainError(err)) return err
    if (err instanceof GateFailure) {
      return new AvatarUnavailable(
        'gate_unavailable',
        "Uday's tool gate could not join the call, so no call was issued. Let us continue in text.",
      )
    }
    if (isAvatarProviderFailure(err)) {
      switch (err.kind) {
        case 'queued': {
          // Our pool had a credential free; Runway's own concurrency limit is what refused.
          // Adding keys fixes the pool, not this — the account tier does.
          const ticket = await this.deps.waitlist.join(session.id)
          return new AvatarBusy(
            'provider_concurrency',
            'Uday is on another call. Give it a moment and try again.',
            ticket,
          )
        }
        case 'breaker_open':
          return new AvatarUnavailable(
            'breaker_open',
            "Uday's line is down right now. Let us continue in text.",
            30,
          )
        case 'not_configured':
          return new AvatarUnavailable('not_configured', err.message)
        default:
          return new AvatarUnavailable(
            'provider_error',
            'Uday could not be reached just now. Let us continue in text.',
          )
      }
    }
    return new AvatarUnavailable(
      'provider_error',
      'Uday could not be reached just now. Let us continue in text.',
    )
  }

  private elapsedMinutes(call: LiveCall): number {
    const seconds = (this.deps.clock.now().getTime() - call.openedAt.getTime()) / 1000
    return Math.max(0.1, Math.round((seconds / 60) * 10) / 10)
  }

  /* The end ------------------------------------------------------------------- */

  /**
   * Give the credential back. `navigator.sendBeacon` on page hide is the realistic caller, so
   * this succeeds without a body and is idempotent. A missed call is not fatal — the reaper
   * catches it — but it is the difference between the next reviewer waiting forty seconds and
   * waiting none.
   */
  async end(session: Session, runwaySessionId: string): Promise<void> {
    const call = this.deps.live.get(runwaySessionId)
    if (!call) {
      const record = await this.deps.audit.getAvatarSession(runwaySessionId)
      if (record && record.sessionId !== session.id) throw new Forbidden()
      return
    }
    if (call.sessionId !== session.id) throw new Forbidden()
    await this.teardown(call, 'client')
  }

  private async teardown(call: LiveCall, reason: AvatarEndReason): Promise<void> {
    const { provider, rpc, leases, audit, clock, waitlist, live, log } = this.deps
    live.take(call.runwaySessionId)
    // The sweep only revisits calls still in `live`, so an entry left here for a call that has
    // just left it is never collected. Every path out of a call goes through teardown, so this
    // is the one place that can be sure.
    this.disconnectedSince.delete(call.runwaySessionId)
    call.lifecycle.tryTo(reason === 'reaped' ? 'reaped' : 'ended')

    if (call.handle) await rpc.close(call.handle).catch(() => {})
    try {
      // A customer's hang-up has already said goodbye to the worker: give the session the
      // chance to end itself, which is what keeps its transcript. Every other ending cancels.
      await provider.cancel(
        call.cred,
        call.runwaySessionId,
        reason === 'client' ? { graceMs: this.deps.endGraceMs ?? CLEAN_END_GRACE_MS } : {},
      )
    } catch (err) {
      log.error(
        { runwaySessionId: call.runwaySessionId, err: (err as Error).message },
        'avatar cancel failed',
      )
    }

    const minutes = this.elapsedMinutes(call)
    await leases.release(call.cred.label, minutes, reason)
    await audit.markAvatarEnded(call.runwaySessionId, reason, minutes, clock.now().toISOString())
    await waitlist.promote()
    this.transcripts.schedule(call.runwaySessionId, call.cred)
    // The call just spent this account's credit; the next grant should know how much is left
    // before it picks, not after it is refused.
    void this.deps.credits.refresh(call.cred)

    log.info(
      { label: call.cred.label, runwaySessionId: call.runwaySessionId, minutes, reason },
      'avatar session ended',
    )
  }

  /**
   * A call that has ended under us: the worker died, the provider ended the session because no
   * customer joined within its window, or the customer's tab was killed. The first live call
   * through this build showed the cost of not watching for it — the browser's own request
   * timeout abandoned a grant, Runway failed the session 18 s later, and the lease stayed held
   * for the whole cap plus grace while the slot looked busy to everyone else. Worse, the reaper
   * that eventually freed it charged the full cap against the daily minute budget rather than
   * the minutes actually run. This frees the slot shortly after the call goes, charges what it
   * cost, and still fetches the transcript.
   *
   * The evidence is three-valued and each provider answers from its own. Runway reads the
   * LiveKit connection this process holds, synchronously. Anam has no pushed signal, so its
   * gate polls `GET /v1/sessions` for our `clientLabel` and reads the row's reported outcome.
   * Where neither can say — no row, an unreadable one, a transport failure — the answer is
   * `unknown`, and the grace below is what makes acting on `gone` safe: the first `gone` only
   * records a timestamp, any other reading clears it, and teardown needs `gone` sustained.
   */
  async sweepDisconnected(): Promise<void> {
    const now = this.deps.clock.now().getTime()
    for (const call of this.deps.live.all()) {
      const id = call.runwaySessionId
      if (!call.handle) {
        this.disconnectedSince.delete(id)
        continue
      }
      const state = await this.deps.rpc.liveness(call.handle)
      // `unknown` is not `gone`. With no evidence the call is dead, the beacon and the reaper
      // are the backstop; tearing down on a shrug would kill live calls.
      if (state !== 'gone') {
        this.disconnectedSince.delete(id)
        continue
      }
      const since = this.disconnectedSince.get(id) ?? now
      this.disconnectedSince.set(id, since)
      if (now - since < DISCONNECT_GRACE_MS) continue
      this.disconnectedSince.delete(id)
      this.deps.log.warn(
        { runwaySessionId: id, label: call.cred.label, state: call.lifecycle.state },
        'the call has ended under us; releasing the slot',
      )
      await this.teardown(call, 'reaped')
    }
  }

  /* After the call ------------------------------------------------------------ */

  async record(session: Session, runwaySessionId: string): Promise<AvatarCallRecord> {
    const { audit } = this.deps
    const record = await audit.getAvatarSession(runwaySessionId)
    if (!record) throw new NotFound('No such avatar session.')
    if (record.sessionId !== session.id) throw new Forbidden()

    const [calls, adviceRecords, transcript, shelf] = await Promise.all([
      audit.listToolCalls(runwaySessionId),
      audit.listAdviceForAvatarSession(runwaySessionId),
      audit.getTranscript(runwaySessionId),
      this.deps.shelf.list(),
    ])

    // Reconciled again on read, from the stored transcript and our ledger: `reconcile` is pure,
    // so this is the same answer that was written with the transcript, and it does not depend
    // on a per-row flag the append-only tool-call table cannot carry.
    const reconciliation =
      record.transcriptStatus === 'fetched' && transcript
        ? reconcile(transcript, calls, shelf)
        : null
    const verified = new Set(reconciliation?.verified ?? [])
    const toolCalls = calls.map((c) => ({
      ...c,
      verifiedInTranscript: reconciliation ? verified.has(c.id) : c.verifiedInTranscript,
    }))

    const coverage = reconciliation?.gateCoverage ?? record.gateCoverage
    const summary =
      reconciliation && coverage
        ? `Gate fired ${coverage.fired}/${coverage.expected} · ${reconciliation.verified.length}/${calls.length} tool calls verified against the provider transcript` +
          (coverage.misses.length > 0
            ? `. ${coverage.misses.join(', ')} named without a check`
            : '')
        : record.transcriptStatus === 'pending'
          ? `Transcript pending. Our own tool ledger shown (${calls.length} calls)`
          : `Transcript unavailable. Our own tool ledger shown (${calls.length} calls)`

    return {
      runwaySessionId,
      session: { ...record, gateCoverage: coverage },
      toolCalls,
      adviceRecords,
      transcriptStatus: record.transcriptStatus,
      transcript,
      reconciliation,
      summary,
    }
  }

  waitlistStatus(session: Session, ticket: string): Promise<WaitlistStatus> {
    return this.deps.waitlist.status(session, ticket)
  }

  leaveWaitlist(session: Session, ticket: string): Promise<void> {
    return this.deps.waitlist.leave(session, ticket)
  }

  /* Operator ------------------------------------------------------------------ */

  async operatorStatus(): Promise<OperatorAvatarStatus> {
    const { leases, pool, budget, waitlist, provider, rpc, taskId } = this.deps
    const held = await leases.listHeld()
    const heldLabels = new Set(held.map((l) => l.credentialLabel))
    const used = await budget.used()
    return {
      credentials: pool.list().map((c) => ({ label: c.label, held: heldLabels.has(c.label) })),
      leases: held.map((l) => ({
        credentialLabel: l.credentialLabel,
        sessionId: l.sessionId,
        runwaySessionId: l.runwaySessionId,
        taskId: l.taskId,
        claimedAt: l.claimedAt,
        expiresAt: l.expiresAt,
      })),
      waitlist: await waitlist.list(),
      minutesUsedToday: Math.round(used * 10) / 10,
      minutesLeftToday: Math.round(Math.max(0, budget.dailyMinutes - used) * 10) / 10,
      breaker: provider.breakerState(),
      rpcOpen: rpc.openCount(),
      taskId,
    }
  }

  /**
   * Release everything. An operator escape hatch and the SIGTERM drain: a lease whose session
   * id never reached the client cannot be ended by the client, and waiting out a thirty-minute
   * reaper is not a recovery plan.
   */
  async releaseAll(reason: Extract<AvatarEndReason, 'release_all' | 'deploy'>): Promise<string[]> {
    const { leases, provider, pool, live, log } = this.deps
    const released: string[] = []

    for (const sessionId of [...this.prepared.keys()]) await this.discardPrepared(sessionId)
    for (const call of live.all()) {
      await this.teardown(call, reason)
      released.push(call.runwaySessionId)
    }
    // Leases this task does not host a call for: claimed by a grant in flight, or left by a
    // previous task. Cancel what we can name and free the credential either way.
    for (const lease of await leases.listHeld()) {
      const cred = pool.byLabel(lease.credentialLabel)
      if (lease.runwaySessionId && cred) {
        await provider.cancel(cred, lease.runwaySessionId).catch((err: Error) => {
          log.error({ label: lease.credentialLabel, err: err.message }, 'release-all cancel failed')
        })
      }
      await leases.release(lease.credentialLabel, this.deps.maxSessionSeconds / 60, reason)
      released.push(lease.runwaySessionId ?? lease.credentialLabel)
    }
    await this.deps.waitlist.promote()
    log.warn({ released, reason }, 'all avatar leases released')
    return released
  }

  /** Stop granting, end live calls, drop timers. The Fastify onClose hook and SIGTERM path. */
  async shutdown(): Promise<void> {
    this.draining = true
    if (this.sweeper) clearInterval(this.sweeper)
    this.transcripts.shutdown()
    if (this.deps.live.size > 0 || (await this.deps.leases.listHeld()).length > 0) {
      await this.releaseAll('deploy')
    }
  }
}
