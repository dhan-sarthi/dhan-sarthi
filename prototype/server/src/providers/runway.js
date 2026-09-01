/**
 * Runway Characters — the realtime avatar provider.
 *
 * Runway Characters is genuinely live, not a render farm. `POST /v1/realtime_sessions`
 * provisions a worker (~2-4s), and once it reports READY you exchange the session key for
 * LiveKit room credentials. From then on it is plain WebRTC: the Character worker joins the
 * room as a second participant and publishes synchronised audio and video, and listens to the
 * microphone track the browser publishes.
 *
 * Runway runs the whole conversation — speech recognition, its own model, the Character's
 * voice. What we keep control of arrives through three narrow openings, and this module is
 * the transport for all three:
 *
 *   personality / startScript   what the Character knows when it starts (10,000 / 2,000 chars)
 *   tools                       what it must ask us before it can answer
 *   conversations               what was said, afterwards, for memory and audit
 *
 * There is no API for pushing new context into a live session. Anything that changes while
 * talking has to be something the model pulls, which is why the tools matter as much as they
 * do. (For the record: Runway *can* lip-sync audio it did not generate, via
 * `integration: { type: 'livekit' }` — but that needs a LiveKit server of our own for its
 * worker to dial into, and it is not the architecture we chose.)
 *
 * Sessions are billed for as long as the worker is alive (2 credits up front, then 2 credits
 * per 6 seconds — $0.20/minute at $0.01/credit), so every path that opens one must be able
 * to close it. That is what cancelSession is for.
 */

const BASE = process.env.RUNWAY_API_BASE || 'https://api.dev.runwayml.com'
const VERSION = '2024-11-06'
const MODEL = 'gwm1_avatars'

// Accept the SDK's own variable name too, so a key placed by `runway`-flavoured tooling works
// without being copied to a second name.
const apiKey = () => process.env.RUNWAY_API_KEY || process.env.RUNWAYML_API_SECRET || ''

export const configured = () => Boolean(apiKey())
export const characterId = () => process.env.RUNWAY_CHARACTER_ID || ''

export class RunwayError extends Error {
  constructor(message, { status, code, body } = {}) {
    super(message)
    this.name = 'RunwayError'
    this.status = status
    this.code = code
    this.body = body
  }
}

async function call(path, { method = 'GET', body, bearer } = {}) {
  const headers = {
    Authorization: `Bearer ${bearer || apiKey()}`,
    'X-Runway-Version': VERSION,
  }
  // Runway rejects any POST without this header, even one whose body is empty — /consume
  // answers 400 "Incorrect content type" rather than acting on it. Always send `{}`.
  if (method !== 'GET' && method !== 'DELETE') headers['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body ?? {}),
  })

  if (res.status === 204) return null
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : null } catch { json = null }

  if (!res.ok) {
    // Carry Runway's own wording through. "Failed to establish LiveKit streaming connection"
    // is the difference between a five-minute fix and an afternoon.
    throw new RunwayError(json?.error || `Runway ${method} ${path} failed`, {
      status: res.status,
      code: json?.failureCode,
      body: json ?? text.slice(0, 300),
    })
  }
  return json
}

/** GET the Character. Cheap, unbilled, and the honest way to answer "does the key work?". */
export async function describeCharacter(id = characterId()) {
  if (!id) {
    const list = await call('/v1/avatars')
    return list?.data?.[0] ?? null
  }
  return call(`/v1/avatars/${id}`)
}

/**
 * Open a session. `integration` is passed straight through, so the caller decides hosted vs
 * byo and this stays a transport.
 */
export async function createSession({
  avatarId = characterId(), personality, startScript, tools, maxDuration = 300,
} = {}) {
  if (!avatarId) throw new RunwayError('RUNWAY_CHARACTER_ID is not set.', { status: 400 })

  const body = { model: MODEL, avatar: { type: 'custom', avatarId }, maxDuration }
  if (personality) body.personality = personality
  if (startScript) body.startScript = startScript
  if (tools?.length) body.tools = tools

  const { id } = await call('/v1/realtime_sessions', { method: 'POST', body })
  return id
}

/**
 * Poll until the worker is up. `queued` means we are behind our own concurrency limit rather
 * than being provisioned — worth surfacing, because it is the symptom of a tier ceiling and
 * not of a broken request.
 */
export async function waitUntilReady(sessionId, { timeoutMs = 30000, intervalMs = 700, onProgress } = {}) {
  const deadline = Date.now() + timeoutMs
  let polls = 0
  while (Date.now() < deadline) {
    const s = await call(`/v1/realtime_sessions/${sessionId}`)
    polls += 1
    onProgress?.({ status: s.status, queued: Boolean(s.queued), polls })
    if (s.status === 'READY') return s
    if (s.status === 'FAILED') {
      throw new RunwayError(s.failure || 'Session failed.', { status: 502, code: s.failureCode, body: s })
    }
    if (s.status === 'CANCELLED') throw new RunwayError('Session was cancelled.', { status: 502, body: s })
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new RunwayError(`Session ${sessionId} not ready within ${timeoutMs}ms.`, { status: 504 })
}

/**
 * Exchange the session key for LiveKit credentials. One shot only: if the WebRTC connection
 * then fails, the session is spent and the caller needs a new one.
 */
export function consumeSession(sessionId, sessionKey) {
  return call(`/v1/realtime_sessions/${sessionId}/consume`, { method: 'POST', bearer: sessionKey, body: {} })
}

/** Stop the worker, and with it the billing. Safe to call on an already-dead session. */
export async function cancelSession(sessionId) {
  try {
    await call(`/v1/realtime_sessions/${sessionId}`, { method: 'DELETE' })
    return true
  } catch (err) {
    if (err.status === 404) return true
    throw err
  }
}

/**
 * Open the backend RPC connection for a session's `backend_rpc` tools.
 *
 * The handler joins the session's LiveKit room as a hidden participant, so tool calls arrive
 * as RPC rather than as webhooks — which means no public callback URL is needed, and the
 * conversation's tool boundary lives inside this process. One handler per session is all the
 * API allows.
 *
 * The 1-8s timeout on the far side is real latency the customer hears as a pause, so handlers
 * must be fast; slow work belongs behind a cached read, not in a tool.
 */
export async function connectBackendRpc({ sessionId, tools, log }) {
  const { createRpcHandler } = await import('@runwayml/avatars-node-rpc')
  return createRpcHandler({
    apiKey: apiKey(),
    sessionId,
    baseUrl: BASE,
    tools,
    onConnected: () => log?.info({ sessionId }, 'avatar backend rpc connected'),
    onDisconnected: () => log?.info({ sessionId }, 'avatar backend rpc disconnected'),
    onError: (err) => log?.error({ sessionId, err: err.message }, 'avatar backend rpc error'),
  })
}

/**
 * The conversation after the fact. The session id is the conversation id, and each transcript
 * entry carries `role`, `content`, `timestamp` and — on assistant turns — `toolCalls` and
 * `toolResults`. That last pair is what makes the suitability gate auditable: the verdict the
 * rules returned is on the record next to the words the customer heard.
 *
 * Recordings, when present, arrive as a `recordingUrl` that expires; fetch again for a fresh
 * one rather than storing it.
 */
export function getConversation(conversationId) {
  return call(`/v1/avatar_conversations/${conversationId}`)
}

/** Past conversations for a Character, newest first. */
export function listConversations({ limit = 25 } = {}) {
  return call(`/v1/avatar_conversations?limit=${encodeURIComponent(limit)}`)
}
