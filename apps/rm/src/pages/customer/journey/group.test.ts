import type { JourneyEvent } from '@dhan/contracts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  OUTCOME_WORDS,
  byMonth,
  countBy,
  diffSummary,
  diffValue,
  foldReviews,
  isRoutineReview,
  matches,
  monthHeading,
  netChange,
  splitDecision,
  titleHasAmount,
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

/* A monthly review as the API writes it: the engine, from the statements, a figure re-sized. */
function review(id: string, at: string, before: number, after: number): JourneyEvent {
  return event({
    id,
    at,
    detail: `Plan refreshed with the statements to ${at}.`,
    diff: [{ field: 'Monthly commitment', before, after }],
  })
}

test('a review from the statements that only re-sizes figures is routine; anything else is not', () => {
  assert.equal(isRoutineReview(review('a', '2026-08-06', 8204, 9126)), true)
  assert.equal(
    isRoutineReview(
      event({
        detail: 'Plan refreshed for August 2026, with July’s statements.',
        diff: [
          {
            field: 'Current stage',
            before: 'Free up about ₹2,535 a month',
            after: 'Free up about ₹2,472 a month',
          },
        ],
      }),
    ),
    true,
  )
  // A stage of a different kind is a milestone, not a review.
  assert.equal(
    isRoutineReview(
      event({
        detail: 'Plan refreshed for November 2025, with October’s statements.',
        diff: [
          {
            field: 'Current stage',
            before: 'Build ₹2,16,375 they can reach',
            after: 'Free up about ₹2,907 a month',
          },
        ],
      }),
    ),
    false,
  )
  assert.equal(
    isRoutineReview(
      event({ title: 'First plan', detail: 'First plan, built from the statements on file.' }),
    ),
    false,
  )
  // The customer caused it.
  assert.equal(
    isRoutineReview(
      event({
        detail: 'Plan refreshed after they passed on "Sweep ₹5,92,984 into a deposit".',
        diff: [{ field: 'Monthly commitment', before: 1, after: 2 }],
      }),
    ),
    false,
  )
  assert.equal(
    isRoutineReview(
      event({
        detail: 'Plan refreshed with the latest statements.',
        diff: [{ field: 'Goal', before: 'Retirement', after: 'Clear expensive debt' }],
      }),
    ),
    false,
  )
  assert.equal(isRoutineReview(event({ kind: 'decision', detail: 'Plan refreshed for x' })), false)
})

test('foldReviews folds a run of reviews into one row where the newest stood', () => {
  const events = [
    event({ id: 'd3', kind: 'decision', at: '2026-08-06', source: 'customer' }),
    review('r3', '2026-08-06', 8204, 9126),
    event({ id: 'h', kind: 'handoff', at: '2026-07-06', source: 'customer' }),
    review('r2', '2026-07-06', 5716, 8204),
    review('r1', '2026-06-06', 6980, 5716),
    event({
      id: 'first',
      title: 'First plan',
      at: '2025-09-06',
      detail: 'First plan, built from the statements on file.',
    }),
    review('r0', '2025-08-06', 1, 2),
  ]
  const rows = foldReviews(events)
  assert.deepEqual(
    rows.map((r) => (r.type === 'reviews' ? r.events.map((e) => e.id).join('+') : r.id)),
    // The first plan breaks the run, and a run of one is left alone.
    ['d3', 'r3+r2+r1', 'h', 'first', 'r0'],
  )
  assert.equal(rows[1]?.at, '2026-08-06')
  // The rows group by month like the events they stand for.
  assert.deepEqual(
    byMonth(rows).map((g) => [g.month, g.events.length]),
    [
      ['2026-08', 2],
      ['2026-07', 1],
      ['2025-09', 1],
      ['2025-08', 1],
    ],
  )
})

test('netChange runs from the oldest review’s before to the newest one’s after', () => {
  assert.deepEqual(
    netChange([review('r3', '2026-08-06', 8204, 9126), review('r2', '2026-07-06', 5716, 8204)]),
    [{ field: 'Monthly commitment', before: 5716, after: 9126 }],
  )
})

test('two deferrals read as two different words, and a title that names the amount is not repeated', () => {
  assert.notEqual(OUTCOME_WORDS['Put off'].word, OUTCOME_WORDS['Pushed back'].word)
  assert.equal(titleHasAmount('Pay ₹21,126 off the card', 21126), true)
  assert.equal(titleHasAmount('Sweep ₹11,10,510 into a deposit', 1110510), true)
  assert.equal(titleHasAmount('Check their subscriptions', 500), false)
  assert.equal(titleHasAmount('Check their subscriptions', null), false)
})
