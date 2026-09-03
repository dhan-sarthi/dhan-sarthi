/**
 * One live avatar call through the real build: the API grants a gated session, a real Chromium
 * opens the web app, presses "Call", and a spoken question about a ULIP arrives over the fake
 * microphone. Success is the worker calling `check_suitability` through our RPC handler, the
 * rules answering BLOCKED / BUNDLED_PROTECTION, and the advice record and tool call showing up on
 * GET /api/v1/avatar/session/:id/record.
 *
 * Every step is timestamped; the run log is the evidence in ../avatar-live-call.md.
 *
 * Billed: about US$0.20 a minute from session creation. The API caps the session (run it with
 * RUNWAY_MAX_SESSION_SECONDS=180) and this script ends the call through the API in `finally`,
 * then checks the session directly against Runway and cancels it if anything is still alive.
 *
 * Prerequisites (nothing is installed by this script):
 *   - an API on API_BASE with AVATAR_PROVIDER=runway, e.g.
 *       cd apps/api && BANK_SOURCE=postgres AVATAR_PROVIDER=runway RUNWAY_MAX_SESSION_SECONDS=180 \
 *         PORT=3011 node --experimental-strip-types --env-file=.env src/index.ts
 *   - a web dev server on WEB_BASE proxying /api to it:
 *       cd apps/web && VITE_API_PROXY_TARGET=http://127.0.0.1:3011 pnpm exec vite --port 5183
 *   - playwright-core (PLAYWRIGHT_CORE = path to the package) and a matching Chromium
 *     (CHROMIUM_PATH = the binary). Neither is a dependency of this repository.
 *   - a 16 kHz mono WAV of the question (FAKE_AUDIO), with leading silence so it lands after
 *     Uday's greeting:
 *       say -v Rishi -o q.aiff "Uday, my cousin says I should take the LIC Market Plus ULIP for
 *         two and a half thousand a month. Should I?" && afconvert -f WAVE -d LEI16@16000 -c 1 q.aiff q.wav
 *
 * Usage:
 *   API_BASE=http://127.0.0.1:3011 WEB_BASE=http://127.0.0.1:5183 \
 *   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core \
 *   CHROMIUM_PATH="/path/to/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" \
 *   FAKE_AUDIO=/path/to/q-padded.wav node docs/engineering/evidence/avatar-live-call.mjs
 *
 * Nothing secret is printed: bearer tokens and LiveKit JWTs are reduced to a length.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core')

const API = (process.env.API_BASE ?? 'http://127.0.0.1:3011').replace(/\/$/, '')
const WEB = (process.env.WEB_BASE ?? 'http://127.0.0.1:5183').replace(/\/$/, '')
const CIF = process.env.CIF ?? 'IDBI0009182731' // Rohan
const WAV = process.env.FAKE_AUDIO
const CHROMIUM = process.env.CHROMIUM_PATH
const WAIT_FOR_TOOL_MS = Number(process.env.WAIT_MS ?? 120_000)
/** After the gate fires, leave the call up this long so the verdict sentence lands in the transcript. */
const LINGER_AFTER_TOOL_MS = Number(process.env.LINGER_MS ?? 20_000)
const TRANSCRIPT_WAIT_MS = 90_000
/**
 * How the call ends. `hangup` presses End (the API cancels the session at once). `drop` pulls
 * the browser's network instead, the hard-killed-tab case: nobody calls /end, the user
 * participant vanishes, and the run records what Runway does with the session and whether the
 * conversation record then carries the turns and tool results a cancelled one does not.
 */
const END_MODE = process.env.END_MODE === 'drop' ? 'drop' : 'hangup'
const DROP_WAIT_MS = Number(process.env.DROP_WAIT_MS ?? 100_000)

if (!WAV || !CHROMIUM) {
  console.error('FAKE_AUDIO and CHROMIUM_PATH are required')
  process.exit(2)
}

// Direct Runway access is used only in `finally`, to prove the session is dead whatever the API did.
const ENV_FILE =
  process.env.ENV_FILE ?? fileURLToPath(new URL('../../../apps/api/.env', import.meta.url))
