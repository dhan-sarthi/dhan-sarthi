/**
 * Coming up: dated events in the next thirty days, read off the file and never forecast.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { snapshot } from '../snapshot.testkit.ts'
import { bookUpcoming, upcomingEvents } from './upcoming.ts'

const AS_OF = '2026-09-01'
const WHO = { cif: 'C1', name: 'Rohan Verma' }

describe('upcomingEvents', () => {
  it('lists a deposit maturing inside the window, and not one outside it', () => {
    const items = upcomingEvents(
      WHO,
      {
        accounts: [
          { accountType: 'FD', currentBalance: 2_00_000, maturityDate: '2026-09-11' },
          { accountType: 'RD', currentBalance: 60_000, maturityDate: '2026-10-01' },
          { accountType: 'FD', currentBalance: 1_00_000, maturityDate: '2026-12-01' },
          { accountType: 'Savings', currentBalance: 50_000 },
        ],
      },
      AS_OF,
    )
    assert.deepEqual(items, [
      {
        cif: 'C1',
        name: 'Rohan Verma',
        kind: 'deposit_maturing',
        date: '2026-09-11',
        label: '₹2L FD matures',
        amount: 2_00_000,
      },
      {
        cif: 'C1',
        name: 'Rohan Verma',
        kind: 'deposit_maturing',
        date: '2026-10-01',
        label: '₹60,000 RD matures',
        amount: 60_000,
      },
    ])
  })

  it('dates a loan’s last instalment on its debit day, in the month the tenure runs out', () => {
    const facts = {
      liabilities: [
        { loanType: 'Personal Loan', emiAmount: 14_800, tenureRemainingMonths: 1, debitDay: 5 },
        { loanType: 'Car Loan', emiAmount: 9_000, tenureRemainingMonths: 2, debitDay: 7 },
        {
          loanType: 'Credit Card Revolving Balance',
          emiAmount: 9_400,
          tenureRemainingMonths: 1,
          isRevolving: true,
        },
      ],
    }
    const within30 = upcomingEvents(WHO, facts, AS_OF)
    assert.deepEqual(
      within30.map((i) => [i.kind, i.date, i.label]),
      [['emi_ending', '2026-09-05', 'Last ₹14,800 EMI on the personal loan']],
    )
    const within40 = upcomingEvents(WHO, facts, AS_OF, 40)
    assert.deepEqual(
      within40.map((i) => i.date),
      ['2026-09-05', '2026-10-07'],
    )
  })

  it('reads the debit day off the snapshot’s EMI series, else uses the month end', () => {
    const s = snapshot({
      debt: { endingSoon: { loanType: 'Education Loan', emiAmount: 6_200, monthsLeft: 1 } },
      commitments: { series: [] },
    })
    const withSeries = upcomingEvents(
      WHO,
      {
        snapshot: {
          ...s,
          commitments: { series: [{ kind: 'emi', amount: 6_200, dayOfMonth: 15 }] },
        },
      },
      AS_OF,
    )
    assert.equal(withSeries[0]?.date, '2026-09-15')
    const withoutSeries = upcomingEvents(WHO, { snapshot: s }, AS_OF)
    assert.equal(withoutSeries[0]?.date, '2026-09-30')
    assert.equal(withoutSeries[0]?.label, 'Last ₹6,200 EMI on the education loan')
  })

  it('falls back to the snapshot’s maturing deposit when no accounts are given', () => {
    const s = snapshot({
      balances: {
        maturingSoon: {
          accountType: 'FD',
          amount: 2_00_000,
          maturityDate: '2026-09-11',
          daysLeft: 10,
          interestRate: 7.1,
        },
      },
    })
    assert.deepEqual(
      upcomingEvents(WHO, { snapshot: s }, AS_OF).map((i) => [i.kind, i.date]),
      [['deposit_maturing', '2026-09-11']],
    )
  })

  it('lists each SIP debit in the window, both ends included', () => {
    const items = upcomingEvents(
      WHO,
      {
        holdings: [
          { name: 'Nifty 50 Index Fund', sipActive: true, sipAmount: 5_000, sipDebitDay: 1 },
          { name: 'Liquid Fund', sipActive: true, sipDebitDay: 31 },
          { name: 'Old fund', sipActive: false, sipAmount: 2_000, sipDebitDay: 10 },
          {
            name: 'Public Provident Fund',
            holdingType: 'PPF',
            sipActive: true,
            sipAmount: 5_000,
            sipDebitDay: 15,
          },
        ],
      },
      AS_OF,
    )
    assert.deepEqual(
      items.map((i) => [i.date, i.label, i.amount]),
      [
        ['2026-09-01', '₹5,000 SIP into Nifty 50 Index Fund', 5_000],
        ['2026-09-15', '₹5,000 contribution to Public Provident Fund', 5_000],
        ['2026-09-30', 'SIP into Liquid Fund', null],
        ['2026-10-01', '₹5,000 SIP into Nifty 50 Index Fund', 5_000],
      ],
    )
  })

  it('renews a policy on the anniversary of its start, and never guesses one', () => {
    const items = upcomingEvents(
      WHO,
      {
        policies: [
          { name: 'IDBI Federal Term Cover', annualPremium: 12_400, purchasedOn: '2024-09-20' },
          { name: 'Started this month', annualPremium: 5_000, purchasedOn: '2026-09-10' },
          { name: 'PMJJBY', annualPremium: 436 },
        ],
      },
      AS_OF,
    )
    assert.deepEqual(
      items.map((i) => [i.kind, i.date, i.label, i.amount]),
      [['policy_renewal', '2026-09-20', 'IDBI Federal Term Cover renews', 12_400]],
    )
  })

  it('is empty for a customer with nothing dated', () => {
    assert.deepEqual(upcomingEvents(WHO, {}, AS_OF), [])
    assert.deepEqual(upcomingEvents(WHO, { snapshot: snapshot() }, AS_OF), [])
  })
})

describe('bookUpcoming', () => {
  it('merges every customer’s list, soonest first', () => {
    const a = upcomingEvents(
      { cif: 'A', name: 'Anita Rao' },
      { accounts: [{ accountType: 'FD', currentBalance: 1_00_000, maturityDate: '2026-09-20' }] },
      AS_OF,
    )
    const b = upcomingEvents(
      { cif: 'B', name: 'Karan Mehta' },
      { holdings: [{ name: 'Index', sipActive: true, sipAmount: 2_000, sipDebitDay: 7 }] },
      AS_OF,
    )
    assert.deepEqual(
      bookUpcoming([a, b]).map((i) => [i.cif, i.date]),
      [
        ['B', '2026-09-07'],
        ['A', '2026-09-20'],
      ],
    )
  })
})
