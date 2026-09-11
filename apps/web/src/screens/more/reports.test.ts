/**
 * The report arithmetic, and the two things a statement must never get wrong.
 *
 * The financial-year maths is here because the source got it wrong on camera — both radios read
 * `(2022 -  2023)` — and because "Current Financial Year" over a twenty-four-month ledger is a
 * partial year for most of the year. The CSV escaping is here because a bank statement's
 * narration is arbitrary text arriving from a payment rail, and a cell beginning `=` is a formula
 * the moment a spreadsheet opens the file.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { HoldingRecordResponse, Transaction } from '@dhan/contracts'
import {
  cell,
  coverage,
  csv,
  fileName,
  financialYear,
  holdingsCsv,
  rangeFor,
  transactionsCsv,
} from './reports.ts'
import type { ReportMeta } from './reports.ts'

const META: ReportMeta = {
  customerName: 'Rohan Mehta',
  snapshotId: 'snap_9f2c41',
  asOf: '2026-09-01',
  source: 'Synthetic ledger',
}

describe('the financial year', () => {
  it('runs April to March and is labelled the way a statement labels it', () => {
    assert.deepEqual(financialYear('2026-09-01'), {
      label: '2026-27',
      from: '2026-04-01',
      to: '2027-03-31',
    })
  })

  it('puts January into the year that started the previous April', () => {
    assert.deepEqual(financialYear('2026-01-15'), {
      label: '2025-26',
      from: '2025-04-01',
      to: '2026-03-31',
    })
    assert.equal(financialYear('2026-03-31').label, '2025-26')
    assert.equal(financialYear('2026-04-01').label, '2026-27')
  })

  it('gives the two radios different years, which the source did not', () => {
    const current = financialYear('2026-09-01')
    const previous = financialYear('2026-09-01', 1)
    assert.notEqual(current.label, previous.label)
    assert.equal(previous.label, '2025-26')
  })

  it('hands a custom tenure straight through', () => {
    const custom = { from: '2025-01-01', to: '2025-01-31' }
    assert.deepEqual(rangeFor('custom', '2026-09-01', custom), custom)
    assert.equal(rangeFor('current-fy', '2026-09-01', custom).from, '2026-04-01')
    assert.equal(rangeFor('previous-fy', '2026-09-01', custom).from, '2025-04-01')
  })
})

describe('what the ledger can honestly cover', () => {
  const horizon = { from: '2024-09-01', to: '2026-09-01' }

  it('passes a range that fits', () => {
    const c = coverage({ from: '2025-04-01', to: '2026-03-31' }, horizon)
    assert.deepEqual(c.range, { from: '2025-04-01', to: '2026-03-31' })
    assert.equal(c.clipped, false)
  })

  it('clips a financial year the ledger only half holds, and says so', () => {
    // The live case: "Current Financial Year" on 1 September runs to next March, and the ledger
    // stops today. A report claiming to cover the year would be six months of nothing.
    const c = coverage({ from: '2026-04-01', to: '2027-03-31' }, horizon)
    assert.deepEqual(c.range, { from: '2026-04-01', to: '2026-09-01' })
    assert.equal(c.clipped, true)
  })

  it('refuses a range the ledger misses entirely', () => {
    const c = coverage({ from: '2019-01-01', to: '2019-12-31' }, horizon)
    assert.equal(c.range, null)
    assert.equal(c.clipped, true)
    assert.equal(c.inverted, false)
  })

  it('catches a backwards custom range before anything is generated', () => {
    const c = coverage({ from: '2026-03-01', to: '2026-01-01' }, horizon)
    assert.equal(c.range, null)
    assert.equal(c.inverted, true)
  })
})

describe('CSV', () => {
  it('quotes commas, quotes and newlines', () => {
    assert.equal(cell('UPI/Ravi, Kumar'), '"UPI/Ravi, Kumar"')
    assert.equal(cell('He said "no"'), '"He said ""no"""')
    assert.equal(cell('two\nlines'), '"two\nlines"')
    assert.equal(cell('plain'), 'plain')
    assert.equal(cell(1234), '1234')
    assert.equal(cell(null), '')
    assert.equal(cell(undefined), '')
  })

  it('defuses a narration a spreadsheet would run as a formula', () => {
    assert.equal(cell('=1+1'), "'=1+1")
    assert.equal(cell('+91 98xxxx'), "'+91 98xxxx")
    assert.equal(cell('-500 REVERSAL'), "'-500 REVERSAL")
    assert.equal(cell('@merchant'), "'@merchant")
    // And still quotes it if it also contains a comma.
    assert.equal(cell('=SUM(A1,A2)'), '"\'=SUM(A1,A2)"')
  })

  it('joins with CRLF', () => {
    assert.equal(
      csv([
        ['a', 'b'],
        ['c', 'd'],
      ]),
      'a,b\r\nc,d',
    )
  })
})

const txn = (over: Partial<Transaction>): Transaction => ({
  txnId: 'T1',
  txnDate: '2026-08-01',
  valueDate: '2026-08-01',
  txnAmount: 1000,
  txnType: 'DEBIT',
  txnMode: 'UPI',
  narration: 'UPI/GROCER',
  spendCategory: 'Groceries',
  balanceAfterTxn: 5000,
  isSalaryCredit: false,
  isRecurring: false,
  ...over,
})

describe('the transaction statement', () => {
  it('carries a provenance block, one row per line, and totals that add up', () => {
    const out = transactionsCsv(
      [
        txn({ txnId: 'T1', txnAmount: 1000, txnType: 'DEBIT' }),
        txn({ txnId: 'T2', txnAmount: 250, txnType: 'DEBIT' }),
        txn({ txnId: 'T3', txnAmount: 60_000, txnType: 'CREDIT', isSalaryCredit: true }),
      ],
      { from: '2026-08-01', to: '2026-08-31' },
      META,
    )
    const lines = out.split('\r\n')
    assert.equal(lines[0], 'Transaction statement')
    assert.ok(out.includes('Customer,Rohan Mehta'))
    assert.ok(out.includes('Snapshot,snap_9f2c41'))
    assert.ok(out.includes('Period,2026-08-01 to 2026-08-31'))
    assert.ok(out.includes('Source,Synthetic ledger'))
    assert.ok(out.includes('Lines,3'))
    assert.ok(out.includes('Credits,60000'))
    assert.ok(out.includes('Debits,1250'))
  })

  it('writes an empty statement as headers and zeroes, never as a stray row', () => {
    const out = transactionsCsv([], { from: '2026-08-01', to: '2026-08-31' }, META)
    assert.ok(out.includes('Lines,0'))
    assert.ok(out.includes('Credits,0'))
  })
})

const holding = (over: Partial<HoldingRecordResponse>): HoldingRecordResponse => ({
  holdingId: 'H1',
  holdingType: 'MUTUAL_FUND',
  name: 'Some Index Fund',
  assetClass: 'Equity',
  investedAmount: 100_000,
  currentValue: 118_000,
  sipActive: true,
  sipAmount: 5_000,
  ...over,
})

describe('the holding statement', () => {
  it('calls the difference a change in value, not a gain', () => {
    const out = holdingsCsv([holding({})], [], META)
    assert.ok(out.includes('Change in value'))
    assert.ok(out.includes('unrealised, not a capital gain'))
    assert.ok(!/\bGain\b/.test(out))
    assert.ok(out.includes('Total invested,100000'))
    assert.ok(out.includes('Total current value,118000'))
  })

  it('keeps cover out of the portfolio total', () => {
    const out = holdingsCsv(
      [holding({})],
      [holding({ holdingId: 'P1', holdingType: 'INSURANCE', name: 'Term plan', currentValue: 0 })],
      META,
    )
    assert.ok(out.includes('Protection in force'))
    assert.ok(out.includes('Total current value,118000'))
  })

  it('is dated as-on rather than for a period, because there is no history behind it', () => {
    const out = holdingsCsv([holding({})], [], META)
    assert.ok(out.includes('As on,2026-09-01'))
    assert.ok(!out.includes('Period,'))
  })
})

describe('the file name', () => {
  it('names the window so a downloads folder sorts', () => {
    assert.equal(
      fileName('transactions', { from: '2025-04-01', to: '2026-03-31' }, '2026-09-01'),
      'transaction-statement-2025-04-01-to-2026-03-31.csv',
    )
    assert.equal(fileName('holdings', null, '2026-09-01'), 'holding-statement-as-on-2026-09-01.csv')
  })
})
