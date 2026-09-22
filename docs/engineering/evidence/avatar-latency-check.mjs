// One real avatar call through the real app, measured, then hung up. Every run bills Runway
// credits, and the script refuses to start one that could take the balance under FLOOR.
//
//   MODE=dry      no provider: checks the page, the rewrite, the fake mic and the monitors (free)
//   MODE=latency  tap → video → first words → greeting ends → hang up
//   MODE=full     greeting, one English question, one Hindi question, hang up
//   MODE=hindi    greeting, one Hindi question, and a recording of what Uday said back
//
// It starts its own API on :3101 (Runway only, capped by CAP seconds), points the running Expo
// web app (:8081) at it by rewriting localhost:3001 → :3101 in the browser, fakes a microphone
// with WebAudio, and watches the avatar's audio and video on the page clock. LINGER seconds on
// the call screen before the tap lets the app ready the call ahead, the way a person looking at
// the screen would. Results: `docs/engineering/avatar-accounts.md`.
//
//   npm i --prefix /tmp/evidence playwright-core
//   say -v Rishi -o /tmp/evidence/q1-en.aiff "Uday, what is the one thing I should do about my money this month?"
//   say -v Lekha -o /tmp/evidence/q2-hi.aiff "उदय, मेरे क्रेडिट कार्ड पर कितना ब्याज लग रहा है, और मुझे पहले क्या करना चाहिए?"
//   for f in q1-en q2-hi; do ffmpeg -i /tmp/evidence/$f.aiff -ar 48000 -ac 1 /tmp/evidence/$f.wav; done
//   NODE_PATH=/tmp/evidence/node_modules AUDIO=/tmp/evidence MODE=full node docs/engineering/evidence/avatar-latency-check.mjs /tmp/evidence/run1
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(path.join(process.env.NODE_PATH ?? '/tmp/evidence/node_modules', 'x.js'))
const { chromium } = require('playwright-core')

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..')
const HERE = path.dirname(new URL(import.meta.url).pathname)
const OUT = process.argv[2] ?? path.join(HERE, 'runs', new Date().toISOString().replace(/[:.]/g, '-'))
const MODE = process.env.MODE ?? 'full'
const CAP = Number(process.env.CAP ?? 80)
const API_PORT = 3101
const APP = 'http://localhost:8081'
const CIF = process.env.CIF ?? 'IDBI0003308471' // Karan: the high-interest debt story
/** Never start a run whose worst case could take the balance below this. */
const FLOOR = Number(process.env.FLOOR ?? 340)
fs.mkdirSync(OUT, { recursive: true })

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 23)}]`, ...a)

/* The Runway key, read the way the API reads it. Never printed. ------------------------------ */
function envFile() {
  const env = {}
  for (const line of fs.readFileSync(path.join(REPO, 'apps/api/.env'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}
const ENV = envFile()
const RUNWAY_KEY = ENV.RUNWAY_API_KEY_1 || (ENV.RUNWAY_API_KEY ?? '').split(',')[0]
const RW = { Authorization: `Bearer ${RUNWAY_KEY}`, 'X-Runway-Version': '2024-11-06' }
async function runway(pathname, init = {}) {
  const res = await fetch(`https://api.dev.runwayml.com${pathname}`, { ...init, headers: { ...RW, ...(init.headers ?? {}) } })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch {}
  return { status: res.status, json }
}
async function credits() {
  const r = await runway('/v1/organization')
  return r.json?.creditBalance ?? null
}

/* The API under test ------------------------------------------------------------------------ */
function startApi() {
  const logPath = path.join(OUT, 'api.log')
  const out = fs.openSync(logPath, 'w')
  const child = spawn(
    process.execPath,
    ['--experimental-strip-types', '--env-file-if-exists=.env', 'src/index.ts'],
    {
      cwd: path.join(REPO, 'apps/api'),
      env: {
        ...process.env,
        PORT: String(API_PORT),
        AVATAR_PROVIDER: MODE === 'dry' ? 'none' : 'runway',
        RUNWAY_MAX_SESSION_SECONDS: String(CAP),
        AVATAR_SESSIONS_PER_IP_PER_HOUR: '50',
        ...(process.env.END_GRACE ? { AVATAR_END_GRACE_SECONDS: process.env.END_GRACE } : {}),
      },
      stdio: ['ignore', out, out],
    },
  )
  return { child, logPath }
}
async function waitHealthy() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`http://localhost:${API_PORT}/api/v1/health`)
      if (r.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('test API never became healthy')
}

