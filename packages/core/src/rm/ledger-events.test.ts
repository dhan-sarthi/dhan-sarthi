/**
 * Ledger events over hand-built statements whose narrations are the generator's own forms
 * (`packages/fixtures/src/narration.ts`), so what is detected here is what the seeded book and a
 * real statement in the same grammar carry. Nothing here knows who the customer is.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { addMonths } from '../dates.ts'
import { txn } from '../snapshot.testkit.ts'
import type { Transaction } from '../types.ts'
import { counterpartyOf, ledgerEvents } from './ledger-events.ts'

const AS_OF = '2026-09-01'

let seq = 0
const line = (over: Partial<Transaction> & Pick<Transaction, 'txnDate'>): Transaction =>
  txn({ txnId: `T${(seq += 1)}`, ...over })

const salary = (txnDate: string, txnAmount: number): Transaction =>
  line({
    txnDate,
    txnAmount,
    txnType: 'CREDIT',
    txnMode: 'NEFT',
    narration: `NEFT/HDFCN26244000123/ACME TECHNOLOGIES PVT LTD/HDFC0000123/SALARY`,
    spendCategory: 'Income',
    isSalaryCredit: true,
    isRecurring: true,
  })

const emi = (txnDate: string, txnAmount = 14_800): Transaction => {
  const [y, m, d] = txnDate.split('-')
  return line({
    txnDate,
    txnAmount,
    txnMode: 'ACH-D',
    narration: `ACH-DR-BAJAJ FINANCE LTD-UTIBMQK5PRYXOL4ABCD-${d}-${m}-${y}`,
    spendCategory: 'Loan EMI',
    isRecurring: true,
  })
}

/** Something on the statement every month, so the ledger visibly carries on. */
const spend = (txnDate: string, txnAmount = 2_000): Transaction =>
  line({ txnDate, txnAmount, narration: 'UPI/DR/600235047977/DMART/ICIC/dmart@icici/GROCERY' })

/** The first of each month from `from`, `count` months. */
const months = (from: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => addMonths(from, i))

describe('salary changes', () => {
  it('reports a rise that held, at its first credit, against the level before', () => {
    const ledger = [
      ...months('2025-06-01', 9).map((d) => salary(d, 1_00_000)),
      ...months('2026-03-01', 7).map((d) => salary(d, 1_25_000)),
    ]
    const events = ledgerEvents(ledger, AS_OF)
    assert.deepEqual(
      events.map((e) => [e.type, e.at, e.title, e.amount]),
      [['salary_change', '2026-03-01', 'Salary up 25% to ₹1.25L a month', 1_25_000]],
    )
    assert.equal(
      events[0]?.detail,
      'From ₹1,00,000 a month. First credited at the new level on 1 Mar.',
    )
    assert.equal(events[0]?.kind, 'ledger')
    assert.equal(events[0]?.source, 'ledger')
  })

  it('does not report a one-month bonus as a change of salary', () => {
    const ledger = months('2025-06-01', 16).map((d) =>
      salary(d, d === '2025-12-01' ? 1_60_000 : 1_00_000),
    )
    assert.deepEqual(ledgerEvents(ledger, AS_OF), [])
  })

  it('reports a cut in the latest month, which has nothing after it to confirm', () => {
    const ledger = months('2025-06-01', 16).map((d) =>
      salary(d, d === '2026-09-01' ? 80_000 : 1_00_000),
    )
    assert.deepEqual(
      ledgerEvents(ledger, AS_OF).map((e) => e.title),
      ['Salary down 20% to ₹80,000 a month'],
    )
  })

  it('ignores a jitter under 15%', () => {
    const ledger = months('2025-06-01', 16).map((d, i) => salary(d, i % 2 ? 1_08_000 : 1_00_000))
    assert.deepEqual(ledgerEvents(ledger, AS_OF), [])
  })
})

