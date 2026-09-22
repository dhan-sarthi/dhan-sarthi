/**
 * The questions the app hands Uday, and where the engine sends each one.
 *
 * Two halves. The first pins the mapping: which question each finding, stage, verdict, record entry
 * and statement line produces, with its own figures in it, and which get none. The second puts every
 * question the module can build to core's own `answer()` — the router the API runs, no network — over
 * a hand-built customer, and checks it lands on the rule it was worded for. That half is the one that
 * matters: a rewording that trips an earlier rule ("recurring", "cost", "cover", "why") fails here
 * rather than in front of a customer as "I am not sure what you are asking".
 *
 * `@dhan/core` resolves to its build under `node --test`, as `spend.test.ts` already relies on.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { answer, findInsights, type CustomerFile, type Snapshot } from '@dhan/core'
import type { Insight, SpendCategory } from '@dhan/contracts'
import {
  CREDIT_FILE,
  COVER_PLUS_SAVINGS,
  EMERGENCY_SAVINGS,
  EMI_COST,
  EXPENSIVE_DEBT_FIRST,
  FIRST_THING,
  GOVERNMENT_SCHEME,
  HEALTH_COVER,
  INTEREST_PAID,
  INVEST_OR_CLEAR,
  LATE_REPAYMENT,
  LIFE_COVER,
  MISSED_REPAYMENT,
  NO_DEPENDANTS,
  PAY_FIRST,
  RM_INSTEAD,
  SAFE_TO_SPEND,
  SAVINGS_INTO_DEPOSIT,
  SAVINGS_RATE,
  SPARE_SAVINGS,
  SUBSCRIPTIONS,
  askFacts,
  biggestSpend,
  coverGapQuestion,
  creditQuestions,
  debtPayoffQuestion,
  depositQuestion,
  depositsQuestion,
  emiEndingQuestion,
  idleCashQuestion,
  leadQuestions,
  lumpSumQuestion,
  periodOf,
  prepayQuestion,
  questionForAdvice,
  questionForInsight,
  questionForLine,
  questionForProduct,
  questionForStage,
  questionForVerdict,
  spareQuestion,
  spendQuestion,
  swearJarQuestion,
  whereFromQuestion,
  wontClearQuestion,
  type AskFacts,
} from './ask.ts'

/** Each finding's headline in the shape `findInsights` writes it — the demo customers' own. */
const HEADLINE: Record<Insight['kind'], string> = {
  missed_repayment: 'You have a missed loan repayment on record.',
  expensive_debt: '₹1,86,240 at 34.8% costs you ₹5,401 a month.',
  protection_gap: 'Your life cover is about ₹2.28 crore short of what your dependents would need.',
  buffer_thin: 'Your savings cover about 1.3 months of your outgoings.',
  deposit_maturing: 'Your ₹2,00,000 deposit matures on 11 September, 10 days away.',
  emi_ending: 'Your education loan ends in 5 months. That frees ₹8,200 a month.',
  idle_cash: '₹1,41,663 has sat untouched in savings for 11 months.',
  price_increase: 'Netflix went from ₹499 to ₹649 in April 2026.',
  subscription_review: '3 subscriptions cost you ₹27,204 a year.',
  category_drift: 'Food & dining is up 32% in three months.',
  habit_cost: 'Fast food, 8.2 times a month. ₹96,845 a year.',
  human_handoff: 'You can talk to a person about any of this.',
}

const HABITS = [
  { key: 'POS PIZZA HUT PUNE', merchant: 'Fast food', category: 'Food & dining' as const },
  { key: 'POS DMART PUNE', merchant: 'DMart', category: 'Groceries' as const },
]

const KARAN: AskFacts = {
  debtTotal: 814_315,
  highestRate: 34.8,
  missedRepayment: true,
  dependents: 2,
  biggestSpend: 'Food & dining',
}
const NO_DEBT: AskFacts = { ...KARAN, debtTotal: 0, missedRepayment: false, dependents: 0 }

const ask = (kind: Insight['kind'], headline = HEADLINE[kind]) =>
  questionForInsight({ kind, headline }, HABITS)