/* What runs in the page before the app does ------------------------------------------------ */
const INIT = () => {
  const ctx = new AudioContext({ sampleRate: 48000 })
  const dest = ctx.createMediaStreamDestination()
  window.__probe = { clicks: [], net: [], ws: [], voice: [], video: null, mic: [], level: 0 }
  const P = window.__probe

  // The microphone is a WebAudio bus the harness can speak into.
  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
  navigator.mediaDevices.getUserMedia = async (c) => {
    if (c && c.audio && !c.video) {
      if (ctx.state !== 'running') await ctx.resume()
      P.mic.push(performance.now())
      return new MediaStream([dest.stream.getAudioTracks()[0].clone()])
    }
    return gum(c)
  }
  window.__say = async (url) => {
    if (ctx.state !== 'running') await ctx.resume()
    const buf = await (await fetch(url)).arrayBuffer()
    const audio = await ctx.decodeAudioData(buf)
    const src = ctx.createBufferSource()
    src.buffer = audio
    src.connect(dest)
    const start = performance.now()
    src.start()
    return new Promise((r) => (src.onended = () => r({ start, end: performance.now() })))
  }

  addEventListener('pointerdown', () => P.clicks.push(performance.now()), true)

  const f = window.fetch
  window.fetch = async (input, init) => {
    const url = String(input?.url ?? input)
    const t = performance.now()
    const method = init?.method ?? 'GET'
    try {
      const r = await f(input, init)
      const row = { url: url.replace(/^https?:\/\/[^/]+/, ''), method, t, dt: performance.now() - t, status: r.status }
      if (method === 'POST' && url.endsWith('/api/v1/avatar/session')) {
        try { const j = await r.clone().json(); row.runwaySessionId = j.runwaySessionId; row.transport = j.transport; row.expiresInSeconds = j.expiresInSeconds } catch {}
      }
      P.net.push(row)
      return r
    } catch (e) {
      P.net.push({ url, method, t, err: String(e) })
      throw e
    }
  }

  const WS = window.WebSocket
  window.WebSocket = function (url, protocols) {
    const ws = protocols === undefined ? new WS(url) : new WS(url, protocols)
    const row = { host: String(url).split('/')[2], t: performance.now(), open: null }
    P.ws.push(row)
    ws.addEventListener('open', () => (row.open = performance.now()))
    return ws
  }
  window.WebSocket.prototype = WS.prototype
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 })

  // The avatar's voice: an analyser on every remote audio element the transport attaches.
  const hooked = new WeakSet()
  setInterval(() => {
    for (const el of document.querySelectorAll('audio')) {
      const s = el.srcObject
      if (!s || hooked.has(s) || s.getAudioTracks().length === 0) continue
      hooked.add(s)
      // Keep what Uday said, so the language of a reply is checked on his voice, not on a
      // transcript the provider may or may not keep.
      try {
        const rec = new MediaRecorder(new MediaStream(s.getAudioTracks()), { mimeType: 'audio/webm' })
        P.chunks = P.chunks ?? []
        rec.ondataavailable = (e) => { if (e.data.size) P.chunks.push(e.data) }
        rec.start(1000)
        P.recorder = rec
        P.recordStart = performance.now()
      } catch {}
      const an = ctx.createAnalyser()
      an.fftSize = 1024
      ctx.createMediaStreamSource(s).connect(an)
      const data = new Float32Array(an.fftSize)
      let speaking = false
      let lastLoud = 0
      setInterval(() => {
        an.getFloatTimeDomainData(data)
        let sum = 0
        for (const v of data) sum += v * v
        const rms = Math.sqrt(sum / data.length)
        const now = performance.now()
        P.level = rms
        if (rms > 0.012) {
          lastLoud = now
          if (!speaking) { speaking = true; P.voice.push({ type: 'start', t: now }) }
        } else if (speaking && now - lastLoud > 700) {
          speaking = false
          P.voice.push({ type: 'end', t: lastLoud })
        }
      }, 25)
    }
  }, 50)

  // The first presented video frame, however the transport reports it.
  setInterval(() => {
    if (P.video) return
    const v = document.querySelector('video')
    if (v && v.videoWidth > 0 && v.currentTime > 0 && !v.paused) {
      P.video = { t: performance.now(), w: v.videoWidth, h: v.videoHeight }
    }
  }, 20)
}

/* The run ------------------------------------------------------------------------------------ */
const report = { mode: MODE, cap: CAP, cif: CIF, at: new Date().toISOString() }
let api = null
let browser = null
let page = null
let sessionToken = null
let grantId = null
const pageErrors = []

