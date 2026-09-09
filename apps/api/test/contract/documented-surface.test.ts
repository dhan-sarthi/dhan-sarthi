/**
 * The API surface table in the architecture doc, against the registry.
 *
 * Written after finding that doc describing "the 28 routes" of an API that had grown to
 * forty-two, and a source tree listing files deleted months earlier. A document nobody can
 * trust is worse than no document: a reviewer who checks one claim and finds it stale stops
 * checking the rest.
 *
 * Only the table is checked, and only for coverage in both directions. Prose about a route is
 * a judgement and cannot be asserted; the existence of a row for it can.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { ROUTES } from '@dhan/contracts'

const DOC = fileURLToPath(new URL('../../../../docs/architecture/DATA-AND-API.md', import.meta.url))

/** `| GET | \`/api/v1/view\` | …` — the first two cells of a table row. */
const ROW = /^\|\s*(GET|POST|PATCH|PUT|DELETE)\s*\|\s*`([^`]+)`\s*\|/gm

describe('the documented API surface', () => {
  const markdown = readFileSync(DOC, 'utf8')
  const documented = new Set<string>()
  for (const m of markdown.matchAll(ROW)) documented.add(`${m[1]} ${m[2]}`)
  const declared = new Set(ROUTES.map((r) => `${r.method} ${r.path}`))

  it('documents every route the registry declares', () => {
    assert.deepEqual(
      [...declared].filter((r) => !documented.has(r)).sort(),
      [],
      'routes in the registry with no row in docs/architecture/DATA-AND-API.md',
    )
  })

  it('documents no route the registry does not declare', () => {
    assert.deepEqual(
      [...documented].filter((r) => !declared.has(r)).sort(),
      [],
      'rows in docs/architecture/DATA-AND-API.md for routes that do not exist',
    )
  })
})
