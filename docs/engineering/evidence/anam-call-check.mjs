/**
 * Does an Anam call actually work for us, and does the tool gate survive the move off Runway?
 *
 * Three questions, in the order that decides whether the migration is cheap or expensive:
 *
 *   1. Does the avatar render? Same bar as `runway-video-check.mjs`: measured pixels, not a
 *      subscribed track. A black rectangle is not a face.
 *   2. Do webhook tools declared *inline* in `personaConfig.tools` actually register? The docs
 *      only describe webhook tools pre-created in the Lab and attached by id, and
 *      `POST /v1/auth/session-token` validates nothing — it accepted a bogus avatarId, a bogus
 *      tool type and a webhook with no url, all 200. So the API cannot answer this; only a
 *      live call can. If inline webhooks fire, each call can carry its own bearer and the
 *      server-side gate survives intact. If they do not, the gate has to move to the client.
 *   3. Does our per-call secret reach us? The webhook request comes from Anam's servers with
 *      no signature, so the header we plant in the tool config is the only thing tying a tool
 *      call back to one customer's session.
 *
 * Billing is real and the org concurrency limit is 1, so the session is stopped in a finally
 * block whether or not anything worked.
 *
 * Two things this needs that the Runway check did not:
 *
 * - **A public URL.** The webhook is called from Anam's servers, not the browser, so a
 *   temporary tunnel is opened to the local echo. The echo answers one canned payload and
 *   holds no customer data.
 * - **A user turn.** `talk()` only makes the avatar speak text verbatim without involving its
 *   LLM, so it cannot provoke a tool call. `sendUserMessage()` can: it is not in the docs but
 *   it is on the client, and it puts words in the customer's mouth for the model to answer.
 *   Chrome still gets a synthesized WAV as its microphone, because a persona with no audio
 *   input behaves differently from one with a quiet customer.
 *
 * The page is served from localhost rather than set with setContent, because getUserMedia and
 * remote module imports both need a real secure origin.
 *
 * Run from the repository root, with ANAM_API_KEY in apps/api/.env:
 *   node docs/engineering/evidence/anam-call-check.mjs
 * Set ENV_FILE for a different env file, CHROMIUM_PATH for a specific binary instead of the
 * installed Google Chrome, MIC_WAV for a different question, and WEBHOOK_BASE to skip the
 * tunnel and use your own public URL.
 */
import http from 'node:http'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

/**
 * playwright-core and localtunnel are not workspace dependencies — nothing ships them, only this
 * script wants them. Install them anywhere and point EVIDENCE_DEPS at that node_modules:
 *   npm i --prefix /tmp/evidence playwright-core localtunnel
 *   EVIDENCE_DEPS=/tmp/evidence/node_modules node docs/engineering/evidence/anam-call-check.mjs
 */
const dep = async (name, entry) => {
  let mod
  try {
    mod = await import(name)
  } catch (err) {
    const dir = process.env.EVIDENCE_DEPS
    if (!dir) throw new Error(`${name} is not installed and EVIDENCE_DEPS is unset (${err.message})`)
    mod = await import(pathToFileURL(join(dir, name, entry)).href)
  }
  return mod
}
// Both of these are CommonJS, so importing them by file URL puts everything under `default`.
const playwright = await dep('playwright-core', 'index.js')
const chromium = playwright.chromium ?? playwright.default?.chromium
if (!chromium) throw new Error('playwright-core resolved but exposes no chromium')

