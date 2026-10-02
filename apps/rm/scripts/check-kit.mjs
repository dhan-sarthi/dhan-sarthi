/**
 * Build check: every export of the component kit (`src/ui/index.ts`) is used by the console.
 *
 * The kit drifted page by page before this existed: a page needed one thing a kit component did
 * not do, rebuilt it locally, and the original stayed in `ui/` with `/kit` its only caller, so the
 * style guide described components production did not use and a fix made in the kit never reached
 * a screen. The rule now is to extend the kit, never fork it, and this fails the build on a kit
 * export that nothing outside `ui/`, the style guide (`pages/Kit.tsx`) and the tests imports.
 *
 * `PENDING` lists the exports added for pages to adopt, each with the page that will. A page that
 * adopts one removes it from the list; an entry that has been adopted fails the check too, so the
 * list cannot outlive its reason.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const BARREL = join(SRC, 'ui', 'index.ts')

/** Kit exports waiting for a page to adopt them: name → who adopts it. */
const PENDING = {}

function fail(lines) {
  process.stderr.write(`check-kit:\n  ${lines.join('\n  ')}\n`)
  process.exit(1)
}

/** The value names the barrel exports (types are free: they cost nothing at runtime). */
function barrelExports() {
  const src = readFileSync(BARREL, 'utf8')
  const names = []
  for (const match of src.matchAll(/export\s*\{([^}]*)\}\s*from/g)) {
    for (const raw of match[1].split(',')) {
      const part = raw.trim()
      if (!part || part.startsWith('type ')) continue
      const name = part
        .split(/\s+as\s+/)
        .pop()
        ?.trim()
      if (name) names.push(name)
    }
  }
  return names
}

function listSources(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...listSources(full))
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

/** Every name a production file outside `ui/` imports from the kit's barrel. */
function usedNames() {
  const used = new Set()
  for (const file of listSources(SRC)) {
    const rel = relative(SRC, file)
    if (rel.startsWith(`ui${'/'}`) || rel === join('pages', 'Kit.tsx') || /\.test\.tsx?$/.test(rel))
      continue
    const src = readFileSync(file, 'utf8')
    for (const match of src.matchAll(/import\s*(type\s*)?\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
      if (match[1] || !/(^|\/)ui\/index\.ts$/.test(match[3])) continue
      for (const raw of match[2].split(',')) {
        const part = raw.trim()
        if (!part || part.startsWith('type ')) continue
        used.add(part.split(/\s+as\s+/)[0].trim())
      }
    }
  }
  return used
}

const exported = barrelExports()
const used = usedNames()
const unused = exported.filter((name) => !used.has(name) && !(name in PENDING))
const adopted = Object.keys(PENDING).filter((name) => used.has(name))
const stale = Object.keys(PENDING).filter((name) => !exported.includes(name))

const problems = [
  ...unused.map(
    (name) =>
      `${name} is exported by ui/index.ts but no page, feature or shell file imports it: use it, or delete it`,
  ),
  ...adopted.map((name) => `${name} is in use now: take it off PENDING in scripts/check-kit.mjs`),
  ...stale.map((name) => `${name} is on PENDING but the kit no longer exports it`),
]
if (problems.length > 0) fail(problems)

process.stdout.write(
  `check-kit: ${exported.length} kit exports, all in use${
    Object.keys(PENDING).length > 0 ? ` (${Object.keys(PENDING).length} awaiting adoption)` : ''
  }\n`,
)
