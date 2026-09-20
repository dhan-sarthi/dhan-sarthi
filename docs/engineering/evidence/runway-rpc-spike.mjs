/**
 * The Runway backend_rpc spike: can our process register a `backend_rpc` tool on a Characters
 * session and be the one answering it BEFORE the browser is handed its LiveKit credentials?
 *
 * Order matters and is the whole point: create (with tools) -> READY -> open the RPC handler
 * (hidden participant joins) -> only then /consume. If any step fails the session is cancelled in
 * the finally block, because billing runs from creation ($0.20/min) whether or not anyone joins.
 *
 * First run: 3 September 2026, one billed session, findings in ../runway-rpc-spike.md.
 *
 * Run from the repository root with apps/api/.env filled in and the SDK installed in apps/api:
 *   node --env-file=apps/api/.env docs/engineering/evidence/runway-rpc-spike.mjs
 * Without --env-file the script parses the same file itself (ENV_FILE overrides the path).
 * Nothing secret is ever printed: keys and tokens are reduced to a prefix and a length.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// Resolved through apps/api, the package that owns the SDK, the same way the video check
// resolves livekit-client through apps/mobile. Falls back to this file's own tree so the script
// also runs from a scratch directory with its own node_modules. The package ships a CJS build.
const { createRpcHandler } = (() => {
  for (const from of [
    new URL('../../../apps/api/package.json', import.meta.url),
    import.meta.url,
  ]) {
    try {
      return createRequire(from)('@runwayml/avatars-node-rpc')
    } catch {}
  }
  throw new Error('@runwayml/avatars-node-rpc is not installed anywhere this script can see')
})()

const ENV =
  process.env.ENV_FILE ?? fileURLToPath(new URL('../../../apps/api/.env', import.meta.url))
const parsed = (() => {
  try {
    return Object.fromEntries(
      readFileSync(ENV, 'utf8')
        .split('\n')
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    )
  } catch {
    return {}
  }
})()
const env = (k) => process.env[k] ?? parsed[k]

const BASE = env('RUNWAY_API_BASE') || 'https://api.dev.runwayml.com'
const KEY = env('RUNWAY_API_KEY')
const CHARACTER = env('RUNWAY_CHARACTER_ID')
if (!KEY || !CHARACTER) {
  console.error('RUNWAY_API_KEY and RUNWAY_CHARACTER_ID are required')
  process.exit(2)
}

const t0 = Date.now()
const ms = () => `+${String(Date.now() - t0).padStart(6)}ms`
const log = (...a) => console.log(ms(), ...a)
const sleep = (n) => new Promise((r) => setTimeout(r, n))
const redact = (v) =>
  typeof v === 'string' && v.length > 12 ? `${v.slice(0, 6)}…(${v.length} chars)` : v
const redactAll = (o) =>
  Object.fromEntries(
    Object.entries(o ?? {}).map(([k, v]) => [
      k,
      /token|key|secret|jwt/i.test(k) ? redact(v) : typeof v === 'string' ? v.slice(0, 80) : v,
    ]),
  )

const call = async (path, { method = 'GET', bearer, body } = {}) => {
  const headers = { Authorization: `Bearer ${bearer || KEY}`, 'X-Runway-Version': '2024-11-06' }
  if (method !== 'GET' && method !== 'DELETE') headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body ?? {}),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {}
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 400)}`)
  return { status: res.status, json }
}

// The SDK calls /connect_backend itself and never surfaces the response. Observe it on the way
// past so the grant shape is on record, with the token redacted like everything else.
const realFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const res = await realFetch(input, init)
  const url = typeof input === 'string' ? input : input.url
  if (url.includes('/connect_backend')) {
    const clone = res.clone()
    let shape = null
    try {
      shape = redactAll(await clone.json())
    } catch {
      shape = { raw: (await res.clone().text()).slice(0, 200) }
    }
    log(`   /connect_backend -> ${res.status}`, JSON.stringify(shape))
  }
  return res
}

// Documented shape (docs.dev.runwayml.com/openapi.json): `parameters` is an ARRAY of typed
// parameter objects, not a JSON-schema object. timeoutSeconds is bounded 1..8, default 4.
const tools = [
  {
    type: 'backend_rpc',
    name: 'check_suitability',
    description:
      "Run a named product through the bank's deterministic suitability rules before recommending, endorsing or agreeing to it. Returns verdict PASS or BLOCKED with the rule and the reason. You must call this before naming any product as suitable, including one the customer raised. You may not reach a suitability conclusion yourself.",
    timeoutSeconds: 6,
    parameters: [
      {
        type: 'string',
        name: 'product_name',
        description: 'The product under discussion, as close to the shelf name as possible.',
        required: true,
      },
      {
        type: 'number',
        name: 'monthly_amount',
        description: 'The monthly rupee amount under discussion. 0 if none has been named.',
        required: false,
      },
    ],
  },
]

let sessionId = null
let handler = null
let connectedAt = null
let readyAt = null
let disconnectedAt = null
const toolCalls = []

try {
  log('1. creating session with tools…')
  const { status: createStatus, json: created } = await call('/v1/realtime_sessions', {
    method: 'POST',
    body: {
      model: 'gwm1_avatars',
      avatar: { type: 'custom', avatarId: CHARACTER },
      maxDuration: 120,
      personality:
        'You are Uday, a wealth adviser at IDBI Bank. Speak briefly. You never judge whether a product suits a customer yourself: you call check_suitability and repeat its verdict.',
      // No browser will join, so nudge the model into the tool on its opening turn; that is the
      // only chance of observing a real call in this spike.
      startScript:
        'Before greeting anyone, call check_suitability with product_name "LIC Market Plus ULIP" and monthly_amount 5000, then say the verdict out loud in one sentence.',
      tools,
    },
  })
  sessionId = created.id
  log(`   POST /v1/realtime_sessions -> ${createStatus}`, JSON.stringify(redactAll(created)))

  log('2. polling to READY…')
  let ready = null
  let sawQueued = false
  for (let i = 0; i < 60; i += 1) {
    const { json: s } = await call(`/v1/realtime_sessions/${sessionId}`)
    if (s.queued) sawQueued = true
    if (s.status === 'READY') {
      ready = s
      break
    }
    if (s.status === 'FAILED' || s.status === 'CANCELLED') {
      throw new Error(`session ${s.status}: ${s.failure ?? ''} ${s.failureCode ?? ''}`)
    }
    if (i % 5 === 0) log(`   ${s.status}${s.queued ? ' (queued)' : ''}`)
    await sleep(700)
  }
  if (!ready) throw new Error('never reached READY')
  readyAt = Date.now()
  log(`   READY (queued seen: ${sawQueued})`, JSON.stringify(redactAll(ready)))

  log('3. opening backend RPC handler (before /consume)…')
  handler = await createRpcHandler({
    apiKey: KEY,
    sessionId,
    baseUrl: BASE,
    debug: true,
    tools: {
      check_suitability: async (args) => {
        toolCalls.push({ at: Date.now(), args })
        log('   *** TOOL CALL check_suitability', JSON.stringify(args))
        return { verdict: 'BLOCKED', rule_id: 'BUNDLED_PROTECTION', reason: 'test' }
      },
    },
    onConnected: () => {
      connectedAt = Date.now()
      log(`   onConnected fired, ${connectedAt - readyAt}ms after READY`)
    },
    onDisconnected: () => {
      disconnectedAt = Date.now()
      log('   onDisconnected fired')
    },
    onError: (err) => log('   onError', err.message),
  })
  log(`   handler open; connected=${handler.connected}`)
  if (!connectedAt) log('   !! createRpcHandler resolved without onConnected')

  log('4. consuming (only now that the gate is up)…')
  const { status: consumeStatus, json: grant } = await call(
    `/v1/realtime_sessions/${sessionId}/consume`,
    { method: 'POST', bearer: ready.sessionKey, body: {} },
  )
  log(`   POST /consume -> ${consumeStatus}`, JSON.stringify(redactAll(grant)))
  const jwt = grant?.token ?? grant?.accessToken
  if (typeof jwt === 'string' && jwt.split('.').length === 3) {
    // The payload is not secret without the signature; the room and identity it names are the
    // facts a client needs to reason about, so record them.
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'))
    log(
      '   grant JWT payload:',
      JSON.stringify({
        sub: payload.sub,
        room: payload.video?.room,
        ttlSeconds: payload.exp
          ? payload.exp - (payload.nbf ?? payload.iat ?? payload.exp)
          : undefined,
        grants: Object.keys(payload.video ?? {}),
      }),
    )
  }

  log('5. waiting up to 45s for a tool call (no browser is connected)…')
  const deadline = Date.now() + 45_000
  let lastStatus = null
  while (Date.now() < deadline && toolCalls.length === 0) {
    await sleep(1000)
    if ((Date.now() - t0) % 5000 < 1000) {
      const { json: s } = await call(`/v1/realtime_sessions/${sessionId}`)
      if (s.status !== lastStatus) {
        lastStatus = s.status
        log(`   session status now ${s.status}; rpc connected=${handler.connected}`)
      }
    }
  }
  if (toolCalls.length > 0) log(`   received ${toolCalls.length} tool call(s)`)
  else log('   no tool call within 45s (expected without a browser participant)')
} catch (err) {
  log('FAILED:', err.message)
} finally {
  if (handler) {
    try {
      await handler.close()
      log('6. rpc handler closed')
    } catch (e) {
      log('   handler close failed:', e.message)
    }
  }
  if (sessionId) {
    try {
      const { status } = await call(`/v1/realtime_sessions/${sessionId}`, { method: 'DELETE' })
      log(`7. DELETE session -> ${status} (billing stopped)`)
    } catch (e) {
      log(`!! COULD NOT CANCEL ${sessionId}: ${e.message}`)
    }
    try {
      const { json: s } = await call(`/v1/realtime_sessions/${sessionId}`)
      log('   session after cancel:', JSON.stringify(redactAll(s)))
    } catch (e) {
      log('   session GET after cancel failed:', e.message.slice(0, 160))
    }

    // runway.md left open whether the conversation populates asynchronously after a cancel.
    // Two unbilled reads, eight seconds apart, answer that for this run.
    for (const attempt of [1, 2]) {
      try {
        const { status, json: convo } = await call(`/v1/avatar_conversations/${sessionId}`)
        const turns = convo?.transcript ?? []
        log(
          `8.${attempt} GET /v1/avatar_conversations -> ${status}`,
          JSON.stringify({
            status: convo?.status,
            duration: convo?.duration,
            tools: (convo?.tools ?? []).map((t) => `${t.type ?? '?'}:${t.name ?? '?'}`),
            turns: turns.length,
            keys: Object.keys(convo ?? {}),
          }),
        )
        for (const turn of turns.slice(0, 6)) {
          log(
            `     ${turn.role}: ${String(turn.content ?? '').slice(0, 100)}`,
            turn.toolCalls ? `toolCalls=${JSON.stringify(turn.toolCalls)}` : '',
            turn.toolResults ? `toolResults=${JSON.stringify(turn.toolResults)}` : '',
          )
        }
      } catch (e) {
        log(`8.${attempt} conversation unavailable: ${e.message.slice(0, 200)}`)
      }
      if (attempt === 1) await sleep(8000)
    }
  }
  log(
    'summary:',
    JSON.stringify({
      readyAfterMs: readyAt ? readyAt - t0 : null,
      onConnectedAfterReadyMs: connectedAt && readyAt ? connectedAt - readyAt : null,
      onDisconnectedFired: disconnectedAt !== null,
      toolCalls: toolCalls.length,
    }),
  )
  // The native LiveKit binding can keep the event loop alive after disconnect.
  process.exit(0)
}
