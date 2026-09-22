/**
 * Anam — the other realtime avatar provider's HTTP surface.
 *
 * Anam is shaped nothing like Runway even though it does the same job, and the difference is
 * worth stating once here so the provider above can stay short:
 *
 *   Runway                                   Anam
 *   create → poll READY → consume → LiveKit  one POST, one JWT, its own WebRTC signalling
 *   a room our RPC host joins as a hidden    a webhook it calls from its own servers
 *     participant to answer tools
 *   DELETE the session                       POST /stop, but only once it has an id
 *   session id known at creation             session id only exists once a client connects
 *
 * That last line is the one that shapes this file. `POST /v1/auth/session-token` mints a token
 * against a *stored config*, not a session; the session is born when the browser connects. So
 * every call here is keyed by the `clientLabel` we set at mint time — our own call id — and the
 * Anam session id is looked up from it, once, and remembered.
 *
 * And a warning that cost a spike to learn: **`/v1/auth/session-token` validates nothing.** A
 * bogus avatarId, a tool with a made-up type and a webhook tool with no url were all accepted
 * with a 200. A minted token is not evidence of anything. `describeAvatar` is the only honest
 * credential probe, and it is unbilled.
 *
 * Verified end to end on 20 September 2026 — see `docs/engineering/anam.md` and
 * `docs/engineering/evidence/anam-call-check.mjs`.
 */
import type { ToolDefinition } from '@dhan/contracts'
import { CircuitBreaker } from '../../infra/circuit.ts'
import { withTimeout } from '../../infra/timeout.ts'
import type { AvatarCredential } from '../../ports/index.ts'

const CALL_TIMEOUT_MS = 8_000

export class AnamError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(message: string, opts: { status?: number; body?: unknown } = {}) {
    super(message)
    this.name = 'AnamError'
    this.status = opts.status ?? 500
    this.body = opts.body
  }
}

/** One inline tool as `personaConfig.tools` declares it. */
export type AnamTool =
  | {
      type: 'server'
      subtype: 'webhook'
      name: string
      description: string
      url: string
      method: 'POST'
      headers: Record<string, string>
      parameters: Record<string, unknown>
      awaitResponse: true
    }
  | {
      type: 'client'
      name: string
      description: string
      parameters: Record<string, unknown>
      awaitResult: true
      toolTimeoutSeconds: number
    }

export interface AnamSessionOptions {
  /** The server-built brief, as Anam's single prompt field. */
  systemPrompt: string
  /** What Uday opens with. Runway called this the start script. */
  initialMessage: string
  tools: AnamTool[]
  maxSeconds: number
  /** Ours, not Anam's: the handle every later lookup goes through. */
  clientLabel: string
}

export interface AnamTranscriptTurn {
  role: string
  message: string
  timestamp?: string
  speakingDurationSeconds?: number | null
  wasInterrupted?: boolean
}

export interface AnamConcurrency {
  limit: number
  active: number
  canStartSession: boolean
  estimatedWaitSeconds: number
}

export interface AnamTransportOptions {
  baseUrl: string
  /**
   * The avatar's voice and brain, for a credential that does not name its own. A cloned voice
   * belongs to the account that cloned it, so a second Anam account carries `voiceId` on its
   * credential and this is only the fallback.
   */
  voiceId: string
  llmId: string
  /**
   * What the speech recogniser expects to hear, ISO 639-1. Unset uses the org default (`en`).
   * Anam has no auto-detect: the code is fixed per session, which is why the persona prompt, not
   * this, is what makes the reply follow the customer's language.
   */
  languageCode?: string
  /**
   * The shape of the video track, which the client cannot fix afterwards.
   *
   * Anam's default is landscape — 1152×768 measured — and the app plays it full-bleed on a
   * phone. Cropping 3:2 into 2:3 with `cover` throws away most of the frame and leaves a face
   * zoomed to the eyebrows. Asking for a portrait track instead is the only fix that does not
   * either letterbox the call or crop it. But the choice is not free: **768×1152 is the only
   * portrait size Anam accepts.** 720×1280, 768×1536, 768×1344 and 576×1152 were each refused
   * with `POST /v1/engine/session → 400`, and the refusal lands at connect time rather than at
   * mint time, because minting validates nothing.
   */
  videoWidth: number
  videoHeight: number
  /**
   * How long one `GET /v1/sessions` page answers for, per credential. Default 4 s; tests pass 0.
   *
   * The sweep asks every couple of seconds and one page answers for every live call *on the
   * same key*, so this is what keeps a 2 s sweep from becoming thirty requests a minute
   * against a key whose org limit is one concurrent session. `ANAM_API_KEY` is a list, so the
   * cache is a map keyed by bearer rather than a single slot: with two keys in play a single
   * slot missed on every read, which is the opposite of what the TTL is for.
   */
  sessionListTtlMs?: number
  /**
   * The breaker the *customer-facing* calls run under — minting a token, describing an avatar.
   * This is the one `AnamAvatarProvider.breakerState()` reports and `availability` reads.
   */
  breaker?: CircuitBreaker
  /**
   * The breaker `GET /v1/sessions` runs under, kept separate on purpose.
   *
   * Liveness is internal housekeeping: the sweep polls it every two seconds whether or not a
   * customer is doing anything. Sharing the customer-facing breaker meant Anam degrading on
   * *that one endpoint* tripped it within a handful of sweeps and took avatar grants offline
   * while `POST /v1/auth/session-token` was perfectly healthy. A failure here must cost a
   * `unknown` liveness answer and nothing else.
   */
  listBreaker?: CircuitBreaker
  fetch?: typeof fetch
}