describe('questionForInsight', () => {
  it('asks every finding about its subject, with its own figures', () => {
    assert.equal(ask('missed_repayment'), MISSED_REPAYMENT)
    assert.equal(ask('expensive_debt'), 'How do I clear ₹1,86,240 of debt at 34.8% fastest?')
    assert.equal(ask('protection_gap'), LIFE_COVER)
    // "Your savings cover…": the savings are the subject, not life cover.
    assert.equal(ask('buffer_thin'), EMERGENCY_SAVINGS)
    assert.equal(
      ask('deposit_maturing'),
      'What should I do with my savings and the ₹2,00,000 deposit?',
    )
    assert.equal(
      ask('emi_ending'),
      'My education loan ends in 5 months. Where should its ₹8,200 EMI go next?',
    )
    assert.equal(ask('idle_cash'), '₹1,41,663 never leaves my account. What should it do?')
    assert.equal(
      ask('price_increase'),
      'Netflix went up to ₹649. What do my subscriptions cost me now?',
    )
    assert.equal(ask('subscription_review'), SUBSCRIPTIONS)
    assert.equal(ask('category_drift'), 'How much did I spend on food last month?')
    assert.equal(ask('habit_cost'), 'How much did I spend on food last month?')
  })

  it('has no question for the finding about a person', () => {
    assert.equal(ask('human_handoff'), null)
  })

  it('keeps the subject when a headline is not in the shape it knows', () => {
    assert.equal(
      ask('expensive_debt', 'Your card is dear.'),
      'How do I clear my expensive debt fastest?',
    )
    assert.equal(
      ask('deposit_maturing', 'A deposit matures soon.'),
      'What should I do with my savings and deposits?',
    )
    assert.equal(
      ask('emi_ending', 'A loan ends soon.'),
      'Where should my loan EMI go once it ends?',
    )
    assert.equal(
      ask('idle_cash', 'Money is idle.'),
      'What should the money sitting in my savings do?',
    )
    assert.equal(ask('price_increase', 'A price went up.'), SUBSCRIPTIONS)
  })

  it('says one month, not one months', () => {
    assert.equal(
      ask('emi_ending', 'Your car loan ends in 1 month. That frees ₹5,000 a month.'),
      'My car loan ends in 1 month. Where should its ₹5,000 EMI go next?',
    )
  })

  it('finds a habit by its name, or its key where it has no name, and gives up without one', () => {
    assert.equal(
      questionForInsight(
        { kind: 'habit_cost', headline: 'DMart, 4.2 times a month. ₹71,972 a year.' },
        HABITS,
      ),
      'How much did I spend on groceries last month?',
    )
    assert.equal(
      questionForInsight(
        { kind: 'habit_cost', headline: 'POS CHAI POINT, 5 times a month. ₹9,000 a year.' },
        [{ key: 'POS CHAI POINT', merchant: null, category: 'Food & dining' }],
      ),
      'How much did I spend on food last month?',
    )
    assert.equal(questionForInsight({ kind: 'habit_cost', headline: HEADLINE.habit_cost }), null)
  })

  it('has no question for a category the engine has no word for', () => {
    assert.equal(ask('category_drift', 'Transfers is up 20% in three months.'), null)
  })
})

describe('spending questions', () => {
  it('names each category by the word the engine reads, singular where the plural misses', () => {
    assert.equal(spendQuestion('Groceries'), 'How much did I spend on groceries last month?')
    assert.equal(spendQuestion('Loan EMI'), 'How much did I spend on loan EMIs last month?')
    assert.equal(spendQuestion('Investment'), 'How much did I spend on investment last month?')
    assert.equal(
      spendQuestion('Rent & bills', 'this month'),
      'How much did I spend on rent and bills this month?',
    )
  })

  it('has none for a category with no word — and never says "fees", which reads as education', () => {
    for (const c of ['Insurance', 'Transfers', 'Fees & charges', 'Income'] as SpendCategory[]) {
      assert.equal(spendQuestion(c), null)
    }
  })

  it('picks the period that holds the line', () => {
    assert.equal(periodOf('2026-08-24', '2026-09-01'), 'last month')
    assert.equal(periodOf('2026-09-10', '2026-09-15'), 'this month')
    assert.equal(periodOf('2026-06-30', '2026-09-01'), 'over the last 12 months')
    assert.equal(periodOf('2025-12-20', '2026-01-05'), 'last month')
    // The as-of day itself falls in no window, so the latest whole month stands in for it.
    assert.equal(periodOf('2026-09-01', '2026-09-01'), 'last month')
  })

  it('takes the biggest category it has a word for', () => {
    assert.equal(
      biggestSpend([
        ['Transfers', 90_000],
        ['Shopping', 93_234],
        ['Food & dining', 77_259],
      ]),
      'Shopping',
    )
    assert.equal(biggestSpend([['Transfers', 21_000]]), undefined)
    assert.equal(biggestSpend([]), undefined)
  })

  it('asks where a gap comes from with the biggest category', () => {
    assert.equal(
      whereFromQuestion("I'm ₹5,992 a month short of my goal.", 'Shopping'),
      "I'm ₹5,992 a month short of my goal. How much did I spend on shopping last month?",
    )
    assert.equal(whereFromQuestion('Short.', undefined), null)
  })
})

