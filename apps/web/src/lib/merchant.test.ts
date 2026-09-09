/**
 * What a statement line is called on screen.
 *
 * This has been wrong twice against real IDBI data, both times in the same way: a function that
 * had to return a string returned a rail word, and the screen showed twenty rows called "Txn"
 * and forty called "Outward" as though those were shops. Both looked like a bug in the app
 * rather than a gap in the feed, which is the worse failure of the two.
 *
 * So the cases below are the ones the sandbox and the generator actually send, and the point of
 * most of them is the null.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Transaction } from '@dhan/contracts'
import { isNamed, merchantOf, narratedName } from './merchant.ts'

const line = (narration: string, over: Partial<Transaction> = {}): Transaction => ({
  txnId: 'T1',
  txnDate: '2025-05-20',
  valueDate: '2025-05-20',
  txnAmount: 100,
  txnType: 'DEBIT',
  txnMode: 'UNKNOWN',
  narration,
  spendCategory: 'Transfers',
  balanceAfterTxn: null,
  isSalaryCredit: false,
  isRecurring: false,
  ...over,
})

describe('the name on a statement line', () => {
  it('finds the merchant in the forms the rails actually produce', () => {
    assert.equal(narratedName('UPI/DR/824112340987/SWIGGY/ICIC/swiggy.rzp@icici/ORDER'), 'Swiggy')
    assert.equal(narratedName('POS 412683 ZOMATO LTD BENGALURU'), 'Zomato')
    assert.equal(narratedName('SB INT CR 01'), 'Savings interest')
    assert.equal(narratedName('NFS/CASH WDL/HDFC/0432'), 'Cash withdrawal')
  })

  it('finds nobody in IDBI’s own narrations, and says so', () => {
    // Priya's statement, every line.
    assert.equal(narratedName('S1 TXN 20'), null)
    // Neha's, both shapes. The second one's fifth field is a bank code, not a shop.
    assert.equal(narratedName('NEFT OUTWARD 3188'), null)
    assert.equal(narratedName('UPI/CR/15903/SENDER/PQRS'), null)
  })

  it('falls back to the direction of the money, never to a rail word', () => {
    assert.equal(merchantOf(line('S1 TXN 20')), 'Money out')
    assert.equal(merchantOf(line('NEFT OUTWARD 3188', { txnType: 'CREDIT' })), 'Money in')
    assert.equal(isNamed(line('S1 TXN 20')), false)
    assert.equal(isNamed(line('UPI/DR/1/SWIGGY/ICIC/a@b/ORDER')), true)
  })

  it('prefers the name the bank sent over anything read out of the line', () => {
    const withName = line('UPI/DR/1/SWIGGY/ICIC/a@b/ORDER', { merchantName: 'Bundl Technologies' })
    assert.equal(merchantOf(withName), 'Bundl Technologies')
    // Even where the line names nobody: a merchant name is a fact, the direction is a fallback.
    assert.equal(merchantOf(line('S1 TXN 20', { merchantName: 'Acme' })), 'Acme')
    assert.equal(isNamed(line('S1 TXN 20', { merchantName: 'Acme' })), true)
  })
})
