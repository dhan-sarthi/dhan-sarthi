/**
 * Post-build check: no synthetic customer reaches the console's bundle.
 *
 * `apps/rm` never imports `@dhan/fixtures` and never inlines a persona string; every customer it
 * shows arrives over `/api/v1/rm/*`. This proves it on the built output rather than trusting the
 * import graph. Every file in `dist/` is searched, not just the entry chunk: the console has no
 * lazy chunk that is allowed to carry them.
 *
 * Markers are string literals from `packages/fixtures/src/personas.ts` that minification cannot
 * remove: the masked account number the generator stamps on a savings account, and the three
 * employer names `infra/scripts/deploy-web.sh` already guards the mobile export with. A hit is a
 * leak.
 *
 * It also checks that the dev-only component kit (`/kit`) stayed out of the production build, by
 * its page title.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

const FIXTURE_MARKERS = [
  'XXXXXX7412',
  'Acme Technologies Pvt Ltd',
  'Zeta Consulting India',
  'Kumar Hardware & Sanitary',
]
const KIT_MARKER = 'RM Desk component kit'

function fail(line) {
  process.stderr.write(`check-bundle: ${line}\n`)
  process.exit(1)
}

function listFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...listFiles(full))
    else if (/\.(js|mjs|css|html|json|map|txt|svg)$/.test(name)) out.push(full)
  }
  return out
}

try {
  statSync(join(DIST, 'index.html'))
} catch {
  fail(`no build at ${DIST}; run vite build first`)
}

const files = listFiles(DIST).filter((f) => !f.endsWith('.map'))
for (const file of files) {
  const src = readFileSync(file, 'utf8')
  for (const marker of FIXTURE_MARKERS) {
    if (src.includes(marker)) {
      fail(`@dhan/fixtures data in ${relative(DIST, file)} (marker "${marker}")`)
    }
  }
  if (src.includes(KIT_MARKER)) {
    fail(`the dev-only component kit is in the production build (${relative(DIST, file)})`)
  }
}

process.stdout.write(
  `check-bundle: ${files.length} file${files.length === 1 ? '' : 's'} clean of fixtures, no kit\n`,
)
