/**
 * The household's arithmetic, and the line between what is computed and what is invented.
 *
 * The screens over this module are markup. What can be wrong here without anybody noticing is the
 * same short list every money surface has — a total that double-counts, a gain quoted over rows
 * that carry no cost, a cover figure added to capital — plus one that is specific to this feature
 * and is the reason the feature needed a decision written about it: **the split between the
 * customer's real figures and the demo members'**. If `realValue` ever drifts into including a
 * demo person, the hero card starts telling a lie in a sentence that reads as a reassurance.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { HoldingRecordResponse, HoldingsResponse } from '@dhan/contracts'
import { portfolioOf } from '../dashboard/portfolio.ts'
import {
  addDays,
  DEFAULT_LINKED,
  DEMO_MEMBERS,
  DEMO_REQUESTS,
  householdOf,
  isCustomerId,
  maskCustomerId,
} from './household.ts'

const SELF = { id: 'self', name: 'Priya Nair' }

type Row = HoldingRecordResponse

function holding(over: Partial<Row> & Pick<Row, 'name'>): Row {
  return {
    holdingId: over.name,
    holdingType: 'MUTUAL_FUND',
    assetClass: 'Equity',
    investedAmount: 0,
    currentValue: 0,
    sipActive: false,
    ...over,
  }
}

const held = (holdings: Row[] = [], policies: Row[] = []): HoldingsResponse => ({
  holdings,
  policies,
  updatedAt: '2026-09-01T00:00:00.000Z',
  totalValue: holdings.reduce((n, h) => n + h.currentValue, 0),
  editable: true,
})

test('with no holdings block the self member is present and empty', () => {
  const h = householdOf(SELF, null, [])
  assert.equal(h.members.length, 1)
  assert.equal(h.members[0]?.self, true)
  assert.equal(h.value, 0)
  assert.equal(h.realValue, 0)
  assert.equal(h.demoValue, 0)
  assert.equal(h.demoMembers, 0)
})

test('realValue is the self member and nothing else', () => {
  const p = portfolioOf(
    held([holding({ name: 'Index fund', currentValue: 250000, investedAmount: 200000 })]),
  )
  const h = householdOf(SELF, p)
  assert.equal(h.realValue, 250000)
  assert.equal(h.demoMembers, DEFAULT_LINKED.length)
  assert.ok(h.demoValue > 0)
  assert.equal(h.realValue + h.demoValue, h.value)
})

test('the household total is the sum of its members, counted once', () => {
  const p = portfolioOf(
    held([holding({ name: 'Index fund', currentValue: 250000, investedAmount: 200000 })]),
  )
  const h = householdOf(SELF, p)
  assert.equal(
    h.value,
    h.members.reduce((n, m) => n + m.value, 0),
  )
  assert.equal(
    h.holdings.length,
    h.members.reduce((n, m) => n + m.holdings.length, 0),
  )
})

test('cover never reaches the household total', () => {
  const p = portfolioOf(
    held(
      [holding({ name: 'Index fund', currentValue: 100000, investedAmount: 100000 })],
      [
        holding({
          name: 'Term cover',
          holdingType: 'INSURANCE',
          assetClass: 'Protection',
          currentValue: 0,
          investedAmount: 10000000,
        }),
      ],
    ),
  )
  const h = householdOf(SELF, p, [])
  assert.equal(h.realValue, 100000)
  assert.equal(
    h.holdings.every((row) => row.group !== 'cover'),
    true,
  )
})

test('a gain is quoted only over the rows that carry a cost', () => {
  const p = portfolioOf(
    held([
      holding({ name: 'Priced fund', currentValue: 120000, investedAmount: 100000 }),
      /* No cost recorded. Its value must stay out of the gain, not be compared against zero. */
      holding({ name: 'Unpriced fund', currentValue: 500000, investedAmount: 0 }),
    ]),
  )
  const h = householdOf(SELF, p, [])
  assert.equal(h.value, 620000)
  assert.equal(h.invested, 100000)
  assert.equal(h.gain, 20000)
  assert.equal(h.gainPct, 20)
})

