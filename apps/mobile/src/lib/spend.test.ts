import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { monthsToClear } from '@dhan/core'
import { balanceByMonth, goingOutRows, monthlyByCategory, newestFirst } from './spend.ts'

describe('monthlyByCategory', () => {
  it('divides a running total down to a month', () => {
    // The figure the comment on this rule names: ₹93,234 of Shopping over 24 months.
    const { perMonth } = monthlyByCategory([['Shopping', 93_234]], 24)
    assert.deepEqual(perMonth, [['Shopping', 3_884.75]])
  })

  it('floors the divisor at one month, so a fresh account passes its totals through', () => {
    const { months, perMonth } = monthlyByCategory([['Eating out', 4_100]], 0)
    assert.equal(months, 1)
    assert.deepEqual(perMonth, [['Eating out', 4_100]])
  })

  it('floors a negative history too', () => {
    assert.equal(monthlyByCategory([], -3).months, 1)
  })

  it('answers 1 rather than -Infinity for an empty ledger', () => {
    const { perMonth, largest } = monthlyByCategory([], 12)
    assert.deepEqual(perMonth, [])
    assert.equal(largest, 1)
  })

  it('preserves order, because the snapshot already sorted it descending', () => {
    const { perMonth, largest } = monthlyByCategory(
      [
        ['Shopping', 24_000],
        ['Eating out', 12_000],
        ['Travel', 6_000],
      ],
      12,
    )
    assert.deepEqual(
      perMonth.map(([name]) => name),
      ['Shopping', 'Eating out', 'Travel'],
    )
    assert.equal(largest, 2_000)
  })
})

describe('goingOutRows', () => {
  // Karan's commitments (rr2-karan-view.json): a family transfer and a daycare fee, two
  // investment debits on the statement, ₹40,000 a month by his holdings, ₹22,501 of plan.
  const karan = {
    total: 119_308,
    rent: 42_000,
    emis: 30_288,
    bills: 4_759,
    obligations: 27_000,
    subscriptions: 3_261,
    investments: 12_000,
    series: [
      { kind: 'rent', category: 'Rent & bills' },
      { kind: 'obligation', category: 'Transfers' },
      { kind: 'obligation', category: 'Education' },
      { kind: 'sip', category: 'Investment' },
    ],
  }

  it('splits the lump into what it is made of, and names the plan as the plan', () => {
    assert.deepEqual(goingOutRows(karan, 22_501, 40_000), [
      { key: 'living', label: 'Rent, bills and EMIs', amount: 77_047 },
      { key: 'transfers', label: 'Transfers and fees', amount: 27_000 },
      {
        key: 'investments',
        label: 'Investments',
        amount: 12_000,
        detail: 'Seen on your statement',
      },
      { key: 'subscriptions', label: 'Subscriptions', amount: 3_261 },
      { key: 'plan', label: 'Set aside for your plan', amount: 22_501 },
    ])
  })

  it("adds up to the engine's own reserved rows, so the Going out figure does not move", () => {
    const rows = goingOutRows(karan, 22_501, 40_000)
    // "Rent, bills and EMIs" ₹1,19,308 + "Set aside for your plan" ₹22,501, from the same view.
    assert.equal(
      rows.reduce((sum, r) => sum + r.amount, 0),
      141_809,
    )
  })

  it('names only what is there', () => {
    // Sunil: no rent, a school fee and a family transfer, nothing invested.
    const sunil = {
      ...karan,
      total: 38_475,
      rent: 0,
      emis: 11_600,
      bills: 4_176,
      obligations: 22_400,
      subscriptions: 299,
      investments: 0,
    }
    const rows = goingOutRows(sunil, 985)
    assert.deepEqual(
      rows.map((r) => r.label),
      ['Transfers and fees', 'Bills and EMIs', 'Subscriptions', 'Set aside for your plan'],
    )
  })

  it('calls a transfer with no fee behind it a transfer', () => {
    const rohan = { ...karan, series: [{ kind: 'obligation', category: 'Transfers' }] }
    assert.equal(goingOutRows(rohan, 0)[1]?.label, 'Regular transfers')
  })

  it('says nothing about the statement when the holdings agree with it', () => {
    const row = goingOutRows(karan, 0, 12_000).find((r) => r.key === 'investments')
    assert.equal(row?.detail, undefined)
  })

  it('leaves the plan row out when the plan sets nothing aside', () => {
    assert.equal(
      goingOutRows(karan, 0).some((r) => r.key === 'plan'),
      false,
    )
  })

  it('keeps the rupee that rounding each part loses', () => {
    // Three parts of ₹100.40 round to ₹300 between them; their total rounds to ₹301.
    const odd = {
      ...karan,
      total: 301.2,
      rent: 100.4,
      emis: 0,
      bills: 0,
      obligations: 100.4,
      subscriptions: 0,
      investments: 100.4,
    }
    const rows = goingOutRows(odd, 0)
    assert.equal(
      rows.reduce((sum, r) => sum + r.amount, 0),
      301,
    )
    assert.deepEqual(
      rows.map((r) => r.amount),
      [101, 100, 100],
    )
  })

  it('falls back to one row when the parts are not the total', () => {
    const drifted = { ...karan, total: 150_000 }
    assert.deepEqual(goingOutRows(drifted, 985), [
      { key: 'all', label: 'Bills, EMIs, transfers and investing', amount: 150_000 },
      { key: 'plan', label: 'Set aside for your plan', amount: 985 },
    ])
  })
})

