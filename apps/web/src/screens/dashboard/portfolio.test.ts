/**
 * The dashboard's arithmetic, which is the half of a portfolio screen that can be wrong quietly.
 *
 * Every case below is either a rule the Holdings and Analytics panes promise, or a way this data
 * differs from the reference's: cover that must never be added to capital, a gain that may only
 * be quoted over the rows carrying a cost, and a deposit held at IDBI that must not appear here
 * at all because it is already an account.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { HoldingRecordResponse, HoldingsResponse } from '@dhan/contracts'
import { portfolioOf } from './portfolio.ts'

type Row = HoldingRecordResponse

/** A row as `/holdings` returns one: a `Holding` plus the id the block keeps it under. */
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

const response = (holdings: Row[], policies: Row[] = []): HoldingsResponse => ({
  holdings,
  policies,
  updatedAt: '2026-09-01T00:00:00.000Z',
  totalValue: holdings.reduce((n, h) => n + h.currentValue, 0),
  editable: true,
})

describe('the total', () => {
  it('sums the recorded values and nothing else', () => {
    const p = portfolioOf(
      response([
        holding({ name: 'Index fund', currentValue: 300000 }),
        holding({ name: 'PPF', holdingType: 'PPF', assetClass: 'Debt', currentValue: 200000 }),
      ]),
    )
    assert.equal(p.total, 500000)
  })

  it('leaves a policy out of it — cover is not capital', () => {
    const p = portfolioOf(
      response(
        [holding({ name: 'Index fund', currentValue: 300000 })],
        [
          holding({
            name: 'Term cover',
            holdingType: 'INSURANCE',
            assetClass: 'Protection',
            currentValue: 5000000,
          }),
        ],
      ),
    )
    assert.equal(p.total, 300000)
    assert.equal(p.coverInForce, 5000000)
    assert.deepEqual(
      p.byGroup.map((s) => s.label),
      ['Mutual funds'],
    )
  })

  it('reads a negative or non-finite value as zero rather than shrinking the total', () => {
    const p = portfolioOf(
      response([
        holding({ name: 'Good', currentValue: 100000 }),
        holding({ name: 'Broken', currentValue: Number.NaN }),
        holding({ name: 'Worse', currentValue: -50000 }),
      ]),
    )
    assert.equal(p.total, 100000)
  })
})

describe('the gain', () => {
  it('is null where no row carries an invested amount', () => {
    const p = portfolioOf(response([holding({ name: 'Index fund', currentValue: 300000 })]))
    assert.equal(p.invested, null)
    assert.equal(p.gain, null)
    assert.equal(p.gainPct, null)
    assert.equal(p.unpriced, 1)
  })

  it('is taken only over the rows that have a cost, not over the whole group', () => {
    /* The bug this exists to stop: ₹4L of value against ₹1L of recorded cost reads as a 300%
       gain, when in truth one fund tripled and the other was never priced. */
    const p = portfolioOf(
      response([
        holding({ name: 'Priced', currentValue: 150000, investedAmount: 100000 }),
        holding({ name: 'Unpriced', currentValue: 250000 }),
      ]),
    )
    assert.equal(p.total, 400000)
    assert.equal(p.invested, 100000)
    assert.equal(p.gain, 50000)
    assert.equal(p.gainPct, 50)
    assert.equal(p.unpriced, 1)
  })

  it('goes negative when the value fell below the cost', () => {
    const p = portfolioOf(
      response([holding({ name: 'Down', currentValue: 80000, investedAmount: 100000 })]),
    )
    assert.equal(p.gain, -20000)
    assert.equal(p.gainPct, -20)
  })
})

describe('grouping', () => {
  it('drops a group with nothing in it rather than drawing an empty card', () => {
    const p = portfolioOf(response([holding({ name: 'Index fund', currentValue: 100000 })]))
    assert.deepEqual(
      p.groups.map((g) => g.id),
      ['funds'],
    )
  })

  it('keeps deposits, PPF and NPS apart, in reading order', () => {
    const p = portfolioOf(
      response([
        holding({ name: 'NPS', holdingType: 'NPS', assetClass: 'Equity', currentValue: 100000 }),
        holding({
          name: 'FD at another bank',
          holdingType: 'FD',
          assetClass: 'Debt',
          currentValue: 200000,
        }),
        holding({ name: 'Index fund', currentValue: 300000 }),
      ]),
    )
    assert.deepEqual(
      p.groups.map((g) => g.id),
      ['funds', 'deposits', 'retirement'],
    )
  })

  it('reads a policy the way the domain writes one — sum assured in investedAmount', () => {
    /* `derive.ts` sums `investedAmount` over the policies to get `lifeCoverInForce`, and a term
       plan's `currentValue` is 0 because pure cover has no surrender value. Read naively that is
       a holding worth nothing that has lost a crore, which is what this stops. */
    const p = portfolioOf(
      response(
        [],
        [
          holding({
            name: 'Term Life',
            holdingType: 'INSURANCE',
            assetClass: 'Protection',
            investedAmount: 10000000,
            currentValue: 0,
          }),
        ],
      ),
    )
    assert.equal(p.coverInForce, 10000000)
    assert.equal(p.groups[0]?.value, 10000000)
    assert.equal(p.groups[0]?.gain, null)
    assert.equal(p.groups[0]?.unpriced, 0)
    assert.equal(p.total, 0)
  })

  it('marks a cover group as cover, so its figure is never a value', () => {
    const p = portfolioOf(
      response(
        [],
        [
          holding({
            name: 'Term',
            holdingType: 'INSURANCE',
            assetClass: 'Protection',
            currentValue: 1,
          }),
        ],
      ),
    )
    assert.equal(p.groups[0]?.kind, 'cover')
  })
})

describe('the series the charts draw', () => {
  it('splits by asset class and drops the classes holding nothing', () => {
    const p = portfolioOf(
      response([
        holding({ name: 'Equity fund', currentValue: 300000 }),
        holding({ name: 'Debt fund', assetClass: 'Debt', currentValue: 100000 }),
      ]),
    )
    assert.deepEqual(p.byAssetClass, [
      { label: 'Equity', value: 300000 },
      { label: 'Debt', value: 100000 },
    ])
  })

  it('never puts a policy in the asset-class series', () => {
    const p = portfolioOf(
      response(
        [holding({ name: 'Equity fund', currentValue: 300000 })],
        [
          holding({
            name: 'Term',
            holdingType: 'INSURANCE',
            assetClass: 'Protection',
            currentValue: 5000000,
          }),
        ],
      ),
    )
    assert.deepEqual(
      p.byAssetClass.map((s) => s.label),
      ['Equity'],
    )
  })

  it('orders the exposure table by size, largest first', () => {
    const p = portfolioOf(
      response([
        holding({ name: 'Small', currentValue: 10000 }),
        holding({ name: 'Large', currentValue: 900000 }),
        holding({ name: 'Middle', currentValue: 100000 }),
      ]),
    )
    assert.deepEqual(
      p.largest.map((row) => row.name),
      ['Large', 'Middle', 'Small'],
    )
  })
})

describe('the monthly mandate', () => {
  it('counts only the rows whose SIP is running', () => {
    const p = portfolioOf(
      response([
        holding({ name: 'Running', currentValue: 1, sipActive: true, sipAmount: 5000 }),
        holding({ name: 'Paused', currentValue: 1, sipActive: false, sipAmount: 9000 }),
        holding({ name: 'None', currentValue: 1 }),
      ]),
    )
    assert.equal(p.sipCount, 1)
    assert.equal(p.sipMonthly, 5000)
  })
})
