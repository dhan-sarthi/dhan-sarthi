/**
 * The deterministic question router.
 *
 * The router is a ladder of regexes in a deliberate order, and the ordering is the part that
 * breaks silently: "what are my subscriptions costing me" contains "costing", so the general
 * spending handler would swallow it if it were listed first, and nothing about the answer
 * would look wrong — it would just be the wrong answer. Ordering cannot be checked by reading,
 * only by asking.
 *
 * `@dhan/fixtures/src/query.test.ts` asks whether Rohan's real ledger produces sensible
 * answers, which needs merchant narrations a generator writes. This asks which handler a
 * question reaches and what it refuses to invent, which needs four transactions and a literal.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildDailyPlan } from './dailyplan.ts'
import { answer, openingLine, suggestedQuestions } from './query.ts'
import { buildRoadmap } from './roadmap.ts'
import { SHELF, customerFile, snapshot, txn } from './snapshot.testkit.ts'

const ASOF = '2026-09-01'

const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`

/** Four August lines and one July line, so a window boundary is actually crossed. */
const LEDGER = customerFile([
  txn({ txnDate: '2026-07-20', txnAmount: 900, narration: 'UPI/SWIGGY/ORDER' }),
  txn({ txnDate: '2026-08-04', txnAmount: 1_200, narration: 'UPI/SWIGGY/ORDER' }),
  txn({ txnDate: '2026-08-11', txnAmount: 800, narration: 'UPI/ZOMATO/ORDER' }),
  txn({ txnDate: '2026-08-19', txnAmount: 2_400, narration: 'POS/BIGBAZAAR/GROCERY' }),
  txn({
    txnDate: '2026-08-25',
    txnAmount: 60_000,
    narration: 'NEFT/ACME/SALARY',
    txnType: 'CREDIT',
  }),
])

const base = snapshot({ asOf: ASOF })

