// What the app asks Uday on the customer's behalf, worded so he can answer it.
//
// Every "Ask Uday about this" hands the chat a question, and the answer is worked out in code:
// `answer()` in packages/core/src/query.ts, the whole conversation when no model is configured and
// the figures under the words when one is. Its router is eight keyword rules, and the first that
// matches wins:
//
//   safe to spend > subscriptions > spending (a category word, a period) > ULIP and endowment >
//   cover > debt > why (the top finding) > savings and balances
//
// A question that trips none of them comes back "I am not sure what you are asking", and one that
// trips an earlier rule than it meant to comes back on the wrong subject. Half the app's hand-offs
// did one or the other, so the wording lives here, once. Every question below was put to the live
// API for all four demo customers and came back matched and on its subject, and `ask.test.ts` runs
// each one through core's own router so a rewording that trips the wrong rule fails there first.
//
// What the wording works around:
// - Words match whole. "loans", "SIPs" and "investments" miss; "loan", "SIP" and "investment" hit.
// - Order decides. "recurring deposit" is a subscription question, "savings plan" a ULIP one, a
//   spending word anywhere makes it a spending question, and "why" before "savings" asks for the
//   top finding.
// - "Why" and "explain" answer with the top finding, whatever else the question says, so they are
//   used only where the top finding is the subject. A missed repayment always ranks first.
// - "This month" on the as-of date is empty (the window stops the day before); "last month" is the
//   last whole calendar month.
// - No product names or aliases. A question naming a shelf product runs the suitability gate and
//   writes an advice record, so "fixed deposit", "health cover", "term cover", "endowment" and
//   the like would file a verdict the customer never asked for.
// - No merchant names in a spending question. The engine takes the first category word anywhere in
//   the sentence, and a merchant's name can carry another category's word.
//
// A subject no rule answers — a fund to keep, a return to assume, a credit limit IDBI's file leaves
// blank — gets `null`, and the screen offers the place that holds the answer instead.
import { isProtectionProduct } from '@dhan/core'
import type {
  Action,
  AdviceRecord,
  Habit,
  Insight,
  ShelfProduct,
  Snapshot,
  SpendCategory,
  Stage,
  Transaction,
  Verdict,
} from '@dhan/contracts'
import { merchantOf } from './merchant.ts'
import { rupees, rupeesShort, shortDate } from './money.ts'

/* ------------------------------------------------------------------ *
 * The questions with nothing to fill in
 * ------------------------------------------------------------------ */

/** The top finding, whatever it is: "why" is answered with it. */
export const FIRST_THING = 'What should I do first, and why?'

/** A missed repayment always ranks first, so "why" answers with it. No debt word: that rule wins. */
export const MISSED_REPAYMENT = 'Why does the missed repayment come first?'

/** The same, asked as the customer who has missed one would ask it. */
export const PAY_FIRST = "I've missed a repayment. What do I pay first, and why?"

/** A late repayment on the credit file is the missed one, so "why" answers with it too. */
export const LATE_REPAYMENT = 'Why does a late repayment matter so much?'

/** Instead of calling the bank: the top finding is what they can do themselves. */
export const RM_INSTEAD = 'Explain what I can do myself before I call my relationship manager.'

/** The engine's own opener (`suggestedQuestions`), answered from the debt: clear it, or invest alongside. */
export const INVEST_OR_CLEAR = 'Should I invest or clear my debt first?'

/** The gate's first rule, asked as the customer would. */
export const EXPENSIVE_DEBT_FIRST = 'Why does my expensive debt come first?'

export const CREDIT_FILE = 'What does my IDBI file say about my debt?'

/** "cost" would make it a spending question; "interest" keeps it on the debt. */
export const INTEREST_PAID = 'How much interest do I pay on my debt?'

/** A spending question on the EMI category: what the instalments take. */
export const EMI_COST = 'What do my loan EMI payments cost me each month?'

export const LIFE_COVER = 'How much life cover do I need?'

/** Answered "Health cover is" for someone nobody depends on. "health cover" is a product alias. */
export const HEALTH_COVER = 'Do I need cover for hospital bills?'

export const NO_DEPENDANTS = 'Nobody depends on my income. Do I need any cover at all?'

export const GOVERNMENT_SCHEME = 'Is a government scheme enough cover for me?'