describe('questionForLine', () => {
  const line = {
    txnType: 'DEBIT' as const,
    txnAmount: 410,
    txnDate: '2026-08-28',
    spendCategory: 'Groceries' as SpendCategory,
    isSalaryCredit: false,
    narration: 'POS SPENCER RETAIL PUNE',
  }

  it("asks what a spend's category cost in the period that holds it — never by the merchant", () => {
    assert.equal(
      questionForLine(line, '2026-09-01'),
      'How much did I spend on groceries last month?',
    )
    assert.equal(
      questionForLine({ ...line, txnDate: '2026-06-02' }, '2026-09-01'),
      'How much did I spend on groceries over the last 12 months?',
    )
  })

  it('asks what is safe to spend on pay, and what the account pays on its interest', () => {
    const pay = {
      ...line,
      txnType: 'CREDIT' as const,
      txnAmount: 192_000,
      txnDate: '2026-09-01',
      spendCategory: 'Income' as SpendCategory,
      isSalaryCredit: true,
      narration: 'NEFT/NORTHWIND SYSTEMS',
    }
    assert.equal(
      questionForLine(pay, '2026-09-01'),
      `₹1,92,000 came in on 1 Sept. ${SAFE_TO_SPEND}`,
    )
    const interest = {
      ...pay,
      txnAmount: 259,
      isSalaryCredit: false,
      narration: 'SB INT CR 01-04-2026 TO 30-06-2026',
    }
    assert.equal(questionForLine(interest, '2026-09-01'), SAVINGS_RATE)
  })

  it('asks the cover sum on a premium, and nothing on a transfer, a refund or a charge', () => {
    assert.equal(questionForLine({ ...line, spendCategory: 'Insurance' }, '2026-09-01'), LIFE_COVER)
    assert.equal(questionForLine({ ...line, spendCategory: 'Transfers' }, '2026-09-01'), null)
    assert.equal(questionForLine({ ...line, spendCategory: 'Fees & charges' }, '2026-09-01'), null)
    assert.equal(
      questionForLine({ ...line, txnType: 'CREDIT', spendCategory: 'Transfers' }, '2026-09-01'),
      null,
    )
  })
})

