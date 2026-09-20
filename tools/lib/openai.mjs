/**
 * The image endpoint, the key that opens it, and the pacing it insists on.
 *
 * Split out of `icons.mjs` when a second kind of artwork needed the same plumbing and none of
 * the icon house style. What is generic lives here — authentication, one request, the rate
 * limit, and the lanes; what is a style decision lives with the set that decides it.
 */
import process from 'node:process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Override with `MODEL=… node tools/gen-*.mjs` to try a different one. */
const MODEL = process.env['MODEL'] ?? 'gpt-image-2.5-sunburst'

/**
 * The first key that actually authenticates.
 *
 * There are two in this repo and they disagree — one of them answers 401. Convention says
 * `.local` wins, so taking the usual precedence and stopping there fails on a key the repo also
 * has a good copy of. One cheap `GET /models` per candidate settles it, and the error names which
 * file was rejected rather than leaving a 401 from the image call to be read as a bad prompt.
 */
async function key() {
  const candidates = []
  if (process.env['OPENAI_API_KEY']) candidates.push(['OPENAI_API_KEY', process.env['OPENAI_API_KEY']])
  for (const f of ['.env.local', '.env']) {
    const p = join(ROOT, f)
    if (!existsSync(p)) continue
    const m = readFileSync(p, 'utf8').match(/^OPENAI_API_KEY\s*=\s*["']?([^"'\r\n]+)/m)
    if (m?.[1]) candidates.push([f, m[1].trim()])
  }
  if (candidates.length === 0) throw new Error('no OPENAI_API_KEY in the environment, .env.local or .env')

  const rejected = []
  for (const [where, k] of candidates) {
    const res = await fetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${k}` } })
    if (res.ok) {
      if (rejected.length > 0) process.stdout.write(`  (ignored a rejected key in ${rejected.join(', ')})\n`)
      process.stdout.write(`  using the key from ${where}\n\n`)
      return k
    }
    rejected.push(`${where} (${res.status})`)
  }
  throw new Error(`every key was rejected: ${rejected.join(', ')}`)
}

/**
 * How many times one image is attempted before it is given up on.
 *
 * The endpoint allows five images a minute for the whole organisation, which parallel lanes will
 * step over now and then however carefully their number is picked. A 429 is therefore normal
 * traffic, not an error: the response says how long to wait, so the image waits that long and
 * asks again instead of being reported as a failure and redrawn by hand later. The jitter
 * matters — without it every lane rejected in the same minute wakes in the same instant and
 * collides again.
 */
const ATTEMPTS = 6

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** One image, as a PNG buffer. `size` is the API's own, e.g. `1024x1024` or `1024x1536`. */
async function image(prompt, { size = '1024x1024', background = 'transparent', quality = 'high' } = {}, apiKey) {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: MODEL, prompt, size, background, quality, n: 1 }),
    })

    if (res.ok) {
      const body = await res.json()
      const b64 = body.data?.[0]?.b64_json
      if (!b64) throw new Error(`no image in response: ${JSON.stringify(body).slice(0, 200)}`)
      return Buffer.from(b64, 'base64')
    }

    const text = await res.text()
    if (res.status !== 429 || attempt >= ATTEMPTS) {
      throw new Error(`${res.status} ${text.replace(/\s+/g, ' ').slice(0, 200)}`)
    }
    const asked = Number(/try again in ([\d.]+)s/.exec(text)?.[1] ?? 0)
    await sleep(Math.max(asked + 1, 8 * attempt) * 1000 + Math.random() * 3000)
  }
}

/**
 * How many images are in flight at once. `LANES=1 node tools/gen-*.mjs` to go back to one.
 *
 * Three, not more, because the ceiling is the organisation's five images a minute and not this
 * machine: three lanes of roughly forty-second requests sit just under it, where four sat just
 * over and spent the difference on backoff. Nothing is won by asking faster than the endpoint
 * will answer.
 */
const LANES = Number(process.env['LANES'] ?? 3)

/**
 * Run `make(job)` over every job, a few at a time. Returns how many returned true.
 *
 * `make` is expected to report its own outcome and swallow its own failure, because a run of
 * fifty that dies on the eleventh has spent money on ten and left the set half-redrawn — worse
 * than a run that finishes and names the three that need another go.
 */
async function runAll(jobs, make) {
  let next = 0
  let made = 0
  const lane = async () => {
    for (let i = next++; i < jobs.length; i = next++) {
      if (await make(jobs[i])) made += 1
    }
  }
  await Promise.all(Array.from({ length: Math.min(LANES, jobs.length) }, lane))
  return made
}

export { MODEL, key, image, runAll }