describe('newestFirst', () => {
  // Karan's "since you last looked", in the order the engine sends it (oldest first).
  const since = [
    { txnId: 'spencer', txnDate: '2026-08-28' },
    { txnId: 'swiggy', txnDate: '2026-08-29' },
    { txnId: 'hpcl', txnDate: '2026-08-29' },
    { txnId: 'blinkit', txnDate: '2026-09-01' },
    { txnId: 'pizza-1800', txnDate: '2026-09-01' },
    { txnId: 'pizza-766', txnDate: '2026-09-01' },
    { txnId: 'dineout', txnDate: '2026-09-01' },
  ]

  it("puts the latest spend first, in the statement's own row order", () => {
    // The order /api/v1/transactions returns the same seven lines in.
    assert.deepEqual(
      newestFirst(since).map((t) => t.txnId),
      ['dineout', 'pizza-766', 'pizza-1800', 'blinkit', 'hpcl', 'swiggy', 'spencer'],
    )
  })

  it('keeps the newest when the list is cut short', () => {
    assert.equal(newestFirst(since).slice(0, 6).at(0)?.txnId, 'dineout')
    assert.equal(newestFirst(since).slice(0, 6).includes(since[0]!), false)
  })

  it('sorts across a month and a year, whatever order the rows came in', () => {
    const rows = [{ txnDate: '2027-01-02' }, { txnDate: '2026-12-31' }, { txnDate: '2027-01-10' }]
    assert.deepEqual(
      newestFirst(rows).map((t) => t.txnDate),
      ['2027-01-10', '2027-01-02', '2026-12-31'],
    )
  })

  it('leaves the input alone', () => {
    const copy = [...since]
    newestFirst(since)
    assert.deepEqual(since, copy)
  })
})

describe('balanceByMonth', () => {
  it("reaches zero in exactly the months core's payoff arithmetic says", () => {
    // Karan's plan: ₹1,86,240 at 34.8%, ₹21,516 a month, "about 11 months".
    const path = balanceByMonth(186_240, 34.8, 21_516, 600)
    assert.equal(path.length - 1, monthsToClear(186_240, 34.8, 21_516))
    assert.equal(path.length - 1, 11)
    assert.equal(path[0], 186_240)
    assert.equal(path.at(-1), 0)
  })

  it('only ever falls while the payment beats the interest', () => {
    const path = balanceByMonth(186_240, 34.8, 21_516, 600)
    for (let m = 1; m < path.length; m++) assert.ok(path[m]! < path[m - 1]!)
  })

  it('climbs, for as long as it is asked, when the payment is below the interest', () => {
    // Priya: ₹3,10,012 at 34.8% accrues about ₹8,990 a month against ₹5,992 paid.
    const path = balanceByMonth(310_012, 34.8, 5_992, 12)
    assert.equal(path.length, 13)
    for (let m = 1; m < path.length; m++) assert.ok(path[m]! > path[m - 1]!)
    assert.equal(monthsToClear(310_012, 34.8, 5_992), null)
  })

  it('clears a debt with no interest by division', () => {
    assert.deepEqual(balanceByMonth(30_000, 0, 10_000, 600), [30_000, 20_000, 10_000, 0])
  })

  it('draws nothing to pay off as a single point', () => {
    assert.deepEqual(balanceByMonth(0, 34.8, 5_000, 12), [0])
  })
})
