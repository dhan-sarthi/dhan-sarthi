/**
 * Runway Characters — the realtime avatar provider.
 *
 * Runway owns the whole conversation: speech recognition, its own model, the Character's cloned
 * voice, and a photorealistic video track. What we control arrives through three narrow openings:
 *
 *   personality / startScript   what the Character knows at the start (10,000 / 2,000 chars)
 *   tools                       what it must ask us before it can answer
 *   conversations               what was said, afterwards, for memory and the audit trail
 *
 * There is **no API for pushing context into a live session**, so anything that changes mid-call
 * has to be something the model pulls. That is why the tool surface matters as much as it does.
 *
 * Verified end to end on 2 Sep 2026 — see `docs/avatar/evidence/`. Three findings from that run
 * are load-bearing here: the worker reaches READY in ~2s but takes another ~5s to publish a
 * decodable frame; `/consume` is **one shot**, so a failed WebRTC connection spends the session;
 * and billing runs from creation, which is why every path that opens one can close it.
 *
 * Ported from prototype/server/src/providers/runway.js.
 */

const BASE = process.env['RUNWAY_API_BASE'] ?? 'https://api.dev.runwayml.com'
const VERSION = '2024-11-06'
const MODEL = 'gwm1_avatars'

export interface RunwayCredential {
  key: string
  characterId: string
  /** For logs and cost attribution. Never the key itself. */
  label: string
}

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

async function call(
  path: string,
  opts: { method?: string; body?: unknown; bearer: string },
): Promise<Record<string, unknown> | null> {
  const method = opts.method ?? 'GET'
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.bearer}`,
    'X-Runway-Version': VERSION,
  }

  // Runway rejects any POST without this header, even one whose body is empty — `/consume`
  // answers 400 "Incorrect content type" rather than acting on it. Always send `{}`.
  if (method !== 'GET' && method !== 'DELETE') headers['Content-Type'] = 'application/json'

  const sendsBody = method !== 'GET' && method !== 'DELETE'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    // Spread rather than `body: undefined` — exactOptionalPropertyTypes means the key must be
    // absent, not present and undefined.
    ...(sendsBody ? { body: JSON.stringify(opts.body ?? {}) } : {}),
  })

  if (res.status === 204) return null
  const text = await res.text()
  let json: Record<string, unknown> | null = null
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null
  } catch {
    json = null
  }

  if (!res.ok) {
    // Carry Runway's own wording through. "Failed to establish LiveKit streaming connection" is
    // the difference between a five-minute fix and an afternoon.
    throw new RunwayError((json?.['error'] as string) ?? `Runway ${method} ${path} failed`, {
      status: res.status,
      ...(typeof json?.['failureCode'] === 'string' ? { code: json['failureCode'] } : {}),
      body: json ?? text.slice(0, 300),
    })
  }
  return json
}

/** Cheap, unbilled, and the honest way to answer "does this key work?". */
export function describeCharacter(cred: RunwayCredential): Promise<unknown> {
  return call(`/v1/avatars/${cred.characterId}`, { bearer: cred.key })
}

export async function createSession(
  cred: RunwayCredential,
  opts: { personality?: string; startScript?: string; maxDuration?: number },
): Promise<string> {
  const body: Record<string, unknown> = {
    model: MODEL,
    avatar: { type: 'custom', avatarId: cred.characterId },
    maxDuration: opts.maxDuration ?? 180,
  }
  if (opts.personality) body['personality'] = opts.personality.slice(0, 10_000)
  if (opts.startScript) body['startScript'] = opts.startScript.slice(0, 2_000)

  const created = await call('/v1/realtime_sessions', { method: 'POST', body, bearer: cred.key })
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
 * provisioned, and an earlier version of this function threw a 409 the moment it saw it — which
 * aborted and deleted every session about a second after creating it, and made the app report
 * "the avatar service is at capacity" permanently while the account was in fact completely idle.
 * Twelve dead sessions on the account before the cause was obvious. The original working check
 * never looked at the flag at all.
 *
 * So: only `FAILED`, `CANCELLED` and the timeout end the wait. Being queued for the whole
 * timeout window *is* contention, and the 504 says so with `wasQueued` on the body.
 */
export async function waitUntilReady(
  cred: RunwayCredential,
  sessionId: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<{ sessionKey: string }> {
  const timeoutMs = opts.timeoutMs ?? 45_000
  const deadline = Date.now() + timeoutMs
  let wasQueued = false

  while (Date.now() < deadline) {
    const s = await call(`/v1/realtime_sessions/${sessionId}`, { bearer: cred.key })
    const status = String(s?.['status'] ?? '')

    if (status === 'READY') return { sessionKey: String(s?.['sessionKey'] ?? '') }
    if (status === 'FAILED') {
      throw new RunwayError(String(s?.['failure'] ?? 'Session failed.'), { status: 502, body: s })
    }
    if (status === 'CANCELLED') {
      throw new RunwayError('Session was cancelled.', { status: 502, body: s })
    }
    if (s?.['queued'] === true) wasQueued = true

    await new Promise((r) => setTimeout(r, opts.intervalMs ?? 700))
  }

  // Queued for the entire window is real contention. Anything else is a slow provision.
  throw new RunwayError(
    wasQueued
      ? 'The avatar service is at capacity.'
      : `Session not ready within ${timeoutMs}ms.`,
    { status: wasQueued ? 409 : 504, ...(wasQueued ? { code: 'QUEUED' } : {}) },
  )
}

export interface LiveKitGrant {
  url: string
  token: string
}

/** Exchange the session key for LiveKit credentials. One shot only. */
export async function consumeSession(sessionId: string, sessionKey: string): Promise<LiveKitGrant> {
  const creds = await call(`/v1/realtime_sessions/${sessionId}/consume`, {
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
export async function cancelSession(cred: RunwayCredential, sessionId: string): Promise<boolean> {
  try {
    await call(`/v1/realtime_sessions/${sessionId}`, { method: 'DELETE', bearer: cred.key })
    return true
  } catch (err) {
    if (err instanceof RunwayError && err.status === 404) return true
    throw err
  }
}

/**
 * The conversation after the fact. The session id is the conversation id.
 *
 * From the verification run: this returned zero turns immediately after a *cancelled* session,
 * so it either populates asynchronously or needs the session to end on its own. Do not rely on
 * it for the audit trail until that is pinned down.
 */
export function getConversation(cred: RunwayCredential, conversationId: string): Promise<unknown> {
  return call(`/v1/avatar_conversations/${conversationId}`, { bearer: cred.key })
}
