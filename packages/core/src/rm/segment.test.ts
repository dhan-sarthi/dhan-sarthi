/**
 * Relationship value, wallet share and segment, against the spec's Definitions table.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { netWorth } from '../networth.ts'
import { snapshot } from '../snapshot.testkit.ts'
import {
  AFFLUENT_FROM,
  PRIORITY_FROM,
  allBalances,
  idbiProducts,
  relationshipValue,
  segmentOf,
  walletSharePct,
  withIdbi,
} from './segment.ts'

const HDFC = { name: 'HDFC Bank', ifscPrefix: 'HDFC', isHome: false }
const ICICI = { name: 'ICICI Bank', ifscPrefix: 'ICIC', isHome: false }
const IDBI = { name: 'IDBI Bank', ifscPrefix: 'IBKL', isHome: true }

describe('relationshipValue', () => {
  it('is assets we can see: every balance plus holdings, debt not netted off', () => {
    const s = snapshot({
      balances: { total: 6_50_000 },
      holdings: { total: 7_20_000, equity: 5_00_000 },
      debt: { total: 1_86_240 },
    })
    assert.equal(relationshipValue(s), 13_70_000)
    assert.equal(relationshipValue(s), netWorth(s).assets)
  })
})

describe('segmentOf', () => {
  it('bands at ₹10L and ₹50L, each boundary belonging to the upper band', () => {
    assert.equal(segmentOf(0), 'mass')
    assert.equal(segmentOf(AFFLUENT_FROM - 1), 'mass')
    assert.equal(segmentOf(AFFLUENT_FROM), 'affluent')
    assert.equal(segmentOf(PRIORITY_FROM - 1), 'affluent')
    assert.equal(segmentOf(PRIORITY_FROM), 'priority')
    assert.equal(AFFLUENT_FROM, 1_000_000)
    assert.equal(PRIORITY_FROM, 5_000_000)
  })
})

describe('withIdbi and wallet share', () => {
  const accounts = [
    { accountType: 'Savings', currentBalance: 1_00_000 },
    { accountType: 'Savings', currentBalance: 3_00_000, institution: HDFC },
    { accountType: 'FD', currentBalance: 2_00_000, institution: IDBI },
    { accountType: 'RD', currentBalance: 50_000, institution: ICICI },
    // PPF and NPS are holdings in `derive`, not balances, on either side of the division.
    { accountType: 'PPF', currentBalance: 1_00_000 },
  ]

  it('counts IDBI balances, treating an account with no institution as IDBI', () => {
    assert.equal(withIdbi(accounts), 3_00_000)
    assert.equal(allBalances(accounts), 6_50_000)
  })

  it('is IDBI balances over all balances, to one decimal', () => {
    assert.equal(walletSharePct(withIdbi(accounts), allBalances(accounts)), 46.2)
    assert.equal(walletSharePct(5_00_000, 5_00_000), 100)
  })

  it('is unknown, not zero, where there are no balances', () => {
    assert.equal(walletSharePct(0, 0), null)
    assert.equal(walletSharePct(withIdbi([]), allBalances([])), null)
  })
})

describe('idbiProducts', () => {
  it('names each distinct IDBI product once, and nothing held elsewhere', () => {
    const products = idbiProducts({
      accounts: [
        { accountType: 'Savings' },
        { accountType: 'Savings', institution: IDBI },
        { accountType: 'FD', institution: HDFC },
      ],
      holdings: [
        { holdingType: 'MUTUAL_FUND', name: 'Index fund', custodian: 'IDBI Bank' },
        { holdingType: 'EQUITY', name: 'INFY', custodian: 'Zerodha', heldOutsideIdbi: true },
        { holdingType: 'NPS', name: 'NPS Tier-I', custodian: 'Protean CRA' },
        { holdingType: 'PPF', name: 'Public Provident Fund' },
        { holdingType: 'MUTUAL_FUND', name: 'Flexi cap', heldOutsideIdbi: true },
      ],
      policies: [
        { holdingType: 'INSURANCE', name: 'PMJJBY' },
        { holdingType: 'INSURANCE', name: 'ULIP', custodian: 'HDFC Life', heldOutsideIdbi: true },
      ],
      liabilities: [
        {
          loanType: 'Credit Card Revolving Balance',
          lender: 'IDBI Credit Card',
          isRevolving: true,
        },
        { loanType: 'Personal Loan', lender: 'Bajaj Finserv' },
        { loanType: 'Home Loan' },
      ],
    })
    assert.deepEqual(products, [
      'Savings account',
      'Mutual fund',
      'PPF',
      'Life cover',
      'Credit card',
    ])
  })

  it('is empty for a customer whose relationship is elsewhere', () => {
    assert.deepEqual(
      idbiProducts({
        accounts: [{ accountType: 'Savings', institution: HDFC }],
        holdings: [],
      }),
      [],
    )
  })
})
