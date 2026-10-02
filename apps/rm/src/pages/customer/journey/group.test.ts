import type { JourneyEvent } from '@dhan/contracts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  byMonth,
  countBy,
  diffSummary,
  diffValue,
  matches,
  monthHeading,
  splitDecision,
} from './group.ts'

/* An event built from literals: only what a test names differs from a quiet default. */
function event(overrides: Partial<JourneyEvent> = {}): JourneyEvent {
  return {
    id: 'e1',
    at: '2026-08-01',
    kind: 'plan',
    source: 'engine',
    title: 'Plan updated',
    detail: null,
    diff: null,
    verdict: null,
    ruleId: null,
    amount: null,
    ...overrides,
  }
}

test('byMonth keeps the order it was given and starts a group at each new month', () => {
  const groups = byMonth([
    event({ id: 'a', at: '2026-09-01' }),
    event({ id: 'b', at: '2026-08-29' }),
    event({ id: 'c', at: '2026-08-01' }),
    event({ id: 'd', at: '2018-04-16', kind: 'joined' }),
  ])
  assert.deepEqual(
    groups.map((g) => [g.month, g.events.map((e) => e.id)]),
    [
      ['2026-09', ['a']],
      ['2026-08', ['b', 'c']],
      ['2018-04', ['d']],
    ],
  )
})

test('monthHeading spells the month out', () => {
  assert.equal(monthHeading('2026-09'), 'September 2026')
  assert.equal(monthHeading('2025-12'), 'December 2025')
})

test('calls, notes and contacts filter together; joining is only under All', () => {
  const events = [
    event({ kind: 'call' }),
    event({ kind: 'note' }),
    event({ kind: 'contact' }),
    event({ kind: 'joined' }),
    event({ kind: 'advice' }),
  ]
  const counts = countBy(events)
  assert.equal(counts.all, 5)
  assert.equal(counts.touch, 3)
  assert.equal(counts.advice, 1)
  assert.equal(counts.plan, 0)
  assert.equal(matches('touch', event({ kind: 'contact' })), true)
  assert.equal(matches('touch', event({ kind: 'joined' })), false)
  assert.equal(matches('all', event({ kind: 'joined' })), true)
})

test('diffSummary says what moved, and "Set" for a first plan', () => {
  assert.equal(
    diffSummary([{ field: 'Current stage', before: 'a', after: 'b' }]),
    'Changed current stage',
  )
  assert.equal(
    diffSummary([
      { field: 'Goal', before: null, after: 'Retire' },
      { field: 'Goal amount', before: null, after: 1 },
      { field: 'Current stage', before: null, after: 'x' },
      { field: 'Monthly commitment', before: null, after: 2 },
    ]),
    'Set goal, goal amount and 2 more',
  )
  assert.equal(
    diffSummary([
      { field: 'Goal', before: 'a', after: 'b' },
      { field: 'Goal amount', before: 1, after: 2 },
    ]),
    'Changed goal and goal amount',
  )
})

test('diffValue reads a number as rupees only where the field names money', () => {
  assert.equal(diffValue('Goal amount', 4482448), '₹44,82,448')
  assert.equal(diffValue('Monthly commitment', 12000), '₹12,000')
  assert.equal(diffValue('Dependents', 3), '3')
  assert.equal(diffValue('Current stage', 'Free up ₹2,472'), 'Free up ₹2,472')
  assert.equal(diffValue('Goal', null), null)
})

test('splitDecision draws the outcome apart from what was decided', () => {
  assert.deepEqual(splitDecision('Put off: Pay ₹21,126 off the card'), {
    outcome: 'Put off',
    rest: 'Pay ₹21,126 off the card',
  })
  assert.deepEqual(splitDecision('Did it: Cap Cash at ₹500 a month'), {
    outcome: 'Did it',
    rest: 'Cap Cash at ₹500 a month',
  })
  assert.deepEqual(splitDecision('Something else: entirely'), {
    outcome: null,
    rest: 'Something else: entirely',
  })
})
