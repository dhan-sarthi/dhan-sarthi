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
import type { Series } from './recurring.ts'
import type { CustomerFile, Product, SpendCategory, Transaction } from './types.ts'

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

/**
 * A label as it reads mid-sentence: the first letter lowered, and not even that where the label
 * opens on an acronym. Lowercasing the whole of it read "rent, bills and emis" aloud.
 */
const midSentence = (label: string): string =>
  /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label

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
      const heldBack = s.reserved.map((r) => `${midSentence(r.label)} ${inr(r.amount)}`)
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

/**
 * The diagnosis as Uday says it on a call: what comes in, where it goes, what is left over, and
 * the one thing that stands out.
 *
 * `openingLine` is the written version, and spoken on a call it sounded like a statement being
 * read aloud: "₹51,997 is spoken for before you decide anything". People do not talk in exact
 * totals, so the totals here are rounded and say "about", while the payments the customer will
 * recognise, the rent and the EMI, keep their exact figure. Each payment is named from its own
 * narration (the FAMILY remark on a transfer, FEES on a school's), never guessed: calling a
 * transfer "money to your parents" when the statement does not say so invents a family.
 *
 * Where the statement is too thin to say this much, it falls back to `openingLine`, which knows
 * how to say less.
 */
export function openingRead(
  snapshot: Snapshot,
  /**
   * Whether to end on the one thing that stands out. Off when a `planAhead` follows, which
   * opens on those same moments and would otherwise say the deposit twice in a row.
   */
  { lead: withLead = true }: { lead?: boolean } = {},
): string {
  const s = snapshot
  if (s.income.monthly <= 0 || s.commitments.total <= 0 || s.discretionary.monthly <= 0) {
    return openingLine(s).text
  }
  const first = s.customer.name.split(' ')[0] ?? ''
  const sentences: string[] = []

  sentences.push(
    s.income.source === 'salary-series'
      ? `${first}, your salary is ${roughly(s.income.monthly)} a month.`
      : `${first}, ${roughly(s.income.monthly)} comes in each month.`,
  )

  // The three biggest payments that can be named; the rest are summed up by kind.
  const named: Series[] = []
  const parts: string[] = []
  for (const x of s.commitments.series) {
    const name = paymentName(x)
    if (name === null || named.length === 3) continue
    named.push(x)
    parts.push(`${inr(x.monthlyCost)} ${name}`)
  }
  const committed = sentenceCase(roughly(s.commitments.total))
  sentences.push(
    parts.length > 0
      ? `${committed} of it is gone before you even start: ${list(parts)}.`
      : `${committed} of it goes on payments that come round every month.`,
  )
  const rest = [
    ...new Set(
      s.commitments.series.filter((x) => !named.includes(x)).flatMap((x) => restName(x) ?? []),
    ),
  ]
  // Largest first, and three at most: a list of six is a statement again, not a sentence.
  if (parts.length > 0 && rest.length > 0) {
    const said = rest.length > 3 ? [...rest.slice(0, 3), 'a few other payments'] : rest
    sentences.push(`The rest of that is ${list(said)}.`)
  }

  const everyday = s.discretionary.byCategory.flatMap(([c]) => EVERYDAY[c] ?? []).slice(0, 3)
  sentences.push(
    `Then ${roughly(s.discretionary.monthly)} goes on everyday spending` +
      (everyday.length > 0 ? `, mostly ${list(everyday)}.` : '.'),
  )

  // Under a thousand rounds to "about ₹0", which is no way to describe anyone's month.
  if (s.surplus.deployable >= 1_000) {
    sentences.push(`That leaves ${roughly(s.surplus.deployable)} spare each month.`)
  }

  const lead = withLead ? findInsights(s).find((i) => i.kind !== 'human_handoff') : undefined
  if (lead) {
    sentences.push(
      /^You/.test(lead.headline)
        ? `And one thing stands out: ${lead.headline.charAt(0).toLowerCase()}${lead.headline.slice(1)}`
        : `And one thing stands out: ${lead.headline}`,
    )
  }
  return sentences.join(' ')
}

/** The plan Uday talks through, and the products in it that the rules must clear on the call. */
export interface PlanAhead {
  text: string
  /** Shelf names, in the order the plan recommends them, for `check_suitability`. */
  products: string[]
}

/**
 * The parts of a roadmap and a daily plan that `planAhead` reads. Structural rather than the
 * full `Roadmap` and `DailyPlan`, so the API's View, which carries the contract versions of both,
 * passes straight in.
 */
