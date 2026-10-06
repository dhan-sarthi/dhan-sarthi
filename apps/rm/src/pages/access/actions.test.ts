import type { AccessEntry } from '@dhan/contracts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ACTIONS, ACTION_WORDS, foldRuns, isDefaultPurpose, spanLabel } from './actions.ts'

function entry(overrides: Partial<AccessEntry> = {}): AccessEntry {
  return {
    id: 'a',
    at: '2026-10-02T02:45:15.000Z',
    cif: 'IDBI0003308471',
    name: 'Karan Deshpande',
    action: 'viewed',
    purpose: 'Relationship review',
    detail: null,
    ...overrides,
  }
}

test('every action has words, and a refused attempt is not called "Refused"', () => {
  for (const action of ACTIONS) assert.ok(ACTION_WORDS[action].sentence.length > 0, action)
  assert.equal(ACTION_WORDS.denied.tab, 'Denied')
  assert.notEqual(ACTION_WORDS.denied.sentence, 'Refused')
})

test('the purpose the console sends by default is marked as one', () => {
  assert.equal(isDefaultPurpose(entry()), true)
  assert.equal(isDefaultPurpose(entry({ purpose: 'Customer asked about a top-up' })), false)
  assert.equal(isDefaultPurpose(entry({ action: 'revealed', detail: 'dateOfBirth' })), false)
  assert.equal(isDefaultPurpose(entry({ action: 'denied', detail: 'Customer file' })), true)
  assert.equal(
    isDefaultPurpose(entry({ action: 'denied', purpose: 'Open the journey', detail: null })),
    false,
  )
})

test('foldRuns folds the same thing done to the same file, and keeps every entry', () => {
  const rows = foldRuns([
    entry({ id: 'v3', at: '2026-10-02T02:45:15.000Z' }),
    entry({ id: 'v2', at: '2026-10-02T02:45:11.000Z' }),
    entry({ id: 'v1', at: '2026-10-02T02:44:51.000Z' }),
    entry({ id: 'r', at: '2026-10-02T02:44:40.000Z', action: 'revealed', detail: 'dateOfBirth' }),
    entry({ id: 'v0', at: '2026-10-02T02:44:30.000Z' }),
    // Another customer breaks the run, and so does an hour's gap.
    entry({ id: 's', at: '2026-10-02T02:44:20.000Z', cif: 'IDBI1', name: 'Sneha' }),
    entry({ id: 'v-1', at: '2026-10-02T01:00:00.000Z' }),
    entry({ id: 'v-2', at: '2026-10-02T00:59:00.000Z' }),
    entry({ id: 'v-3', at: '2026-10-01T23:00:00.000Z' }),
  ])
  assert.deepEqual(
    rows.map((r) => r.entries.map((e) => e.id)),
    [['v3', 'v2', 'v1'], ['r'], ['v0'], ['s'], ['v-1', 'v-2'], ['v-3']],
  )
  assert.equal(rows[0]?.entry.id, 'v3')
  assert.equal(
    rows.reduce((n, r) => n + r.entries.length, 0),
    9,
  )
})

test('a run reads as a span of minutes, or of seconds inside one minute; one entry keeps its second', () => {
  const run = [entry({ at: '2026-10-02T02:45:15.000Z' }), entry({ at: '2026-10-02T02:44:51.000Z' })]
  const span = spanLabel(run)
  assert.match(span, /–/)
  assert.ok(!/:\d\d:\d\d/.test(span), span)
  assert.match(spanLabel([entry()]), /:\d\d:\d\d/)
  // Inside one minute, the seconds stay.
  const quick = spanLabel([
    entry({ at: '2026-10-02T02:44:42.000Z' }),
    entry({ at: '2026-10-02T02:44:39.000Z' }),
  ])
  assert.match(quick, /:39–.*:42/)
})
