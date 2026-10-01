/**
 * The call queue's order, exactly as the spec writes it: open handoffs oldest first, then one
 * top signal per customer by the engine's own ranking. Each customer's insights come from the
 * real `findInsights` over a testkit snapshot, so the ranking under test is the engine's.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findInsights } from '../insights.ts'
import { snapshot } from '../snapshot.testkit.ts'
import type { SnapshotOverrides } from '../snapshot.testkit.ts'
import { callQueue } from './queue.ts'
import type { QueueCustomer, QueueHandoff } from './queue.ts'
import type { Segment } from './segment.ts'

const QUIET: SnapshotOverrides = { balances: { idleMonths: 0 } }

function customer(
  cif: string,
  name: string,
  segment: Segment,
  overrides: SnapshotOverrides,
): QueueCustomer {
  const base = { ...QUIET, ...overrides }
  return {
    cif,
    name,
    segment,
    insights: findInsights(
      snapshot({ ...base, balances: { ...QUIET.balances, ...overrides.balances } }),
    ),
  }
}

const card = customer('C1', 'Karan Mehta', 'affluent', {
  debt: { total: 1_86_240, hasHighInterest: true, highInterestTotal: 1_86_240, highestRate: 34.8 },
})
const deposit = customer('C2', 'Rohan Verma', 'mass', {
  balances: {
    maturingSoon: {
      accountType: 'FD',
      amount: 2_00_000,
      maturityDate: '2026-09-06',
      daysLeft: 5,
      interestRate: 7.1,
    },
  },
})
const idle = customer('C3', 'Anita Rao', 'priority', {
  balances: { idleFloor: 6_00_000, idleMonths: 9 },
})
const nothing = customer('C4', 'Sunil Patil', 'mass', {})
const cover = customer('C5', 'Priya Nair', 'mass', {
  protection: {
    dependents: 2,
    lifeCoverInForce: 0,
    lifeCoverNeeded: 1_20_00_000,
    gap: 1_20_00_000,
  },
})

const handoff = (
  id: string,
  cif: string,
  requestedOn: string,
  waitingDays: number,
  status: QueueHandoff['status'] = 'open',
): QueueHandoff => ({ id, cif, name: cif, requestedOn, waitingDays, status })

const handoffs: QueueHandoff[] = [
  handoff('D-late', 'C4', '2026-08-28', 4),
  handoff('D-first', 'C3', '2026-08-25', 7),
  // A second request from the same customer is not a second row.
  handoff('D-again', 'C3', '2026-08-30', 2),
  // Already called back.
  handoff('D-done', 'C1', '2026-08-20', 12, 'contacted'),
  // Outside the book handed in.
  handoff('D-stranger', 'C9', '2026-08-01', 31),
]

const queue = callQueue([cover, idle, nothing, deposit, card], handoffs)

describe('callQueue', () => {
  it('puts open handoffs first, oldest first, then signals in the engine’s ranking', () => {
    assert.deepEqual(
      queue.map((q) => [q.cif, q.source]),
      [
        ['C3', 'handoff'],
        ['C4', 'handoff'],
        // Urgent, then important with a deadline inside 14 days, then important by waterfall.
        ['C1', 'signal'],
        ['C2', 'signal'],
        ['C5', 'signal'],
      ],
    )
  })

  it('carries the customer’s top signal on their handoff row instead of listing them twice', () => {
    const row = queue[0]
    assert.equal(row?.id, 'handoff:D-first')
    assert.equal(row?.signal?.kind, 'idle_cash')
    assert.equal(
      row?.why,
      'Waiting 7 days for a call, asked through Uday; top issue: ₹6L idle in savings for 9 months.',
    )
    assert.equal(row?.opener, 'Anita, calling back on the request made through Uday.')
    assert.equal(queue.filter((q) => q.cif === 'C3').length, 1)
  })

  it('keeps a handoff with nothing behind it, with no signal', () => {
    const row = queue[1]
    assert.equal(row?.signal, null)
    assert.equal(row?.why, 'Waiting 4 days for a call, asked through Uday.')
    assert.equal(row?.initials, 'SP')
    assert.equal(row?.segment, 'mass')
  })

  it('gives each signal row its figure-first reason and opener', () => {
    const row = queue.find((q) => q.cif === 'C1')
    assert.equal(row?.id, 'signal:C1:expensive_debt')
    assert.equal(row?.signal?.title, 'Card at 34.8% — ₹1.86L outstanding')
    assert.equal(row?.why, '₹1,86,240 on a card at 34.8% costs ₹5,401 a month in interest.')
    assert.equal(
      row?.opener,
      '₹5,401 a month is going on card interest. Shall we plan to clear it?',
    )
  })

  it('never says "you" in a reason or an opener', () => {
    for (const q of queue) {
      assert.doesNotMatch(`${q.why} ${q.opener}`, /\byou(r)?\b/i, q.id)
    }
  })

  it('leaves out customers with nothing to say and no request', () => {
    const only = callQueue([nothing], [])
    assert.deepEqual(only, [])
  })

  it('breaks a tie between equal signals by name, so the order is stable', () => {
    const twin = { ...idle, cif: 'C6', name: 'Aarti Shah' }
    const order = callQueue([idle, twin], []).map((q) => q.name)
    assert.deepEqual(order, ['Aarti Shah', 'Anita Rao'])
  })

  it('stops at the limit', () => {
    assert.equal(callQueue([cover, idle, nothing, deposit, card], handoffs, { limit: 3 }).length, 3)
    assert.equal(callQueue([card], [], { limit: 0 }).length, 0)
  })
})
