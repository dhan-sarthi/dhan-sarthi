// Headless-Chrome screenshotter for the Dhan Sarthi Expo web target.
// Recipe: launch Chrome with --headless=new + CDP, mint an API token, inject it into
// localStorage, then navigate per route and capture at 390x844 @2x.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// --base https://… points both at one origin, which is how the deployment serves them: CloudFront
// routes / to the web bundle and /api/* to the API.
const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1].replace(/\/$/, '')
  : undefined
const API = BASE ?? 'http://localhost:3001'
const WEB = BASE ?? 'http://localhost:8081'
const OUT = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : './shots'
const CIF = process.argv.includes('--cif')
  ? process.argv[process.argv.indexOf('--cif') + 1]
  : 'IDBI0003308471' // Karan
const HEIGHT = Number(
  process.argv.includes('--h') ? process.argv[process.argv.indexOf('--h') + 1] : 844,
)
const WAIT = Number(
  process.argv.includes('--wait') ? process.argv[process.argv.indexOf('--wait') + 1] : 3500,
)
const ROUTES = process.argv.includes('--routes')
  ? process.argv[process.argv.indexOf('--routes') + 1].split(',')
  : ['/spend']
const NOTOKEN = process.argv.includes('--no-token')

mkdirSync(OUT, { recursive: true })

const port = 9333 + Math.floor(Math.random() * 400)
const profile = mkdtempSync(join(tmpdir(), 'ds-shot-'))
const chrome = spawn(
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--font-render-hinting=none',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`)
      const j = await r.json()
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl
    } catch {
      // Chrome is still starting and the debugging port is not open yet; try again.
    }
    await sleep(250)
  }
  throw new Error('chrome never came up')
}

function cdp(url) {
  const ws = new WebSocket(url)
  let id = 0
  const pending = new Map()
  const ready = new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    }
  }
  return {
    ready,
    send(method, params = {}, sessionId) {
      const mid = ++id
      return new Promise((res, rej) => {
        pending.set(mid, (m) =>
          m.error ? rej(new Error(method + ': ' + JSON.stringify(m.error))) : res(m.result),
        )
        ws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) }))
      })
    },
    close: () => ws.close(),
  }
}

const main = async () => {
  const token = NOTOKEN
    ? null
    : await fetch(`${API}/api/v1/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cif: CIF }),
      })
        .then((r) => r.json())
        .then((j) => j.token)
  if (token) console.log('token', token.slice(0, 12) + '…')

  const c = cdp(await wsUrl())
  await c.ready
  const { targetId } = await c.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true })
  const S = (m, p) => c.send(m, p, sessionId)

  await S('Page.enable')
  await S('Runtime.enable')
  await S('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: HEIGHT,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: 390,
    screenHeight: HEIGHT,
  })

  await S('Page.navigate', { url: WEB + '/' })
  await sleep(4000)
  if (token) {
    await S('Runtime.evaluate', {
      expression: `localStorage.setItem('dhan.session.token', ${JSON.stringify(token)}); 'ok'`,
    })
  }

  // Each entry is  route[>clickText[>clickText…]][#name]
  for (const spec of ROUTES) {
    const [lhs, explicit] = spec.split('#')
    const [route, ...clicks] = lhs.split('>')
    const name =
      explicit ||
      (route.replace(/^\//, '').replace(/[?=&]/g, '-') || 'root') +
        (clicks.length
          ? '-' +
            clicks
              .join('-')
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
          : '')
    await S('Page.navigate', { url: WEB + route })
    await sleep(WAIT)
    for (const label of clicks) {
      const scroll = label.startsWith('~')
      if (scroll) {
        await S('Runtime.evaluate', {
          expression: `window.scrollTo(0, ${Number(label.slice(1))}); document.querySelectorAll('div').forEach(d=>{if(d.scrollHeight>d.clientHeight+40)d.scrollTop=${Number(label.slice(1))}}); 'ok'`,
        })
        await sleep(1200)
        continue
      }
      const { result } = await S('Runtime.evaluate', {
        expression: `(() => {
          const want = ${JSON.stringify(label)}.toLowerCase();
          const nodes = [...document.querySelectorAll('div,span,button,a,[role="button"],[role="tab"]')];
          const hit = nodes.reverse().find(n => (n.innerText||'').trim().toLowerCase() === want)
            || nodes.find(n => (n.innerText||'').trim().toLowerCase().includes(want));
          if (!hit) return 'miss';
          const t = hit.closest('[role="button"],[role="tab"],button,a') || hit;
          const r = t.getBoundingClientRect();
          return JSON.stringify({ x: r.x + r.width/2, y: r.y + r.height/2 });
        })()`,
        returnByValue: true,
      })
      if (result.value === 'miss') {
        console.log('  MISS click', label)
        continue
      }
      const { x, y } = JSON.parse(result.value)
      for (const type of ['mousePressed', 'mouseReleased']) {
        await S('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
      }
      await sleep(1600)
    }
    const { data } = await S('Page.captureScreenshot', { format: 'png' })
    const path = join(OUT, `${name}.png`)
    writeFileSync(path, Buffer.from(data, 'base64'))
    console.log('shot', path)
  }

  c.close()
  chrome.kill()
}

main().catch((e) => {
  console.error(e)
  chrome.kill()
  process.exit(1)
})