describe('the plan, the gate and the record', () => {
  it('asks each stage by what it is for', () => {
    assert.equal(
      questionForStage({ kind: 'get_cover', targetAmount: 1e7 }, KARAN),
      'Why does life cover come first on my plan?',
    )
    assert.equal(
      questionForStage({ kind: 'clear_debt', targetAmount: 186_240 }, KARAN),
      'How do I clear ₹1,86,240 of debt at 34.8% fastest?',
    )
    assert.equal(questionForStage({ kind: 'clear_debt', targetAmount: 0 }, KARAN), MISSED_REPAYMENT)
    assert.equal(questionForStage({ kind: 'clear_debt', targetAmount: 0 }, NO_DEBT), null)
    assert.equal(
      questionForStage({ kind: 'free_up', targetAmount: 5_992 }, KARAN),
      'I need to free up ₹5,992 a month. How much did I spend on food last month?',
    )
    assert.equal(
      questionForStage({ kind: 'build_buffer', targetAmount: 4e5 }, KARAN),
      EMERGENCY_SAVINGS,
    )
    assert.equal(questionForStage({ kind: 'grow', targetAmount: 2.2e7 }, KARAN), INVEST_OR_CLEAR)
    assert.equal(questionForStage({ kind: 'grow', targetAmount: 2.2e7 }, NO_DEBT), null)
  })

  const product = (category: string, extra: object = {}) =>
    ({ category, ...extra }) as Parameters<typeof questionForProduct>[0]

  it('asks a product by its kind, never by its name', () => {
    assert.equal(
      questionForProduct(product('Term Insurance', { coverType: 'life' }), KARAN),
      LIFE_COVER,
    )
    assert.equal(
      questionForProduct(product('Government Insurance', { coverType: 'life' }), KARAN),
      LIFE_COVER,
    )
    assert.equal(
      questionForProduct(product('Health Insurance', { coverType: 'health' }), NO_DEBT),
      HEALTH_COVER,
    )
    // With dependants the engine's cover answer is about life cover, so health gets no question.
    assert.equal(
      questionForProduct(product('Health Insurance', { coverType: 'health' }), KARAN),
      null,
    )
    assert.equal(
      questionForProduct(product('Government Insurance', { coverType: 'accident' }), KARAN),
      null,
    )
    assert.equal(
      questionForProduct(product('Endowment', { bundlesProtectionAndInvestment: true }), KARAN),
      COVER_PLUS_SAVINGS,
    )
    assert.equal(
      questionForProduct(product('ULIP', { bundlesProtectionAndInvestment: true }), KARAN),
      COVER_PLUS_SAVINGS,
    )
    for (const c of ['Sweep-in FD', 'Fixed Deposit', 'Recurring Deposit', 'Liquid']) {
      assert.equal(questionForProduct(product(c), KARAN), SAVINGS_INTO_DEPOSIT)
    }
    assert.equal(questionForProduct(product('Index Fund'), KARAN), INVEST_OR_CLEAR)
    assert.equal(questionForProduct(product('PPF'), NO_DEBT), null)
  })

  it('asks a refusal by the rule that stopped it, where the engine can speak to that rule', () => {
    const fund = product('Index Fund')
    assert.equal(
      questionForVerdict({ verdict: 'BLOCKED', ruleId: 'HIGH_INTEREST_DEBT' }, fund, KARAN),
      EXPENSIVE_DEBT_FIRST,
    )
    assert.equal(
      questionForVerdict({ verdict: 'BLOCKED', ruleId: 'MISSED_REPAYMENT' }, fund, KARAN),
      MISSED_REPAYMENT,
    )
    assert.equal(
      questionForVerdict({ verdict: 'BLOCKED', ruleId: 'EMERGENCY_BUFFER' }, fund, KARAN),
      EMERGENCY_SAVINGS,
    )
    assert.equal(
      questionForVerdict({ verdict: 'BLOCKED', ruleId: 'BUNDLED_PROTECTION' }, fund, KARAN),
      COVER_PLUS_SAVINGS,
    )
    for (const rule of [
      'RISK_CEILING',
      'VOLATILITY_VS_HORIZON',
      'AFFORDABILITY',
      'HORIZON_VS_LOCKIN',
      'TAX_BENEFIT_UNAVAILABLE',
    ]) {
      assert.equal(questionForVerdict({ verdict: 'BLOCKED', ruleId: rule }, fund, KARAN), null)
    }
    assert.equal(
      questionForVerdict({ verdict: 'PASS', ruleId: null }, fund, KARAN),
      INVEST_OR_CLEAR,
    )
  })

  it('asks a record entry by its rule, its action or its product', () => {
    const entry = (
      verdict: 'PASS' | 'BLOCKED' | 'UNKNOWN_PRODUCT',
      actionKind: Parameters<typeof questionForAdvice>[0]['actionKind'],
      ruleId: string | null = null,
    ) => ({ verdict, actionKind, ruleId })
    assert.equal(
      questionForAdvice(entry('BLOCKED', null, 'MISSED_REPAYMENT'), undefined, KARAN),
      MISSED_REPAYMENT,
    )
    assert.equal(questionForAdvice(entry('UNKNOWN_PRODUCT', null), undefined, KARAN), null)
    assert.equal(questionForAdvice(entry('PASS', 'buy_term_cover'), undefined, KARAN), LIFE_COVER)
    assert.equal(
      questionForAdvice(entry('PASS', 'open_sweep_in'), undefined, KARAN),
      SAVINGS_INTO_DEPOSIT,
    )
    assert.equal(
      questionForAdvice(entry('PASS', 'increase_sip'), undefined, KARAN),
      INVEST_OR_CLEAR,
    )
    assert.equal(
      questionForAdvice(entry('PASS', 'cancel_subscription'), undefined, KARAN),
      SUBSCRIPTIONS,
    )
    assert.equal(
      questionForAdvice(entry('PASS', 'set_category_cap'), undefined, KARAN),
      'How much did I spend on food last month?',
    )
    assert.equal(questionForAdvice(entry('PASS', 'talk_to_rm'), undefined, KARAN), RM_INSTEAD)
    assert.equal(
      questionForAdvice(
        entry('PASS', null),
        product('Term Insurance', { coverType: 'life' }),
        KARAN,
      ),
      LIFE_COVER,
    )
    assert.equal(questionForAdvice(entry('PASS', null), undefined, KARAN), null)
  })

  it('reads the facts off a snapshot', () => {
    const facts = askFacts({
      debt: { total: 39_770, highestRate: 9.15, missedRepayment: false },
      protection: { dependents: 2 },
      discretionary: {
        byCategory: [
          ['Shopping', 93_234],
          ['Food & dining', 77_259],
        ],
      },
    } as Parameters<typeof askFacts>[0])
    assert.deepEqual(facts, {
      debtTotal: 39_770,
      highestRate: 9.15,
      missedRepayment: false,
      dependents: 2,
      biggestSpend: 'Shopping',
    })
  })
})

