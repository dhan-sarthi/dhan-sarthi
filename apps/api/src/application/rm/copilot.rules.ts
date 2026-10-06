/**
 * The copilot with no model: the brief, the answers and the suggested questions, written from
 * the numbered facts by rules.
 *
 * This is what most RMs will read. With no key, a failed call, a timeout or a reply the guard
 * would not keep, the copilot answers from here, so these sentences are written to be read, not
 * to be a fallback someone tolerates. Every sentence cites the facts it rests on and quotes its
 * figures from them, under the same guard a model's sentence passes (a test holds the whole book
 * to that), so the footnotes on the screen mean the same thing whichever wrote the words.
 *
 * The suggested questions are chosen from the customer's own record, and each is one this file
 * can answer from facts, so a tapped suggestion never lands on "the record does not show that".
 */
import { evaluate, firstName, plural, revoice, rupees, ruleLabel } from '@dhan/core'
import type { Verdict } from '@dhan/core'
import type { CitedSentence } from '@dhan/contracts'
import type { ShelfProduct } from '../../ports/index.ts'
import type { ActivityFacts } from './activity.service.ts'
import { dated, healthReason } from './copilot.facts.ts'
import { namedProduct } from './copilot.guard.ts'
import type { FactSheet } from './copilot.facts.ts'
import { BRIEF_SECTIONS } from './copilot.prompt.ts'
import type { BriefSection } from './copilot.prompt.ts'
import type { CustomerState } from './customer-state.ts'

export interface BriefPart {
  title: BriefSection
  sentences: CitedSentence[]
}

/** The most a part of the deterministic brief says. A brief is read in the minute before a call. */
const PART_MAX = { since: 4, talk: 4, careful: 3, ask: 3 } as const

/** Below this many months of savings, the rules refuse anything with a lock-in. */
const BUFFER_FLOOR_MONTHS = 3

const HEALTH_WORDS = { on_track: 'on track', at_risk: 'at risk', off_track: 'off track' } as const

const say = (text: string, ...cites: (string | null | undefined)[]): CitedSentence => ({
  text,
  cites: [...new Set(cites.filter((c): c is string => typeof c === 'string'))],
})

const unstop = (text: string): string => text.trim().replace(/\.+$/, '')

/** "card at 34.8%" from "Card at 34.8%": a title read mid-sentence. Acronyms keep their case. */
function midSentence(title: string): string {
  const t = unstop(title)
  return /^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t
}

/**
 * The brief from the facts alone.
 *
 * Its talking points are the engine's signals in the engine's order, written as the signal's
 * own title and detail; `copilot.arrange.ts` then tags each by its severity and holds "Talk
 * about" and "Be careful about" to the engine's ranking, for this brief exactly as for a
 * model's. Three records shape it most: a request waiting for the desk leads, because it is why
 * the call is happening; a customer with no contact and no activity gets one sentence saying so,
 * not two; and where nothing is urgent the brief says so rather than calling an opportunity
 * pressing.
 */
