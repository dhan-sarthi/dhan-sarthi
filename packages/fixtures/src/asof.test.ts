/**
 * The one as-of property that is a statement about two packages.
 *
 * The arithmetic itself is asserted at its own interface in `packages/core/src/asof.test.ts`,
 * over hand-built ledgers and literal `LiabilityContract` / `SipContract` values. What cannot
 * be asserted from there is parity: that `generateCustomerFile` and the pure functions agree at
 * every clock position. That needs the generator and core in one file, and this is the only
 * package that may see both — core may not depend on the fixtures. It is also the property the
 * seeded database rests on, which is what lets the API quote the generator's figures.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { accountFactsAsOf, liabilityAsOf, sipHoldingAsOf } from '@dhan/core'
import { generateCustomerFile, liabilityContract, sipContract } from './generate.ts'
import { PERSONAS, ROHAN } from './personas.ts'

const ANCHOR = '2026-09-01'

describe('parity with the generator', () => {
  const DATES = [ANCHOR, '2026-09-02', '2026-09-08', '2026-10-01', '2027-03-01', '2028-03-01']

  it('produces the generator’s account figures at every clock position', () => {
    for (const spec of PERSONAS) {
      for (const asOf of DATES) {
        const file = generateCustomerFile(spec, { anchor: ANCHOR, asOf, months: 24 })
        const savings = file.accounts[0]
        assert.ok(savings)

        // The primary account's own rows. Account facts are per account, so feeding a merged
        // four-bank ledger to this would compare the primary's balance against a sum over
        // every account the customer holds — which is a different and much larger number.
        const own = file.transactions.filter(
          (t) =>
            t.accountNumberMasked === undefined ||
            t.accountNumberMasked === spec.accountNumberMasked,
        )
        const facts = accountFactsAsOf(own, asOf, {
          openingBalance: spec.openingBalance,
        })
        assert.equal(savings.currentBalance, facts.currentBalance, `${spec.slug} ${asOf}`)
        assert.equal(savings.minBalance12m, facts.minBalance12m, `${spec.slug} ${asOf}`)
        assert.equal(savings.avgMonthlyBalance3m, facts.avgMonthlyBalance3m)
        assert.equal(savings.avgMonthlyBalance12m, facts.avgMonthlyBalance12m)
      }
    }
  })

  it('rolls the same loans and SIPs the generator puts in the file', () => {
    for (const spec of PERSONAS) {
      for (const asOf of DATES) {
        const file = generateCustomerFile(spec, { anchor: ANCHOR, asOf, months: 24 })
        const liabilities = spec.emis
          .map((e) => liabilityAsOf(liabilityContract(e), ANCHOR, asOf))
          .filter((l) => l !== null)
        assert.deepEqual(file.liabilities, liabilities, `${spec.slug} ${asOf}`)

        const sips = spec.sips.map((s) => sipHoldingAsOf(sipContract(s), ANCHOR, asOf, 24))
        assert.deepEqual(file.holdings.slice(0, sips.length), sips, `${spec.slug} ${asOf}`)
      }
    }
  })

  it('lets Rohan’s education loan leave the file after five months', () => {
    const before = generateCustomerFile(ROHAN, { anchor: ANCHOR, asOf: '2027-01-01', months: 24 })
    const after = generateCustomerFile(ROHAN, { anchor: ANCHOR, asOf: '2027-02-01', months: 24 })
    assert.equal(before.liabilities.length, 1)
    assert.equal(before.liabilities[0]?.tenureRemainingMonths, 1)
    assert.equal(after.liabilities.length, 0)
  })
})