async function endEverything(reason) {
  log('ending the call:', reason)
  let pressed = false
  try { await page?.getByText('End the call', { exact: true }).click({ timeout: 1500 }); pressed = true } catch {}
  if (!grantId || grantId.startsWith('anam_')) return
  // The app said goodbye and the API is giving the session its grace to end by itself, which is
  // what keeps the transcript. Watch it do so; cancel only if it is still running after that.
  const hungUpAt = Date.now()
  const until = hungUpAt + (pressed ? Number(process.env.END_WATCH ?? 16) * 1000 : 0)
  let status = ''
  while (Date.now() < until) {
    status = (await runway(`/v1/realtime_sessions/${grantId}`)).json?.status ?? ''
    if (status && status !== 'RUNNING' && status !== 'READY' && status !== 'NOT_READY') break
    await new Promise((r) => setTimeout(r, 500))
  }
  report.endStatus = status || null
  report.endAfterMs = Date.now() - hungUpAt
  log('session status after hang-up:', status, 'after', report.endAfterMs, 'ms')
  if (!status || status === 'RUNNING' || status === 'READY' || status === 'NOT_READY') {
    if (sessionToken) {
      try {
        await fetch(`http://localhost:${API_PORT}/api/v1/avatar/session/${grantId}/end`, {
          method: 'POST', headers: { authorization: `Bearer ${sessionToken}` },
        })
      } catch {}
    }
    const r = await runway(`/v1/realtime_sessions/${grantId}`, { method: 'DELETE' }).catch(() => null)
    log('runway DELETE (still running)', r?.status)
  }
}

async function waitFor(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const v = await page.evaluate(fn).catch(() => null)
    if (v) return v
    await new Promise((r) => setTimeout(r, 100))
  }
  log(`timed out waiting for ${label}`)
  return null
}

/** The avatar finished talking: a start, then an end, then `quietMs` with no new start. */
async function waitForTurnEnd(afterT, quietMs, timeoutMs, label) {
  return waitFor(
    `(() => { const v = window.__probe.voice.filter(e => e.t >= ${afterT});
       const starts = v.filter(e => e.type === 'start'); if (!starts.length) return null;
       const last = v[v.length - 1]; if (last.type !== 'end') return null;
       return performance.now() - last.t >= ${quietMs} ? { firstStart: starts[0].t, lastEnd: last.t } : null })()`,
    timeoutMs,
    label,
  )
}

const hardStop = setTimeout(async () => {
  await endEverything('hard stop at 150s')
  process.exit(3)
}, 150_000)