export interface AheadRoadmap {
  stages: readonly {
    kind: string
    monthly: number
    productId: string | null
    productName: string | null
  }[]
  goal: { purpose?: string | null | undefined }
}
export interface AheadPlan {
  primary: { kind: string; productId?: string | null | undefined } | null
}

/**
 * The moments ahead, joined into one plan: what Uday says when the customer asks what to do.
 *
 * One fact at a time is what a chatbot does: "your deposit matures", then "move it into a
 * sweep-in". An advisor reads a deposit maturing, a loan ending and a family with no cover as
 * one situation, and says how they fit together, in order, with the dates and the price of
 * waiting. The owner asked for exactly that on 6 October 2026, after hearing the single
 * suggestion on a demo call and finding it flat. So this is built only when at least two such
 * moments are live: a deposit maturing, an EMI ending within six months, a cover gap with
 * people depending on the income. With fewer, the day's one suggestion is the honest answer.
 *
 * Every figure is the engine's. The dates and amounts are the snapshot's, the cover and its
 * premium come from the roadmap's own stage (already past the rules), the cost of doing nothing
 * is the deposit insight's monthly value, and the price a day is that premium over thirty days.
 * The order is the roadmap's: protection first.
 */
export function planAhead(
  snapshot: Snapshot,
  roadmap: AheadRoadmap,
  plan: AheadPlan,
  shelf: readonly Product[],
): PlanAhead | null {
  const s = snapshot
  const deposit = s.balances.maturingSoon
  const loan =
    s.debt.endingSoon !== null && s.debt.endingSoon.monthsLeft <= 6 ? s.debt.endingSoon : null
  const cover =
    s.protection.dependents > 0 && s.protection.gap > 0
      ? (roadmap.stages.find((st) => st.kind === 'get_cover' && st.monthly > 0) ?? null)
      : null
  if ([deposit, loan, cover].filter((m) => m !== null).length < 2) return null

  const first = s.customer.name.split(' ')[0] ?? ''
  const changes: string[] = []
  if (deposit) {
    changes.push(
      `In ${plural(deposit.daysLeft, 'day')}, your ${inr(deposit.amount)} deposit matures.`,
    )
  }
  if (loan) {
    changes.push(
      `In ${plural(loan.monthsLeft, 'month')}, your ${loan.loanType.toLowerCase()} ends and ` +
        `${inr(loan.emiAmount)} a month comes free.`,
    )
  }
  const sentences = [
    `${first}, ${changes.length === 2 ? 'two things are about to change for you' : 'something is about to change for you'}.`,
    ...changes,
    `Here's how I'd put ${changes.length === 2 ? 'them' : 'it'} together.`,
  ]

  const steps: string[] = []
  const products: string[] = []
  if (cover) {
    const product = shelf.find((p) => p.productId === cover.productId)
    const n = s.protection.dependents
    const who = n === 1 ? 'One person depends' : `${sentenceCase(count(n))} people depend`
    const held =
      s.protection.lifeCoverInForce > 0
        ? `your cover is ${lakhCrore(s.protection.gap)} short`
        : 'you have no life cover'
    const what =
      product?.coverAmount !== undefined
        ? `${lakhCrore(product.coverAmount)} of term cover`
        : (cover.productName ?? 'Term cover')
    const perDay = cover.monthly / 30
    steps.push(
      `your family. ${who} on your income, and ${held}. ${what} costs ${inr(cover.monthly)} a month. ` +
        `That's ${Number.isInteger(perDay) ? inr(perDay) : `less than ${inr(Math.ceil(perDay))}`} a day.`,
    )
    if (product) products.push(product.name)
  }
  if (deposit) {
    const cost = findInsights(s).find((i) => i.kind === 'deposit_maturing')?.monthlyValue ?? 0
    const primary = plan.primary
    const sweep =
      primary?.kind === 'open_sweep_in'
        ? shelf.find((p) => p.productId === primary.productId)
        : undefined
    steps.push(
      `the ${inr(deposit.amount)}. If you do nothing, it renews at the counter rate` +
        (cost > 0 ? `, and that costs you about ${inr(cost)} a month.` : '.') +
        (sweep
          ? ` Move it into a sweep-in instead` +
            (sweep.indicativeReturn !== undefined ? `, at about ${sweep.indicativeReturn}%` : '') +
            (sweep.lockInYears === 0 ? ': it keeps earning, and you can take it out any day.' : '.')
          : ' Decide where it goes before then.'),
    )
    if (sweep) products.push(sweep.name)
  }
  if (loan) {
    const grow = roadmap.stages.find((st) => st.kind === 'grow' && st.monthly > 0)
    const share = grow
      ? loan.emiAmount >= grow.monthly
        ? 'all of'
        : loan.emiAmount * 2 >= grow.monthly
          ? 'most of'
          : 'a good part of'
      : null
    const purpose = roadmap.goal.purpose
    steps.push(
      `when your ${loan.loanType.toLowerCase()} ends, put that ${inr(loan.emiAmount)} straight into a SIP.` +
        (grow && share
          ? ` That covers ${share} the ${inr(grow.monthly)} a month your goal needs` +
            (purpose ? `: ${purpose.charAt(0).toLowerCase()}${purpose.slice(1)}.` : '.')
          : '') +
        " Set it up before the first month lands, and you'll never miss it.",
    )
  }

  const ordinal = ['First', 'Second', 'Third']
  steps.forEach((step, i) => sentences.push(`${ordinal[i] ?? 'Then'}, ${step}`))
  sentences.push(
    cover ? "Shall we start with your family's cover?" : 'Shall we start with the first one?',
  )
  return { text: sentences.join(' '), products }
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}