const ENV = process.env.ENV_FILE ?? fileURLToPath(new URL('../../../apps/api/.env', import.meta.url))
const env = Object.fromEntries(
  readFileSync(ENV, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const BASE = env.ANAM_API_BASE || 'https://api.anam.ai'
const KEY = env.ANAM_API_KEY
const AVATAR = env.ANAM_AVATAR_ID
const VOICE = env.ANAM_VOICE_ID
const LLM = env.ANAM_LLM_ID
if (!KEY) throw new Error(`ANAM_API_KEY missing from ${ENV}`)

const SDK = process.env.ANAM_SDK_URL || 'https://esm.sh/@anam-ai/js-sdk@4.27.0'
const PORT = Number(process.env.WEBHOOK_PORT ?? 8787)
const QUESTION =
  'Hello Uday. Does a five thousand rupee monthly S I P suit me? Please check my suitability first.'
// Stands in for the per-call bearer the API would mint: the only thing that would tell us
// which customer's session a tool call belongs to.
const CALL_TOKEN = `spike-${Math.random().toString(36).slice(2, 10)}`
const LABEL = `dhan-anam-spike-${Date.now()}`

const call = async (path, { method = 'GET', body } = {}) => {
  const headers = { Authorization: `Bearer ${KEY}` }
  if (method !== 'GET' && method !== 'DELETE') headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body ?? {}),
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch {}
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`)
  return json
}

/**
 * A microphone that says one thing. Silence first so the greeting is not talked over, silence
 * after so the looping fake device does not re-ask over the answer.
 */
function buildMicWav() {
  if (process.env.MIC_WAV) return process.env.MIC_WAV
  const out = join(tmpdir(), 'anam-spike-mic.wav')
  if (existsSync(out)) return out
  const aiff = join(tmpdir(), 'anam-spike.aiff')
  const raw = join(tmpdir(), 'anam-spike-raw.wav')
  execFileSync('say', ['-o', aiff, QUESTION])
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', aiff, raw])

  // A minimal WAV rewrite: 7s lead-in, the question, 25s of quiet.
  const buf = readFileSync(raw)
  const dataAt = buf.indexOf(Buffer.from('data')) + 8
  const speech = buf.subarray(dataAt)
  const silence = (seconds) => Buffer.alloc(16000 * 2 * seconds)
  const pcm = Buffer.concat([silence(7), speech, silence(25)])
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(16000, 24)
  header.writeUInt32LE(32000, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  writeFileSync(out, Buffer.concat([header, pcm]))
  return out
}

/** What the gate would answer. Fixed numbers, so the transcript can be checked against them. */
const VERDICT = {
  verdict: 'suitable',
  reason: 'A surplus of thirty three thousand rupees a month covers the five thousand rupee SIP with room to spare.',
  monthlySurplusRupees: 33000,
}

const PAGE = (token) => `<!doctype html>
<meta charset="utf-8">
<body style="margin:0;background:#000">
<video id="v" autoplay playsinline style="width:100vw;height:100vh;object-fit:cover;background:#000"></video>
<script type="module">
  import { createClient, AnamEvent } from '${SDK}'
  const seen = { sessionId: null, clientTool: [], toolEvents: [], messages: [], closed: null }
  window.__seen = seen
  const note = (s) => { console.log('SDK ' + s); }
  try {
    const anam = createClient(${JSON.stringify(token)})
    window.__anam = anam
    anam.addListener(AnamEvent.SESSION_READY, (e) => {
      seen.sessionId = (e && e.sessionId) || e || null
      note('SESSION_READY ' + seen.sessionId)
    })
    anam.addListener(AnamEvent.CONNECTION_ESTABLISHED, () => note('CONNECTION_ESTABLISHED'))
    anam.addListener(AnamEvent.CONNECTION_CLOSED, (r, d) => {
      seen.closed = JSON.stringify(r) + ' ' + (d || '')
      note('CONNECTION_CLOSED ' + seen.closed)
    })
    anam.addListener(AnamEvent.VIDEO_PLAY_STARTED, () => note('VIDEO_PLAY_STARTED'))
    anam.addListener(AnamEvent.SERVER_WARNING, (m) => note('SERVER_WARNING ' + m))
    anam.addListener(AnamEvent.USER_SPEECH_STARTED, () => note('USER_SPEECH_STARTED'))
    anam.addListener(AnamEvent.USER_SPEECH_ENDED, () => note('USER_SPEECH_ENDED'))
    for (const ev of ['TOOL_CALL_STARTED', 'TOOL_CALL_COMPLETED', 'TOOL_CALL_FAILED']) {
      if (!AnamEvent[ev]) continue
      anam.addListener(AnamEvent[ev], (e) => {
        seen.toolEvents.push({ ev, e })
        note(ev + ' ' + JSON.stringify(e).slice(0, 300))
      })
    }
    anam.addListener(AnamEvent.MESSAGE_HISTORY_UPDATED, (m) => { seen.messages = m })
    anam.registerToolCallHandler('show_card', {
      onStart: async (p) => {
        seen.clientTool.push((p && p.arguments) || p)
        note('client tool show_card ' + JSON.stringify((p && p.arguments) || {}))
        return 'card shown'
      },
    })
    await anam.streamToVideoElement('v')
    note('streamToVideoElement resolved')

    // Let the greeting land, then ask. sendUserMessage is undocumented but present on the
    // client, and unlike talk() it goes to the model as the customer rather than to the mouth.
    setTimeout(() => {
      try {
        anam.sendUserMessage(${JSON.stringify(QUESTION)})
        note('sendUserMessage sent')
      } catch (err) {
        note('sendUserMessage FAILED ' + (err && err.message))
      }
    }, 9000)
  } catch (err) {
    seen.closed = 'THREW ' + (err && err.message)
    note('THREW ' + (err && err.message))
  }
</script>
`

const webhookHits = []
let server = null
let tunnel = null
let sessionId = null
let browser = null
let page = null

try {
  console.log('1. credential and avatar…')
  const avatar = await call(`/v1/avatars/${AVATAR}`)
  console.log(`   ok: ${avatar?.displayName ?? '(unnamed)'} (${String(AVATAR).slice(0, 8)}…)`)

  const capacity = await call('/v1/sessions/concurrency')
  console.log(
    `   capacity: ${capacity.active}/${capacity.limit} active, canStart=${capacity.canStartSession}, wait=${capacity.estimatedWaitSeconds}s`,
  )
  if (!capacity.canStartSession) throw new Error('org is at its concurrency limit; nothing to test')

  console.log('2. building the microphone…')
  const micWav = buildMicWav()
  console.log(`   ${micWav}`)

  console.log('3. opening the echo the webhook tool will call…')
  let pageHtml = ''
  server = http.createServer((req, res) => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(pageHtml)
      return
    }
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      let parsed = null
      try { parsed = raw ? JSON.parse(raw) : null } catch {}
      webhookHits.push({
        at: new Date().toISOString(),
        url: req.url,
        token: req.headers['x-call-token'] ?? null,
        body: parsed ?? raw.slice(0, 300),
      })
      console.log(
        `   [webhook] ${req.method} ${req.url}  x-call-token=${req.headers['x-call-token'] ?? '(absent)'}  body=${raw.slice(0, 200)}`,
      )
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(VERDICT))
    })
  })
  await new Promise((r) => server.listen(PORT, r))

  let publicBase = process.env.WEBHOOK_BASE
  if (!publicBase) {
    const lt = await dep('localtunnel', 'localtunnel.js')
    tunnel = await (lt.default ?? lt)({ port: PORT })
    publicBase = tunnel.url
  }
  const webhookUrl = `${publicBase}/api/v1/avatar/tool/check_suitability`
  console.log(`   reachable at ${webhookUrl}`)

  const reachable = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-call-token': CALL_TOKEN, 'bypass-tunnel-reminder': '1' },
    body: JSON.stringify({ selfTest: true }),
  })
  console.log(`   self-test ${reachable.status} ${(await reachable.text()).slice(0, 80)}`)
  if (!reachable.ok) throw new Error('the tunnel is not reachable; Anam will not reach it either')
  webhookHits.length = 0

  console.log('4. minting a session token…')
  const persona = {
    name: 'Uday',
    avatarId: AVATAR,
    voiceId: VOICE,
    llmId: LLM,
    maxSessionLengthSeconds: 180,
    systemPrompt: [
      'You are Uday, a careful Indian banking guide speaking to a customer called Rohan.',
      'You MUST call the check_suitability tool with productId "sip-balanced-01" before you give any verdict about a SIP.',
      'Never state a verdict the tool did not give you, and speak the tool\'s reason back in one sentence.',
      'After you have spoken the verdict, call show_card with cardId "suitability".',
      'Keep every reply under 40 words.',
    ].join(' '),
    initialMessage: 'Rohan, good to see you. What would you like to look at today?',
    tools: [
      {
        // The open question. If this fires, the gate stays on the server.
        type: 'server',
        subtype: 'webhook',
        name: 'check_suitability',
        description:
          'Check whether an investment product suits this customer. Must be called before giving any verdict.',
        url: webhookUrl,
        method: 'POST',
        headers: { 'X-Call-Token': CALL_TOKEN, 'bypass-tunnel-reminder': '1' },
        parameters: {
          type: 'object',
          properties: {
            productId: { type: 'string', description: 'The product being considered.' },
          },
          required: ['productId'],
        },
        awaitResponse: true,
      },
      {
        type: 'client',
        name: 'show_card',
        description: 'Put a card on the customer screen once the verdict has been spoken.',
        parameters: {
          type: 'object',
          properties: { cardId: { type: 'string' } },
          required: ['cardId'],
        },
        awaitResult: true,
        toolTimeoutSeconds: 5,
      },
    ],
  }
  const { sessionToken } = await call('/v1/auth/session-token', {
    method: 'POST',
    body: { clientLabel: LABEL, personaConfig: persona },
  })
  pageHtml = PAGE(sessionToken)
  console.log(`   token minted (label ${LABEL}) — which proves nothing; the endpoint validates nothing`)

  console.log('5. connecting a real browser…')
  browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chrome' }),
    args: [
      '--no-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${micWav}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  })
  const context = await browser.newContext({
    viewport: { width: 480, height: 720 },
    permissions: ['microphone'],
  })
  page = await context.newPage()
  page.on('console', (m) => { if (m.type() !== 'debug') console.log(`   [browser] ${m.text().slice(0, 240)}`) })
  page.on('pageerror', (e) => console.log(`   [browser error] ${String(e).slice(0, 240)}`))
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' })

  // Sample the actual pixels, same bar as the Runway check: a subscribed track sits black
  // through keyframe warm-up, and the first seconds of any such stream are legitimately dark.
  const samples = []
  for (let i = 0; i < 45; i += 1) {
    await new Promise((r) => setTimeout(r, 1000))
    const s = await page.evaluate(() => {
      const v = document.getElementById('v')
      if (!v || !v.videoWidth) return { t: 0, w: 0, h: 0, luma: null, unique: 0, frames: null }
      const c = document.createElement('canvas')
      c.width = 64
      c.height = 64
      const ctx = c.getContext('2d')
      ctx.drawImage(v, 0, 0, 64, 64)
      const px = ctx.getImageData(0, 0, 64, 64).data
      let sum = 0
      const seen = new Set()
      for (let j = 0; j < px.length; j += 4) {
        sum += 0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2]
        seen.add(`${px[j] >> 4},${px[j + 1] >> 4},${px[j + 2] >> 4}`)
      }
      const q = v.getVideoPlaybackQuality?.()
      return {
        t: Number(v.currentTime.toFixed(2)),
        w: v.videoWidth,
        h: v.videoHeight,
        luma: Number((sum / (px.length / 4)).toFixed(1)),
        unique: seen.size,
        frames: q?.totalVideoFrames ?? null,
        tools: (window.__seen?.toolEvents ?? []).length,
      }
    })
    samples.push(s)
    console.log(
      `   t=${String(s.t).padStart(5)}s  ${s.w}x${s.h}  luma=${String(s.luma).padStart(5)}  colours=${String(s.unique).padStart(4)}  frames=${s.frames}  toolEvents=${s.tools}  webhooks=${webhookHits.length}`,
    )
    if ((s.luma ?? 0) > 12 && s.unique > 40 && i % 10 === 0) {
      await page.screenshot({ path: `anam-frame-${i}.png` })
    }
    // Everything we came for has happened; no reason to keep burning the one slot.
    if (webhookHits.length > 0 && i > 22) break
  }

  const seen = await page.evaluate(() => {
    const s = window.__seen
    try { window.__anam?.stopStreaming?.() } catch {}
    return s
  })
  sessionId = seen.sessionId

  const best = samples.reduce((a, b) => ((b.luma ?? 0) > (a.luma ?? 0) ? b : a), samples[0])
  const lit = (best.luma ?? 0) > 12 && (best.unique ?? 0) > 40
  const tokenOk = webhookHits.length > 0 && webhookHits.every((h) => h.token === CALL_TOKEN)

  console.log('\n--- verdict ---')
  console.log(
    lit
      ? `   VIDEO RENDERS — ${best.w}x${best.h}, mean luma ${best.luma}, ${best.unique} distinct colours`
      : `   VIDEO NOT PROVEN — best luma ${best.luma}, ${best.unique} colours. A track may have arrived; pixels did not.`,
  )
  console.log(
    webhookHits.length > 0
      ? `   INLINE WEBHOOK TOOLS FIRE — ${webhookHits.length} hit(s). The server-side gate survives.`
      : '   NO WEBHOOK HIT — inline webhook tools did not reach us. The gate has to move to the client.',
  )
  console.log(
    webhookHits.length > 0
      ? `   per-call secret ${tokenOk ? 'ARRIVED intact' : 'DID NOT ARRIVE — configured headers are stripped'}`
      : '   per-call secret untested (no hit)',
  )
  console.log(
    seen.clientTool.length > 0
      ? `   CLIENT TOOLS FIRE — ${JSON.stringify(seen.clientTool)}`
      : '   no client tool call',
  )
  for (const hit of webhookHits) console.log(`   webhook body: ${JSON.stringify(hit.body)}`)
  for (const t of seen.toolEvents) console.log(`   tool event: ${t.ev} ${JSON.stringify(t.e).slice(0, 240)}`)
  if (seen.closed) console.log(`   connection closed: ${seen.closed}`)
  console.log(`   session id from SESSION_READY: ${sessionId ?? '(never fired)'}`)
  for (const m of (seen.messages ?? []).slice(0, 8)) {
    console.log(`   ${m.role ?? '?'}: ${String(m.content ?? '').slice(0, 130)}`)
  }
} catch (err) {
  console.error('\nFAILED: ' + (err?.stack ?? err?.message ?? err))
} finally {
  if (browser) await browser.close()
  if (!sessionId) {
    // SESSION_READY never fired, so find it the way the API would have to: by the label we set.
    try {
      const list = await call('/v1/sessions?limit=10')
      sessionId = (list?.data ?? []).find((s) => s.clientLabel === LABEL)?.id ?? null
      if (sessionId) console.log(`\n   (recovered session ${sessionId} by clientLabel)`)
    } catch {}
  }
  if (sessionId) {
    try {
      await call(`/v1/sessions/${sessionId}/stop`, { method: 'POST' })
      console.log(`   session ${sessionId} stopped (billing stopped)`)
    } catch (e) {
      console.error(`   !! could not stop ${sessionId}: ${e.message.slice(0, 200)}`)
    }
    try {
      const tr = await call(`/v1/sessions/${sessionId}/transcript`)
      // { sessionId, personaName, durationMs, totalMessages, messages: [{ role, message, ... }] }.
      // Note what is *not* here: tool calls. Runway put toolCalls/toolResults on the assistant
      // turn and the reconciler read them from there. Anam's transcript is speech only, so the
      // record of what the gate was asked has to come from our own webhook log.
      const turns = tr?.messages ?? []
      console.log(`   transcript: ${turns.length} turns, ${tr?.durationMs ?? '?'}ms billed`)
      for (const turn of turns.slice(0, 8)) {
        console.log(`     ${turn.role ?? '?'}: ${String(turn.message ?? '').slice(0, 130)}`)
      }
    } catch (e) {
      console.log(`   transcript unavailable: ${e.message.slice(0, 160)}`)
    }
  }
  if (tunnel) await tunnel.close()
  if (server) server.close()
}