test('a household with no cost recorded anywhere quotes no gain at all', () => {
  const p = portfolioOf(
    held([holding({ name: 'Index fund', currentValue: 90000, investedAmount: 0 })]),
  )
  const h = householdOf(SELF, p, [])
  assert.equal(h.invested, null)
  assert.equal(h.gain, null)
  assert.equal(h.gainPct, null)
})

test('every demo row is marked as one and every own row is not', () => {
  const p = portfolioOf(
    held([holding({ name: 'Index fund', currentValue: 1000, investedAmount: 1000 })]),
  )
  const h = householdOf(SELF, p)
  assert.equal(h.holdings.filter((row) => row.real).length, 1)
  assert.equal(h.members.filter((m) => m.real).length, 1)
  assert.equal(h.members.filter((m) => !m.real).length, DEFAULT_LINKED.length)
})

test('unlinking a demo member removes it from the total and from the rows', () => {
  const all = householdOf(SELF, null)
  const one = DEMO_MEMBERS[0]
  assert.ok(one)
  const fewer = householdOf(
    SELF,
    null,
    DEFAULT_LINKED.filter((id) => id !== one.id),
  )
  assert.equal(fewer.demoMembers, all.demoMembers - 1)
  assert.ok(fewer.value < all.value)
  assert.equal(
    fewer.holdings.some((row) => row.memberId === one.id),
    false,
  )
})

test('the chip row lists only groups the household actually holds', () => {
  const h = householdOf(SELF, null, [])
  assert.deepEqual(h.groups, [])
  const p = portfolioOf(
    held([
      holding({ name: 'Deposit', holdingType: 'FD', currentValue: 5000, investedAmount: 5000 }),
    ]),
  )
  assert.deepEqual(
    householdOf(SELF, p, []).groups.map((g) => g.id),
    ['deposits'],
  )
})

test('the cooldown date is five days on from the simulated clock, in UTC', () => {
  assert.equal(addDays('2025-02-26', 5), '2025-03-03')
  assert.equal(addDays('2024-02-26', 5), '2024-03-02')
  assert.equal(addDays('2025-12-30', 5), '2026-01-04')
})

test('a Customer ID is masked to what was actually typed', () => {
  assert.equal(maskCustomerId('129209661'), '••••9661')
  assert.equal(maskCustomerId('661'), '••••661')
  assert.equal(maskCustomerId('1292 0966 1'), '••••9661')
})

test('the only check on a Customer ID is its shape', () => {
  assert.equal(isCustomerId('129209661'), true)
  assert.equal(isCustomerId(' 12920966 '), true)
  assert.equal(isCustomerId('1292'), false)
  assert.equal(isCustomerId('12920966a'), false)
  assert.equal(isCustomerId(''), false)
})

test('a request is a demo member who is not linked yet, so accepting links that person', () => {
  /* The id is shared on purpose: `Accept` is `linked + request.id`, and it must not be possible
     for the button with somebody's name on it to add anybody else. */
  for (const request of DEMO_REQUESTS) {
    const member = DEMO_MEMBERS.find((m) => m.id === request.id)
    assert.ok(member, `${request.name} has no member record`)
    assert.equal(member.name, request.name)
    assert.equal(DEFAULT_LINKED.includes(request.id), false)

    const before = householdOf(SELF, null)
    const after = householdOf(SELF, null, [...DEFAULT_LINKED, request.id])
    assert.equal(after.demoMembers, before.demoMembers + 1)
    assert.ok(after.members.some((m) => m.name === request.name))
  }
})

test('every demo member is either linked by default or waiting as a request', () => {
  const accounted = new Set([...DEFAULT_LINKED, ...DEMO_REQUESTS.map((r) => r.id)])
  assert.equal(accounted.size, DEMO_MEMBERS.length)
})