describe('returned mandates', () => {
  const returned = line({
    txnDate: '2026-05-15',
    txnAmount: 300,
    txnMode: 'ACH-D',
    narration: 'NACH RETURN CHGS 15-05-2026',
    spendCategory: 'Fees & charges',
  })
  const gst = line({
    txnDate: '2026-05-15',
    txnAmount: 54,
    txnMode: 'ACH-D',
    narration: 'GST @18% ON NACH RETURN CHGS 15-05-2026',
    spendCategory: 'Fees & charges',
  })
  const paidByHand = line({
    txnDate: '2026-05-27',
    txnAmount: 11_600,
    txnMode: 'IMPS',
    narration: 'IMPS/P2A/614710210152/IDBI BANK RETAIL ASSETS/IBKL0000510/LATE EMI',
    spendCategory: 'Loan EMI',
  })

  it('reports the return once, not again for its GST, with when it was paid by hand', () => {
    const events = ledgerEvents([returned, gst, paidByHand], AS_OF)
    assert.deepEqual(
      events.map((e) => [e.type, e.at, e.title, e.amount]),
      [
        [
          'mandate_returned',
          '2026-05-15',
          '₹11,600 EMI mandate returned, paid 12 days later',
          11_600,
        ],
      ],
    )
    assert.equal(
      events[0]?.detail,
      '₹300 return charge on 15 May; the instalment went by hand on 27 May.',
    )
  })

  it('says only what the statement shows when no hand payment followed', () => {
    const events = ledgerEvents([returned, gst], AS_OF)
    assert.deepEqual(
      events.map((e) => [e.title, e.detail, e.amount]),
      [['Mandate returned unpaid', '₹300 return charge on 15 May.', 300]],
    )
  })
})

describe('matured deposits', () => {
  it('reads a maturity or closure credit, and not the interest line', () => {
    const events = ledgerEvents(
      [
        line({
          txnDate: '2026-08-11',
          txnAmount: 2_00_000,
          txnType: 'CREDIT',
          txnMode: 'NEFT',
          narration: 'FD MATURITY PROCEEDS 0012345678',
          spendCategory: 'Transfers',
        }),
        line({
          txnDate: '2026-04-02',
          txnAmount: 50_000,
          txnType: 'CREDIT',
          narration: 'TD CLOSURE PROCEEDS 0098765432',
          spendCategory: 'Transfers',
        }),
        line({
          txnDate: '2026-06-30',
          txnAmount: 1_204,
          txnType: 'CREDIT',
          txnMode: 'NEFT',
          narration: 'SB INT CR 01-04-2026 TO 30-06-2026',
          spendCategory: 'Income',
        }),
      ],
      AS_OF,
    )
    assert.deepEqual(
      events.filter((e) => e.type === 'deposit_matured').map((e) => [e.type, e.at, e.title]),
      [
        ['deposit_matured', '2026-04-02', '₹50,000 from a matured deposit'],
        ['deposit_matured', '2026-08-11', '₹2L from a matured deposit'],
      ],
    )
  })
})

describe('closed loans', () => {
  const carriesOn = months('2026-01-20', 8).map((d) => spend(d))

  it('reports a mandate run that stopped while the statement carried on', () => {
    const ledger = [...months('2026-01-05', 5).map((d) => emi(d)), ...carriesOn]
    const events = ledgerEvents(ledger, AS_OF)
    assert.deepEqual(
      events.map((e) => [e.type, e.at, e.title, e.amount]),
      [
        [
          'loan_closed',
          '2026-05-05',
          '₹14,800 a month freed — Bajaj Finance Ltd loan closed',
          14_800,
        ],
      ],
    )
    assert.equal(events[0]?.detail, 'Last instalment on 5 May, after 5 on this statement.')
  })

  it('does not close a loan still being paid, or one whose ledger simply ends', () => {
    const running = [...months('2026-01-05', 8).map((d) => emi(d)), ...carriesOn]
    assert.deepEqual(ledgerEvents(running, AS_OF), [])
    const ends = months('2026-01-05', 5).map((d) => emi(d))
    assert.deepEqual(ledgerEvents(ends, AS_OF), [])
  })

  it('does not close a loan whose next instalment was returned and paid by hand', () => {
    const ledger = [
      ...months('2026-01-05', 4).map((d) => emi(d)),
      line({
        txnDate: '2026-05-05',
        txnAmount: 300,
        txnMode: 'ACH-D',
        narration: 'NACH RETURN CHGS 05-05-2026',
        spendCategory: 'Fees & charges',
      }),
      ...carriesOn,
    ]
    assert.deepEqual(
      ledgerEvents(ledger, AS_OF).map((e) => e.type),
      ['mandate_returned'],
    )
  })

  it('needs three instalments before it calls anything a loan', () => {
    const ledger = [...months('2026-01-05', 2).map((d) => emi(d)), ...carriesOn]
    assert.ok(!ledgerEvents(ledger, AS_OF).some((e) => e.type === 'loan_closed'))
  })
})