describe('the smaller hand-offs', () => {
  it('puts the most severe subjects at the foot of the findings, once each', () => {
    const insights = (
      ['subscription_review', 'price_increase', 'missed_repayment', 'expensive_debt'] as const
    ).map((kind) => ({
      kind,
      headline: HEADLINE[kind],
      severity:
        kind.endsWith('debt') || kind.startsWith('missed')
          ? ('urgent' as const)
          : ('opportunity' as const),
    }))
    assert.deepEqual(leadQuestions(insights, HABITS), [
      MISSED_REPAYMENT,
      'How do I clear ₹1,86,240 of debt at 34.8% fastest?',
    ])
    assert.deepEqual(leadQuestions(insights.slice(0, 2), HABITS, 3), [
      SUBSCRIPTIONS,
      'Netflix went up to ₹649. What do my subscriptions cost me now?',
    ])
    assert.deepEqual(
      leadQuestions([
        { kind: 'human_handoff', headline: HEADLINE.human_handoff, severity: 'opportunity' },
      ]),
      [],
    )
  })

  it('asks the credit file about the debt, then the late repayment or the instalments', () => {
    assert.deepEqual(creditQuestions({ late: true, borrowing: true }), [
      CREDIT_FILE,
      LATE_REPAYMENT,
    ])
    assert.deepEqual(creditQuestions({ late: false, borrowing: true }), [CREDIT_FILE, EMI_COST])
    assert.deepEqual(creditQuestions({ late: false, borrowing: false }), [CREDIT_FILE])
  })

  it("sets the swear jar's question on the chosen place's category, or the top habit's", () => {
    assert.equal(swearJarQuestion('DMart', HABITS), 'How much did I spend on groceries last month?')
    assert.equal(swearJarQuestion(null, HABITS), 'How much did I spend on food last month?')
    assert.equal(
      swearJarQuestion('Somewhere new', HABITS),
      'How much did I spend on food last month?',
    )
    assert.equal(swearJarQuestion(null, []), null)
  })

  it('words the rest with the figures on screen', () => {
    assert.equal(
      debtPayoffQuestion(186_240, 34.8, 11),
      'How do I clear ₹1,86,240 of debt at 34.8% faster than 11 months?',
    )
    assert.equal(wontClearQuestion(5_992), "Why doesn't my debt clear at ₹5,992 a month?")
    assert.equal(prepayQuestion(9.15), 'Should I prepay my loan at 9.15%?')
    assert.equal(
      emiEndingQuestion('Education Loan', 5, 8_200),
      'My education loan ends in 5 months. Where should its ₹8,200 EMI go next?',
    )
    assert.equal(coverGapQuestion(22_770_000, 270_000), 'Do I need ₹2.28Cr more life cover?')
    assert.equal(coverGapQuestion(0, 10_000_000), 'Is ₹1Cr of life cover enough?')
    assert.equal(
      depositQuestion(200_000),
      'What should I do with my savings and the ₹2,00,000 deposit?',
    )
    assert.equal(depositsQuestion(200_000), 'What should I do with my savings and deposits?')
    assert.equal(depositsQuestion(0), 'Should any of my savings go into a deposit?')
    assert.equal(idleCashQuestion(141_663), '₹1,41,663 never leaves my account. What should it do?')
    assert.equal(
      spareQuestion('the spare ₹2.29L', 6, true),
      'My safety net is past 6 months. Should the spare ₹2.29L clear my debt first?',
    )
    assert.equal(
      spareQuestion('the spare ₹38k', 6, false),
      'My savings are past a 6-month safety net. What should the spare ₹38k do?',
    )
    assert.equal(
      lumpSumQuestion({ amount: 200_000 }),
      'Where should ₹2,00,000 go instead of sitting in savings?',
    )
  })
})

