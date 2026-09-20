/**
 * What a transaction row is called.
 *
 * Every line in the statement, the spend bars and the challenge screens is labelled by this
 * function, and the two ways it can be wrong are both silent: a name that is really a rail
 * token ("Txn", "Neft") looks like a merchant, and a `null` that should have been a name
 * turns a whole feed into "Money out". So the cases here are the shapes the real rails
 * produce, not invented ones.
 *
 * It reads `seriesKey` from `@dhan/core`, which is the point: the row's name and the
 * recurring detector's idea of a series are stripped by the same code and cannot disagree.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { merchantOf, narratedName } from './merchant.ts'

describe('narratedName', () => {
  it('takes the counterparty out of the UPI grammar, not the rail or the bank code', () => {
    assert.equal(narratedName('UPI/DR/123456/SWIGGY/HDFC/swiggy@hdfcbank/FOOD'), 'Swiggy')
    assert.equal(narratedName('UPI/CR/998877/RAHUL SHARMA/ICIC/rahul@okicici/P2P'), 'Rahul Sharma')
  })

  it('reads a card narration past the rail and stops before the masked PAN', () => {
    assert.equal(narratedName('POS/ZARA INDIA/4523XXXXXX1234'), 'Zara India')
  })

  it('names the lines the bank writes itself, which have no counterparty at all', () => {
    assert.equal(narratedName('SB INT CR'), 'Savings interest')
    assert.equal(narratedName('NFS/CASH WDL ATM 4412'), 'Cash withdrawal')
    assert.equal(narratedName('GST @18% ON CHGS'), 'GST on charges')
  })

  it('returns null rather than inventing a merchant out of the plumbing', () => {
    // The sandbox narrates every line as `S1 TXN 20`; "a transaction" is not who was paid.
    assert.equal(narratedName('S1 TXN 20'), null)
    assert.equal(narratedName('NEFT/IMPS/TRF'), null)
    assert.equal(narratedName(''), null)
  })
})

describe('merchantOf', () => {
  it('falls back to the direction of the money, and only then', () => {
    assert.equal(merchantOf({ narration: 'S1 TXN 20', txnType: 'DEBIT' }), 'Money out')
    assert.equal(merchantOf({ narration: 'S1 TXN 20', txnType: 'CREDIT' }), 'Money in')
    assert.equal(
      merchantOf({ narration: 'UPI/DR/1/SWIGGY/HDFC/swiggy@hdfcbank/FOOD', txnType: 'DEBIT' }),
      'Swiggy',
    )
  })
})
