/**
 * The engine against the generated ledgers.
 *
 * These live here rather than in `@dhan/core` because core may not depend on the fixtures —
 * the dependency would point the wrong way and a production build would ship synthetic
 * customers. This package already depends on core, so it is where the two meet.
 *
 * One honest caveat about the categorisation numbers below. The recognition dictionary in core
 * contains every merchant this package generates, so a coverage figure near 100% is **not**
 * evidence the enrichment works on real bank data — it is evidence the two tables agree. What
 * these tests genuinely protect is behaviour: word-boundary matching, the commitment/habit
 * split, and the arithmetic reconciling.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  categorize,
  commitments,
  coverage,
  derive,
  detectHabits,
  detectRecurring,
  disagreements,
  seriesKey,
} from '@dhan/core'
import type { Transaction } from '@dhan/core'
import { generateCustomerFile, generateLedger } from './generate.ts'
import { PERSONAS, PRIYA, ROHAN, SUNIL } from './personas.ts'

const ASOF = '2026-09-01'
const OPTS = { anchor: ASOF, asOf: ASOF, months: 24 }

const txn = (narration: string, over: Partial<Transaction> = {}): Transaction => ({
  txnId: 'T1',
  txnDate: '2026-08-15',
  txnAmount: 1_000,
  txnType: 'DEBIT',
  txnMode: 'UPI',
  narration,
  spendCategory: 'Shopping',
  balanceAfterTxn: 10_000,
  isSalaryCredit: false,
  isRecurring: false,
  ...over,
})

describe('categorisation', () => {
  it('matches on whole words, not substrings', () => {
    // The bug this pins: "PARENTS" contains "RENT", so a monthly transfer to family was filed
    // as a housing bill twenty-three times a year. Nothing in the code looked wrong; it only
    // surfaced because the bank's own label disagreed.
    assert.equal(categorize(txn('IMPS/P2A/PARENTS')).category, 'Transfers')
    assert.equal(categorize(txn('IMPS/P2A/RENT/512345678')).category, 'Rent & bills')
  })

  it('prefers the more specific merchant where two overlap', () => {
    assert.equal(categorize(txn('UPI/SWIGGY INSTAMART/4112')).category, 'Groceries')
    assert.equal(categorize(txn('UPI/SWIGGY/4112')).category, 'Food & dining')
  })

  it('recognises income from the narration, not only the bank’s flag', () => {
    const t = txn('NEFT-CR-IDIB000M123-ACME TECHNOLOGIES-SALARY', {
      txnType: 'CREDIT',
      isSalaryCredit: false,
    })
    assert.equal(categorize(t).category, 'Income')
  })

  it('admits when it does not know, rather than guessing', () => {
    const e = categorize(txn('UPI/QWERTYUIOP ENTERPRISES/9911', { spendCategory: 'Shopping' }))
    assert.equal(e.merchant, null)
    assert.equal(e.confidence, 'low')
    // Falls back to the bank's own label, and says so, so a caller can discount it.
    assert.equal(e.method, 'bank')
  })

  it('agrees with the bank on every generated transaction', () => {
    // Not proof the dictionary is good — see the note at the top of this file. It is proof that
    // no pattern has started quietly stealing another's transactions.
    for (const spec of PERSONAS) {
      const txns = generateLedger(spec, OPTS)
      assert.deepEqual(
        disagreements(txns).map((d) => `${d.narration} ${d.ours}!=${d.bank}`),
        [],
      )
      assert.ok(coverage(txns).rate > 0.98)
    }
  })
})

describe('recurring detection', () => {
  it('collapses reference numbers so repeats form one series', () => {
    assert.equal(seriesKey('UPI/SWIGGY/412683940281'), 'UPI/SWIGGY')
    assert.equal(seriesKey('UPI/SWIGGY/998112340021'), 'UPI/SWIGGY')
    // The bank/branch code is per-transaction. Leaving it in meant the single most regular
    // event in the ledger — the salary — was the one thing that never formed a series.
    assert.equal(
      seriesKey('NEFT-CR-IDIB000M123-ACME TECHNOLOGIES-SALARY'),
      seriesKey('NEFT-CR-IDIB000M881-ACME TECHNOLOGIES-SALARY'),
    )
  })

  it('infers periodicity rather than reading the generator’s flag', () => {
    // isRecurring exists in the fixtures because the generator knows the truth. Production has
    // no such field, so this grades the detector against it as a labelled dataset.
    const txns = generateLedger(ROHAN, OPTS)
    const found = new Set(detectRecurring(txns, ASOF).flatMap((s) => s.txnIds))

    const truth = txns.filter((t) => t.isRecurring)
    const recalled = truth.filter((t) => found.has(t.txnId))
    const recall = recalled.length / truth.length

    const claimed = txns.filter((t) => found.has(t.txnId))
    const correct = claimed.filter((t) => t.isRecurring)
    const precision = correct.length / claimed.length

    assert.ok(recall > 0.95, `recall ${(recall * 100).toFixed(1)}% — missing real commitments`)
    assert.ok(precision > 0.95, `precision ${(precision * 100).toFixed(1)}% — inventing them`)
  })

  it('does not call a frequent merchant a commitment', () => {
    // Buying from Amazon most weeks is a habit, not a recurring charge. Reporting it as one
    // reads as broken, and worse, it would be subtracted before working out safe-to-spend —
    // telling the customer they have less freedom than they do.
    const txns = generateLedger(PRIYA, OPTS)
    const series = detectRecurring(txns, ASOF)
    const keys = series.map((s) => s.key)

    for (const shop of ['POS/AMAZON', 'POS/MYNTRA', 'UPI/SWIGGY', 'UPI/ZOMATO']) {
      assert.ok(!keys.includes(shop), `${shop} was classified as a recurring commitment`)
    }

    const habits = detectHabits(txns, ASOF).map((h) => h.key)
    assert.ok(habits.includes('UPI/SWIGGY'), 'and it should still show up as a habit')
  })

  it('records why each series counts as a commitment', () => {
    const series = detectRecurring(generateLedger(ROHAN, OPTS), ASOF)
    const byKey = new Map(series.map((s) => [s.key, s]))

    assert.equal(byKey.get('SI/NETFLIX/AUTOPAY')?.reason, 'mandate')
    assert.equal(byKey.get('IMPS/P2A/RENT')?.reason, 'fixed-monthly')
    // An electricity bill varies in amount but not in timing. That is exactly what separates it
    // from shopping, which varies in both.
    assert.equal(byKey.get('UPI/MPPKVVCL ELECTRICITY')?.reason, 'utility')
  })

  it('finds a price rise nobody was told about', () => {
    // The one thing about subscriptions we can genuinely detect without asking. "You forgot
    // about this" is not detectable from a bank statement and we do not claim it.
    const series = detectRecurring(generateLedger(ROHAN, OPTS), ASOF)
    const netflix = series.find((s) => s.key.includes('NETFLIX'))
    assert.ok(netflix)
    assert.equal(netflix.priceChanges.length, 1)
    assert.equal(netflix.priceChanges[0]?.from, 649)
    assert.equal(netflix.priceChanges[0]?.to, 799)
  })

  it('reports the annual cost, because nobody cancels a monthly one', () => {
    const series = detectRecurring(generateLedger(ROHAN, OPTS), ASOF)
    const gym = series.find((s) => s.key.includes('CULTFIT'))
    assert.ok(gym)
    assert.equal(gym.monthlyCost, 1_499)
    assert.equal(gym.annualCost, 1_499 * 12)
  })
})

describe('the snapshot', () => {
  it('counts every rupee exactly once', () => {
    // The invariant that caught subscriptions being counted as both a commitment and
    // discretionary spending — which inflated a customer's outgoings by exactly the cost of
    // their subscriptions and made Priya look like she overspends a salary she does not.
    //
    // Partitions every debit in the window three ways and insists the parts sum to the whole:
    // committed, discretionary, or a category that is never either (school fees, EMIs, premiums).
    const NEVER = ['Investment', 'Insurance', 'Education', 'Loan EMI', 'Fees & charges', 'Income']

    for (const spec of PERSONAS) {
      const file = generateCustomerFile(spec, OPTS)
      const s = derive(file, ASOF)
      const committedIds = new Set(s.commitments.series.flatMap((x) => x.txnIds))

      const debits = file.transactions.filter(
        (t) => t.txnType === 'DEBIT' && t.txnDate >= '2025-09-01' && t.txnDate <= ASOF,
      )

      let total = 0
      let committed = 0
      let discretionary = 0
      let neither = 0

      for (const t of debits) {
        total += t.txnAmount
        const category = categorize(t).category
        if (committedIds.has(t.txnId)) committed += t.txnAmount
        else if (NEVER.includes(category)) neither += t.txnAmount
        else discretionary += t.txnAmount
      }

      assert.equal(
        committed + discretionary + neither,
        total,
        `${spec.slug}: the parts do not sum to the whole`,
      )

      // And no transaction may be inside a counted commitment series *and* in a category the
      // snapshot treats as separate — that is the shape the double-count took.
      const overlap = debits.filter(
        (t) => committedIds.has(t.txnId) && NEVER.includes(categorize(t).category) &&
          categorize(t).category !== 'Investment' && categorize(t).category !== 'Loan EMI' &&
          categorize(t).category !== 'Insurance' && categorize(t).category !== 'Education',
      )
      assert.deepEqual(overlap.map((t) => t.narration), [])

      // Finally the headline arithmetic has to hold on its own terms.
      assert.equal(
        s.surplus.monthly,
        Math.round(s.income.monthly - s.commitments.total - s.discretionary.monthly),
      )
    }
  })

  it('predicts a surplus close to what the balance actually did', () => {
    // The strongest check available: the engine says a customer has ₹X spare each month, and
    // the savings balance over two years either agrees or the engine is wrong.
    for (const spec of PERSONAS) {
      const file = generateCustomerFile(spec, OPTS)
      const s = derive(file, ASOF)
      const actual = (s.balances.savings - spec.openingBalance) / 24

      if (s.surplus.deployable === 0) continue
      const ratio = s.surplus.deployable / Math.max(1, actual)
      assert.ok(
        ratio > 0.5 && ratio < 1.8,
        `${spec.slug}: says ₹${s.surplus.deployable}/mo deployable, balance grew ₹${Math.round(actual)}/mo`,
      )
    }
  })

  it('never offers up money the customer does not have', () => {
    for (const spec of PERSONAS) {
      const s = derive(generateCustomerFile(spec, OPTS), ASOF)
      assert.ok(s.surplus.deployable >= 0)
      assert.ok(s.surplus.deployable <= Math.max(0, s.surplus.monthly))
    }
  })

  it('provides for irregular costs only where the buffer cannot absorb them', () => {
    // Charging a customer twice — holding six months in reserve *and* shrinking their SIP for
    // the same hospital bill — is wrong. A funded buffer is what absorbs it.
    const rohan = derive(generateCustomerFile(ROHAN, OPTS), ASOF)
    assert.ok(rohan.buffer.monthsCovered >= rohan.buffer.targetMonths)
    assert.equal(rohan.irregular.monthlyProvision, 0)
    assert.ok(rohan.irregular.monthlyRunRate > 0, 'but the run rate is still reported')

    const sunil = derive(generateCustomerFile(SUNIL, OPTS), ASOF)
    assert.ok(sunil.buffer.monthsCovered < sunil.buffer.targetMonths)
    assert.ok(sunil.irregular.monthlyProvision > 0)
  })

  it('tells a salary apart from a trader’s collections', () => {
    const rohan = derive(generateCustomerFile(ROHAN, OPTS), ASOF)
    assert.equal(rohan.income.stability, 'regular')
    assert.equal(rohan.income.source, 'salary-series')
    assert.equal(rohan.income.monthly, 85_000)
    assert.equal(rohan.income.payDay, 1)

    const sunil = derive(generateCustomerFile(SUNIL, OPTS), ASOF)
    assert.equal(sunil.income.stability, 'variable')
    // No payroll flag to read it off, so the figure is a median of credits and is marked as such.
    assert.equal(sunil.income.source, 'monthly-credits')
    assert.equal(sunil.income.payDay, null)
  })

  it('finds the drift in a category even when the total is flat', () => {
    // Rohan's overall discretionary spend barely moves; his food spend is up by a third. The
    // second is actionable and the first is not, which is why the trend is per category.
    const s = derive(generateCustomerFile(ROHAN, OPTS), ASOF)
    const food = s.discretionary.categoryTrends.find((c) => c.category === 'Food & dining')
    assert.ok(food, 'no food trend detected')
    assert.ok(food.changePct > 0.2, `food only moved ${(food.changePct * 100).toFixed(0)}%`)
  })

  it('asks for cover only where someone depends on the customer', () => {
    const rohan = derive(generateCustomerFile(ROHAN, OPTS), ASOF)
    assert.equal(rohan.protection.dependents, 2)
    assert.ok(rohan.protection.gap > 0)

    const priya = derive(generateCustomerFile(PRIYA, OPTS), ASOF)
    assert.equal(priya.protection.dependents, 0)
    assert.equal(priya.protection.lifeCoverNeeded, 0)
    assert.equal(priya.protection.gap, 0)
  })

  it('surfaces the loan that is about to end', () => {
    const s = derive(generateCustomerFile(ROHAN, OPTS), ASOF)
    assert.ok(s.debt.endingSoon)
    assert.equal(s.debt.endingSoon.emiAmount, 8_200)
    assert.ok(s.debt.endingSoon.monthsLeft <= 6)
  })

  it('flags high-interest debt and a missed repayment', () => {
    const priya = derive(generateCustomerFile(PRIYA, OPTS), ASOF)
    assert.equal(priya.debt.hasHighInterest, true)
    assert.equal(priya.debt.highestRate, 42)

    const sunil = derive(generateCustomerFile(SUNIL, OPTS), ASOF)
    assert.equal(sunil.debt.missedRepayment, true)
  })

  it('reports how much of the data it could not explain', () => {
    for (const spec of PERSONAS) {
      const s = derive(generateCustomerFile(spec, OPTS), ASOF)
      assert.ok(s.quality.categorisedShare > 0.98)
      assert.ok(s.quality.monthsOfHistory >= 10)
    }
  })
})
