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
import { findInsights } from './insights.ts'
import { answer, openingLine, openingRead, planAhead, suggestedQuestions } from './query.ts'
import type { AheadPlan, AheadRoadmap } from './query.ts'
import type { Series } from './recurring.ts'
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

/** A recurring payment as `detectRecurring` would report it, monthly unless told otherwise. */
function series(overrides: Partial<Series> & Pick<Series, 'key' | 'kind' | 'monthlyCost'>): Series {
  return {
    merchant: null,
    category: 'Transfers',
    mode: 'IMPS',
    cadence: 'monthly',
    intervalDays: 30,
    dayOfMonth: 2,
    occurrences: 12,
    firstSeen: '2025-09-02',
    lastSeen: '2026-08-02',
    amount: overrides.monthlyCost,
    annualCost: overrides.monthlyCost * 12,
    amountVariation: 0,
    fixed: true,
    active: true,
    priceChanges: [],
    reason: 'fixed-monthly',
    txnIds: [],
    ...overrides,
  }
}

describe('openingRead', () => {
  // Rohan's month, in the shape the engine derives it: ₹85,000 salary, ₹51,997 committed.
  const rohan = snapshot({
    customer: { name: 'Rohan Mehta' },
    income: { monthly: 85_000, source: 'salary-series' },
    commitments: {
      total: 51_997,
      rent: 24_500,
      emis: 8_200,
      bills: 4_030,
      obligations: 8_000,
      subscriptions: 2_267,
      investments: 5_000,
      series: [
        series({
          key: 'IMPS/P2A/SUDHIR PATEL/RENT',
          kind: 'rent',
          category: 'Rent & bills',
          monthlyCost: 24_500,
        }),
        series({
          key: 'ACH/DR/IDBI BANK RETAIL ASSETS',
          kind: 'emi',
          category: 'Loan EMI',
          merchant: 'Lender',
          monthlyCost: 8_200,
        }),
        series({ key: 'IMPS/P2A/MEENA MEHTA/FAMILY', kind: 'obligation', monthlyCost: 8_000 }),
        series({
          key: 'ACH/DR/INDIAN CLEARING CORP',
          kind: 'sip',
          category: 'Investment',
          merchant: 'Mutual fund',
          monthlyCost: 5_000,
        }),
        series({ key: 'ELECTRICITY', kind: 'bill', category: 'Rent & bills', monthlyCost: 2_152 }),
        series({ key: 'CULT.FIT', kind: 'subscription', category: 'Health', monthlyCost: 1_499 }),
      ],
    },
    discretionary: {
      monthly: 22_070,
      byCategory: [
        ['Shopping', 93_234],
        ['Food & dining', 77_259],
        ['Groceries', 59_251],
        ['Health', 38_034],
      ],
    },
    surplus: { monthly: 10_933, deployable: 10_933 },
  })

  it('talks in round totals and names the payments the customer will recognise', () => {
    const text = openingRead(rohan)

    assert.match(text, /^Rohan, your salary is ₹85,000 a month\./)
    assert.match(text, /About ₹52,000 of it is gone before you even start/)
    assert.match(
      text,
      /₹24,500 on rent, ₹8,200 on your loan EMI and ₹8,000 you send home to family\./,
    )
    assert.match(text, /The rest of that is your SIP, bills and subscriptions\./)
    assert.match(
      text,
      /Then about ₹22,000 goes on everyday spending, mostly shopping, eating out and groceries\./,
    )
    assert.match(text, /That leaves about ₹11,000 spare each month\./)
    // No exact total read out like a statement line.
    assert.doesNotMatch(text, /51,997|22,070|10,933/)
  })

  it('never names a transfer the narration does not explain', () => {
    const unexplained = snapshot({
      ...rohan,
      commitments: {
        ...rohan.commitments,
        series: [series({ key: 'IMPS/P2A/A PERSON', kind: 'transfer', monthlyCost: 8_000 })],
      },
    })
    const text = openingRead(unexplained)

    assert.doesNotMatch(text, /family|parents/i)
    assert.match(text, /of it goes on payments that come round every month\./)
  })

  it('says fees for a school or a daycare, and a card payment as a card payment', () => {
    const text = openingRead(
      snapshot({
        ...rohan,
        commitments: {
          ...rohan.commitments,
          series: [
            series({
              key: 'IMPS/P2A/SARASWATI VIDYALAYA/SCHOOL FEE',
              kind: 'obligation',
              category: 'Education',
              monthlyCost: 12_400,
            }),
            series({
              key: 'CREDITCARD PAYMENT XX',
              kind: 'emi',
              category: 'Loan EMI',
              monthlyCost: 8_494,
            }),
          ],
        },
      }),
    )
    assert.match(text, /₹12,400 on school fees and ₹8,494 towards your credit card/)
  })

  it('sums up the rest in three at most, largest first, each named for what it is', () => {
    // Karan's month: seven recurring payments after the three that get named.
    const text = openingRead(
      snapshot({
        ...rohan,
        commitments: {
          ...rohan.commitments,
          series: [
            series({ key: 'IMPS/P2A/SANJEEV KULKARNI/RENT', kind: 'rent', monthlyCost: 42_000 }),
            series({ key: 'ACH/DR/IDBI BANK RETAIL ASSETS', kind: 'emi', monthlyCost: 18_500 }),
            series({
              key: 'IMPS/P2A/SHUBHANGI DESHPANDE/FAMILY',
              kind: 'obligation',
              monthlyCost: 15_000,
            }),
            series({
              key: 'IMPS/P2A/LITTLE WINGS DAYCARE/FEES',
              kind: 'obligation',
              category: 'Education',
              monthlyCost: 12_000,
            }),
            series({ key: 'CREDITCARD PAYMENT XX', kind: 'emi', monthlyCost: 11_788 }),
            series({ key: 'ACH/DR/NPCI NACH', kind: 'sip', monthlyCost: 7_000 }),
            series({ key: 'ELECTRICITY', kind: 'bill', monthlyCost: 2_118 }),
            series({ key: 'CULT.FIT', kind: 'subscription', monthlyCost: 1_599 }),
          ],
        },
      }),
    )
    assert.match(
      text,
      /The rest of that is daycare, your credit card, your SIP and a few other payments\./,
    )
  })

  it('says "about" only when a total is not already round, and income that is not a salary as what comes in', () => {
    const text = openingRead(
      snapshot({
        ...rohan,
        income: { ...rohan.income, monthly: 68_522, source: 'monthly-credits' },
      }),
    )
    assert.match(text, /^Rohan, about ₹69,000 comes in each month\./)
  })

  it('falls back to the written opening when the statement is too thin to break down', () => {
    const thin = snapshot({
      income: { monthly: 44_805 },
      commitments: { total: 0, rent: 0, emis: 0, bills: 0, subscriptions: 0, obligations: 0 },
      discretionary: { monthly: 0, topHabits: [] },
    })
    assert.equal(openingRead(thin), openingLine(thin).text)
  })
})

