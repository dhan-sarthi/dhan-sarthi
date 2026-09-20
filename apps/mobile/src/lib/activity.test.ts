import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { groupByDay } from './activity.ts'

const d = (atSim: string, amount: number) => ({ atSim, amount })

describe('groupByDay', () => {
  it('puts every deposit from one day under one heading', () => {
    const out = groupByDay([d('2026-09-14', 40), d('2026-09-12', 10), d('2026-09-14', 25)])
    assert.deepEqual(
      out.map((g) => [g.date, g.items.length]),
      [
        ['2026-09-14', 2],
        ['2026-09-12', 1],
      ],
    )
  })

  it('orders the days newest first, across a month and a year boundary', () => {
    const out = groupByDay([
      d('2026-09-30', 1),
      d('2027-01-02', 2),
      d('2026-10-01', 3),
      d('2026-12-31', 4),
    ])
    assert.deepEqual(
      out.map((g) => g.date),
      ['2027-01-02', '2026-12-31', '2026-10-01', '2026-09-30'],
    )
  })

  it('keeps the server’s order within a day', () => {
    const out = groupByDay([d('2026-09-14', 40), d('2026-09-14', 25), d('2026-09-14', 10)])
    assert.deepEqual(
      out[0]?.items.map((i) => i.amount),
      [40, 25, 10],
    )
  })

  it('is empty for an empty pot, not a day with nothing in it', () => {
    assert.deepEqual(groupByDay([]), [])
  })
})