describe('routing', () => {
  it('sends a subscription question to the subscription handler, not to spending', () => {
    // The specific question has to beat the general one even though it contains "costing".
    const a = answer('What are my subscriptions costing me?', base, LEDGER)
    assert.equal(a.matched, true)
    assert.equal(a.text, 'No live subscriptions on your account.')
    assert.equal(a.resolved, undefined, 'the spending handler is the one that resolves a window')
  })

  it('sends a safe-to-spend question to the envelope, not to total spending', () => {
    const a = answer('What can I safely spend today?', base, LEDGER)
    assert.equal(a.matched, true)
    // 100,000 in less 40,000 committed.
    assert.match(a.text, /60,000 this month after everything committed/)
  })

  it('quotes the plan’s pot when the caller has one, so the screen and the sentence agree', () => {
    const a = answer('How much can I spend?', base, LEDGER, {
      safeToSpend: {
        pot: 18_400,
        envelope: 23_400,
        limit: null,
        affordable: 23_400,
        perDay: 613,
        daysToSalary: 30,
        nextSalaryDate: '2026-10-01',
        incomeStability: 'regular',
        reserved: [{ label: 'Plan', amount: 5_000 }],
      },
    })

    assert.match(a.text, /18,400 left to spend/)
    assert.match(a.text, /613 a day/)
    // And not the bare envelope, which is a different number.
    assert.doesNotMatch(a.text, /60,000 this month after everything committed/)
  })

  it('reads out what is held back in the engine’s words, acronyms intact', () => {
    const ledger = customerFile([...LEDGER.transactions, txn({ txnDate: ASOF, txnAmount: 700 })])
    const roadmap = buildRoadmap(
      base,
      {
        id: 'goal-test',
        kind: 'wealth_target',
        purpose: 'A house deposit',
        targetAmount: 2_000_000,
        targetDate: '2036-09-01',
        createdAt: ASOF,
      },
      SHELF,
      ASOF,
    )
    const { safeToSpend } = buildDailyPlan(base, roadmap, ledger.transactions, SHELF, ASOF)
    const plan = inr(roadmap.monthlyCommitment)
    const a = answer('How much can I spend?', base, ledger, { safeToSpend })

    // The plan's row in Budget's words. "Saved and invested" read a ₹985 premium as the
    // customer's own investing, beside a Holdings tab showing ₹40,000 a month of SIPs.
    assert.deepEqual(
      safeToSpend.reserved.map((r) => r.label),
      ['Rent, bills and EMIs', 'Set aside for your plan', 'Already spent this month'],
    )
    // Lowercasing the whole label read "rent, bills and emis" aloud.
    assert.ok(
      a.text.includes(
        `That is after rent, bills and EMIs ₹40,000, set aside for your plan ${plan}, ` +
          `already spent this month ₹700, out of ₹1,00,000 coming in.`,
      ),
      a.text,
    )
    assert.ok(a.evidence.includes(`Set aside for your plan: ${plan}`))
  })

  it('leaves a held-back label that opens on an acronym as it is', () => {
    const a = answer('How much can I spend?', base, LEDGER, {
      safeToSpend: {
        pot: 18_400,
        envelope: 23_400,
        limit: null,
        affordable: 23_400,
        perDay: 613,
        daysToSalary: 30,
        nextSalaryDate: '2026-10-01',
        incomeStability: 'regular',
        reserved: [{ label: 'EMIs and bills', amount: 5_000 }],
      },
    })
    assert.match(a.text, /That is after EMIs and bills ₹5,000,/)
  })

  it('sends a ULIP question to the refusal before the general protection handler', () => {
    // "savings plan" would also match /\bplan\b/-style protection wording downstream.
    const a = answer('My cousin says I should take a LIC savings plan', base, LEDGER)
    assert.match(a.text, /^No\. A ULIP/)
  })

  it('answers a protection question differently with and without dependents', () => {
    const alone = answer('Do I need life cover?', base, LEDGER)
    assert.match(alone.text, /Nobody depends on your income/)

    const withFamily = answer(
      'Do I need life cover?',
      snapshot({
        protection: {
          dependents: 2,
          lifeCoverInForce: 500_000,
          lifeCoverNeeded: 12_000_000,
          gap: 11_500_000,
        },
      }),
      LEDGER,
    )
    assert.match(withFamily.text, /2 people depend on your income/)
    assert.match(withFamily.text, /1,20,00,000/)
  })

  it('falls through, and says so, rather than guessing at a number', () => {
    const a = answer('who won the cricket', base, LEDGER)
    assert.equal(a.matched, false)
    assert.match(a.text, /I am not sure what you are asking/)
  })

  it('answers every question it offers as a tap', () => {
    // A suggested question that lands on the fallback is a visible product bug: the app put
    // the words in the customer's mouth and then failed to understand them.
    for (const q of suggestedQuestions(base)) {
      assert.equal(answer(q, base, LEDGER).matched, true, q)
    }
  })

  it('offers the debt and protection taps only when they apply', () => {
    assert.equal(
      suggestedQuestions(base).some((q) => /debt/i.test(q)),
      false,
    )
    const encumbered = snapshot({
      debt: {
        total: 186_000,
        hasHighInterest: true,
        highInterestTotal: 186_000,
        highestRate: 34.8,
      },
      protection: { dependents: 2, lifeCoverNeeded: 12_000_000, gap: 12_000_000 },
    })
    const qs = suggestedQuestions(encumbered)
    assert.ok(qs.some((q) => /debt/i.test(q)))
    assert.ok(qs.some((q) => /LIC savings plan/i.test(q)))
    for (const q of qs) assert.equal(answer(q, encumbered, LEDGER).matched, true, q)
  })
})

describe('the debt handler', () => {
  it('charges the dear rate to the dear balance only', () => {
    // ₹8,14,000 owed, ₹1,86,000 of it on a card at 34.8%. Charging the card's rate to the
    // whole book quotes ₹23,615 a month where the truth is ₹5,394.
    const mixed = snapshot({
      debt: {
        total: 814_000,
        hasHighInterest: true,
        highInterestTotal: 186_000,
        highestRate: 34.8,
        monthlyOutgo: 18_000,
      },
    })
    const a = answer('Should I clear my card first?', mixed, LEDGER)

    assert.match(a.text, /5,394 a month in interest/)
    assert.doesNotMatch(a.text, /23,615/)
    assert.match(a.text, /clear it first/)
  })

  it('says a cheap balance may be invested alongside', () => {
    const cheap = snapshot({
      debt: { total: 628_000, hasHighInterest: false, highInterestTotal: 0, highestRate: 9.4 },
    })
    assert.match(
      answer('what about my loan', cheap, LEDGER).text,
      /low enough to invest alongside it/,
    )
  })

  it('says nothing is outstanding rather than quoting zeroes', () => {
    assert.equal(
      answer('how much do I owe', base, LEDGER).text,
      'Nothing outstanding. That is a good place to be.',
    )
  })
})

