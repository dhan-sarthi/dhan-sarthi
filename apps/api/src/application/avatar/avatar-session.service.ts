/**
 * The avatar call, from tap to teardown.
 *
 * The grant runs in this order and no other: budget → reap → claim lease → brief →
 * createSession → waitUntilReady → RpcHost.open → consume → persist → grant. The RPC host joins
 * the room BEFORE `/consume` is ever called, and the lifecycle state machine makes consuming
 * from any state but `gated` a thrown error. A rejected open cancels, releases and answers 502
 * `gate_unavailable`: an ungated session is never issued, and the text tier takes over.
 *
 * Three things this has to get right, none of them optional:
 *
 * **Concurrency.** Runway's Tier 1 allows one live session per credential, and judges will open
 * the link at the same moment as each other. Credentials are leased for the life of a call
 * through the LeaseStore, and a full pool answers 409 with a waitlist ticket — which the client
 * renders as "Uday is with another customer" with a working typed conversation behind it.
 *
 * **Money.** Billing starts at session creation and runs until the worker dies. A hard-killed
 * browser bills until the cap. So: a daily minute budget read from the store, a per-call cap
 * never longer than the budget has left, and a reaper that cancels anything held past its lease.
 *
 * **Teardown.** Every path that opens a session can close it, including the ones that throw.
 */
import { toolJsonSchemas } from '@dhan/contracts'
import type {
  AvatarAvailability,
  AvatarCallRecord,
  AvatarEndReason,
  AvatarGrant,
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
  Clock,
  Lease,
  LeaseStore,
  ProductShelfPort,
  Session,
} from '../../ports/index.ts'
import type { AdvisoryService } from '../advisory.service.ts'
import { AvatarBusy, AvatarUnavailable, Forbidden, NotFound, isDomainError } from '../errors.ts'
import { buildBrief } from './brief.builder.ts'
import type { CredentialPool } from './credential-pool.ts'
import type { LeaseReaper } from './lease-reaper.ts'
import { Lifecycle } from './lifecycle.ts'
import type { LiveCall, LiveCalls } from './live-calls.ts'
import type { MinuteBudget } from './minute-budget.ts'
import { isAvatarProviderFailure } from './provider-error.ts'
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
}

/** Past the cap, before the reaper cancels: room for the worker to wind down on its own. */
const LEASE_GRACE_SECONDS = 45
const READY_TIMEOUT_MS = 45_000
/** The worker needs about five seconds after READY before it publishes a decodable frame. */
const EXPECT_VIDEO_AFTER_MS = 5_000
/** How often live calls are checked for a room that closed under them, and how long a handle must stay disconnected before the call is torn down. */
const DISCONNECT_SWEEP_MS = 2_000
const DISCONNECT_GRACE_MS = 5_000

const BUSY_MESSAGE = 'Uday is with another customer right now.'

/** Marks a failure of the RPC host so it maps to `gate_unavailable` whatever the SDK said. */
class GateFailure extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = 'GateFailure'
  }
}

export class AvatarSessionService {
  private readonly deps: AvatarServiceDeps
  private readonly transcripts: TranscriptService
  private readonly sweeper: NodeJS.Timeout | null
  /** First moment each live call's handle was seen disconnected, by runway session id. */
  private readonly disconnectedSince = new Map<string, number>()
  private draining = false

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
          this.sweepDisconnected().catch((err: Error) =>
            deps.log.error({ err: err.message }, 'disconnect sweep failed'),
          )
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
    const { provider, leases, pool, budget, waitlist } = this.deps
    const enabled = this.deps.enabled && this.configured
    const breaker = provider.breakerState()
    const [held, minutesLeftToday, queueLength] = await Promise.all([
      leases.listHeld(),
      budget.left(),
      waitlist.length(),
    ])
    const free = pool.size - held.length
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

