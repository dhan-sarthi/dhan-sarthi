/**
 * The avatar session endpoint.
 *
 * The client never holds a Runway key — it asks for a short-lived LiveKit token and gets back a
 * URL, a JWT, and nothing else. That is the rule from CONTRIBUTING.md: a client able to reach a
 * provider directly is a client that can leak a key.
 *
 * Three things this has to get right, none of them optional:
 *
 * **Concurrency.** Runway's Tier 1 allows one live session per credential, and judges will open
 * the link at the same moment as each other. So credentials are pooled, checked out for the life
 * of a call, and a full pool answers 409 — which the client renders as "Uday is with another
 * customer" with a working typed conversation behind it, not a spinner.
 *
 * **Money.** Billing starts at session creation, not at connection, and runs until the worker
 * dies. A hard-killed browser bills until the cap. So: a hard per-day ceiling, a short
 * `maxDuration`, and a reaper that cancels anything held past its lease.
 *
 * **Teardown.** Every path that opens a session can close it, including the ones that throw.
 */
import type { FastifyInstance } from 'fastify'
import {
  cancelSession,
  consumeSession,
  createSession,
  describeCharacter,
  type RunwayError,
  waitUntilReady,
} from '../providers/runway.ts'
import type { RunwayCredential } from '../providers/runway.ts'

/* ------------------------------------------------------------------ *
 * The credential pool
 * ------------------------------------------------------------------ */

/**
 * Credentials come from the environment as parallel lists, so adding a fourth account is an env
 * change rather than a deploy:
 *
 *   RUNWAY_API_KEY=k1,k2,k3
 *   RUNWAY_CHARACTER_ID=c1,c2,c3
 *
 * A single key with a single character id is the ordinary case and needs no commas.
 */