/** The ULIP answer, reached by "Jeevan" alone: "endowment" and "ULIP" are product aliases. */
export const COVER_PLUS_SAVINGS = 'Is a Jeevan plan a good way to save?'

/** The engine's own opener, word for word. */
export const SUBSCRIPTIONS = 'What do my subscriptions cost me?'

export const SAFE_TO_SPEND = 'How much can I spend safely until payday?'

export const SAVINGS_RATE = 'What does my savings account pay, and is there a better place for it?'

export const EMERGENCY_SAVINGS = 'How much do I have in savings for an emergency?'

/** "deposit" alone is not an alias; "fixed deposit" and "sweep-in deposit" are. */
export const SAVINGS_INTO_DEPOSIT = 'Should some of my savings go into a deposit?'

export const SPARE_SAVINGS = 'What should my spare savings do now?'

/* ------------------------------------------------------------------ *
 * Spending
 * ------------------------------------------------------------------ */

/**
 * The word the engine reads each category by (core `CATEGORY_WORDS`), singular where the plural
 * would miss. A category it has no word for — insurance, transfers, fees — has no spending
 * question: "fees" would even be read as education.
 */
const CATEGORY_WORD: Partial<Record<SpendCategory, string>> = {
  'Food & dining': 'food',
  Groceries: 'groceries',
  Transport: 'transport',
  Shopping: 'shopping',
  Entertainment: 'entertainment',
  Health: 'health',
  'Rent & bills': 'rent and bills',
  'Loan EMI': 'loan EMIs',
  Investment: 'investment',
  Education: 'education',
  Cash: 'cash',
}

/** The periods the engine reads out of a question (core `resolveWindow`). */
export type Period = 'last month' | 'this month' | 'over the last 12 months'

/** What one category cost over one period, or null where the engine has no word for it. */
export function spendQuestion(
  category: SpendCategory,
  period: Period = 'last month',
): string | null {
  const word = CATEGORY_WORD[category]
  return word === undefined ? null : `How much did I spend on ${word} ${period}?`
}

/** "2026-08" for any day in September 2026. */
function monthBefore(iso: string): string {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`
}

/**
 * The period that holds a statement line, so the total the engine reads out includes it. A line on
 * the as-of date itself falls in no window — each one stops the day before — so it gets last
 * month, the category's latest whole month.
 */
export function periodOf(date: string, asOf: string): Period {
  if (date >= asOf) return 'last month'
  if (date.slice(0, 7) === asOf.slice(0, 7)) return 'this month'
  if (date.slice(0, 7) === monthBefore(asOf)) return 'last month'
  return 'over the last 12 months'
}

/** Where the customer's money goes most: the biggest line on their discretionary spending. */
export function biggestSpend(
  byCategory: readonly (readonly [SpendCategory, number])[],
): SpendCategory | undefined {
  let top: readonly [SpendCategory, number] | undefined
  for (const entry of byCategory) {
    if (CATEGORY_WORD[entry[0]] !== undefined && (top === undefined || entry[1] > top[1])) {
      top = entry
    }
  }
  return top?.[0]
}

/**
 * "Where does it come from?", answered with the biggest category: its total last month and the two
 * places most of it went. `lead` is the customer's own sentence about the gap.
 */
export function whereFromQuestion(
  lead: string,
  category: SpendCategory | undefined,
): string | null {
  const ask = category === undefined ? null : spendQuestion(category)
  return ask === null ? null : `${lead} ${ask}`
}

/* ------------------------------------------------------------------ *
 * Debt, savings and cover, with the customer's own figures
 * ------------------------------------------------------------------ */

/** The expensive balance at its rate. "debt" is the word the debt rule reads; "₹1,86,240 at 34.8%" alone is nothing. */
export function debtPayoffQuestion(
  amount: number,
  rate: number,
  fasterThanMonths?: number,
): string {
  const clear = `How do I clear ${rupees(amount)} of debt at ${rate}%`
  return fasterThanMonths === undefined
    ? `${clear} fastest?`
    : `${clear} faster than ${fasterThanMonths} months?`
}

export function wontClearQuestion(payment: number): string {
  return `Why doesn't my debt clear at ${rupees(payment)} a month?`
}

export function prepayQuestion(rate: number): string {
  return `Should I prepay my loan at ${rate}%?`
}