  async start(session: Session, ticket?: string): Promise<AvatarGrant> {
    this.assertUsable()
    const {
      provider,
      rpc,
      leases,
      audit,
      shelf,
      advisory,
      clock,
      pool,
      budget,
      reaper,
      waitlist,
      live,
      taskId,
      maxSessionSeconds,
      engineVersion,
      log,
    } = this.deps

    // Half-open: one unbilled probe decides whether the line is back before anything is billed.
    if (provider.breakerState() === 'half-open') {
      const cred = pool.list()[0]
      const probe = cred ? await provider.probe(cred) : { ok: false }
      if (!probe.ok) {
        throw new AvatarUnavailable(
          'breaker_open',
          "Uday's line is down right now. Let us continue in text.",
          30,
        )
      }
    }

    const minutesLeft = await budget.assertAvailable()
    await reaper.run()

    if (live.bySession(session.id)) {
      throw new AvatarBusy('pool_busy', 'This session already has a live call. End it first.', {
        ticket: null,
        position: null,
        estimatedWaitSeconds: null,
      })
    }

    if ((await waitlist.claim(session.id, ticket)) === 'wait') throw await this.busy(session)

    const claimed = await this.acquire(session, maxSessionSeconds)
    if (!claimed) throw await this.busy(session)
    await waitlist.granted(session.id)
    const { cred, lease } = claimed

    const call: LiveCall = {
      runwaySessionId: '',
      sessionId: session.id,
      cred,
      lease,
      handle: null,
      lifecycle: new Lifecycle('claimed'),
      openedAt: clock.now(),
      // Never longer than the budget has left, so a call cannot overspend the day.
      maxSeconds: Math.max(10, Math.min(maxSessionSeconds, Math.floor(minutesLeft * 60))),
    }
    const { lifecycle } = call

    try {
      lifecycle.to('creating')
      const view = await advisory.view(session)
      const trail = await audit.listForSession(session.id)
      const brief = buildBrief(view, trail.decisions, view.shelfProducts)

      const { runwaySessionId } = await provider.createSession(cred, {
        personality: brief.personality,
        startScript: brief.startScript,
        tools: toolJsonSchemas(),
        maxSeconds: call.maxSeconds,
      })
      call.runwaySessionId = runwaySessionId
      await leases.attach(cred.label, runwaySessionId)

      const { sessionKey } = await provider.waitUntilReady(cred, runwaySessionId, {
        timeoutMs: READY_TIMEOUT_MS,
      })
      lifecycle.to('ready')
      const readyAt = clock.now().toISOString()

      // The gate joins the room here. Only once it has may the browser be given the room.
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
      lifecycle.to('gated')
      const rpcConnectedAt = clock.now().toISOString()

      lifecycle.assertConsumable()
      const grant = await provider.consume(runwaySessionId, sessionKey)
      lifecycle.to('granted')
      const grantedAt = clock.now().toISOString()

      await audit.appendAvatarSession({
        runwaySessionId,
        sessionId: session.id,
        credentialLabel: cred.label,
        taskId,
        openedAt: call.openedAt.toISOString(),
        readyAt,
        rpcConnectedAt,
        grantedAt,
      })
      live.set(call)

      log.info(
        { label: cred.label, runwaySessionId, maxSeconds: call.maxSeconds, minutesLeft },
        'avatar session granted',
      )
      return {
        url: grant.url,
        token: grant.token,
        runwaySessionId,
        expectVideoAfterMs: EXPECT_VIDEO_AFTER_MS,
        expiresInSeconds: call.maxSeconds,
      }
    } catch (err) {
      await this.abortGrant(call, err)
      throw await this.mapFailure(session, err)
    }
  }

  private async acquire(
    session: Session,
    maxSeconds: number,
  ): Promise<{ cred: AvatarCredential; lease: Lease } | null> {
    const { leases, pool, clock, taskId } = this.deps
    const expiresAt = new Date(
      clock.now().getTime() + (maxSeconds + LEASE_GRACE_SECONDS) * 1000,
    ).toISOString()
    for (const cred of pool.list()) {
      const lease = await leases.tryAcquire(cred.label, session.id, expiresAt, taskId)
      if (lease) return { cred, lease }
    }
    return null
  }

  private async busy(session: Session): Promise<AvatarBusy> {
    const ticket = await this.deps.waitlist.join(session.id)
    return new AvatarBusy('pool_busy', BUSY_MESSAGE, ticket)
  }

  /** Release the credential and stop the billing, whatever went wrong. */
  private async abortGrant(call: LiveCall, err: unknown): Promise<void> {
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
    call.lifecycle.tryTo(reason === 'reaped' ? 'reaped' : 'ended')

    if (call.handle) await rpc.close(call.handle).catch(() => {})
    try {
      await provider.cancel(call.cred, call.runwaySessionId)
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

    log.info(
      { label: call.cred.label, runwaySessionId: call.runwaySessionId, minutes, reason },
      'avatar session ended',
    )
  }

  /**
   * A room that closed under a live call leaves our handle disconnected: the worker died,
   * Runway ended the session because no customer joined within its ~20 s, or the customer's
   * tab was killed and the worker gave up. The first live call through this build showed the
   * cost of not watching for it — the browser's own request timeout abandoned a grant, Runway
   * failed the session 18 s later, and the lease stayed held for the whole cap plus grace
   * while the slot looked busy to everyone else. This frees it seconds after the room goes,
   * charges the minutes actually run rather than the cap, and still fetches the transcript.
   * A short grace period keeps a LiveKit reconnect from being mistaken for the end.
   */
  async sweepDisconnected(): Promise<void> {
    const now = this.deps.clock.now().getTime()
    for (const call of this.deps.live.all()) {
      const id = call.runwaySessionId
      if (!call.handle || call.handle.connected) {
        this.disconnectedSince.delete(id)
        continue
      }
      const since = this.disconnectedSince.get(id) ?? now
      this.disconnectedSince.set(id, since)
      if (now - since < DISCONNECT_GRACE_MS) continue
      this.disconnectedSince.delete(id)
      this.deps.log.warn(
        { runwaySessionId: id, label: call.cred.label, state: call.lifecycle.state },
        'avatar room closed under a live call; releasing the slot',
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
            ? ` — ${coverage.misses.join(', ')} named without a check`
            : '')
        : record.transcriptStatus === 'pending'
          ? `Transcript pending — our own tool ledger shown (${calls.length} calls)`
          : `Transcript unavailable — our own tool ledger shown (${calls.length} calls)`

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