/**
 * What a `GET /v1/sessions` row says about the call, in the only three answers it can earn.
 *
 * `unclear` is the important one and it is not a failure mode: it is a row whose `exitStatus`
 * is a spelling nobody has seen, and the only safe reading of an unverified outcome is that it
 * is not evidence of anything.
 */
export type AnamRowState = 'ended' | 'live' | 'unclear'

/** One row of `GET /v1/sessions`, as much of it as we read. */
export interface AnamSessionRow {
  id: string
  clientLabel: string
  state: AnamRowState
  /** The raw `exitStatus`, so an unrecognised spelling can be logged rather than guessed at. */
  exitStatus: string | null
}

/**
 * `exitStatus` spellings this build will act on, normalised to lowercase letters.
 *
 * Why an allow-list rather than "any non-empty string is an outcome": the field names on a
 * list row are attested by a documentation table and nothing else — `anam-call-check.mjs` read
 * only `id` and `clientLabel`, and `docs/engineering/anam.md` describes the endpoint as PAST
 * sessions, so a *live* row's shape is unobserved. Reading an unknown string as an outcome
 * costs a live customer their call: `gone` sustained for the grace tears the session down
 * mid-sentence. Reading it as `unclear` costs nothing — the beacon and the reaper are exactly
 * where we were before. So the deny-list below exists for the spellings a live row plausibly
 * carries, and anything matching neither set is logged and ignored, which is how the real
 * spelling gets learnt from the first billed call instead of guessed at now.
 */
const ENDED_STATUSES = new Set([
  'ended',
  'complete',
  'completed',
  'finished',
  'closed',
  'stopped',
  'terminated',
  'disconnected',
  'clientdisconnected',
  'userended',
  'sessionended',
  'hangup',
  'cancelled',
  'canceled',
  'expired',
  'timeout',
  'timedout',
  'idletimeout',
  'maxduration',
  'maxsessionlength',
  'error',
  'failed',
  'failure',
  'normal',
])

/** Spellings that mean the call is still running. Never an outcome, whatever else is present. */
const LIVE_STATUSES = new Set([
  'inprogress',
  'active',
  'running',
  'live',
  'started',
  'starting',
  'connecting',
  'connected',
  'pending',
  'queued',
  'ready',
])

/**
 * Classify one row.
 *
 * A listed row that reports no outcome at all reads as still running — that is what a list of
 * sessions saying nothing is over means, and it is the direction that costs nothing. What it
 * must NOT do is read as an outcome, and `sessionLengthMs` is deliberately absent from this
 * function for exactly that reason: nothing observed says it is the final length rather than
 * elapsed-so-far, and if it is the latter then treating it as an outcome hangs up on every
 * live Anam call about seventeen seconds in.
 */
function classify(exitStatus: string | null): AnamRowState {
  if (exitStatus === null) return 'live'
  const key = exitStatus.toLowerCase().replace(/[^a-z]/g, '')
  if (LIVE_STATUSES.has(key)) return 'live'
  if (ENDED_STATUSES.has(key)) return 'ended'
  return 'unclear'
}

type Json = Record<string, unknown>

export class AnamTransport {
  readonly breaker: CircuitBreaker
  /** See `AnamTransportOptions.listBreaker`. Never read by `availability`. */
  readonly listBreaker: CircuitBreaker
  private readonly baseUrl: string
  private readonly voiceId: string
  private readonly llmId: string
  private readonly languageCode: string | undefined
  private readonly videoWidth: number
  private readonly videoHeight: number
  private readonly fetchImpl: typeof fetch
  private readonly sessionListTtlMs: number
  /** clientLabel → Anam session id, once the client has connected and made one exist. */
  private readonly sessionIds = new Map<string, string>()
  /**
   * bearer → the last page read on that key, held for `sessionListTtlMs`. `Date.now()` because
   * there is no Clock here. A map rather than one slot: see `sessionListTtlMs` above.
   */
  private readonly sessionPages = new Map<string, { at: number; rows: AnamSessionRow[] }>()