/** "EMI" keeps it on the debt whatever the loan is called; the answer names the loan that ends. */
export function emiEndingQuestion(loanType: string, monthsLeft: number, emi: number): string {
  const months = monthsLeft === 1 ? '1 month' : `${monthsLeft} months`
  return `My ${loanType.toLowerCase()} ends in ${months}. Where should its ${rupees(emi)} EMI go next?`
}

export function coverGapQuestion(gap: number, inForce: number): string {
  return gap > 0
    ? `Do I need ${rupeesShort(gap)} more life cover?`
    : `Is ${rupeesShort(inForce)} of life cover enough?`
}

export function depositQuestion(amount: number): string {
  return `What should I do with my savings and the ${rupees(amount)} deposit?`
}

/** The net-worth line for deposits: what they hold, or whether to start. */
export function depositsQuestion(deposits: number): string {
  return deposits > 0
    ? 'What should I do with my savings and deposits?'
    : 'Should any of my savings go into a deposit?'
}

export function idleCashQuestion(amount: number): string {
  return `${rupees(amount)} never leaves my account. What should it do?`
}

/** Past the safety net: the spare goes to the expensive debt first, or to work. */
export function spareQuestion(spare: string, months: number, expensiveDebt: boolean): string {
  return expensiveDebt
    ? `My safety net is past ${months} months. Should ${spare} clear my debt first?`
    : `My savings are past a ${months}-month safety net. What should ${spare} do?`
}

/* ------------------------------------------------------------------ *
 * Findings
 * ------------------------------------------------------------------ */

type HabitLike = Pick<Habit, 'merchant' | 'key' | 'category'>

const amountOf = (figure: string): number => Number(figure.replace(/[₹,]/g, ''))

/**
 * The question a finding hands Uday: its subject, in words he answers, with the finding's own
 * figures. The figures are read off the headline, which the engine writes in one fixed shape per
 * kind; where the shape is not recognised the question drops the figure rather than the subject.
 *
 * `null` for the finding that is about a person — Uday is not one, and the screen offers the
 * bank's own line instead — and for a habit or a category the engine has no word for. A habit is
 * found by its name in `habits` (the snapshot's `discretionary.topHabits`), which is the only place
 * its category is carried.
 */
export function questionForInsight(
  insight: Pick<Insight, 'kind' | 'headline'>,
  habits: readonly HabitLike[] = [],
): string | null {
  const h = insight.headline
  switch (insight.kind) {
    case 'missed_repayment':
      return MISSED_REPAYMENT
    case 'expensive_debt': {
      const m = /^(₹[\d,]+) at ([\d.]+)%/.exec(h)
      return m?.[1] !== undefined && m[2] !== undefined
        ? debtPayoffQuestion(amountOf(m[1]), Number(m[2]))
        : 'How do I clear my expensive debt fastest?'
    }
    case 'protection_gap':
      return LIFE_COVER
    case 'buffer_thin':
      return EMERGENCY_SAVINGS
    case 'deposit_maturing': {
      const m = /(₹[\d,]+) deposit/.exec(h)
      return m?.[1] !== undefined
        ? depositQuestion(amountOf(m[1]))
        : 'What should I do with my savings and deposits?'
    }
    case 'emi_ending': {
      const m = /^Your (.+?) ends in (\d+) months?\. That frees (₹[\d,]+) a month/.exec(h)
      return m?.[1] !== undefined && m[2] !== undefined && m[3] !== undefined
        ? emiEndingQuestion(m[1], Number(m[2]), amountOf(m[3]))
        : 'Where should my loan EMI go once it ends?'
    }
    case 'idle_cash': {
      const m = /^(₹[\d,]+) has sat/.exec(h)
      return m?.[1] !== undefined
        ? idleCashQuestion(amountOf(m[1]))
        : 'What should the money sitting in my savings do?'
    }
    case 'price_increase': {
      const m = /^(.+?) went from ₹[\d,]+ to (₹[\d,]+)/.exec(h)
      return m?.[1] !== undefined && m[2] !== undefined
        ? `${m[1]} went up to ${m[2]}. What do my subscriptions cost me now?`
        : SUBSCRIPTIONS
    }
    case 'subscription_review':
      return SUBSCRIPTIONS
    case 'category_drift': {
      const category = (Object.keys(CATEGORY_WORD) as SpendCategory[]).find((c) =>
        h.startsWith(`${c} is up`),
      )
      return category === undefined ? null : spendQuestion(category)
    }
    case 'habit_cost': {
      const habit = habits.find((x) => h.startsWith(`${x.merchant ?? x.key},`))
      return habit === undefined ? null : spendQuestion(habit.category)
    }
    case 'human_handoff':
      return null
  }
}

