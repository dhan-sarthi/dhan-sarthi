/**
 * Post-build check: the engine and the fixtures stay out of the main bundle.
 *
 * ADR-0001 moves `@dhan/core` and `@dhan/fixtures` into a lazy chunk under `src/offline/`. This
 * script proves it on the built output rather than trusting the import graph: it walks the
 * entry chunk and everything it imports statically and fails if a string that can only come from
 * those packages is present. With `VITE_OFFLINE_FALLBACK=false` — the bank build — the chunk
 * must be absent from `dist/` altogether, so the same markers are searched in every file.
 *
 * Markers are string literals minification cannot remove: the masked account number the
 * generator stamps on every synthetic savings account, and the projection disclaimer sentence
 * from core. The screens get both from the API, never from a literal, so a hit is a leak.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const MARKERS = [
  { text: 'XXXXXX7412', from: '@dhan/fixtures' },
  { text: 'Illustration only, on the assumed rate shown', from: '@dhan/core' },
]
const offlineAllowed = process.env['VITE_OFFLINE_FALLBACK'] !== 'false'

function say(line) {
  process.stdout.write(`${line}\n`)
}

function fail(line) {
  process.stderr.write(`check-bundle: ${line}\n`)
  process.exit(1)
}

function listJs(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...listJs(full))
    else if (name.endsWith('.js')) out.push(full)
  }
  return out
}

/** The chunks a file pulls in statically: `import"./x.js"`, `from"./x.js"`, `export*from"./x.js"`. */
function staticImports(file) {
  const src = readFileSync(file, 'utf8')
  const found = new Set()
  for (const m of src.matchAll(/(?:import|from)\s*["']([^"']+\.js)["']/g)) {
    found.add(resolve(dirname(file), m[1]))
  }
  return found
}

function entryChunk() {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8')
  const m = html.match(/<script[^>]+type="module"[^>]+src="([^"]+\.js)"/)
  if (!m) fail('no module script in dist/index.html')
  return join(DIST, m[1].replace(/^\//, ''))
}

function mainBundle() {
  const seen = new Set()
  const queue = [entryChunk()]
  while (queue.length > 0) {
    const file = queue.pop()
    if (seen.has(file)) continue
    seen.add(file)
    for (const dep of staticImports(file)) if (!seen.has(dep)) queue.push(dep)
  }
  return [...seen]
}

function hits(file) {
  const src = readFileSync(file, 'utf8')
  return MARKERS.filter((m) => src.includes(m.text))
}

try {
  statSync(DIST)
} catch {
  fail(`no build at ${DIST}; run vite build first`)
}

const main = mainBundle()
for (const file of main) {
  for (const h of hits(file)) {
    fail(`${h.from} is in the main bundle (${file.slice(DIST.length + 1)}, marker "${h.text}")`)
  }
}
say(`check-bundle: main bundle clean (${main.length} chunk${main.length === 1 ? '' : 's'})`)

const all = listJs(DIST)
const lazy = all.filter((f) => !main.includes(f) && hits(f).length > 0)
if (!offlineAllowed) {
  if (lazy.length > 0) {
    fail(
      `VITE_OFFLINE_FALLBACK=false but the offline chunk was built: ${lazy
        .map((f) => f.slice(DIST.length + 1))
        .join(', ')}`,
    )
  }
  say('check-bundle: offline chunk absent, as the bank build requires')
} else {
  say(
    lazy.length > 0
      ? `check-bundle: offline chunk present as a lazy import (${lazy.map((f) => f.slice(DIST.length + 1)).join(', ')})`
      : 'check-bundle: no offline chunk found (VITE_OFFLINE_FALLBACK is on; expected one)',
  )
  if (lazy.length === 0) process.exit(1)
}
