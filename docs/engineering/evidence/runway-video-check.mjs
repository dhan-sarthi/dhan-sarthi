/**
 * The check that has been open for weeks: does the Runway video track actually render in a
 * real browser?
 *
 * The engineering notes said it could not be tested because "headless Chromium has no H.264".
 * That is not true of the Chromium that ships with Playwright — RTCRtpReceiver.getCapabilities
 * ('video') lists video/H264 — so the test is possible after all.
 *
 * Billing is real ($0.20/min), so the session is cancelled in a finally block no matter what.
 *
 * Run from the repository root after `pnpm install`, with apps/api/.env filled in:
 *   node docs/engineering/evidence/runway-video-check.mjs
 * Set ENV_FILE to point at a different env file, and CHROMIUM_PATH to use a specific binary
 * instead of the installed Google Chrome.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ENV = process.env.ENV_FILE ?? fileURLToPath(new URL('../../../apps/api/.env', import.meta.url))
const env = Object.fromEntries(
  readFileSync(ENV, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const BASE = env.RUNWAY_API_BASE || 'https://api.dev.runwayml.com'
const KEY = env.RUNWAY_API_KEY
const CHARACTER = env.RUNWAY_CHARACTER_ID
// Resolved through apps/web, which is the package that depends on livekit-client.
const LIVEKIT_UMD = createRequire(new URL('../../../apps/web/package.json', import.meta.url)).resolve(
  'livekit-client/dist/livekit-client.umd.js',
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
  try { json = text ? JSON.parse(text) : null } catch {}
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`)
  return json
}

let sessionId = null
let browser = null

try {
  console.log('1. character…')
  const ch = await call(`/v1/avatars/${CHARACTER}`)
  console.log(`   ok: ${ch?.name ?? '(unnamed)'} (${CHARACTER.slice(0, 8)}…)`)

  console.log('2. creating session…')
  const created = await call('/v1/realtime_sessions', {
    method: 'POST',
    body: {
      model: 'gwm1_avatars',
      avatar: { type: 'custom', avatarId: CHARACTER },
      maxDuration: 180,
      startScript: 'Say exactly: Rohan, eighty five thousand comes in and fifty two thousand is already committed.',
    },
  })
  sessionId = created.id
  console.log(`   session ${sessionId}`)

  console.log('3. waiting for READY…')
  let ready = null
  for (let i = 0; i < 45; i += 1) {
    const s = await call(`/v1/realtime_sessions/${sessionId}`)
    if (s.status === 'READY') { ready = s; break }
    if (s.status === 'FAILED' || s.status === 'CANCELLED') {
      throw new Error(`session ${s.status}: ${s.failure ?? ''} ${s.failureCode ?? ''}`)
    }
    if (i % 5 === 0) console.log(`   ${s.status}${s.queued ? ' (queued)' : ''}`)
    await new Promise((r) => setTimeout(r, 800))
  }
  if (!ready) throw new Error('never reached READY')
  console.log('   READY')

  console.log('4. consuming for LiveKit creds…')
  const creds = await call(`/v1/realtime_sessions/${sessionId}/consume`, {
    method: 'POST',
    bearer: ready.sessionKey,
    body: {},
  })
  const url = creds.url ?? creds.livekitUrl ?? creds.wsUrl
  const token = creds.token ?? creds.accessToken
  console.log(`   url ${url ? String(url).slice(0, 42) : '(missing)'}  token ${token ? 'yes' : 'MISSING'}`)
  if (!url || !token) throw new Error(`unexpected consume shape: ${JSON.stringify(creds).slice(0, 400)}`)

  console.log('5. connecting a real browser…')
  browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chrome' }),
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
           '--autoplay-policy=no-user-gesture-required'],
  })
  const page = await browser.newPage({ viewport: { width: 480, height: 720 } })
  page.on('console', (m) => { if (m.type() !== 'debug') console.log(`   [browser] ${m.text().slice(0, 160)}`) })

  await page.setContent('<video id="v" autoplay playsinline style="width:100%;height:100%;object-fit:cover;background:#000"></video>')
  await page.addScriptTag({ path: LIVEKIT_UMD })

  // Stay connected while sampling. The previous run disconnected inside the page before the
  // screenshot was taken, so the capture was of a detached element — a black frame that said
  // nothing about whether video actually arrived. And 15 frames at 0.76s is keyframe warm-up:
  // the first frames of a WebRTC stream are legitimately dark.
  await page.exposeFunction('report', (s) => console.log(`   [sample] ${s}`))

  const connect = page.evaluate(
    async ([wsUrl, jwt]) => {
      const { Room, RoomEvent } = window.LivekitClient
      const room = new Room({ adaptiveStream: false, dynacast: false })
      window.__room = room
      window.__seen = { video: false, audio: false }

      room.on(RoomEvent.TrackSubscribed, (track) => {
        window.__seen[track.kind] = true
        if (track.kind === 'video') track.attach(document.getElementById('v'))
        else { const el = track.attach(); el.autoplay = true; document.body.appendChild(el) }
      })

      await room.connect(wsUrl, jwt)
      try { await room.localParticipant.setMicrophoneEnabled(true) } catch {}
      return true
    },
    [url, token],
  )
  await connect

  // Sample the actual pixels. Mean luma over a downscaled frame is the only claim worth
  // making: "a track subscribed" is not "a face appeared".
  const samples = []
  for (let i = 0; i < 10; i += 1) {
    await new Promise((r) => setTimeout(r, 1000))
    const s = await page.evaluate(() => {
      const v = document.getElementById('v')
      if (!v.videoWidth) return { t: 0, w: 0, luma: null, unique: 0 }
      const c = document.createElement('canvas')
      c.width = 64
      c.height = 64
      const ctx = c.getContext('2d')
      ctx.drawImage(v, 0, 0, 64, 64)
      const px = ctx.getImageData(0, 0, 64, 64).data
      let sum = 0
      const seen = new Set()
      for (let j = 0; j < px.length; j += 4) {
        const l = 0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2]
        sum += l
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
      }
    })
    samples.push(s)
    console.log(`   t=${String(s.t).padStart(5)}s  ${s.w}x${s.h}  luma=${String(s.luma).padStart(5)}  colours=${String(s.unique).padStart(4)}  frames=${s.frames}`)
    if (s.luma !== null && s.luma > 12 && s.unique > 40) {
      await page.screenshot({ path: `runway-frame-${i}.png` })
    }
  }

  const result = await page.evaluate(() => {
    const participants = [...window.__room.remoteParticipants.values()].map((p) => p.identity)
    const seen = window.__seen
    window.__room.disconnect()
    return { seen, participants }
  })
  const best = samples.reduce((a, b) => ((b.luma ?? 0) > (a.luma ?? 0) ? b : a), samples[0])
  result.stats = best

  console.log(`   tracks: video=${result.seen.video} audio=${result.seen.audio}`)
  console.log(`   participants: ${JSON.stringify(result.participants)}`)
  console.log(`   video: ${JSON.stringify(result.stats)}`)

  const lit = (best.luma ?? 0) > 12 && (best.unique ?? 0) > 40
  console.log(
    lit
      ? `\n   *** VIDEO RENDERS — ${best.w}x${best.h}, mean luma ${best.luma}, ${best.unique} distinct colours ***`
      : `\n   !!! Track subscribed=${result.seen.video} but frames stayed dark (best luma ${best.luma}). Not proven.`,
  )

  try {
    const convo = await call(`/v1/avatar_conversations/${sessionId}`)
    const turns = convo?.transcript ?? convo?.data?.transcript ?? []
    console.log(`   transcript: ${turns.length} turns`)
    for (const turn of turns.slice(0, 4)) {
      console.log(`     ${turn.role}: ${String(turn.content ?? '').slice(0, 110)}`)
    }
  } catch (e) {
    console.log(`   transcript unavailable: ${e.message.slice(0, 120)}`)
  }
} catch (err) {
  console.error('\nFAILED: ' + err.message)
} finally {
  if (browser) await browser.close()
  if (sessionId) {
    try {
      await call(`/v1/realtime_sessions/${sessionId}`, { method: 'DELETE' })
      console.log(`\n6. session ${sessionId} cancelled (billing stopped)`)
    } catch (e) {
      console.error(`\n!! COULD NOT CANCEL ${sessionId}: ${e.message}`)
    }
  }
}