const SEVERITY_ORDER: readonly Insight['severity'][] = ['urgent', 'important', 'opportunity']

/** The foot of the findings: one question per subject, most severe first, as many as fit. */
export function leadQuestions(
  insights: readonly Pick<Insight, 'kind' | 'headline' | 'severity'>[],
  habits: readonly HabitLike[] = [],
  limit = 2,
): string[] {
  const out: string[] = []
  for (const severity of SEVERITY_ORDER) {
    for (const insight of insights) {
      const question = insight.severity === severity ? questionForInsight(insight, habits) : null
      if (question !== null && !out.includes(question)) out.push(question)
    }
  }
  return out.slice(0, limit)
}

/**
 * Where a swear jar would bite: what the habit it is set on — or the top habit, before one is
 * picked — cost over the last month, and where most of it went. The jar's places come without a
 * category, so the place is looked up among the habits, which carry one.
 */
export function swearJarQuestion(
  merchant: string | null,
  habits: readonly HabitLike[],
): string | null {
  const habit = habits.find((h) => (h.merchant ?? h.key) === merchant) ?? habits[0]
  return habit === undefined ? null : spendQuestion(habit.category)
}

/* ------------------------------------------------------------------ *
 * The plan, the gate, the credit file and the record
 * ------------------------------------------------------------------ */

/**
 * The questions under the credit file: what it says about the debt, then — for a late repayment —
 * why that matters, or what the instalments take. Nothing on the bureau report or the score: the
 * engine reads neither, and the page carries the free report itself.
 */
export function creditQuestions(file: { late: boolean; borrowing: boolean }): string[] {
  if (file.late) return [CREDIT_FILE, LATE_REPAYMENT]
  return file.borrowing ? [CREDIT_FILE, EMI_COST] : [CREDIT_FILE]
}

/** The customer facts the questions below turn on. */
export type AskFacts = {
  debtTotal: number
  highestRate: number
  missedRepayment: boolean
  dependents: number
  biggestSpend: SpendCategory | undefined
}

export function askFacts(
  snapshot: Pick<Snapshot, 'debt' | 'protection' | 'discretionary'>,
): AskFacts {
  return {
    debtTotal: snapshot.debt.total,
    highestRate: snapshot.debt.highestRate,
    missedRepayment: snapshot.debt.missedRepayment,
    dependents: snapshot.protection.dependents,
    biggestSpend: biggestSpend(snapshot.discretionary.byCategory),
  }
}

/** A stage of the plan, asked about by what it is for. A growth stage is only askable while there is debt to weigh it against. */
export function questionForStage(
  stage: Pick<Stage, 'kind' | 'targetAmount'>,
  facts: AskFacts,
): string | null {
  switch (stage.kind) {
    case 'get_cover':
      return 'Why does life cover come first on my plan?'
    case 'clear_debt':
      if (stage.targetAmount > 0) return debtPayoffQuestion(stage.targetAmount, facts.highestRate)
      return facts.missedRepayment ? MISSED_REPAYMENT : null
    case 'free_up':
      return whereFromQuestion(
        `I need to free up ${rupees(stage.targetAmount)} a month.`,
        facts.biggestSpend,
      )
    case 'build_buffer':
      return EMERGENCY_SAVINGS
    case 'grow':
      return facts.debtTotal > 0 ? INVEST_OR_CLEAR : null
  }
}

/** The rule the gate stopped on, where the engine can speak to it. */
export function questionForRule(ruleId: string | null): string | null {
  switch (ruleId) {
    case 'HIGH_INTEREST_DEBT':
      return EXPENSIVE_DEBT_FIRST
    case 'MISSED_REPAYMENT':
      return MISSED_REPAYMENT
    case 'EMERGENCY_BUFFER':
      return EMERGENCY_SAVINGS
    case 'BUNDLED_PROTECTION':
      return COVER_PLUS_SAVINGS
    default:
      return null
  }
}

type ProductLike = Pick<ShelfProduct, 'category' | 'coverType' | 'bundlesProtectionAndInvestment'>

const DEPOSIT_LIKE = new Set<ShelfProduct['category']>([
  'Sweep-in FD',
  'Fixed Deposit',
  'Recurring Deposit',
  'Liquid',
])

