/**
 * Answering questions about the ledger, in code.
 *
 * This is the accuracy defence, and it exists because of a specific and very likely failure: a
 * judge asks *"how much did I spend on food last month?"*, a language model does the arithmetic,
 * and gets it wrong. Cleo solved the same problem the same way — real-time agents resolve which
 * merchants count, which date window "last month" means, aggregate deterministically, and only
 * then hand the result over to be phrased.
 *
 * So the rule here is the rule from the suitability gate: **code owns the numbers, the model owns
 * the words.** Every answer below carries its own evidence, and `resolved` records how the
 * question was interpreted so a wrong answer can be diagnosed rather than argued about.
 *
 * When no key is available this module is also the whole conversation — the Tier-3 fallback in
 * `docs/product/decisions.md`. Every figure is still real, because the engine is pure.
 */
import { categorize } from './categorize.ts'
import type { SafeToSpend } from './dailyplan.ts'
import { addMonths, monthKey, ymd } from './dates.ts'
import type { Snapshot } from './derive.ts'
import { findInsights } from './insights.ts'
import { subscriptions } from './recurring.ts'
import type { CustomerFile, SpendCategory, Transaction } from './types.ts'

/**
 * What the caller already knows about today, so the answer quotes it rather than recomputing
 * it. The one thing that matters here is the safe-to-spend pot: Today shows the envelope less
 * the plan's commitment and what has already gone this month, and a conversation that answers
 * the same question with a different number is a conversation nobody trusts.
 */
export interface AnswerContext {
  safeToSpend?: SafeToSpend
}

export interface Answer {
  /** What to say. Complete sentences — this is read aloud as well as displayed. */
  text: string
  /** The figures behind it, so "how do you know?" is always answerable. */
  evidence: string[]
  /** How the question was understood. Surfaced in the transcript, not hidden. */
  resolved?: { category?: SpendCategory; from?: string; to?: string; merchant?: string }
  /** Whether this came from the rules or fell through to a generic reply. */
  matched: boolean
}