function loadCredentials(): RunwayCredential[] {
  const keys = (process.env['RUNWAY_API_KEY'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const ids = (process.env['RUNWAY_CHARACTER_ID'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  return keys
    .map((key, i) => ({
      key,
      // One character id shared across keys is not usable — a Character belongs to the account
      // that created it — so fall back to the first only to keep a single-key setup working.
      characterId: ids[i] ?? ids[0] ?? '',
      label: `runway-${i + 1}`,
    }))
    .filter((c) => c.characterId !== '')
}

interface Lease {
  cred: RunwayCredential
  sessionId: string
  openedAt: number
  expiresAt: number
}

const CREDENTIALS = loadCredentials()

/**
 * Two caps, doing different jobs.
 *
 * The per-call cap exists only because Runway needs a number, so it is set near the ceiling the
 * API will accept (30 minutes; 3,600s is rejected). Nobody should be cut off mid-sentence — an
 * earlier 180-second limit was a guard I put in while wiring this up and it made the product feel
 * metered, which is the opposite of "your own banker".
 *
 * The cap that actually protects anything is the **daily minute budget**. Billing is $0.20 a
 * minute from session creation, so what matters is total minutes in a day, not how many calls
 * they were spread across. A public link with no budget is how you find out about this from an
 * invoice.
 */
const MAX_SECONDS = Number(process.env['RUNWAY_MAX_SESSION_SECONDS'] ?? 1800)
const DAILY_MINUTE_BUDGET = Number(process.env['RUNWAY_DAILY_MINUTE_BUDGET'] ?? 240)

/** label -> lease. A credential appears here exactly while it is busy. */
const leases = new Map<string, Lease>()
let openedToday = 0
let minutesUsedToday = 0
let dayStamp = new Date().toISOString().slice(0, 10)

function rollDay(): void {
  const today = new Date().toISOString().slice(0, 10)
  if (today !== dayStamp) {
    dayStamp = today
    openedToday = 0
    minutesUsedToday = 0
  }
}

/**
 * Charge a finished call against the day's budget.
 *
 * Actual elapsed time where we know it. A lease that had to be reaped is charged its full cap,
 * because a session nobody closed ran until Runway stopped it — assuming otherwise would let a
 * string of abandoned tabs spend the budget invisibly.
 */
function charge(lease: Lease, reaped: boolean): void {
  const seconds = reaped ? MAX_SECONDS : Math.round((Date.now() - lease.openedAt) / 1000)
  minutesUsedToday += Math.max(0.1, seconds / 60)
}

const budgetLeft = (): number => Math.max(0, DAILY_MINUTE_BUDGET - minutesUsedToday)

/** Cancel anything held past its lease. Called before every acquire, so no timer is needed. */
async function reap(log: FastifyInstance['log']): Promise<void> {
  const now = Date.now()
  for (const [label, lease] of leases) {
    if (lease.expiresAt > now) continue
    leases.delete(label)
    charge(lease, true)
    try {
      await cancelSession(lease.cred, lease.sessionId)
      log.info({ label, sessionId: lease.sessionId }, 'avatar session reaped past its lease')
    } catch (err) {
      log.error({ label, err: (err as Error).message }, 'could not reap avatar session')
    }
  }
}

function acquire(): RunwayCredential | null {
  return CREDENTIALS.find((c) => !leases.has(c.label)) ?? null
}

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

export async function avatarRoutes(app: FastifyInstance): Promise<void> {
  /** Is the avatar usable at all, and how much of it is free? Cheap and unbilled. */
  app.get('/api/avatar/status', async () => {
    rollDay()
    return {
      configured: CREDENTIALS.length > 0,
      credentials: CREDENTIALS.length,
      busy: leases.size,
      free: Math.max(0, CREDENTIALS.length - leases.size),
      // Which sessions are actually held, so a stuck lease can be seen and released rather
      // than waited out. Without this the only recovery was restarting the process.
      held: [...leases.values()].map((l) => ({
        label: l.cred.label,
        sessionId: l.sessionId,
        heldForSeconds: Math.round((Date.now() - l.openedAt) / 1000),
      })),
      openedToday,
      minutesUsedToday: Math.round(minutesUsedToday * 10) / 10,
      dailyMinuteBudget: DAILY_MINUTE_BUDGET,
      minutesLeftToday: Math.round(budgetLeft() * 10) / 10,
      maxSessionSeconds: MAX_SECONDS,
    }
  })

  /** Does the key actually work? Verifies without opening a billed session. */
  app.get('/api/avatar/check', async (_req, reply) => {
    const cred = CREDENTIALS[0]
    if (!cred) return reply.code(503).send({ error: 'No Runway credential configured.' })
    try {
      const character = (await describeCharacter(cred)) as Record<string, unknown> | null
      return { ok: true, character: character?.['name'] ?? null, credentials: CREDENTIALS.length }
    } catch (err) {
      const e = err as RunwayError
      return reply.code(502).send({ ok: false, error: e.message, status: e.status })
    }
  })

  app.post('/api/avatar/session', async (req, reply) => {
    rollDay()

    if (CREDENTIALS.length === 0) {
      // Not an error the customer caused, and the client has a designed state for it.
      return reply.code(503).send({ error: 'The voice service is not configured in this build.' })
    }

    // Two minutes is the smallest call worth starting. Below that, say so rather than granting
    // a session that dies mid-greeting.
    if (budgetLeft() < 2) {
      return reply.code(429).send({
        error: 'Uday has reached his time limit for today. He will be back tomorrow.',
        retryAfter: 'tomorrow',
      })
    }

    await reap(app.log)

    const cred = acquire()
    if (!cred) {
      return reply
        .code(409)
        .send({ error: 'Uday is with another customer right now.', cause: 'pool_busy' })
    }

    const body = (req.body ?? {}) as { personality?: string; startScript?: string }
    let sessionId: string | null = null

    // Claim the credential before the network call, so two requests landing together cannot both
    // see it free. Single-threaded event loop, so this is sufficient without a lock.
    leases.set(cred.label, {
      cred,
      sessionId: '',
      openedAt: Date.now(),
      expiresAt: Date.now() + (MAX_SECONDS + 45) * 1000,
    })

    try {
      // Never longer than the budget has left, so a call cannot overspend the day.
      const seconds = Math.min(MAX_SECONDS, Math.floor(budgetLeft() * 60))

      sessionId = await createSession(cred, {
        ...(body.personality ? { personality: body.personality } : {}),
        ...(body.startScript ? { startScript: body.startScript } : {}),
        maxDuration: seconds,
      })

      const lease = leases.get(cred.label)
      if (lease) lease.sessionId = sessionId

      const ready = await waitUntilReady(cred, sessionId)
      const grant = await consumeSession(sessionId, ready.sessionKey)

      openedToday += 1
      app.log.info(
        { label: cred.label, sessionId, openedToday, minutesLeftToday: budgetLeft() },
        'avatar session granted',
      )

      return {
        ...grant,
        sessionId,
        // The worker needs ~5 more seconds after READY before it publishes a decodable frame.
        // Told to the client so it can hold a designed waiting state rather than an empty video.
        expectVideoAfterMs: 5_000,
        expiresInSeconds: seconds,
      }
    } catch (err) {
      // Release the credential and stop the billing, whatever went wrong.
      const failed = leases.get(cred.label)
      if (failed) charge(failed, false)
      leases.delete(cred.label)
      if (sessionId) {
        try {
          await cancelSession(cred, sessionId)
        } catch {
          app.log.error({ sessionId }, 'session left open after a failed grant')
        }
      }

      const e = err as RunwayError
      app.log.error(
        { label: cred.label, err: e.message, status: e.status, code: e.code },
        'avatar session failed',
      )

      if (e.code === 'QUEUED') {
        return reply.code(409).send({
          error: 'Uday is on another call. Give it a moment and try again.',
          // Our pool had a credential free; Runway's own concurrency limit is what refused.
          // Adding keys fixes the pool, not this — the account tier does.
          cause: 'provider_concurrency',
        })
      }

      return reply
        .code(e.status === 409 ? 409 : 502)
        .send({ error: e.message, cause: 'provider_error' })
    }
  })

  /**
   * Give the credential back.
   *
   * `navigator.sendBeacon` on page hide is the realistic caller, so this must succeed without a
   * body and without a response anybody reads. A missed call is not fatal — the reaper catches it
   * — but it is the difference between the next judge waiting forty seconds and waiting none.
   */
  /**
   * Release everything.
   *
   * An operator escape hatch, not a customer-facing route: a lease whose session id never
   * reached the client cannot be ended by the client, and waiting out a thirty-minute reaper is
   * not a recovery plan.
   */
  app.post('/api/avatar/release-all', async (_req, reply) => {
    const released: string[] = []
    for (const [label, lease] of leases) {
      leases.delete(label)
      charge(lease, false)
      released.push(lease.sessionId || label)
      try {
        if (lease.sessionId) await cancelSession(lease.cred, lease.sessionId)
      } catch (err) {
        app.log.error({ label, err: (err as Error).message }, 'release-all cancel failed')
      }
    }
    app.log.warn({ released }, 'all avatar leases released')
    return reply.send({ released, free: CREDENTIALS.length })
  })

  app.post('/api/avatar/session/:sessionId/end', async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string }

    for (const [label, lease] of leases) {
      if (lease.sessionId !== sessionId) continue
      leases.delete(label)
      charge(lease, false)
      try {
        await cancelSession(lease.cred, sessionId)
        app.log.info(
          { label, sessionId, minutesLeftToday: Math.round(budgetLeft() * 10) / 10 },
          'avatar session ended by client',
        )
      } catch (err) {
        app.log.error({ sessionId, err: (err as Error).message }, 'end failed')
      }
      return reply.code(204).send()
    }

    return reply.code(204).send()
  })
}