export function rulesBrief(state: CustomerState, sheet: FactSheet): BriefPart[] {
  const ix = sheet.index
  const first = sheet.first
  const snap = state.snapshot

  /* Since the last contact ------------------------------------------------ */

  const since: CitedSentence[] = []
  const contact = ix.contact.of
  const handoff = ix.handoff.of
  const lastActive = ix.activity.of.lastActivityAt
  if (handoff !== null) {
    since.push(
      say(
        `${first} asked to talk to the RM on ${dated(handoff.requestedOn)} and has waited ${plural(handoff.waitingDays, 'day')}, so start by answering that.` +
          (handoff.reason ? ` The request: "${unstop(handoff.reason)}".` : ''),
        ix.handoff.id,
      ),
    )
  }
  // With nothing on record at all, one sentence says so; the activity line below is then spent.
  const silent = contact === null && handoff === null && lastActive === null
  since.push(
    contact !== null
      ? say(
          `The last RM contact on record was on ${dated(contact.at)}: ${midSentence(contact.title)}.`,
          ix.contact.id,
        )
      : silent
        ? say(
            `No RM contact and no app activity are on record, so this would be the desk's first conversation with ${first}.`,
            ix.contact.id,
            ix.activity.id,
          )
        : say(
            `No ${handoff === null ? '' : 'earlier '}RM contact is on record, so this would be the desk's first conversation with ${first}.`,
            ix.contact.id,
          ),
  )
  const after = (at: string): boolean => contact === null || at > contact.at
  const decision = ix.decisions.find((d) => after(d.of.at))
  if (decision) {
    since.push(
      say(
        `The latest decision on record, on ${dated(decision.of.at)}: ${midSentence(decision.of.title)}.`,
        decision.id,
      ),
    )
  }
  const refusal = ix.refusals.find((r) => after(r.of.at))
  if (refusal) {
    since.push(
      say(
        `On ${dated(refusal.of.at)} Uday refused ${refusal.of.productName ?? 'a product'} for ${first}.`,
        refusal.id,
      ),
    )
  }
  const event = ix.ledger.find((e) => after(e.of.at))
  if (event) {
    since.push(
      say(
        `On ${dated(event.of.at)} the statement shows: ${midSentence(event.of.title)}.`,
        event.id,
      ),
    )
  }
  if (since.length < 3 && !silent) {
    const calls = ix.activity.of.udayCalls
    since.push(
      lastActive === null
        ? say(`There is no app activity from ${first} on record.`, ix.activity.id)
        : say(
            `${first} was last active on ${dated(lastActive)}` +
              (calls > 0 ? ` and has had ${plural(calls, 'call')} with Uday.` : '.'),
            ix.activity.id,
          ),
    )
  }

  /* Talk about ------------------------------------------------------------ */

  // The signals' own words, in the engine's order; the arrangement adds the severity tag.
  const talk: CitedSentence[] = []
  const urgent = ix.signals.some((s) => s.of.severity === 'urgent')
  ix.signals.slice(0, 2).forEach((s, i) => {
    // The title stays first, beside its tag, as on every other point; with nothing urgent the
    // lead says so last, in words the arrangement reads as "not urgent". Where a request is
    // waiting, the brief has already said to start with it.
    const point = `${unstop(s.of.title)}. ${unstop(s.of.detail)}.`
    const calm =
      handoff === null ? 'Nothing urgent is open, so start here.' : 'Nothing urgent is open.'
    talk.push(say(i === 0 && !urgent ? `${point} ${calm}` : point, s.id))
  })
  const stages = state.roadmap.stages
  const stage = stages[state.roadmap.currentStageIndex]
  if (stage && ix.roadmap) {
    // A stage label can hold its own colon ("Enough to stop working at 60: ₹1.5Cr by …").
    const label = midSentence(revoice(stage.label)).replace(/: /g, ', ')
    // Off track on the goal's own stage, its reason is the conversation: what the plan cannot
    // fund and the choices left. On an earlier stage the reason is that stage's, said elsewhere.
    const goalStage = stage.index === stages.length
    const why = state.health === 'off_track' && goalStage ? ` ${unstop(revoice(stage.why))}.` : ''
    talk.push(
      say(
        stages.length === 1
          ? `${first}'s plan has one stage: ${label}.${why}`
          : `${first}'s plan is at stage ${stage.index} of ${stages.length}: ${label}.${why}`,
        ix.roadmap,
      ),
    )
  }
  const gap = state.gaps[0]
  if (gap && ix.gaps) {
    talk.push(
      say(`The rules pass ${gap.productName} for ${first} today: ${unstop(gap.why)}.`, ix.gaps),
    )
  }
  const soon = ix.upcoming.of[0]
  if (soon) {
    talk.push(say(`Coming up on ${dated(soon.date)}: ${midSentence(soon.label)}.`, ix.upcoming.id))
  }
  if (talk.length === 0) {
    talk.push(
      say(`${first}'s goal is ${HEALTH_WORDS[state.health]}: ${healthReason(state)}.`, ix.goal),
    )
  }

  /* Be careful about ------------------------------------------------------ */

  const careful: CitedSentence[] = []
  for (const r of ix.refusals.slice(0, 2)) {
    const rule = ruleLabel(r.of.ruleId ?? '')
    careful.push(
      say(
        `Uday refused ${r.of.productName ?? 'a product'} on ${dated(r.of.at)} under "${rule}"` +
          (r.of.spoken ? `, and ${first} was told: "${r.of.spoken}"` : '.') +
          ' Run the rules again before raising it.',
        r.id,
      ),
    )
  }
  const costly = ix.loans.find((l) => l.of.ratePct >= 24)
  if (costly) {
    careful.push(
      say(
        `No investment should come up while ${first}'s ${costly.of.loanType.toLowerCase()} at ${costly.of.ratePct}% is outstanding: the rules hold every investment back, cover excepted.`,
        costly.id,
      ),
    )
  }
  const overdue = ix.loans.find((l) => l.of.overdueDays > 0)
  if (overdue) {
    careful.push(
      say(
        `An instalment on ${first}'s ${overdue.of.loanType.toLowerCase()} is ${plural(overdue.of.overdueDays, 'day')} overdue, so nothing but cover can be recommended until it clears.`,
        overdue.id,
      ),
    )
  }
  if (ix.consent) {
    careful.push(
      say(
        `${first}'s consent limits what the desk can see, so some figures are missing; do not advise on what is not shown.`,
        ix.consent,
      ),
    )
  }
  if (ix.income && snap.income.monthly <= 0) {
    careful.push(
      say(
        `The income figure is what ${first} declared, not what the statement shows; confirm it before sizing anything.`,
        ix.income,
      ),
    )
  }
  if (ix.buffer) {
    const months = snap.buffer.monthsCovered
    if (months === null) {
      careful.push(
        say(
          `How long ${first}'s savings would last cannot be measured, and the rules treat that as too thin for anything that locks money away.`,
          ix.buffer,
        ),
      )
    } else if (months < BUFFER_FLOOR_MONTHS) {
      careful.push(
        say(
          `${first}'s savings cover only ${months} ${months === 1 ? 'month' : 'months'} of outgoings, so anything that locks money away should wait.`,
          ix.buffer,
        ),
      )
    }
  }
  if (careful.length === 0) {
    careful.push(
      say(
        `Nothing on the record calls for extra care. ${first}'s risk profile is ${state.file.customer.riskProfile.toLowerCase()}, and the rules still check any product before it is named.`,
        ix.profile,
        ix.noRefusals,
      ),
    )
  }

  /* They may ask --------------------------------------------------------- */

  const ask: CitedSentence[] = []
  if (handoff !== null) {
    ask.push(
      say(
        `${first} will want to know what is happening with the request to talk to the RM, made on ${dated(handoff.requestedOn)}.`,
        ix.handoff.id,
      ),
    )
  }
  const lastRefusal = ix.refusals[0]
  if (lastRefusal) {
    ask.push(
      say(
        `${first} may ask why ${lastRefusal.of.productName ?? 'the product'} was refused: the rule was "${ruleLabel(lastRefusal.of.ruleId ?? '')}".`,
        lastRefusal.id,
      ),
    )
  }
  const goalLine = say(
    `${first} may ask whether the goal is on track: it is ${HEALTH_WORDS[state.health]}, because ${healthReason(state)}.`,
    ix.goal,
  )
  if (state.health !== 'on_track') ask.push(goalLine)
  const p = snap.protection
  if (ix.protection && p.gap > 0 && p.lifeCoverNeeded > 0) {
    ask.push(
      say(
        `${first} may ask how much cover is enough: the record puts the need at ${rupees(p.lifeCoverNeeded)}, ` +
          (p.lifeCoverInForce > 0
            ? `against ${rupees(p.lifeCoverInForce)} held.`
            : 'with none held.'),
        ix.protection,
      ),
    )
  }
  if (soon) {
    ask.push(
      say(
        `${first} may ask about what falls due on ${dated(soon.date)}: ${midSentence(soon.label)}.`,
        ix.upcoming.id,
      ),
    )
  }
  if (state.health === 'on_track') ask.push(goalLine)

  const parts: Record<BriefSection, CitedSentence[]> = {
    'Since the last contact': since.slice(0, PART_MAX.since),
    'Talk about': talk.slice(0, PART_MAX.talk),
    'Be careful about': careful.slice(0, PART_MAX.careful),
    'They may ask': ask.slice(0, PART_MAX.ask),
  }
  return BRIEF_SECTIONS.map((title) => ({ title, sentences: parts[title] }))
}