  constructor(options: AnamTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.voiceId = options.voiceId
    this.llmId = options.llmId
    this.languageCode = options.languageCode
    this.videoWidth = options.videoWidth
    this.videoHeight = options.videoHeight
    this.sessionListTtlMs = options.sessionListTtlMs ?? 4_000
    this.breaker = options.breaker ?? new CircuitBreaker()
    this.listBreaker = options.listBreaker ?? new CircuitBreaker()
    this.fetchImpl = options.fetch ?? fetch
  }

  private async call(
    path: string,
    opts: {
      method?: string
      body?: unknown
      bearer: string
      timeoutMs?: number
      probe?: boolean
      /** Which breaker this call answers to. Defaults to the customer-facing one. */
      breaker?: CircuitBreaker
    },
  ): Promise<Json | null> {
    const method = opts.method ?? 'GET'
    const sendsBody = method !== 'GET' && method !== 'DELETE'
    const headers: Record<string, string> = { Authorization: `Bearer ${opts.bearer}` }
    if (sendsBody) headers['Content-Type'] = 'application/json'

    // A refusal (4xx) is carried out of the breaker as a value, so it counts as the line working.
    const outcome = await (opts.breaker ?? this.breaker).exec(
      () =>
        withTimeout(
          async (signal) => {
            const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
              method,
              headers,
              signal,
              ...(sendsBody ? { body: JSON.stringify(opts.body ?? {}) } : {}),
            })
            if (res.status === 204) return { ok: true as const, json: null }
            const text = await res.text()
            let json: Json | null
            try {
              json = text ? (JSON.parse(text) as Json) : null
            } catch {
              json = null
            }
            if (res.ok) return { ok: true as const, json }

            const error = new AnamError(
              (json?.['error'] as string) ?? `Anam ${method} ${path} failed`,
              { status: res.status, body: json ?? text.slice(0, 300) },
            )
            if (res.status >= 500) throw error
            return { ok: false as const, error }
          },
          opts.timeoutMs ?? CALL_TIMEOUT_MS,
          `Anam ${method} ${path}`,
        ),
      { probe: opts.probe ?? false },
    )

    if (!outcome.ok) throw outcome.error
    return outcome.json
  }

  /** Cheap, unbilled, and — unlike minting a token — an honest answer to "does this key work?". */
  describeAvatar(cred: AvatarCredential): Promise<Json | null> {
    return this.call(`/v1/avatars/${cred.characterId}`, { bearer: cred.key, probe: true })
  }

  /**
   * What Runway made us guess. `limit` is the org's concurrent-session ceiling and `active` is
   * how many are running, so a queue estimate is a fact here rather than an inference.
   */
  async concurrency(cred: AvatarCredential): Promise<AnamConcurrency | null> {
    const body = await this.call('/v1/sessions/concurrency', { bearer: cred.key, probe: true })
    if (!body) return null
    return {
      limit: Number(body['limit'] ?? 0),
      active: Number(body['active'] ?? 0),
      canStartSession: body['canStartSession'] !== false,
      estimatedWaitSeconds: Number(body['estimatedWaitSeconds'] ?? 0),
    }
  }

  /**
   * Mint the token the browser connects with. This is the whole of Runway's create-wait-consume
   * in one call — and, to say it twice because it matters, it validates nothing it is given.
   */
  async createSessionToken(cred: AvatarCredential, opts: AnamSessionOptions): Promise<string> {
    const body: Json = {
      clientLabel: opts.clientLabel,
      sessionOptions: {
        videoWidth: this.videoWidth,
        videoHeight: this.videoHeight,
        videoQuality: 'high',
      },
      personaConfig: {
        name: 'Uday',
        avatarId: cred.characterId,
        voiceId: cred.voiceId ?? this.voiceId,
        llmId: cred.llmId ?? this.llmId,
        systemPrompt: opts.systemPrompt.slice(0, 10_000),
        initialMessage: opts.initialMessage.slice(0, 2_000),
        maxSessionLengthSeconds: opts.maxSeconds,
        ...(this.languageCode ? { languageCode: this.languageCode } : {}),
        ...(opts.tools.length > 0 ? { tools: opts.tools } : {}),
      },
    }
    const minted = await this.call('/v1/auth/session-token', {
      method: 'POST',
      body,
      bearer: cred.key,
    })
    const token = minted?.['sessionToken']
    if (typeof token !== 'string' || token.length === 0) {
      throw new AnamError('Anam minted no session token', { body: minted })
    }
    return token
  }

  /**
   * The recent sessions for this key, cached for `sessionListTtlMs`.
   *
   * Live sessions are listed here, not only finished ones — `stopSession` has always resolved
   * its id this way and could not work otherwise, which is what makes the same page usable as
   * a liveness signal.
   *
   * `ended` is never inferred from absence, and — since the amendment — never from a field
   * whose meaning on a *live* row is unverified either. `classify` above says which spellings
   * of `exitStatus` this build will act on; everything else is `unclear`, which the gate turns
   * into `unknown`, which the sweep treats as "no evidence" and leaves alone. The two failure
   * directions therefore both land on today's behaviour — the beacon, then the reaper — rather
   * than on a torn-down live call.
   *
   * This runs under `listBreaker`, not the customer-facing one, and as a `probe` so that a
   * half-open list breaker is allowed to close itself again: nothing else calls this endpoint,
   * so there is no burst to protect against, and without the flag a tripped list breaker would
   * stay half-open forever.
   */
  async listSessions(cred: AvatarCredential): Promise<AnamSessionRow[] | null> {
    const cached = this.sessionPages.get(cred.key)
    if (cached && Date.now() - cached.at < this.sessionListTtlMs) return cached.rows

    const list = await this.call('/v1/sessions?limit=25', {
      bearer: cred.key,
      breaker: this.listBreaker,
      probe: true,
    })
    if (!list) return null
    const raw = Array.isArray(list['data']) ? (list['data'] as Json[]) : []
    const rows = raw.flatMap<AnamSessionRow>((row) => {
      const id = row['id']
      const clientLabel = row['clientLabel']
      if (typeof id !== 'string' || typeof clientLabel !== 'string') return []
      const status = row['exitStatus']
      const exitStatus = typeof status === 'string' && status.length > 0 ? status : null
      return [{ id, clientLabel, state: classify(exitStatus), exitStatus }]
    })
    this.sessionPages.set(cred.key, { at: Date.now(), rows })
    return rows
  }

  /**
   * The Anam session id for one of our call ids, or null if no client ever connected.
   *
   * There is no lookup endpoint, so this is a scan of the recent list for our `clientLabel`.
   * Cached once found, separately and permanently: a session id never changes, and a call that
   * ends is still listed.
   */
  async resolveSessionId(cred: AvatarCredential, clientLabel: string): Promise<string | null> {
    const cached = this.sessionIds.get(clientLabel)
    if (cached) return cached

    const rows = await this.listSessions(cred)
    const id = rows?.find((row) => row.clientLabel === clientLabel)?.id ?? null
    if (id) this.sessionIds.set(clientLabel, id)
    return id
  }

  forget(clientLabel: string): void {
    this.sessionIds.delete(clientLabel)
    for (const [bearer, page] of this.sessionPages) {
      if (page.rows.some((row) => row.clientLabel === clientLabel)) this.sessionPages.delete(bearer)
    }
  }

  /** Stop the session and the billing. A session nobody ever connected to has nothing to stop. */
  async stopSession(cred: AvatarCredential, clientLabel: string): Promise<void> {
    const id = await this.resolveSessionId(cred, clientLabel)
    if (!id) return
    try {
      await this.call(`/v1/sessions/${id}/stop`, { method: 'POST', bearer: cred.key })
    } catch (err) {
      // A session the engine already closed answers 4xx here. That is the desired state.
      if (err instanceof AnamError && err.status < 500) return
      throw err
    }
  }

  /**
   * The conversation after the fact. Speech only — Anam's transcript carries no tool calls,
   * which is why the reconciler is fed our own gate ledger rather than this.
   */
  async getTranscript(
    cred: AvatarCredential,
    clientLabel: string,
  ): Promise<AnamTranscriptTurn[] | null> {
    const id = await this.resolveSessionId(cred, clientLabel)
    if (!id) return null
    const body = await this.call(`/v1/sessions/${id}/transcript`, { bearer: cred.key })
    const messages = body?.['messages']
    if (!Array.isArray(messages) || messages.length === 0) return null
    return messages as AnamTranscriptTurn[]
  }
}

/**
 * Our tool definitions in Anam's inline shape.
 *
 * Every tool becomes a webhook back to this process, because the gate has to stay on the server:
 * the model must not be able to hear a verdict the browser made up. `url` carries the call id
 * and `headers` carry the per-call secret, since Anam signs nothing and its request body holds
 * only what the model extracted — nothing that says whose call this is.
 */
export function toAnamTools(
  defs: ToolDefinition[],
  opts: { publicBaseUrl: string; runwaySessionId: string; secret: string },
): AnamTool[] {
  const base = opts.publicBaseUrl.replace(/\/$/, '')
  return defs.map((def) => ({
    type: 'server',
    subtype: 'webhook',
    name: def.name,
    description: def.description,
    url: `${base}/api/v1/avatar/tool/${encodeURIComponent(opts.runwaySessionId)}/${encodeURIComponent(def.name)}`,
    method: 'POST',
    headers: { 'X-Avatar-Call': opts.secret },
    parameters: def.parameters,
    awaitResponse: true,
  }))
}