describe('large months', () => {
  // Twelve ordinary months: ₹60,000 in, ₹45,000 out.
  const ordinary = months('2025-10-01', 12).flatMap((d) => [
    salary(d, 60_000),
    ...(d === '2026-09-01'
      ? []
      : [spend(d.replace(/01$/, '03'), 20_000), spend(d.replace(/01$/, '10'), 25_000)]),
  ])

  it('flags a month out at more than twice the usual, naming its largest line', () => {
    const hospital = line({
      txnDate: '2025-10-09',
      txnAmount: 74_000,
      txnMode: 'NEFT',
      narration: 'NEFT/DR/ORANGE CITY HOSPITAL/HDFC0000212/ADMISSION',
      spendCategory: 'Health',
    })
    const events = ledgerEvents([...ordinary, hospital], AS_OF)
    assert.deepEqual(
      events.map((e) => [e.type, e.at, e.title, e.amount]),
      [
        [
          'large_outflow',
          '2025-10-09',
          '₹1.19L went out during Oct 2025, 2.6× a usual month',
          1_19_000,
        ],
      ],
    )
    assert.equal(events[0]?.detail, 'Largest: ₹74,000, to Orange City Hospital, on 9 Oct.')
  })

  it('flags a windfall month in', () => {
    const sale = line({
      txnDate: '2026-02-11',
      txnAmount: 3_10_000,
      txnType: 'CREDIT',
      txnMode: 'IMPS',
      narration: 'IMPS/P2A/611904428871/RAHUL JOSHI/HDFC0000712/CAR SALE',
      spendCategory: 'Transfers',
    })
    const events = ledgerEvents([...ordinary, sale], AS_OF)
    assert.deepEqual(
      events.map((e) => [e.type, e.title, e.detail]),
      [
        [
          'large_inflow',
          '₹3.7L came in during Feb 2026, 6.2× a usual month',
          'Largest: ₹3,10,000, from Rahul Joshi, on 11 Feb.',
        ],
      ],
    )
  })

  it('does not count money moved between the customer’s own accounts', () => {
    const sweep = line({
      txnDate: '2026-02-24',
      txnAmount: 1_50_000,
      txnMode: 'IMPS',
      narration: 'IMPS/P2A/611952200417/SELF/IBKL0000105/TRANSFER',
      spendCategory: 'Transfers',
      isSelfTransfer: true,
    })
    assert.deepEqual(ledgerEvents([...ordinary, sweep], AS_OF), [])
  })
})

describe('the window', () => {
  it('reports only the last twelve calendar months, and ignores rows after the as-of date', () => {
    const old = line({
      txnDate: '2025-09-20',
      txnAmount: 300,
      narration: 'NACH RETURN CHGS 20-09-2025',
      spendCategory: 'Fees & charges',
    })
    const future = line({
      txnDate: '2026-09-15',
      txnAmount: 300,
      narration: 'NACH RETURN CHGS 15-09-2026',
      spendCategory: 'Fees & charges',
    })
    const inside = line({
      txnDate: '2025-10-01',
      txnAmount: 300,
      narration: 'NACH RETURN CHGS 01-10-2025',
      spendCategory: 'Fees & charges',
    })
    assert.deepEqual(
      ledgerEvents([old, future, inside], AS_OF).map((e) => e.at),
      ['2025-10-01'],
    )
  })

  it('is empty for an empty ledger', () => {
    assert.deepEqual(ledgerEvents([], AS_OF), [])
  })
})

describe('counterpartyOf', () => {
  it('reads the payee off each rail’s grammar', () => {
    const cases: [string, string | null][] = [
      ['UPI/DR/800412179072/SWIGGY/ICIC/swiggy.rzp@icici/ORDER', 'Swiggy'],
      ['IMPS/P2A/626181509069/SUDHIR PATEL/HDFC0000123/RENT', 'Sudhir Patel'],
      ['NEFT/DR/ORANGE CITY HOSPITAL/HDFC0000212/ADMISSION', 'Orange City Hospital'],
      [
        'NEFT/HDFCN262440001234/ACME TECHNOLOGIES PVT LTD/HDFC0000123/SALARY AUG 2026',
        'Acme Technologies Pvt Ltd',
      ],
      ['ACH-DR-IDBI BANK RETAIL ASSETS-IBKLA1B2C3D4E5F6G7H8-07-09-2026', 'IDBI Bank Retail Assets'],
      ['ACH/D/PMJJBY LIC OF INDIA/PREMIUM/500110042882', 'PMJJBY LIC of India'],
      ['POS 4XXXXXXXXXXX7412 DMART INDORE', 'Dmart Indore'],
      ['IMPS/P2A/611952200417/SELF/IBKL0000105/TRANSFER', 'own account'],
      ['SB INT CR 01-07-2026 TO 30-09-2026', null],
    ]
    for (const [narration, expected] of cases) assert.equal(counterpartyOf(narration), expected)
  })
})