/**
 * A product, asked about by its kind — never by its name, which would run the gate a second time.
 * Life cover gets the cover sum; health cover only where nobody depends on the customer, the one
 * case the engine's answer is about health; accident cover never.
 */
export function questionForProduct(product: ProductLike, facts: AskFacts): string | null {
  if (product.bundlesProtectionAndInvestment === true) return COVER_PLUS_SAVINGS
  if (isProtectionProduct(product)) {
    if (product.coverType === 'health') return facts.dependents === 0 ? HEALTH_COVER : null
    return product.coverType === 'accident' ? null : LIFE_COVER
  }
  if (product.category === 'ULIP' || product.category === 'Endowment') return COVER_PLUS_SAVINGS
  if (DEPOSIT_LIKE.has(product.category)) return SAVINGS_INTO_DEPOSIT
  return facts.debtTotal > 0 ? INVEST_OR_CLEAR : null
}

/** A gate verdict: the rule it stopped on, or the product it passed. */
export function questionForVerdict(
  verdict: Pick<Verdict, 'verdict' | 'ruleId'>,
  product: ProductLike,
  facts: AskFacts,
): string | null {
  return verdict.verdict === 'BLOCKED'
    ? questionForRule(verdict.ruleId)
    : questionForProduct(product, facts)
}

/** An entry on the record: refused by a rule, recommended as an action, or checked as a product. */
export function questionForAdvice(
  entry: Pick<AdviceRecord, 'verdict' | 'ruleId' | 'actionKind'>,
  product: ProductLike | undefined,
  facts: AskFacts,
): string | null {
  if (entry.verdict === 'UNKNOWN_PRODUCT') return null
  if (entry.verdict === 'BLOCKED') return questionForRule(entry.ruleId)
  switch (entry.actionKind) {
    case null:
      return product === undefined ? null : questionForProduct(product, facts)
    case 'buy_term_cover':
    case 'enrol_pmjjby':
      return LIFE_COVER
    case 'buy_health_cover':
      return facts.dependents === 0 ? HEALTH_COVER : null
    case 'open_sweep_in':
    case 'start_ssp':
    case 'move_to_liquid_fund':
      return SAVINGS_INTO_DEPOSIT
    case 'start_sip':
    case 'increase_sip':
    case 'pause_sip':
      return facts.debtTotal > 0 ? INVEST_OR_CLEAR : null
    case 'pay_down_card':
      return 'How do I clear my expensive debt fastest?'
    case 'cancel_subscription':
      return SUBSCRIPTIONS
    case 'set_category_cap':
      return facts.biggestSpend === undefined ? null : spendQuestion(facts.biggestSpend)
    case 'talk_to_rm':
      return RM_INSTEAD
    default:
      return null
  }
}

/** A lump sum Today's card cannot size on the gate sheet: where the money sits now, and why it could do better. */
export function lumpSumQuestion(action: Pick<Action, 'amount'>): string {
  return `Where should ${rupees(action.amount)} go instead of sitting in savings?`
}

/* ------------------------------------------------------------------ *
 * A statement line
 * ------------------------------------------------------------------ */

/**
 * What a statement line hands Uday. A spend: what its category cost over the period that holds it.
 * Pay: what is safe to spend until the next. Savings interest: what the account pays. An insurance
 * premium: the cover sum. A transfer, a refund or a bank charge has no rule that answers it, so
 * `null`, and the sheet's table is the answer. Without an as-of date the period is last month.
 */
export function questionForLine(
  txn: Pick<
    Transaction,
    'txnType' | 'txnAmount' | 'txnDate' | 'spendCategory' | 'isSalaryCredit' | 'narration'
  >,
  asOf: string | undefined,
): string | null {
  if (txn.txnType === 'CREDIT') {
    if (txn.spendCategory !== 'Income' && !txn.isSalaryCredit) return null
    if (merchantOf(txn) === 'Savings interest') return SAVINGS_RATE
    const amount = rupees(Math.abs(txn.txnAmount))
    return `${amount} came in on ${shortDate(txn.txnDate, asOf)}. ${SAFE_TO_SPEND}`
  }
  if (txn.spendCategory === 'Insurance') return LIFE_COVER
  return spendQuestion(
    txn.spendCategory,
    asOf === undefined ? 'last month' : periodOf(txn.txnDate, asOf),
  )
}