const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`

/* ------------------------------------------------------------------ *
 * Resolving the question
 * ------------------------------------------------------------------ */

const CATEGORY_WORDS: readonly [RegExp, SpendCategory][] = [
  [
    /\b(food|eat|eating|dining|restaurant|swiggy|zomato|takeaway|delivery|order(ing)?\s*in)\b/i,
    'Food & dining',
  ],
  [/\b(grocer(y|ies)|kirana|vegetables|supermarket|blinkit|zepto|bigbasket|dmart)\b/i, 'Groceries'],
  [/\b(transport|travel|cab|taxi|uber|ola|rapido|fuel|petrol|diesel|auto)\b/i, 'Transport'],
  [/\b(shopping|clothes|amazon|flipkart|myntra|electronics|gadget)\b/i, 'Shopping'],
  [/\b(entertainment|movies|cinema|netflix|streaming|games?)\b/i, 'Entertainment'],
  [/\b(health|medical|medicine|doctor|hospital|pharmacy|gym)\b/i, 'Health'],
  [/\b(rent|bills?|electricity|utilit(y|ies)|broadband|mobile)\b/i, 'Rent & bills'],
  [/\b(emi|loan|repayment)\b/i, 'Loan EMI'],
  [/\b(invest(ed|ment|ing)?|sip|mutual\s*fund)\b/i, 'Investment'],
  [/\b(school|fees|tuition|education|college)\b/i, 'Education'],
  [/\b(cash|atm|withdraw(al)?)\b/i, 'Cash'],
]

function resolveCategory(q: string): SpendCategory | null {
  for (const [pattern, category] of CATEGORY_WORDS) {
    if (pattern.test(q)) return category
  }
  return null
}

/**
 * Resolve the time window a question means.
 *
 * Cleo make the point that this is where the ambiguity lives: "last month" could be the last
 * thirty days, the last calendar month, or since the customer was last paid. Defaulting to the
 * last complete calendar month is the reading a customer looking at a statement expects, and
 * `resolved` says which was used either way.
 */
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** "August" reads as a month; "2026-08" reads as a database key. */
const spokenMonth = (iso: string): string => MONTHS[Number(iso.slice(5, 7)) - 1] ?? iso.slice(0, 7)

function resolveWindow(q: string, asOf: string): { from: string; to: string; label: string } {
  if (/\bthis month\b|\bso far\b/i.test(q)) {
    return { from: `${monthKey(asOf)}-01`, to: asOf, label: 'this month so far' }
  }
  if (/\blast month\b|\bprevious month\b/i.test(q)) {
    const prev = addMonths(asOf, -1)
    const start = `${monthKey(prev)}-01`
    const end = `${monthKey(asOf)}-01`
    return { from: start, to: end, label: spokenMonth(prev) }
  }
  if (/\blast (week|7 days)\b/i.test(q)) {
    const d = ymd(asOf)
    const from = new Date(Date.UTC(d.year, d.month - 1, d.day - 7)).toISOString().slice(0, 10)
    return { from, to: asOf, label: 'the last seven days' }
  }
  if (/\bthis year\b|\blast 12 months\b|\byear\b/i.test(q)) {
    return { from: addMonths(asOf, -12), to: asOf, label: 'the last twelve months' }
  }
  const prev = addMonths(asOf, -1)
  return { from: `${monthKey(prev)}-01`, to: `${monthKey(asOf)}-01`, label: spokenMonth(prev) }
}

function sumIn(
  txns: readonly Transaction[],
  from: string,
  to: string,
  category: SpendCategory | null,
): { total: number; count: number; top: { merchant: string; amount: number }[] } {
  const byMerchant = new Map<string, number>()
  let total = 0
  let count = 0

  for (const t of txns) {
    if (t.txnType !== 'DEBIT') continue
    if (t.txnDate < from || t.txnDate >= to) continue
    const e = categorize(t)
    if (category && e.category !== category) continue
    total += t.txnAmount
    count += 1
    const name = e.merchant ?? 'Other'
    byMerchant.set(name, (byMerchant.get(name) ?? 0) + t.txnAmount)
  }

  return {
    total,
    count,
    top: [...byMerchant.entries()]
      .map(([merchant, amount]) => ({ merchant, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4),
  }
}

/* ------------------------------------------------------------------ *
 * Answering
 * ------------------------------------------------------------------ */

/**
 * The deterministic answer to a question, or `matched: false` where none of the rules apply.
 *
 * Ordered most specific first. A question mentioning both a category and an amount is a spending
 * question, not a general one.
 */
export function answer(
  question: string,
  snapshot: Snapshot,
  file: CustomerFile,
  context: AnswerContext = {},
): Answer {
  const q = question.trim()
  const asOf = snapshot.asOf
  const first = snapshot.customer.name.split(' ')[0] ?? ''

  /* Safe to spend --------------------------------------------------- */
  if (
    /\b(safe to spend|safely spend|spend safely|safe spend|can i spend|how much (can|do) i have (left|to spend)|afford)\b/i.test(
      q,
    )
  ) {
    const s = context.safeToSpend
    if (s) {
      // The pot Today shows, held back item by item, so the figure and the screen agree.
      const heldBack = s.reserved.map((r) => `${r.label.toLowerCase()} ${inr(r.amount)}`)
      return {
        matched: true,
        text:
          `${inr(s.pot)} left to spend — about ${inr(s.perDay)} a day for the ` +
          `${s.daysToSalary} ${s.daysToSalary === 1 ? 'day' : 'days'} ` +
          (s.incomeStability === 'regular'
            ? `until payday on ${Number(s.nextSalaryDate.slice(8))} ${spokenMonth(s.nextSalaryDate)}.`
            : `left this month.`) +
          (heldBack.length > 0
            ? ` That is after ${heldBack.join(', ')}, out of ${inr(snapshot.income.monthly)} coming in.`
            : ''),
        evidence: [
          `${inr(snapshot.income.monthly)} a month coming in`,
          ...s.reserved.map((r) => `${r.label}: ${inr(r.amount)}`),
          `${inr(s.pot)} left, ${inr(s.perDay)} a day for ${s.daysToSalary} days`,
          `Next salary ${s.nextSalaryDate}`,
        ],
      }
    }

    // Without today's plan the best honest figure is the month's envelope.
    const envelope = snapshot.income.monthly - snapshot.commitments.total
    return {
      matched: true,
      text:
        `${inr(envelope)} this month after everything committed. Payday is ` +
        `${Number(snapshot.income.nextPayDate.slice(8))} ${spokenMonth(snapshot.income.nextPayDate)}, ` +
        `${snapshot.income.daysToNextPay} days away.`,
      evidence: [
        `${inr(snapshot.income.monthly)} a month coming in`,
        `${inr(snapshot.commitments.total)} a month committed`,
        `Next salary ${snapshot.income.nextPayDate}`,
      ],
    }
  }

  /* Subscriptions ---------------------------------------------------- */
  // Before the general spending handler: "what are my subscriptions costing me" contains
  // "costing", and the specific question must win.
  if (/\b(subscription|subscriptions|recurring|mandate|autopay|standing instruction)\b/i.test(q)) {
    const subs = subscriptions(snapshot.commitments.series)
    if (subs.length === 0) {
      return { matched: true, text: 'No live subscriptions on your account.', evidence: [] }
    }
    const annual = subs.reduce((s, x) => s + x.annualCost, 0)
    return {
      matched: true,
      text:
        `${subs.length} live: ${subs.map((x) => `${x.merchant ?? x.key} at ${inr(x.amount)}`).join(', ')}. ` +
        `That is ${inr(annual)} a year. I cannot tell which you still use — you can.`,
      evidence: subs.map(
        (x) => `${x.merchant ?? x.key}: ${inr(x.amount)} a month, ${inr(x.annualCost)} a year`,
      ),
    }
  }

  /* Spending by category -------------------------------------------- */
  if (/\b(spend|spent|spending|cost|costing|go(ing)? on)\b/i.test(q)) {
    const category = resolveCategory(q)
    const window = resolveWindow(q, asOf)
    const { total, count, top } = sumIn(file.transactions, window.from, window.to, category)

    if (count === 0) {
      return {
        matched: true,
        text: `Nothing on ${category ?? 'that'} in ${window.label} that I can see.`,
        evidence: [`Looked at ${window.from} to ${window.to}`],
        resolved: { from: window.from, to: window.to, ...(category ? { category } : {}) },
      }
    }

    const label = category ? category.toLowerCase() : 'everything'
    return {
      matched: true,
      text:
        `${inr(total)} on ${label} in ${window.label}, across ${count} ` +
        `${count === 1 ? 'payment' : 'payments'}. ` +
        (top.length > 1
          ? `Mostly ${top
              .slice(0, 2)
              .map((t) => `${t.merchant} (${inr(t.amount)})`)
              .join(' and ')}.`
          : ''),
      evidence: [
        `Looked at ${window.from} to ${window.to}`,
        ...top.map((t) => `${t.merchant}: ${inr(t.amount)}`),
      ],
      resolved: { from: window.from, to: window.to, ...(category ? { category } : {}) },
    }
  }

  /* The ULIP question ----------------------------------------------- */
  if (/\b(ulip|market plus|endowment|jeevan|money.?back|savings plan)\b/i.test(q)) {
    return {
      matched: true,
      text:
        'No. A ULIP mixes cover with investing, hides its charges inside, and locks your money ' +
        'for five years. IDBI sells it and I am still telling you not to buy it. Buy term cover ' +
        'for protection and a fund for growth: same job, a fraction of the cost, and you can ' +
        'change one without touching the other.',
      evidence: [
        'Cover and investment bundled, locked in for five years',
        'Cover is usually only ten times the yearly premium',
        'Term plus a fund does the same job for far less',
      ],
    }
  }

  /* Protection ------------------------------------------------------ */
  if (/\b(insurance|cover|term|protect|die|death|family)\b/i.test(q)) {
    const p = snapshot.protection
    if (p.dependents === 0) {
      return {
        matched: true,
        text:
          'Nobody depends on your income, so life cover is not urgent. Health cover is. ' +
          'One hospital stay can wipe out a decade of investing.',
        evidence: ['Nobody on record depends on your income'],
      }
    }
    return {
      matched: true,
      text:
        `${p.dependents} people depend on your income and you hold ${inr(p.lifeCoverInForce)} ` +
        `of cover. The rule of thumb is ${inr(p.lifeCoverNeeded)} — ten times your yearly income. ` +
        `Term cover is the cheapest way to buy it, and it gets dearer every year you wait.`,
      evidence: [
        `${p.dependents} people depend on you`,
        `${inr(p.lifeCoverInForce)} of cover today`,
        `${inr(p.lifeCoverNeeded)} needed — ten times your income, as a rule of thumb`,
      ],
    }
  }

  /* Debt ------------------------------------------------------------ */
  if (/\b(debt|card|credit card|loan|emi|interest|owe)\b/i.test(q)) {
    const d = snapshot.debt
    if (d.total === 0) {
      return {
        matched: true,
        text: 'Nothing outstanding. That is a good place to be.',
        evidence: [],
      }
    }
    /*
     * The dear balance costs the dear rate; the rest does not.
     *
     * `d.total * d.highestRate` charged the card's rate to the whole book — Karan's ₹8,14,315,
     * most of it loans at well under half that, quoted as costing ₹23,615 a month when the card
     * costs ₹5,401. Same arithmetic slip as `expensive_debt` in `insights.ts`, and both now use
     * `highInterestTotal`, which is the field the suitability gate has always read.
     */
    const dear = d.hasHighInterest ? d.highInterestTotal : d.total
    const monthly = Math.round((dear * d.highestRate) / 100 / 12)
    return {
      matched: true,
      text:
        `${inr(d.total)} outstanding. The dearest is ${inr(dear)} at ${d.highestRate}%, which ` +
        `costs you ${inr(monthly)} a month in interest. ` +
        (d.hasHighInterest
          ? 'Nothing you can invest in returns that, so clear it first.'
          : 'That is low enough to invest alongside it.') +
        (d.endingSoon
          ? ` Your ${d.endingSoon.loanType.toLowerCase()} ends in ${d.endingSoon.monthsLeft} months, freeing ${inr(d.endingSoon.emiAmount)} a month.`
          : ''),
      evidence: [
        `${inr(d.total)} outstanding in total`,
        `${inr(dear)} of it at ${d.highestRate}%, the highest rate you pay`,
        `${inr(monthly)} a month in interest on that`,
        ...(d.missedRepayment ? ['One repayment has been missed'] : []),
      ],
    }
  }

  /* Why this advice ------------------------------------------------- */
  if (/\b(why|how do you know|explain|reason|based on)\b/i.test(q)) {
    const top = findInsights(snapshot)[0]
    if (top) {
      return {
        matched: true,
        text: `${top.headline} ${top.detail}`,
        evidence: top.evidence,
      }
    }
  }

  /* Balance / position --------------------------------------------- */
  if (/\b(balance|how much (do i have|have i got)|savings|account|position|net worth)\b/i.test(q)) {
    return {
      matched: true,
      text:
        `${inr(snapshot.balances.savings)} in savings, ${inr(snapshot.balances.deposits)} in ` +
        `deposits. Worth knowing: ${inr(snapshot.balances.idleFloor)} has not moved in twelve ` +
        `months, earning about 2.7% while prices rise faster than that.`,
      evidence: [
        `${inr(snapshot.balances.savings)} in savings`,
        `${inr(snapshot.balances.deposits)} in deposits`,
        `${inr(snapshot.balances.idleFloor)} — your lowest balance in twelve months`,
        `Never dipped below it in ${snapshot.balances.idleMonths} months`,
      ],
    }
  }

  /* Nothing matched ------------------------------------------------- */
  const top = findInsights(snapshot)[0]
  return {
    matched: false,
    text: top
      ? `I am not sure what you are asking, and I will not guess at a number. But here is what ` +
        `I would raise with you, ${first}: ${top.headline}`
      : `I am not sure what you are asking, and I would rather say so than make a figure up.`,
    evidence: top?.evidence ?? [],
  }
}

/**
 * The opening line for a conversation.
 *
 * Deliberately a statement, not a question. The advisor has just read the statements — opening
 * with *"what are your financial goals?"* wastes that, and it is a question a customer who has
 * never had advice genuinely cannot answer. Cleo make the same point: she can suggest the goal.
 * Proposing beats interrogating on both product quality and demo time.
 *
 * There is a second version for when the statement will not support the first. Over IDBI's own
 * feed no salary is recognisable and no habit has a merchant, so the diagnosis came out as
 * "Priya, ₹0 comes in. ₹0 is committed before you decide anything, and about ₹0 goes on
 * everything else" — three fabricated zeros, in the opening sentence, from an advisor whose
 * whole claim is that it read the ledger. Saying what is actually known is better than saying
 * nothing three times.
 */
export function openingLine(snapshot: Snapshot): Answer {
  const s = snapshot
  const first = s.customer.name.split(' ')[0] ?? ''
  const insights = findInsights(s)
  const lead = insights[0]

  /*
   * The diagnosis, from the parts that are actually known.
   *
   * The first version of this read every figure out regardless, which over a statement the
   * categoriser cannot see into produced "₹44,805 comes in. ₹0 is committed before you decide
   * anything, and about ₹0 goes on everything else" — an opening sentence with two fabricated
   * zeros in it, from an advisor whose whole claim is that it read the ledger. Each clause now
   * has to earn its place.
   */
  const clauses: string[] = []
  if (s.income.monthly > 0) clauses.push(`${inr(s.income.monthly)} comes in`)
  if (s.commitments.total > 0) {
    clauses.push(`${inr(s.commitments.total)} is spoken for before you decide anything`)
  }
  if (s.discretionary.monthly > 0) {
    clauses.push(`about ${inr(s.discretionary.monthly)} goes on the rest`)
  }

  const diagnosis =
    clauses.length === 0
      ? `${first}, I can see ${inr(s.balances.total)} across your accounts and ` +
        `${inr(s.debt.total)} owed. Nothing else in this statement is clear enough to tell you ` +
        `what a normal month looks like. Tell me what comes in and I can.`
      : clauses.length === 1
        ? `${first}, ${clauses[0]}. Nothing else in this statement is clear enough to break ` +
          `down yet.`
        : `${first}, ${clauses.slice(0, -1).join(', ')} and ${clauses[clauses.length - 1]}.`

  return {
    matched: true,
    text: lead ? `${diagnosis} ${lead.headline}` : diagnosis,
    evidence: [
      s.income.monthly > 0
        ? `${inr(s.income.monthly)} a month coming in (${s.income.source})`
        : 'No salary found in the statement',
      `${inr(s.commitments.total)} a month committed`,
      `${inr(s.discretionary.monthly)} a month on everything else`,
      `${inr(s.surplus.deployable)} a month spare`,
      ...(lead?.evidence ?? []),
    ],
  }
}

/** Openers offered as taps, so a judge on a phone does not have to type. */
export function suggestedQuestions(snapshot: Snapshot): string[] {
  const out = ['What did I spend on food last month?', 'What do my subscriptions cost me?']
  if (snapshot.debt.total > 0) out.push('Should I invest or clear my debt first?')
  if (snapshot.protection.dependents > 0)
    out.push('My cousin says I should take a LIC savings plan')
  out.push('What can I spend today?', 'Why are you telling me this?')
  return out
}