const dotenv = (() => {
  try {
    return Object.fromEntries(
      readFileSync(ENV_FILE, 'utf8')
        .split('\n')
        .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    )
  } catch {
    return {}
  }
})()
const RUNWAY_BASE = process.env.RUNWAY_API_BASE ?? dotenv.RUNWAY_API_BASE ?? 'https://api.dev.runwayml.com'
const RUNWAY_KEY = (process.env.RUNWAY_API_KEY ?? dotenv.RUNWAY_API_KEY ?? '').split(',')[0]?.trim()

const t0 = Date.now()
const ms = () => `+${String(Date.now() - t0).padStart(6)}ms`
const log = (...a) => console.log(new Date().toISOString(), ms(), ...a)
const sleep = (n) => new Promise((r) => setTimeout(r, n))
const redact = (v) => (typeof v === 'string' && v.length > 12 ? `<${v.length} chars>` : v)
const redactAll = (o) =>
  Object.fromEntries(
    Object.entries(o ?? {}).map(([k, v]) => [k, /token|key|secret|jwt/i.test(k) ? redact(v) : v]),
  )

async function api(path, { method = 'GET', body, token, headers = {} } = {}) {
  const h = { accept: 'application/json', ...headers }
  if (token) h.authorization = `Bearer ${token}`
  if (body !== undefined) h['content-type'] = 'application/json'
  const res = await fetch(`${API}${path}`, {
    method,
    headers: h,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {}
  return { status: res.status, json, text }
}

async function runway(path, method = 'GET') {
  const headers = { Authorization: `Bearer ${RUNWAY_KEY}`, 'X-Runway-Version': '2024-11-06' }
  const res = await fetch(`${RUNWAY_BASE}${path}`, { method, headers })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {}
  return { status: res.status, json }
}

const timeline = []
const mark = (event, extra) => {
  timeline.push({ event, at: new Date().toISOString(), elapsedMs: Date.now() - t0, ...extra })
  log(`▶ ${event}`, extra ? JSON.stringify(extra) : '')
}

let browser = null
let token = null
let runwaySessionId = null
let endedViaApi = false

try {
  /* 1. A session for Rohan, exactly as the picker would create it. */
  const created = await api('/api/v1/sessions', { method: 'POST', body: { cif: CIF } })
  if (created.status !== 200) throw new Error(`session create ${created.status}: ${created.text}`)
  token = created.json.token
  mark('session created', { cif: CIF, capabilities: created.json.session?.capabilities })

  const availability = await api('/api/v1/avatar/availability')
  log('availability', JSON.stringify(availability.json))
  if (!availability.json?.available) throw new Error('slot not available; nothing was billed')

  /* 2. A real browser with a fake microphone that plays the question. */
  browser = await chromium.launch({
    executablePath: CHROMIUM,
    headless: true,
    args: [
      '--no-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${WAV}%noloop`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ['microphone'],
  })
  await context.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value)
    },
    ['dhan.session.v2', JSON.stringify({ token, cif: CIF })],
  )
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'debug') return
    const text = m.text()
    if (/livekit|lk-|Room|track|avatar|error|warn/i.test(text)) log(`   [browser] ${text.slice(0, 200)}`)
  })
  page.on('pageerror', (e) => log(`   [pageerror] ${String(e).slice(0, 200)}`))
  page.on('response', async (res) => {
    const url = res.url()
    if (!url.includes('/api/v1/avatar/')) return
    const method = res.request().method()
    let body = null
    try {
      body = await res.json()
    } catch {}
    if (method === 'POST' && /\/avatar\/session$/.test(url)) {
      mark(`grant response ${res.status()}`, redactAll(body))
      if (res.status() === 200 && typeof body?.runwaySessionId === 'string') {
        runwaySessionId = body.runwaySessionId
      }
    } else if (method === 'POST' && url.endsWith('/end')) {
      mark(`end response ${res.status()}`)
      if (res.status() === 204) endedViaApi = true
    }
  })

  await page.goto(WEB, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Ask Uday' }).click({ timeout: 20_000 })
  mark('Ask screen opened')

  const call = page.getByRole('button', { name: 'Call' })
  try {
    await call.waitFor({ state: 'visible', timeout: 15_000 })
  } catch {
    const text = await page.evaluate(() => document.body.innerText.slice(0, 600))
    throw new Error(`no Call button; screen says: ${text.replace(/\s+/g, ' ')}`)
  }
  await call.click()
  mark('Call pressed')

  /* 3. Watch the screen and the record until the gate fires. */
  const seen = { live: false, audio: false, video: false, status: '', caption: '' }
  const toolCallsSeen = new Set()
  let firstToolAt = null
  let record = null
  let lastPoll = 0
  const deadline = Date.now() + WAIT_FOR_TOOL_MS
  while (Date.now() < deadline) {
    const s = await page.evaluate(() => {
      const v = document.querySelector('video')
      const a = document.querySelector('audio')
      const pill = [...document.querySelectorAll('span')]
        .map((el) => el.textContent?.trim() ?? '')
        .find((t) => /^(Live|Speaking|Joining…|Calling…|Text|Your turn|In line · \d+|\d+:\d\d left)$/.test(t))
      const text = document.body.innerText
      const caption = [
        'Connecting to Uday…',
        'Uday is joining…',
        'He is already talking — one moment',
        'Listen — he is introducing himself',
        'He can hear you',
      ].find((c) => text.includes(c))
      return {
        pill: pill ?? '',
        caption: caption ?? '',
        endBtn: !!document.querySelector('[aria-label="End call"]'),
        muted: text.includes('Muted'),
        video: v ? { w: v.videoWidth, h: v.videoHeight, t: Number(v.currentTime.toFixed(1)) } : null,
        audio: a ? { t: Number(a.currentTime.toFixed(1)), paused: a.paused } : null,
        reason: text.match(/Uday(?:'s| is| could)[^\n]{0,120}/)?.[0] ?? '',
      }
    })
    if (s.endBtn && !seen.live) {
      seen.live = true
      mark('room connected (in-call controls shown)')
    }
    if (s.audio && s.audio.t > 0 && !seen.audio) {
      seen.audio = true
      mark('first audio playing', s.audio)
    }
    if (s.video && s.video.t > 0 && s.video.w > 0 && !seen.video) {
      seen.video = true
      mark('first video frame decoded', s.video)
    }
    if (s.pill !== seen.status) {
      seen.status = s.pill
      log(`   status pill: "${s.pill}"`)
    }
    if (s.caption !== seen.caption) {
      seen.caption = s.caption
      log(`   caption: "${s.caption}"`)
    }
    if (!seen.live && !s.endBtn && s.pill === 'Text') {
      throw new Error(`the screen fell back to text: ${s.reason || '(no reason shown)'}`)
    }

    if (runwaySessionId && Date.now() - lastPoll > 2_000) {
      lastPoll = Date.now()
      const r = await api(`/api/v1/avatar/session/${runwaySessionId}/record`, { token })
      if (r.status === 200) {
        record = r.json
        for (const c of record.toolCalls) {
          if (toolCallsSeen.has(c.id)) continue
          toolCallsSeen.add(c.id)
          mark(`tool call: ${c.tool}`, {
            args: c.args,
            verdict: c.result?.verdict,
            rule_id: c.result?.rule_id,
            product: c.result?.product,
            latencyMs: c.latencyMs,
            adviceRecordId: c.adviceRecordId,
            createdAt: c.createdAt,
          })
          if (c.tool === 'check_suitability' && !firstToolAt) firstToolAt = Date.now()
        }
      }
    }
    if (firstToolAt && Date.now() - firstToolAt > LINGER_AFTER_TOOL_MS) break
    await sleep(500)
  }

  if (!firstToolAt) log('!! no check_suitability call within the wait window')

  /* 4. End the call: from the screen, the way a customer would, or by vanishing. */
  if (END_MODE === 'drop') {
    await context.setOffline(true)
    mark('browser network dropped (no /end will be sent)')
    let last = null
    const until = Date.now() + DROP_WAIT_MS
    while (Date.now() < until) {
      await sleep(3_000)
      const s = await runway(`/v1/realtime_sessions/${runwaySessionId}`)
      const status = s.json?.status ?? `http ${s.status}`
      if (status !== last) {
        last = status
        mark(`runway session ${status}`, { failure: s.json?.failure, failureCode: s.json?.failureCode })
      }
      const r = await api(`/api/v1/avatar/session/${runwaySessionId}/record`, { token })
      const ended = r.json?.session?.endedAt
      if (ended) {
        mark('API released the slot', {
          endReason: r.json.session.endReason,
          minutesCharged: r.json.session.minutesCharged,
          endedAt: ended,
        })
        break
      }
      if (['CANCELLED', 'FAILED', 'COMPLETED', 'ENDED'].includes(String(status))) continue
    }
    const screen = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300)).catch(() => '(page gone)')
    log('   screen after drop:', screen)
  } else {
    const endBtn = page.locator('[aria-label="End call"]')
    if (await endBtn.count()) {
      await endBtn.click()
      mark('End pressed')
      await sleep(2_000)
    }
    const afterEnd = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300))
    log('   screen after end:', afterEnd)
  }

  /* 5. The record, then the transcript once the backoff fetch lands. */
  if (runwaySessionId) {
    const until = Date.now() + TRANSCRIPT_WAIT_MS
    for (;;) {
      const r = await api(`/api/v1/avatar/session/${runwaySessionId}/record`, { token })
      record = r.json
      if (r.status !== 200 || record.transcriptStatus !== 'pending' || Date.now() > until) break
      await sleep(3_000)
    }
    log('record.session', JSON.stringify(record.session))
    log('record.summary', record.summary)
    log('record.transcriptStatus', record.transcriptStatus)
    for (const c of record.toolCalls) {
      log(
        `   toolCall ${c.tool} verified=${c.verifiedInTranscript}`,
        JSON.stringify({ args: c.args, verdict: c.result?.verdict, rule_id: c.result?.rule_id, latencyMs: c.latencyMs }),
      )
    }
    for (const a of record.adviceRecords) {
      log(
        `   advice source=${a.source} verdict=${a.verdict} rule=${a.ruleId} product=${a.productId}`,
        JSON.stringify({ spoken: a.spoken, alternative: a.alternative, snapshotId: a.snapshotId }),
      )
    }
    if (record.transcript) {
      log(`   transcript: ${record.transcript.length} turns`)
      for (const turn of record.transcript) {
        log(
          `     ${turn.role}: ${String(turn.text ?? '').slice(0, 160)}`,
          turn.toolCalls ? `toolCalls=${JSON.stringify(turn.toolCalls)}` : '',
          turn.toolResults ? `toolResults=${JSON.stringify(turn.toolResults).slice(0, 300)}` : '',
        )
      }
    }
    log('record.reconciliation', JSON.stringify(record.reconciliation))
  }
} catch (err) {
  log('FAILED:', err instanceof Error ? err.message : String(err))
} finally {
  if (runwaySessionId && token && !endedViaApi) {
    try {
      const r = await api(`/api/v1/avatar/session/${runwaySessionId}/end`, { method: 'POST', token })
      mark(`end via API (finally) ${r.status}`)
    } catch (e) {
      log('   end via API failed:', e.message)
    }
  }
  if (browser) await browser.close().catch(() => {})
  if (runwaySessionId && RUNWAY_KEY) {
    // Belt and braces: whatever the API did, the session must be dead before this exits.
    try {
      const s = await runway(`/v1/realtime_sessions/${runwaySessionId}`)
      log(`   runway session status: ${s.json?.status ?? s.status}`, s.json?.failureCode ?? '')
      if (s.json && !['CANCELLED', 'FAILED', 'COMPLETED', 'ENDED'].includes(String(s.json.status))) {
        const d = await runway(`/v1/realtime_sessions/${runwaySessionId}`, 'DELETE')
        log(`   DELETE runway session -> ${d.status}`)
      }
      const convo = await runway(`/v1/avatar_conversations/${runwaySessionId}`)
      log(
        '   runway conversation:',
        JSON.stringify({
          status: convo.json?.status,
          durationSeconds: convo.json?.duration,
          turns: (convo.json?.transcript ?? []).length,
          tools: (convo.json?.tools ?? []).map((t) => (typeof t === 'string' ? t : `${t.type}:${t.name}`)),
          toolResultTurns: (convo.json?.transcript ?? []).filter((t) => t.toolResults?.length).length,
        }),
      )
    } catch (e) {
      log('   runway check failed:', e.message)
    }
  }
  log('timeline:', JSON.stringify(timeline, null, 1))
  process.exit(0)
}