/* ------------------------------------------------------------------ *
 * Answers
 * ------------------------------------------------------------------ */

type Topic =
  | 'refusals'
  | 'handoff'
  | 'contact'
  | 'changes'
  | 'debt'
  | 'habits'
  | 'cover'
  | 'goal'
  | 'surplus'
  | 'buffer'
  | 'wallet'
  | 'investments'
  | 'upcoming'
  | 'priorities'
  | 'profile'

/**
 * The questions an RM asks, by the words they use, most specific first. A question can match
 * several; the first two answered are what the answer says, so "why was the card refused"
 * answers the refusal before the card.
 */
const TOPICS: readonly { topic: Topic; words: RegExp }[] = [
  { topic: 'refusals', words: /\b(refus\w*|block\w*|turn\w* down|reject\w*|mis-?sell\w*)\b/i },
  {
    topic: 'handoff',
    words:
      /\b(ask\w* (?:for|to (?:talk|speak))|request\w*|hand-?off|call ?back|talk to (?:the |an |their |his |her )?rm|waiting)\b/i,
  },
  {
    topic: 'contact',
    words:
      /\b(last (?:contact|call|spoke|time|activity|active|seen)|contacted|spoke|when did|active)\b/i,
  },
  {
    topic: 'changes',
    words: /\b(chang\w*|since|lately|recent\w*|what'?s new|happened|events?)\b/i,
  },
  {
    topic: 'debt',
    words:
      /\b(debts?|loans?|cards?|emis?|interest|owes?|owed|owing|borrow\w*|repay\w*|overdue|missed)\b/i,
  },
  {
    topic: 'habits',
    words: /\b(subscri\w*|habits?|price ris\w*|went up in price|small spends?)\b/i,
  },
  { topic: 'cover', words: /\b(cover|insur\w*|protect\w*|life|health|polic(?:y|ies)|term)\b/i },
  { topic: 'goal', words: /\b(goal|plan|roadmap|stages?|on track|at risk|off track|target)\b/i },
  {
    topic: 'surplus',
    words:
      /\b(surplus|left ?over|spare|afford\w*|income|salary|earn\w*|spend\w*|cash ?flow|budget|commit\w*)\b/i,
  },
  { topic: 'buffer', words: /\b(buffer|emergenc\w*|idle|savings|cash|liquid\w*|deposits?)\b/i },
  {
    topic: 'wallet',
    words:
      /\b(wallet|share|outside idbi|other banks?|with idbi|elsewhere|relationship value|products? (?:held|they hold)|balances?|accounts?)\b/i,
  },
  {
    topic: 'investments',
    words: /\b(invest\w*|sips?|mutual|funds?|portfolio|equity|holdings?)\b/i,
  },
  {
    topic: 'upcoming',
    words: /\b(coming up|upcoming|next \d+ days|next month|due|matur\w*|renew\w*)\b/i,
  },
  {
    topic: 'priorities',
    words:
      /\b(first|priorit\w*|raise|focus|most important|urgent|top|signals?|issues?|worry|concern\w*)\b/i,
  },
  {
    topic: 'profile',
    words: /\b(who is|how old|age|dependents?|family|risk profile|segment|city|lives?)\b/i,
  },
]

/** How many lines a rules answer quotes. Past this it is the file, not an answer. */
const ANSWER_MAX = 4

function topicFacts(topic: Topic, sheet: FactSheet): (string | null)[] {
  const ix = sheet.index
  const signalsOf = (...kinds: string[]): string[] =>
    ix.signals.filter((s) => kinds.includes(s.of.kind)).map((s) => s.id)
  switch (topic) {
    case 'refusals':
      return ix.refusals.length > 0 ? ix.refusals.map((r) => r.id) : [ix.noRefusals]
    case 'handoff':
      return [ix.handoff.id]
    case 'contact':
      return [ix.contact.id, ix.activity.id]
    case 'changes': {
      const news = [...ix.decisions.slice(0, 2), ...ix.ledger].map((x) => x.id)
      return [...news, ix.activity.id]
    }
    case 'debt':
      return ix.loans.length > 0
        ? [
            ...ix.loans.map((l) => l.id),
            ...signalsOf('expensive_debt', 'missed_repayment', 'emi_ending'),
          ]
        : [ix.noLoans ?? ix.consent]
    case 'habits':
      return signalsOf('subscription_review', 'price_increase', 'habit_cost', 'category_drift')
    case 'cover':
      return [ix.protection ?? ix.consent, ix.policies, ...signalsOf('protection_gap')]
    case 'goal':
      return [ix.goal, ix.roadmap]
    case 'surplus':
      return [ix.income ?? ix.consent, ix.spending]
    case 'buffer':
      return [ix.buffer ?? ix.consent, ...signalsOf('idle_cash', 'buffer_thin', 'deposit_maturing')]
    case 'wallet':
      return [ix.wallet ?? ix.consent]
    case 'investments':
      return [ix.investments ?? ix.consent]
    case 'upcoming':
      return [ix.upcoming.id, ...signalsOf('deposit_maturing', 'emi_ending')]
    case 'priorities':
      return [...ix.signals.slice(0, 2).map((s) => s.id), ix.roadmap]
    case 'profile':
      return [ix.profile]
  }
}

/** The topics a question asks about, in `TOPICS` order. */
export function topicsOf(question: string): Topic[] {
  return TOPICS.filter((t) => t.words.test(question)).map((t) => t.topic)
}

/**
 * A question answered by quoting the record's own lines: the verdict first where a product was
 * checked, then past refusals of that product, then the lines for the first two topics the
 * question asks about. Where it asks about nothing the record holds, it says so, and says what
 * the record does hold.
 */
export function rulesAnswer(
  question: string,
  sheet: FactSheet,
  check: { factId: string; productId: string } | null,
): CitedSentence[] {
  const byId = new Map(sheet.facts.map((f) => [f.id, f]))
  const ids: string[] = []
  const take = (id: string | null | undefined): void => {
    if (typeof id === 'string' && !ids.includes(id)) ids.push(id)
  }
  if (check) {
    take(check.factId)
    for (const r of sheet.index.refusals) if (r.of.productId === check.productId) take(r.id)
  }
  for (const topic of topicsOf(question).slice(0, 2)) {
    for (const id of topicFacts(topic, sheet)) take(id)
  }

  if (ids.length === 0) {
    const top = sheet.index.signals[0]
    return [
      say('The record does not answer that directly.'),
      say(
        `It holds ${sheet.first}'s income and spending, balances, loans, cover, investments, goal and plan, signals, refusals and recent activity.`,
      ),
      ...(top ? [say(byId.get(top.id)?.text ?? '', top.id)] : []),
    ]
  }
  return ids.slice(0, ANSWER_MAX).map((id) => say(byId.get(id)?.text ?? '', id))
}

/**
 * The gate, before any model: the shelf product a question names, judged by the rules over this
 * customer's snapshot as the customer's own text chat judges it (`gateFor` in
 * `conversation.service.ts`): no amount, the goal's kind, the plan's horizon, and the shelf the
 * plan was gated over. Null where the question names no product; nothing is guessed.
 */
export function productCheck(
  question: string,
  state: Pick<CustomerState, 'snapshot' | 'goal' | 'horizonYears' | 'shelf'>,
): { product: ShelfProduct; verdict: Verdict } | null {
  const product = namedProduct(question, state.shelf)
  if (product === null) return null
  const verdict = evaluate({
    product,
    snapshot: state.snapshot,
    amount: 0,
    goal: { kind: state.goal.kind, horizonYears: state.horizonYears },
    alternatives: state.shelf,
  })
  return { product, verdict }
}

/* ------------------------------------------------------------------ *
 * Suggested questions
 * ------------------------------------------------------------------ */

/** The most a suggestion list shows, and the least it pads up to. */
const PROMPTS_MAX = 6
const PROMPTS_MIN = 4

/** The question an RM would ask about a customer's top signal, by its kind. */
const SIGNAL_QUESTION: Readonly<Record<string, (first: string) => string>> = {
  missed_repayment: (f) => `What happened with ${f}'s missed repayment?`,
  expensive_debt: (f) => `How much is ${f} paying on expensive debt each month?`,
  buffer_thin: (f) => `How long would ${f}'s savings last?`,
  protection_gap: (f) => `How short is ${f} on life cover?`,
  deposit_maturing: (f) => `When does ${f}'s deposit mature, and for how much?`,
  emi_ending: (f) => `What frees up when ${f}'s loan ends?`,
  idle_cash: (f) => `How much of ${f}'s savings is sitting idle?`,
  price_increase: (f) => `Which of ${f}'s subscriptions went up in price?`,
  subscription_review: (f) => `What is ${f} paying for subscriptions?`,
  category_drift: (f) => `Which of ${f}'s spending habits have grown?`,
  habit_cost: (f) => `Which small habits cost ${f} the most?`,
}

/**
 * A product as an RM would say it: the shelf name up to its first comma ("LIC Term Assurance"),
 * where that still names the same product to the gate, else the whole name.
 */
function spokenName(product: ShelfProduct, shelf: readonly ShelfProduct[]): string {
  const short = product.name.split(',')[0]?.trim() ?? product.name
  return namedProduct(short, shelf)?.productId === product.productId ? short : product.name
}

/**
 * Four to six questions about this customer, from their own record: the request and the
 * refusals where there are any (from `activity`, which the caller passes when it has it), the
 * top signal, the goal where it is not on track, a product the rules pass for one of the
 * customer's gaps, money outside IDBI, and what is coming up. Pure; no model.
 */
export function suggestedPrompts(
  state: CustomerState,
  activity?: Pick<ActivityFacts, 'refusals' | 'openHandoff'>,
): string[] {
  const first = firstName(state.file.customer.custName)
  const out: string[] = []
  const add = (q: string): void => {
    if (!out.includes(q)) out.push(q)
  }

  if (activity?.openHandoff) add(`What did ${first} ask to talk to the RM about?`)
  if (activity && activity.refusals > 0) add(`What has Uday refused ${first}, and why?`)
  const top = state.signals[0]
  const ask = top ? SIGNAL_QUESTION[top.kind] : undefined
  if (ask) add(ask(first))
  if (state.health !== 'on_track') {
    add(`Why is ${first}'s goal ${HEALTH_WORDS[state.health]}?`)
  }
  const gap = state.gaps[0]
  const product = gap ? state.shelf.find((p) => p.productId === gap.productId) : undefined
  if (product) add(`Would the rules pass ${spokenName(product, state.shelf)} for ${first}?`)
  if (state.walletSharePct !== null && state.walletSharePct < 50) {
    add(`How much of ${first}'s money is outside IDBI?`)
  }
  if (state.upcoming.length > 0) add(`What is coming up for ${first} in the next 30 days?`)

  for (const fallback of [
    `What should I raise first with ${first}?`,
    `Where does ${first}'s plan stand?`,
    `How much does ${first} have left over each month?`,
    `What has changed in ${first}'s money lately?`,
  ]) {
    if (out.length >= PROMPTS_MIN) break
    add(fallback)
  }
  return out.slice(0, PROMPTS_MAX)
}