/* ------------------------------------------------------------------ *
 * Through the engine's own router
 * ------------------------------------------------------------------ */

/**
 * A customer with every finding the wording leans on: a missed repayment (so it ranks first and
 * "why" answers with it), a card at 34.8%, two dependants, money in savings. Only the fields the
 * router and `findInsights` read are filled; the rest of `Snapshot` is not consulted.
 */
function customer(overrides: { debt?: object; protection?: object } = {}): Snapshot {
  return {
    asOf: '2026-09-01',
    customer: { name: 'Karan Mehta', age: 34, dependents: 2, declaredMonthlyIncome: 192_000 },
    income: { monthly: 192_000, nextPayDate: '2026-10-01', daysToNextPay: 30 },
    commitments: { total: 119_308, investments: 40_000, series: [] },
    discretionary: { monthly: 50_000, byCategory: [], categoryTrends: [], topHabits: [] },
    balances: {
      savings: 1_245_774,
      deposits: 200_000,
      total: 1_445_774,
      idleFloor: 120_000,
      idleMonths: 11,
      maturingSoon: null,
    },
    buffer: { monthsCovered: 8.5, targetMonths: 6, shortfall: 0 },
    debt: {
      total: 814_315,
      hasHighInterest: true,
      highInterestTotal: 186_240,
      highestRate: 34.8,
      missedRepayment: true,
      monthlyOutgo: 30_500,
      endingSoon: null,
      ...overrides.debt,
    },
    protection: {
      dependents: 2,
      lifeCoverInForce: 270_000,
      lifeCoverNeeded: 23_040_000,
      gap: 22_770_000,
      ...overrides.protection,
    },
  } as unknown as Snapshot
}

const NO_LEDGER = { transactions: [] } as unknown as CustomerFile

/** Which of the engine's eight rules answered, read off the shape each one writes. */
function ruleOf(question: string, snapshot: Snapshot): string {
  const a = answer(question, snapshot, NO_LEDGER)
  if (!a.matched) return 'none'
  const top = findInsights(snapshot)[0]
  if (top !== undefined && a.text.startsWith(top.headline)) return `why:${top.kind}`
  if (a.resolved?.from !== undefined) return `spend:${a.resolved.category ?? 'everything'}`
  if (/left to spend|after everything committed/.test(a.text)) return 'safe'
  if (/live:|No live subscriptions/.test(a.text)) return 'subs'
  if (a.text.startsWith('No. A ULIP')) return 'ulip'
  if (/depends? on your income/.test(a.text)) return 'cover'
  if (/outstanding/.test(a.text)) return 'debt'
  if (/ in savings, /.test(a.text)) return 'balance'
  return 'other'
}

/** The rule each finding's question is worded for, on the customer above. */
const EXPECTED_FOR: Record<Insight['kind'], string | null> = {
  missed_repayment: 'why:missed_repayment',
  expensive_debt: 'debt',
  protection_gap: 'cover',
  buffer_thin: 'balance',
  deposit_maturing: 'balance',
  emi_ending: 'debt',
  idle_cash: 'balance',
  price_increase: 'subs',
  subscription_review: 'subs',
  category_drift: 'spend:Food & dining',
  habit_cost: 'spend:Food & dining',
  human_handoff: null,
}