/** Small counts the way they are said: "two people", not "2 people". */
function count(n: number): string {
  return (
    ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][n] ?? String(n)
  )
}

/**
 * A cover amount the way it is said: "₹1 crore", not "₹1,00,00,000". A balance stays exact
 * (`inr`); a cover is a round target nobody should have to count the zeroes of.
 */
function lakhCrore(n: number): string {
  const trim = (v: number): string => String(Number(v.toFixed(2)))
  if (n >= 1_00_00_000) return `₹${trim(n / 1_00_00_000)} crore`
  if (n >= 1_00_000) return `₹${trim(n / 1_00_000)} lakh`
  return inr(n)
}

/** The spending categories, as a person names them. Anything else is not everyday spending. */
const EVERYDAY: Partial<Record<SpendCategory, string>> = {
  Groceries: 'groceries',
  'Food & dining': 'eating out',
  Shopping: 'shopping',
  Transport: 'getting around',
  Entertainment: 'entertainment',
  Health: 'health',
}

/** What a recurring payment is for, said after its amount, or null when the narration cannot say. */
function paymentName(x: Series): string | null {
  switch (x.kind) {
    case 'rent':
      return 'on rent'
    case 'emi':
      return /CREDIT ?CARD/i.test(x.key) ? 'towards your credit card' : 'on your loan EMI'
    case 'sip':
      return x.merchant === 'Mutual fund' ? 'into your mutual fund' : 'into your savings scheme'
    case 'obligation':
    case 'transfer':
      if (x.category === 'Education') return `on ${fees(x)}`
      return toFamily(x) ? 'you send home to family' : null
    default:
      return null
  }
}

/** A payment left out of the named three, in a word or two for "the rest of that is …". */
function restName(x: Series): string | null {
  switch (x.kind) {
    case 'sip':
      return 'your SIP'
    case 'bill':
      return 'bills'
    case 'subscription':
      return 'subscriptions'
    case 'insurance':
      return 'insurance'
    case 'emi':
      return /CREDIT ?CARD/i.test(x.key) ? 'your credit card' : 'another loan EMI'
    case 'obligation':
    case 'transfer':
      if (x.category === 'Education') return fees(x)
      return toFamily(x) ? 'what you send home' : 'regular transfers'
    default:
      return null
  }
}

/** What a school or a daycare's narration says the fee is for. */
function fees(x: Series): string {
  return /DAYCARE/i.test(x.key) ? 'daycare' : /SCHOOL/i.test(x.key) ? 'school fees' : 'fees'
}

/** A transfer whose narration carries the customer's own remark that it goes to family. */
function toFamily(x: Series): boolean {
  return /FAMILY|HOME|PARENT/i.test(x.key)
}

/** A total the way a person says it: exact when it is a round thousand, "about" otherwise. */
function roughly(n: number): string {
  const r = Math.round(n / 1_000) * 1_000
  return r === Math.round(n) ? inr(r) : `about ${inr(r)}`
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "a, b and c": no serial comma, the way it is said. */
function list(items: readonly string[]): string {
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`
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