describe('planAhead', () => {
  // Rohan on 1 September: a deposit ten days from maturity, a loan five months from its last
  // EMI, and two people depending on an income with no life cover behind it.
  const rohan = snapshot({
    customer: { name: 'Rohan Mehta' },
    balances: {
      maturingSoon: {
        accountType: 'FD',
        amount: 200_000,
        maturityDate: '2026-09-11',
        daysLeft: 10,
        interestRate: 7.1,
      },
    },
    debt: { endingSoon: { loanType: 'Education Loan', emiAmount: 8_200, monthsLeft: 5 } },
    protection: {
      dependents: 2,
      lifeCoverInForce: 0,
      lifeCoverNeeded: 10_200_000,
      gap: 10_200_000,
    },
  })
  const roadmap: AheadRoadmap = {
    stages: [
      {
        kind: 'get_cover',
        monthly: 985,
        productId: 'INS_TERM_201',
        productName: 'IDBI Federal Term Cover',
      },
      {
        kind: 'grow',
        monthly: 9_948,
        productId: 'MF_INDEX_103',
        productName: 'Nifty 50 Index Fund',
      },
    ],
    goal: { purpose: 'Enough to stop working at 60' },
  }
  const plan: AheadPlan = { primary: { kind: 'open_sweep_in', productId: 'IDBI_SWEEP_001' } }

  it('joins the moments into one ordered plan, protection first, with dates and the price of waiting', () => {
    const ahead = planAhead(rohan, roadmap, plan, SHELF)
    assert.ok(ahead)
    const cost = findInsights(rohan).find((i) => i.kind === 'deposit_maturing')?.monthlyValue ?? 0

    assert.match(ahead.text, /^Rohan, two things are about to change for you\./)
    assert.match(ahead.text, /In 10 days, your ₹2,00,000 deposit matures\./)
    assert.match(
      ahead.text,
      /In 5 months, your education loan ends and ₹8,200 a month comes free\./,
    )
    assert.match(
      ahead.text,
      /First, your family\. Two people depend on your income, and you have no life cover\./,
    )
    assert.match(
      ahead.text,
      /₹1 crore of term cover costs ₹985 a month\. That's less than ₹33 a day\./,
    )
    assert.ok(ahead.text.includes(`costs you about ₹${cost.toLocaleString('en-IN')} a month`))
    assert.match(ahead.text, /Move it into a sweep-in instead, at about 6\.9%/)
    assert.match(
      ahead.text,
      /Third, when your education loan ends, put that ₹8,200 straight into a SIP\. That covers most of the ₹9,948 a month your goal needs: enough to stop working at 60\./,
    )
    assert.match(ahead.text, /Shall we start with your family's cover\?$/)
    // Each product the plan recommends goes to the gate on the call, in the order it is said.
    assert.deepEqual(ahead.products, ['IDBI Federal Term Cover', 'IDBI Sweep-in FD'])
  })

  it("stays quiet with only one moment, where the day's single suggestion is the honest answer", () => {
    const coverOnly = snapshot({ ...rohan, balances: { ...rohan.balances, maturingSoon: null } })
    assert.equal(
      planAhead(
        snapshot({ ...coverOnly, debt: { ...coverOnly.debt, endingSoon: null } }),
        roadmap,
        plan,
        SHELF,
      ),
      null,
    )
  })

  it('does not count a loan that ends more than six months out', () => {
    const late = snapshot({
      ...rohan,
      balances: { ...rohan.balances, maturingSoon: null },
      debt: {
        ...rohan.debt,
        endingSoon: { loanType: 'Car Loan', emiAmount: 12_000, monthsLeft: 9 },
      },
    })
    assert.equal(planAhead(late, roadmap, plan, SHELF), null)
  })

  it('names a cover that is short rather than missing, and a whole-rupee price a day exactly', () => {
    const ahead = planAhead(
      snapshot({
        ...rohan,
        protection: { ...rohan.protection, lifeCoverInForce: 200_000, gap: 10_000_000 },
      }),
      { ...roadmap, stages: [{ ...roadmap.stages[0]!, monthly: 900 }] },
      plan,
      SHELF,
    )
    assert.ok(ahead)
    assert.match(ahead.text, /your cover is ₹1 crore short/)
    assert.match(ahead.text, /That's ₹30 a day\./)
  })
})
