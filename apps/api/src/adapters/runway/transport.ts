/**
 * Runway Characters — the realtime avatar provider's HTTP surface.
 *
 * Runway owns the whole conversation: speech recognition, its own model, the Character's cloned
 * voice, and a photorealistic video track. What we control arrives through three narrow openings:
 *
 *   personality / startScript   what the Character knows at the start (10,000 / 2,000 chars)
 *   tools                       what it must ask us before it can answer
 *   conversations               what was said, afterwards, for the audit trail
 *
 * There is **no API for pushing context into a live session**, so anything that changes mid-call
 * has to be something the model pulls. That is why the tool surface matters as much as it does.
 *
 * Verified end to end on 2 and 3 September 2026 — see `docs/engineering/evidence/`. Findings
 * that are load-bearing here: the worker reaches READY in ~2s but takes another ~5s to publish
 * a decodable frame; `/consume` is **one shot**, so a failed WebRTC connection spends the
 * session; billing runs from creation, which is why every path that opens one can close it; and
 * the `tools` body takes `parameters` as a list of typed parameters, not a JSON-schema object.
 *
 * Every call carries a deadline and runs under the circuit breaker. A 4xx is Runway refusing a
 * request, not the line being down, so it does not count against the breaker.
 */
import type { ToolDefinition } from '@dhan/contracts'
import { CircuitBreaker } from '../../infra/circuit.ts'
import { withTimeout } from '../../infra/timeout.ts'
import type { AvatarCredential } from '../../ports/index.ts'

const VERSION = '2024-11-06'
const MODEL = 'gwm1_avatars'
const CALL_TIMEOUT_MS = 8_000
const POLL_TIMEOUT_MS = 3_000

export class RunwayError extends Error {
  readonly status: number
  readonly code: string | undefined
  readonly body: unknown

  constructor(message: string, opts: { status?: number; code?: string; body?: unknown } = {}) {
    super(message)
    this.name = 'RunwayError'
    this.status = opts.status ?? 500
    this.code = opts.code
    this.body = opts.body
  }
}

/** One parameter as Runway's session-create body declares it. */
export interface RunwayToolParameter {
  type: string
  name: string
  description: string
  required: boolean
}

export interface RunwayToolBody {
  type: 'backend_rpc'
  name: string
  description: string
  timeoutSeconds: number
  parameters: RunwayToolParameter[]
}

/**
 * The contracts package emits a provider-neutral definition carrying JSON Schema, which is the
 * shape the brief assumed; the spike showed Runway's documented body is a flat parameter list
 * under a `backend_rpc` discriminator. Both of those are Runway's words, so both are added here
 * and nowhere else: the contract stays a schema and only this file knows Runway's wire form.
 */
export function toRunwayToolBody(def: ToolDefinition): RunwayToolBody {
  const properties = (def.parameters['properties'] ?? {}) as Record<string, Record<string, unknown>>
  const required = new Set((def.parameters['required'] as string[] | undefined) ?? [])

  return {
    type: 'backend_rpc',
    name: def.name,
    description: def.description,
    timeoutSeconds: def.timeoutSeconds,
    parameters: Object.entries(properties).map(([name, schema]) => {
      const raw = schema['type']
      const type = Array.isArray(raw) ? String(raw[0] ?? 'string') : String(raw ?? 'string')
      return {
        type: type === 'integer' ? 'number' : type,
        name,
        description: typeof schema['description'] === 'string' ? schema['description'] : '',
        required: required.has(name),
      }
    }),
  }
}

export interface LiveKitGrant {
  url: string
  token: string
}

export interface RunwayTransportOptions {
  baseUrl: string
  breaker?: CircuitBreaker
  fetch?: typeof fetch
}

type Json = Record<string, unknown>

export class RunwayTransport {
  readonly breaker: CircuitBreaker
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(options: RunwayTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.breaker = options.breaker ?? new CircuitBreaker()
    this.fetchImpl = options.fetch ?? fetch
  }