try {
  if (MODE !== 'dry') {
    if (!RUNWAY_KEY) throw new Error('no Runway key in apps/api/.env')
    report.creditsBefore = await credits()
    log('credits before', report.creditsBefore)
    // Never start a run whose worst case (2 up front + 2 per six seconds up to the cap, and the
    // hang-up's grace) could take the balance under FLOOR.
    // If billing ran on while the session winds down after the hang-up, that counts too.
    const worst = 2 + 2 * Math.ceil((CAP + Number(process.env.END_GRACE ?? 20)) / 6)
    report.worstCaseCredits = worst
    if (report.creditsBefore === null || report.creditsBefore - worst < FLOOR) {
      throw new Error(`refusing: ${report.creditsBefore} - worst case ${worst} would cross the ${FLOOR} floor`)
    }
  }

  api = startApi()
  await waitHealthy()
  log('test API up on', API_PORT)

  browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['microphone'] })
  await ctx.addInitScript(INIT)
  // The app was built against :3001 (the user's API). Send it to the test API instead.
  await ctx.route('http://localhost:3001/**', (route) => route.continue({ url: route.request().url().replace(':3001', `:${API_PORT}`) }))
  // The WAVs, served from the page's origin so the page can fetch them.
  await ctx.route(`${APP}/__audio/**`, (route) => route.fulfill({ path: path.join(process.env.AUDIO ?? path.join(HERE, 'audio'), route.request().url().split('/__audio/')[1]), contentType: 'audio/wav' }))
  page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') { pageErrors.push(m.text().slice(0, 200)); log('page error:', m.text().slice(0, 200)) } })

  const s = await fetch(`http://localhost:${API_PORT}/api/v1/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cif: CIF }) })
  sessionToken = (await s.json()).token
  await page.goto(`${APP}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate((t) => localStorage.setItem('dhan.session.token', t), sessionToken)
  await page.goto(`${APP}/uday`, { waitUntil: 'domcontentloaded' })
  const startBtn = page.getByText(/^(Start the call|Start a call|Call Uday again|Call again)$/)
  await startBtn.first().waitFor({ timeout: 60_000 }).catch(() => {})
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(OUT, '0-before.png') })

  if (MODE === 'dry') {
    // The mic bus and the analyser, looped back on themselves: speak, and see it heard.
    const heard = await page.evaluate(async () => {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      const a = document.createElement('audio'); a.srcObject = s; document.body.appendChild(a)
      await new Promise((r) => setTimeout(r, 200))
      await window.__say('/__audio/q1-en.wav')
      await new Promise((r) => setTimeout(r, 1200))
      return window.__probe.voice
    })
    report.dry = {
      startButton: await startBtn.count(),
      heard,
      mic: await page.evaluate(() => window.__probe.mic.length),
      prepare: await page.evaluate(() => window.__probe.net.filter((r) => r.url.includes('/prepare'))),
      errors: pageErrors,
    }
    log('dry run', JSON.stringify(report.dry))
  } else {
    // A person looks at the screen before tapping; the app readies the call meanwhile.
    const LINGER = Number(process.env.LINGER ?? 10)
    log(`lingering ${LINGER}s on the call screen before tapping`)
    await page.waitForTimeout(LINGER * 1000)
    report.prepareRequests = await page.evaluate(() => window.__probe.net.filter((r) => r.url === '/api/v1/avatar/session/prepare').map((r) => ({ status: r.status, ms: Math.round(r.dt) })))
    await startBtn.first().click()
    const tap = await page.evaluate(() => window.__probe.clicks.at(-1))
    log('tapped')

    const grant = await waitFor(`window.__probe.net.find(r => r.method === 'POST' && r.url === '/api/v1/avatar/session')`, 45_000, 'grant')
    grantId = grant?.runwaySessionId ?? null
    report.grant = grant && { status: grant.status, ms: Math.round(grant.t + grant.dt - tap), transport: grant.transport, expiresInSeconds: grant.expiresInSeconds, id: grantId }
    log('grant', JSON.stringify(report.grant))
    if (!grantId) throw new Error(`no grant (status ${grant?.status})`)

    const video = await waitFor(`window.__probe.video`, 40_000, 'first video frame')
    const firstVoice = await waitFor(`window.__probe.voice.find(e => e.type === 'start')`, 40_000, 'first words')
    if (video) await page.screenshot({ path: path.join(OUT, '1-first-frame.png') })
    await page.waitForTimeout(2500)
    await page.screenshot({ path: path.join(OUT, '2-talking.png') })

    const greeting = await waitForTurnEnd(0, 1300, 45_000, 'greeting to end')
    const probe0 = await page.evaluate(() => window.__probe)
    const lk = probe0.ws.find((w) => /livekit/.test(w.host))
    report.latencyMs = {
      tapToGrant: report.grant.ms,
      tapToLiveKitOpen: lk?.open ? Math.round(lk.open - tap) : null,
      tapToFirstFrame: video ? Math.round(video.t - tap) : null,
      tapToFirstWords: firstVoice ? Math.round(firstVoice.t - tap) : null,
      micAcquiredAfterTap: probe0.mic.length ? Math.round(probe0.mic[0] - tap) : null,
      greetingSeconds: greeting ? Math.round((greeting.lastEnd - greeting.firstStart) / 100) / 10 : null,
    }
    report.video = video && { w: video.w, h: video.h }
    // The app's own marks, where the build under test sets them: a second clock on the same run.
    report.appMarks = await page.evaluate(() => {
      const marks = performance.getEntriesByType('mark').filter((m) => m.name.startsWith('avatar:'))
      const tap = marks.find((m) => m.name === 'avatar:tap')
      return tap ? Object.fromEntries(marks.map((m) => [m.name.slice(7), Math.round(m.startTime - tap.startTime)])) : null
    })
    log('latency', JSON.stringify(report.latencyMs))

    if (MODE === 'hindi') {
      // Ask in Hindi three seconds into the greeting: does he stop to listen, and does he
      // answer in Hindi?
      const firstWordsAt = firstVoice?.t ?? 0
      await page.waitForFunction((t) => performance.now() - t > 3000, firstWordsAt)
      const said = await page.evaluate((u) => window.__say(u), '/__audio/q2-hi.wav')
      const voice = await page.evaluate(() => window.__probe.voice)
      // Stopped for the question: an 'end' while the question was being spoken.
      const stopped = voice.find((e) => e.type === 'end' && e.t > said.start && e.t < said.end + 800)
      report.bargeIn = { questionAt: Math.round(said.start - tap), stoppedAfterMs: stopped ? Math.round(stopped.t - said.start) : null }
      log('barge-in', JSON.stringify(report.bargeIn))
      const reply = await waitForTurnEnd(said.end, 2500, 45_000, 'hindi reply')
      report.hindi = reply && { replyAfterMs: Math.round(reply.firstStart - said.end), replySeconds: Math.round((reply.lastEnd - reply.firstStart) / 100) / 10, replyStartOnRecording: null }
      if (reply) report.hindi.replyStartOnRecording = await page.evaluate((t) => Math.round((t - window.__probe.recordStart) / 100) / 10, reply.firstStart)
      report.questionOnRecording = await page.evaluate((t) => Math.round((t - window.__probe.recordStart) / 100) / 10, said.start)
      log('hindi reply', JSON.stringify(report.hindi))
      await page.screenshot({ path: path.join(OUT, '3-hindi.png') })
    }
    if (MODE === 'full') {
      for (const [i, file] of [['q1', 'q1-en.wav'], ['q2', 'q2-hi.wav']]) {
        const said = await page.evaluate((u) => window.__say(u), `/__audio/${file}`)
        log(`${i} said (${Math.round(said.end - said.start)} ms)`)
        // 2.5 s of quiet, not 1.5: an answer that pauses while a tool runs is still one answer.
        const reply = await waitForTurnEnd(said.end, 2500, 40_000, `${i} reply`)
        report[i] = reply && { replyAfterMs: Math.round(reply.firstStart - said.end), replySeconds: Math.round((reply.lastEnd - reply.firstStart) / 100) / 10 }
        log(`${i} reply`, JSON.stringify(report[i]))
        await page.screenshot({ path: path.join(OUT, `3-${i}.png`) })
      }
    }
    // Save what Uday said before hanging up tears the audio element down.
    const b64 = await page.evaluate(async () => {
      const P = window.__probe
      if (!P.recorder) return null
      await new Promise((r) => { P.recorder.onstop = r; P.recorder.stop() })
      const blob = new Blob(P.chunks, { type: 'audio/webm' })
      const buf = new Uint8Array(await blob.arrayBuffer())
      let bin = ''
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      return btoa(bin)
    })
    if (b64) fs.writeFileSync(path.join(OUT, 'uday.webm'), Buffer.from(b64, 'base64'))
    await endEverything('script done')
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(OUT, '4-ended.png') })
  }
} catch (err) {
  report.error = String(err?.message ?? err)
  log('ERROR', report.error)
  await endEverything('error')
} finally {
  clearTimeout(hardStop)
  try { await browser?.close() } catch {}
  // Graceful: the API's shutdown releases every lease and cancels what it still holds.
  if (api) {
    api.child.kill('SIGTERM')
    await new Promise((r) => setTimeout(r, 2500))
    try { api.child.kill('SIGKILL') } catch {}
    const lines = fs.readFileSync(api.logPath, 'utf8').split('\n')
    const readied = lines.findIndex((l) => l.includes('readied ahead of the tap'))
    const granted = lines.findIndex((l) => l.includes('avatar session granted'))
    report.serverLog = [readied, granted].filter((i) => i >= 0).map((i) => lines.slice(i, i + 20).join('\n')).join('\n---\n')
    const failed = lines.filter((l) => /could not take the call|avatar session failed|ERROR/.test(l)).slice(0, 10)
    if (failed.length) report.serverWarnings = failed
  }
  if (grantId && !grantId.startsWith('anam_')) {
    // The record only fills once the session has ended; give it time to.
    let c = {}
    for (let i = 0; i < 12; i += 1) {
      c = (await runway(`/v1/avatar_conversations/${grantId}`)).json ?? {}
      if ((c.transcript ?? []).length > 0 && c.recordingUrl) break
      await new Promise((r) => setTimeout(r, 3000))
    }
    report.runway = { status: c.status, duration: c.duration, startedAt: c.startedAt, endedAt: c.endedAt, failure: c.failure ?? null }
    report.transcript = (c.transcript ?? []).map((t) => ({
      role: t.role, text: t.content, tools: (t.toolCalls ?? []).map((x) => x.name), results: (t.toolResults ?? []).map((x) => x.name),
    }))
    if (c.recordingUrl) report.recordingUrl = c.recordingUrl
  }
  if (MODE !== 'dry') {
    for (let i = 0; i < 6; i += 1) {
      report.creditsAfter = await credits()
      if (report.creditsAfter !== report.creditsBefore) break
      await new Promise((r) => setTimeout(r, 4000))
    }
    report.creditsSpent = report.creditsBefore - report.creditsAfter
    log('credits after', report.creditsAfter, 'spent', report.creditsSpent)
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  log('report →', path.join(OUT, 'report.json'))
  process.exit(0)
}
