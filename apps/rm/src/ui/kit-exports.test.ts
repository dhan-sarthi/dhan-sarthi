import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const CHECK = fileURLToPath(new URL('../../scripts/check-kit.mjs', import.meta.url))

test('every kit export is used by a page, a feature or the shell (scripts/check-kit.mjs)', () => {
  // Throws, with the check's own message, when an export is unused or PENDING is stale.
  const out = execFileSync(process.execPath, [CHECK], { encoding: 'utf8' })
  assert.match(out, /all in use/)
})