  private async call(
    path: string,
    opts: { method?: string; body?: unknown; bearer: string; timeoutMs?: number; probe?: boolean },
  ): Promise<Json | null> {
    const method = opts.method ?? 'GET'
    const sendsBody = method !== 'GET' && method !== 'DELETE'
    const headers: Record<string, string> = {
      Authorization: `Bearer ${opts.bearer}`,
      'X-Runway-Version': VERSION,
    }
    // Runway rejects any POST without this header, even one whose body is empty — `/consume`
    // answers 400 "Incorrect content type" rather than acting on it. Always send `{}`.
    if (sendsBody) headers['Content-Type'] = 'application/json'

    // A refusal (4xx) is carried out of the breaker as a value so it counts as the line working.
    const outcome = await this.breaker.exec(
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

            // Carry Runway's own wording through. "Failed to establish LiveKit streaming
            // connection" is the difference between a five-minute fix and an afternoon.
            const error = new RunwayError(
              (json?.['error'] as string) ?? `Runway ${method} ${path} failed`,
              {
                status: res.status,
                ...(typeof json?.['failureCode'] === 'string' ? { code: json['failureCode'] } : {}),
                body: json ?? text.slice(0, 300),
              },
            )
            if (res.status >= 500) throw error
            return { ok: false as const, error }
          },
          opts.timeoutMs ?? CALL_TIMEOUT_MS,
          `Runway ${method} ${path}`,
        ),
      { probe: opts.probe ?? false },
    )

    if (!outcome.ok) throw outcome.error
    return outcome.json
  }

  /** Cheap, unbilled, and the honest way to answer "does this key work?". The breaker's probe. */
  describeCharacter(cred: AvatarCredential): Promise<Json | null> {
    return this.call(`/v1/avatars/${cred.characterId}`, { bearer: cred.key, probe: true })
  }

  async createSession(
    cred: AvatarCredential,
    opts: {
      personality?: string
      startScript?: string
      tools?: ToolDefinition[]
      maxDuration?: number
    },
  ): Promise<string> {
    const body: Json = {
      model: MODEL,
      avatar: { type: 'custom', avatarId: cred.characterId },
      maxDuration: opts.maxDuration ?? 180,
    }
    if (opts.personality) body['personality'] = opts.personality.slice(0, 10_000)
    if (opts.startScript) body['startScript'] = opts.startScript.slice(0, 2_000)
    if (opts.tools && opts.tools.length > 0) body['tools'] = opts.tools.map(toRunwayToolBody)

    const created = await this.call('/v1/realtime_sessions', {
      method: 'POST',
      body,
      bearer: cred.key,
    })
    const id = created?.['id']
    if (typeof id !== 'string') {
      throw new RunwayError('Runway returned no session id', { body: created })
    }
    return id
  }

  /**
   * Poll until the worker is up.
   *
   * **`queued` is not a failure.** Runway raises that flag transiently while a worker is being
   * provisioned, and an earlier version of this function threw a 409 the moment it saw it —
   * which aborted and deleted every session about a second after creating it, and made the app
   * report "the avatar service is at capacity" permanently while the account was in fact
   * completely idle. Twelve dead sessions on the account before the cause was obvious.
   *
   * So: only `FAILED`, `CANCELLED` and the timeout end the wait. Being queued for the whole
   * timeout window *is* contention, and the error says so with code QUEUED.
   */
  async waitUntilReady(
    cred: AvatarCredential,
    sessionId: string,
    opts: { timeoutMs?: number; intervalMs?: number } = {},
  ): Promise<{ sessionKey: string }> {
    const timeoutMs = opts.timeoutMs ?? 45_000
    const deadline = Date.now() + timeoutMs
    let wasQueued = false

    while (Date.now() < deadline) {
      const s = await this.call(`/v1/realtime_sessions/${sessionId}`, {
        bearer: cred.key,
        timeoutMs: POLL_TIMEOUT_MS,
      })
      const status = String(s?.['status'] ?? '')

      if (status === 'READY') return { sessionKey: String(s?.['sessionKey'] ?? '') }
      if (status === 'FAILED') {
        throw new RunwayError(String(s?.['failure'] ?? 'Session failed.'), {
          status: 502,
          code: 'FAILED',
          body: s,
        })
      }
      if (status === 'CANCELLED') {
        throw new RunwayError('Session was cancelled.', { status: 502, code: 'CANCELLED', body: s })
      }
      if (s?.['queued'] === true) wasQueued = true

      await new Promise((r) => setTimeout(r, opts.intervalMs ?? 700))
    }

    throw new RunwayError(
      wasQueued ? 'The avatar service is at capacity.' : `Session not ready within ${timeoutMs}ms.`,
      { status: wasQueued ? 409 : 504, code: wasQueued ? 'QUEUED' : 'NOT_READY' },
    )
  }

  /** Exchange the session key for LiveKit credentials. One shot only. */
  async consumeSession(sessionId: string, sessionKey: string): Promise<LiveKitGrant> {
    const creds = await this.call(`/v1/realtime_sessions/${sessionId}/consume`, {
      method: 'POST',
      bearer: sessionKey,
      body: {},
    })

    const url = creds?.['url'] ?? creds?.['livekitUrl'] ?? creds?.['wsUrl']
    const token = creds?.['token'] ?? creds?.['accessToken']

    if (typeof url !== 'string' || typeof token !== 'string') {
      throw new RunwayError('Runway /consume returned an unexpected shape', { body: creds })
    }
    return { url, token }
  }

  /** Stop the worker, and with it the billing. Safe on an already-dead session. */
  async cancelSession(cred: AvatarCredential, sessionId: string): Promise<boolean> {
    try {
      await this.call(`/v1/realtime_sessions/${sessionId}`, { method: 'DELETE', bearer: cred.key })
      return true
    } catch (err) {
      if (err instanceof RunwayError && err.status === 404) return true
      throw err
    }
  }

  /**
   * The conversation after the fact. The session id is the conversation id.
   *
   * From the verification run: this returned zero turns immediately after a *cancelled*
   * session, so the caller fetches with backoff and models "unavailable" as an outcome.
   */
  getConversation(cred: AvatarCredential, conversationId: string): Promise<Json | null> {
    return this.call(`/v1/avatar_conversations/${conversationId}`, { bearer: cred.key })
  }
}