describe('every question, through the engine', () => {
  const karan = customer()

  const cases: [string, string | null][] = [
    [MISSED_REPAYMENT, 'why:missed_repayment'],
    [PAY_FIRST, 'why:missed_repayment'],
    [LATE_REPAYMENT, 'why:missed_repayment'],
    [FIRST_THING, 'why:missed_repayment'],
    [RM_INSTEAD, 'why:missed_repayment'],
    [INVEST_OR_CLEAR, 'debt'],
    [EXPENSIVE_DEBT_FIRST, 'debt'],
    [CREDIT_FILE, 'debt'],
    [INTEREST_PAID, 'debt'],
    [EMI_COST, 'spend:Loan EMI'],
    [LIFE_COVER, 'cover'],
    [HEALTH_COVER, 'cover'],
    [NO_DEPENDANTS, 'cover'],
    [GOVERNMENT_SCHEME, 'cover'],
    [COVER_PLUS_SAVINGS, 'ulip'],
    [SUBSCRIPTIONS, 'subs'],
    [SAFE_TO_SPEND, 'safe'],
    [SAVINGS_RATE, 'balance'],
    [EMERGENCY_SAVINGS, 'balance'],
    [SAVINGS_INTO_DEPOSIT, 'balance'],
    [SPARE_SAVINGS, 'balance'],
    [debtPayoffQuestion(186_240, 34.8), 'debt'],
    [debtPayoffQuestion(186_240, 34.8, 11), 'debt'],
    [wontClearQuestion(5_992), 'debt'],
    [prepayQuestion(9.15), 'debt'],
    [emiEndingQuestion('Education Loan', 5, 8_200), 'debt'],
    [coverGapQuestion(22_770_000, 270_000), 'cover'],
    [coverGapQuestion(0, 10_000_000), 'cover'],
    [depositQuestion(200_000), 'balance'],
    [depositsQuestion(200_000), 'balance'],
    [depositsQuestion(0), 'balance'],
    [idleCashQuestion(141_663), 'balance'],
    [spareQuestion('the spare ₹2.29L', 6, true), 'debt'],
    [spareQuestion('the spare ₹38k', 6, false), 'balance'],
    [lumpSumQuestion({ amount: 200_000 }), 'balance'],
    [
      "I'm ₹5,992 a month short of my goal. How much did I spend on shopping last month?",
      'spend:Shopping',
    ],
    ...(Object.keys(HEADLINE) as Insight['kind'][]).map((kind): [string, string | null] => [
      ask(kind) ?? '',
      ask(kind) === null ? null : EXPECTED_FOR[kind],
    ]),
  ]

  for (const [question, rule] of cases) {
    if (rule === null) continue
    it(`"${question}" → ${rule}`, () => assert.equal(ruleOf(question, karan), rule))
  }

  it('asks every spending category it has a word for as that category, in every period', () => {
    const words: SpendCategory[] = [
      'Food & dining',
      'Groceries',
      'Transport',
      'Shopping',
      'Entertainment',
      'Health',
      'Rent & bills',
      'Loan EMI',
      'Investment',
      'Education',
      'Cash',
    ]
    for (const c of words) {
      for (const period of ['last month', 'this month', 'over the last 12 months'] as const) {
        assert.equal(ruleOf(spendQuestion(c, period) ?? '', karan), `spend:${c}`, `${c}, ${period}`)
      }
    }
  })

  it('answers the payoff for a customer with nothing outstanding too, rather than falling through', () => {
    const clear = customer({
      debt: { total: 0, hasHighInterest: false, highInterestTotal: 0, missedRepayment: false },
    })
    assert.equal(ruleOf(INVEST_OR_CLEAR, clear), 'debt')
    assert.equal(ruleOf(CREDIT_FILE, clear), 'debt')
  })

  it('names no product or alias: a question that did would run the gate and file a verdict', () => {
    // The shelf's names and aliases (packages/fixtures shelf.ts) that ordinary wording could hit.
    const ALIASES =
      /\b(fixed deposit|recurring deposit|sweep[- ]in|health cover|health insurance|term (cover|plan|insurance|assurance)|endowment|savings plan|ulip|market plus|money back|liquid fund|index fund|debt fund|tax sav(er|ing fund)|elss|ppf|provident fund|nps|pension scheme|pmjjby|pmsby|accident cover|family floater|mediclaim|jeevan (anand|jyoti))\b/i
    for (const [question] of cases) assert.doesNotMatch(question, ALIASES)
  })
})