describe('window and category resolution', () => {
  it('defaults to the last complete calendar month and says which', () => {
    const a = answer('What did I spend on food?', base, LEDGER)

    assert.deepEqual(a.resolved, {
      from: '2026-08-01',
      to: '2026-09-01',
      category: 'Food & dining',
    })
    // The August Swiggy and Zomato lines, not the July one.
    assert.match(a.text, /2,000 on food & dining in August/)
    assert.doesNotMatch(a.text, /2,900/)
  })

  it('reads "this month so far" as the current partial month', () => {
    const a = answer('What have I spent this month so far?', base, LEDGER)
    assert.equal(a.resolved?.from, '2026-09-01')
    assert.equal(a.resolved?.to, ASOF)
  })

  it('reads "this year" as the last twelve months', () => {
    const a = answer('What did I spend this year?', base, LEDGER)
    assert.equal(a.resolved?.from, '2025-09-01')
  })

  it('carries no category when the question names none', () => {
    const a = answer('What did I spend last month?', base, LEDGER)
    assert.equal(a.resolved?.category, undefined)
    // Everything debited in August: 1,200 + 800 + 2,400. The salary credit is not spending.
    assert.match(a.text, /4,400 on everything in August/)
  })

  it('names the window rather than inventing a total when nothing matches', () => {
    const a = answer('What did I spend on entertainment last month?', base, LEDGER)
    assert.match(a.text, /Nothing on Entertainment in August that I can see/)
    assert.equal(a.resolved?.category, 'Entertainment')
  })
})

describe('openingLine', () => {
  it('reads out the diagnosis when the statement supports one', () => {
    const a = openingLine(base)
    assert.equal(a.matched, true)
    assert.match(a.text, /^Test, /)
    assert.match(a.text, /1,00,000 comes in/)
    assert.match(a.text, /40,000 is spoken for/)
    assert.match(a.text, /about ₹20,000 goes on the rest/)
  })

  it('drops the clauses it cannot support instead of quoting fabricated zeroes', () => {
    // Over IDBI's own feed no salary is recognisable and no habit has a merchant. The first
    // version of this said "₹0 comes in. ₹0 is committed … and about ₹0 goes on everything
    // else" — three invented figures in the opening sentence of an advisor whose whole claim
    // is that it read the ledger.
    const unreadable = snapshot({
      income: { monthly: 0 },
      commitments: { total: 0, rent: 0, emis: 0, bills: 0, subscriptions: 0, obligations: 0 },
      discretionary: { monthly: 0, topHabits: [] },
      surplus: { monthly: 0, deployable: 0 },
      balances: { savings: 56_780, total: 56_780, idleFloor: 0, idleMonths: 0 },
      debt: { total: 814_000, monthlyOutgo: 18_000 },
    })
    const a = openingLine(unreadable)

    assert.doesNotMatch(a.text, /₹0/)
    assert.match(a.text, /56,780 across your accounts/)
    assert.match(a.text, /Tell me what comes in/)
    assert.ok(a.evidence.includes('No salary found in the statement'))
  })

  it('shortens to one clause without claiming a breakdown it does not have', () => {
    const partial = snapshot({
      income: { monthly: 44_805 },
      commitments: { total: 0, rent: 0, emis: 0, bills: 0, subscriptions: 0, obligations: 0 },
      discretionary: { monthly: 0, topHabits: [] },
    })
    const a = openingLine(partial)

    assert.match(a.text, /44,805 comes in/)
    assert.doesNotMatch(a.text, /₹0/)
    assert.match(a.text, /Nothing else in this statement is clear enough to break down yet/)
  })
})
