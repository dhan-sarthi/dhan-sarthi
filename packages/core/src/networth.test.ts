/**
 * Net worth, and the two definitions inside it that are easy to get wrong.
 *
 * The module's own docblock says it was lifted out of a render body "where nothing could test
 * it". This is that test. It also pins the structural parameter: the shape is deliberately not
 * core's `Snapshot`, so that a client holding the wire mirror can call it without a cast.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { netWorth } from './networth.ts'
import type { NetWorthFacts } from './networth.ts'
import { snapshot } from './snapshot.testkit.ts'

describe('netWorth', () => {
  it('is everything owned less everything owed', () => {
    const n = netWorth({
      balances: { total: 480_000 },
      holdings: { total: 720_000, equity: 500_000 },
      debt: { total: 186_000 },
    })

    assert.equal(n.assets, 1_200_000)
    assert.equal(n.liabilities, 186_000)
    assert.equal(n.net, 1_014_000)
  })

  it('goes negative rather than clamping, because that is the customer’s actual position', () => {
    const n = netWorth({
      balances: { total: 20_000 },
      holdings: { total: 0, equity: 0 },
      debt: { total: 583_000 },
    })
    assert.equal(n.net, -563_000)
  })

  it('shows cash as an allocation, not as money not yet invested', () => {
    const n = netWorth({
      balances: { total: 480_000 },
      holdings: { total: 720_000, equity: 500_000 },
      debt: { total: 0 },
    })
    assert.equal(n.allocation.cash, 480_000)
    assert.equal(
      n.allocation.cash + n.allocation.equity + n.allocation.fixed,
      n.assets,
      'the three slices are the whole of assets',
    )
  })

  it('counts everything non-equity as fixed, so NPS and PPF are not dropped', () => {
    // holdings.debt is debt funds alone. Using it here would lose the ₹2,20,000 sitting in
    // NPS, PPF and endowments — the difference between total and equity, not `debt`.
    const facts = {
      balances: { total: 0 },
      holdings: { total: 720_000, equity: 500_000, debt: 0 },
      debt: { total: 0 },
    }
    assert.equal(netWorth(facts).allocation.fixed, 220_000)
  })

  it('accepts core’s own Snapshot unchanged', () => {
    // The structural parameter has to keep admitting a Snapshot, or core's callers need the
    // cast the docblock exists to avoid.
    const facts: NetWorthFacts = snapshot({
      balances: { total: 480_000 },
      holdings: { total: 100_000, equity: 100_000 },
      debt: { total: 50_000 },
    })
    assert.equal(netWorth(facts).net, 530_000)
  })
})
