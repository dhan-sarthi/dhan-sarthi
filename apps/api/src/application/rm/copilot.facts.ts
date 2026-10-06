/**
 * The copilot's facts: one customer's record, as numbered lines a model may quote and a reader
 * can check.
 *
 * Every line is read off the customer's state at the RM clock (`customer-state.ts`) or off
 * their activity (`activity.service.ts`), in a fixed order, so the same record gives the same
 * `F1 … Fn` on every call and a citation means the same thing to the model, the guard and the
 * footnote. Nothing is computed here beyond formatting: each figure is one the engine or the
 * record already holds, and it is formatted once, in the line, with the console's own
 * formatters, so the guard can hold a sentence to the exact characters it may quote.
 *
 * The lines are written as plain third-person sentences ("Karan's card …"), not as key: value
 * pairs, because the deterministic answers reuse them as they stand: with no model, a question
 * about debt is answered with the debt lines themselves, and they have to read as an answer.
 *
 * A line that says what is *not* on the record ("No refusals are on record") is a fact too. A
 * model that is told nothing about refusals will guess; one that is told there are none can
 * cite the line that says so.
 */
import {
  daysBetween,
  firstName,
  goalLabel,
  plural,
  revoice,
  rupees,
  ruleLabel,
  shortDate,
} from '@dhan/core'
import type { Signal, UpcomingItem, LedgerEvent } from '@dhan/core'
import type {
  AdviceItem,
  ConsentScope,
  Fact,
  FactSourceKind,
  Handoff,
  JourneyEvent,
} from '@dhan/contracts'
import type { ActivityFacts } from './activity.service.ts'
import { HIGH_INTEREST_PCT, UPCOMING_DAYS } from './customer-state.ts'
import type { CustomerState } from './customer-state.ts'

/** What the customer's activity adds to their state. Each part is empty where nothing is on record. */
export interface CopilotRecord {
  activity: ActivityFacts
  /** Open and contacted requests to talk to the RM, oldest first. */
  handoffs: readonly Handoff[]
  /** BLOCKED advice records, newest first. */
  refusals: readonly AdviceItem[]
  /** The customer's journey, any order; the facts sort what they read. */
  journey: readonly JourneyEvent[]
}

/** How many of each repeated kind become lines. Past these the brief is a list, not a brief. */
const MAX_SIGNALS = 4
const MAX_REFUSALS = 3
const MAX_DECISIONS = 3
const MAX_LEDGER = 2
const MAX_UPCOMING = 4
/** Ledger events older than this are history, not news, for a meeting brief. */
const LEDGER_NEWS_DAYS = 183

const UPCOMING_RANK: Readonly<Record<UpcomingItem['kind'], number>> = {
  deposit_maturing: 0,
  emi_ending: 1,
  policy_renewal: 2,
  sip_date: 3,
}

export interface Indexed<T> {
  id: string
  of: T
}

/**
 * Which line says what, so the deterministic brief and answers can cite a line by meaning
 * rather than by number. Null where the customer's record has nothing of that kind and no
 * "none" line was written for it.
 */
export interface FactIndex {
  profile: string
  consent: string | null
  income: string | null
  spending: string | null
  buffer: string | null
  loans: Indexed<{ loanType: string; ratePct: number; overdueDays: number }>[]
  noLoans: string | null
  protection: string | null
  policies: string | null
  investments: string | null
  wallet: string | null
  goal: string
  roadmap: string | null
  signals: Indexed<Signal>[]
  gaps: string | null
  upcoming: Indexed<readonly UpcomingItem[]>
  ledger: Indexed<LedgerEvent>[]
  activity: Indexed<ActivityFacts>
  contact: Indexed<JourneyEvent | null>
  handoff: Indexed<Handoff | null>
  refusals: Indexed<AdviceItem>[]
  noRefusals: string | null
  decisions: Indexed<JourneyEvent>[]
}

export interface FactSheet {
  facts: Fact[]
  index: FactIndex
  /** The customer's first name, as every line and sentence calls them. */
  first: string
}

/** "7 Mar 2026": the year always, because a brief is read beside dates in other years. */
export function dated(iso: string): string {
  return `${shortDate(iso)} ${iso.slice(0, 4)}`
}

const pct = (n: number): string => `${n}%`

/** "a, b and c". */
function listed(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] ?? ''}`
}

/** A sentence's last character, made a full stop where it is not already punctuation. */
function stop(text: string): string {
  const t = text.trim()
  return /[.!?"”']$/.test(t) ? t : `${t}.`
}

/** Without its own full stop, so it can be joined into a longer sentence. */
function unstop(text: string): string {
  return text.trim().replace(/\.+$/, '')
}

/**
 * A decision's journey title leads with its outcome as a label ("Put off: Pay ₹9,126 off the
 * card"). Copied into a fact like that, the model read the label as part of a quotation and wrote
 * "Karan was told, 'Put off: …'", so the fact says who did what to which suggestion.
 */
const DECISION_VERBS: Readonly<Record<string, string>> = {
  'Did it': 'acted on the suggestion',
  Declined: 'declined the suggestion',
  'Put off': 'put off the suggestion',
  'Pushed back': 'pushed back on the suggestion',
}

function decided(first: string, title: string): string {
  const m = /^(Did it|Declined|Put off|Pushed back): (.+)$/.exec(title.trim())
  const verb = m?.[1] === undefined ? undefined : DECISION_VERBS[m[1]]
  return m?.[2] === undefined || verb === undefined
    ? `: ${unstop(title)}`
    : ` ${first} ${verb} "${unstop(m[2])}"`
}

const HEALTH_WORDS = { on_track: 'on track', at_risk: 'at risk', off_track: 'off track' } as const

const SCOPE_WORDS: Readonly<Record<ConsentScope, string>> = {
  PROFILE: 'profile',
  ACCOUNTS: 'balances',
  TXN: 'transactions',
  LIABILITIES: 'loans',
  HOLDINGS: 'investments and policies',
}
const SCOPES = Object.keys(SCOPE_WORDS) as ConsentScope[]

const EMPLOYMENT: Readonly<Record<string, string>> = {
  Salaried: 'salaried',
  'Self-employed': 'self-employed',
  Business: 'runs a business',
}

/** Who, by the RM's name for them: the customer, Uday, the desk or the statement. */
const SOURCE_FOR_JOURNEY: Readonly<Record<JourneyEvent['kind'], FactSourceKind>> = {
  joined: 'profile',
  plan: 'roadmap',
  decision: 'decision',
  advice: 'advice',
  handoff: 'decision',
  call: 'decision',
  note: 'decision',
  contact: 'decision',
  ledger: 'ledger',
}

class Sheet {
  readonly facts: Fact[] = []

  add(text: string, kind: FactSourceKind, ref: string | null = null): string {
    const id = `F${this.facts.length + 1}`
    this.facts.push({ id, text: stop(text), source: { kind, ref } })
    return id
  }
}

/** The goal's health in words, with the reason the definition gives for it. */
export function healthReason(state: CustomerState): string {
  if (state.health === 'off_track') return 'the plan cannot reach it with the money available'
  if (state.roadmap.shortfallMonthly > 0) {
    return `the plan is ${rupees(state.roadmap.shortfallMonthly)} a month short`
  }
  if (state.health === 'at_risk') {
    const urgent = state.signals.filter((s) => s.severity === 'urgent').map((s) => unstop(s.title))
    if (urgent.length === 0) return 'an urgent issue is open'
    const what = urgent.map((t) =>
      /^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t,
    )
    return urgent.length === 1
      ? `an urgent issue is open (${what[0] ?? ''})`
      : `${urgent.length} urgent issues are open (${what.join('; ')})`
  }
  return 'the plan reaches it on current figures'
}

/** The latest of the desk's own contacts: a call it logged, or a handoff it marked contacted. */
function lastContact(journey: readonly JourneyEvent[]): JourneyEvent | null {
  const contacts = journey
    .filter((e) => e.source === 'rm' && (e.kind === 'call' || e.kind === 'contact'))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  return contacts[contacts.length - 1] ?? null
}

function latestFirst<T extends { at: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

export function factSheet(state: CustomerState, record: CopilotRecord): FactSheet {
  const sheet = new Sheet()
  const snap = state.snapshot
  const customer = state.file.customer
  const first = firstName(customer.custName)
  const asOf = state.asOf
  const has = (scope: ConsentScope): boolean => state.granted.has(scope)

  /* Who ---------------------------------------------------------------- */

  const segment = state.segment.charAt(0).toUpperCase() + state.segment.slice(1)
  const profile = sheet.add(
    `${customer.custName}, ${snap.customer.age}, ${EMPLOYMENT[customer.employmentType] ?? customer.employmentType}, ` +
      `lives in ${customer.city}; ${plural(customer.dependents, 'dependent')}; ` +
      `${customer.riskProfile} risk profile; ${segment} segment. Record as at ${dated(asOf)}`,
    'profile',
    state.cif,
  )

  // A scope the customer did not consent to is not a zero; it is a figure the desk may not see,
  // and saying so stops "income ₹0" reaching a brief.
  const missing = SCOPES.filter((s) => !has(s))
  const consent =
    missing.length === 0
      ? null
      : sheet.add(
          state.consent.status !== 'ACTIVE'
            ? `${first}'s consent is ${state.consent.status.toLowerCase()}, so nothing from the accounts can be read`
            : `${first}'s consent does not cover ${listed(missing.map((s) => SCOPE_WORDS[s]))}, so those figures are not shown`,
          'profile',
          state.consent.consentId,
        )

  /* Money in and out --------------------------------------------------- */

  let income: string | null = null
  let spending: string | null = null
  if (has('TXN')) {
    income =
      snap.income.monthly > 0
        ? sheet.add(
            `${first}'s income is ${rupees(snap.income.monthly)} a month, ${snap.income.stability}`,
            'snapshot',
          )
        : sheet.add(
            `No salary is recognisable on ${first}'s statement; ${first} declared ${rupees(snap.customer.declaredMonthlyIncome)} a month`,
            'profile',
          )
    const left = snap.surplus.monthly
    spending = sheet.add(
      `${first} commits ${rupees(snap.commitments.total)} a month to fixed payments (EMIs, rent, bills, ` +
        `subscriptions and SIPs) and spends about ${rupees(snap.discretionary.monthly)} on everyday things, ` +
        (left >= 0
          ? `leaving ${rupees(left)} a month`
          : `which is ${rupees(-left)} a month more than comes in`),
      'snapshot',
    )
  }

  let buffer: string | null = null
  if (has('ACCOUNTS')) {
    const covered = snap.buffer.monthsCovered
    const idle =
      snap.balances.idleMonths > 0 && snap.balances.idleFloor > 0
        ? `; ${rupees(snap.balances.idleFloor)} of it has sat untouched for ${plural(snap.balances.idleMonths, 'month')}`
        : ''
    buffer = sheet.add(
      covered === null
        ? `${first} has ${rupees(snap.balances.total)} in savings and deposits; how many months that covers cannot be measured, because no regular outgoings are recognisable${idle}`
        : `${first} has ${rupees(snap.balances.total)} in savings and deposits, enough for ${covered} ${covered === 1 ? 'month' : 'months'} of outgoings against a target of ${snap.buffer.targetMonths}${idle}`,
      'snapshot',
    )
  }

  /* Debt ----------------------------------------------------------------- */

  const loans: FactIndex['loans'] = []
  let noLoans: string | null = null
  if (has('LIABILITIES')) {
    state.file.liabilities.forEach((l, i) => {
      const lender = state.lenders[i] ?? null
      const parts = [
        `${first}'s ${l.loanType.toLowerCase()} has ${rupees(l.outstandingPrincipal)} outstanding at ${pct(l.loanInterestRate)}`,
        `${rupees(l.emiAmount)} a month`,
        ...(l.isRevolving === true
          ? []
          : [`${plural(Math.max(0, l.tenureRemainingMonths), 'month')} left`]),
        ...(lender === null ? [] : [`paid to ${lender}`]),
      ]
      const overdue =
        l.dpdStatus > 0 ? `; an instalment is ${plural(l.dpdStatus, 'day')} overdue` : ''
      const costly =
        l.loanInterestRate >= HIGH_INTEREST_PCT
          ? `; above ${HIGH_INTEREST_PCT}%, so the rules hold back every investment (cover excepted) until it is cleared`
          : ''
      const id = sheet.add(`${parts.join(', ')}${overdue}${costly}`, 'snapshot')
      loans.push({
        id,
        of: { loanType: l.loanType, ratePct: l.loanInterestRate, overdueDays: l.dpdStatus },
      })
    })
    if (loans.length === 0)
      noLoans = sheet.add(`${first} has no loans or card balances on file`, 'snapshot')
  }

  /* Cover ---------------------------------------------------------------- */

  let protection: string | null = null
  let policies: string | null = null
  if (has('HOLDINGS')) {
    const p = snap.protection
    const health =
      p.healthCoverInForce > 0
        ? `health cover of ${rupees(p.healthCoverInForce)}`
        : 'no health cover on file'
    protection = sheet.add(
      p.lifeCoverNeeded > 0
        ? `${first} has ${rupees(p.lifeCoverInForce)} of life cover against a need of ${rupees(p.lifeCoverNeeded)} ` +
            `(ten times annual income, a rule of thumb)${p.gap > 0 ? `, so ${rupees(p.gap)} short` : ''}; ${health}`
        : `${first} has ${rupees(p.lifeCoverInForce)} of life cover and no dependents on file, so the record shows no cover need; ${health}`,
      'snapshot',
    )
    const held = state.file.policies.map((h) => {
      const terms = [
        ...(h.sumAssured === undefined ? [] : [`${rupees(h.sumAssured)} cover`]),
        ...(h.annualPremium === undefined ? [] : [`${rupees(h.annualPremium)} a year`]),
        ...(h.heldOutsideIdbi === true ? ['held outside IDBI'] : []),
      ]
      return terms.length > 0 ? `${h.name} (${terms.join(', ')})` : h.name
    })
    if (held.length > 0) policies = sheet.add(`${first} holds ${held.join('; ')}`, 'snapshot')
  }

  /* Investments and the bank's share ------------------------------------ */

  let investments: string | null = null
  if (has('HOLDINGS')) {
    const h = snap.holdings
    investments = sheet.add(
      h.total > 0
        ? `${first}'s investments are worth ${rupees(h.total)}: ${rupees(h.equity)} in equity and ${rupees(h.debt)} in fixed income, ` +
            (h.sipMonthly > 0
              ? `with ${rupees(h.sipMonthly)} a month going in by SIP`
              : 'with no SIP running')
        : `${first} has no investments on file`,
      'snapshot',
    )
  }

  let wallet: string | null = null
  if (has('ACCOUNTS')) {
    const elsewhere = [
      ...new Set(
        state.file.accounts
          .filter((a) => a.institution !== undefined && !a.institution.isHome)
          .map((a) => a.institution?.name ?? ''),
      ),
    ].filter(Boolean)
    const share =
      state.walletSharePct === null
        ? `${first} holds no balances at any bank`
        : `${rupees(state.withIdbi)} of ${first}'s ${rupees(state.balances)} in balances is with IDBI (${pct(state.walletSharePct)})` +
          (elsewhere.length > 0 ? `; the rest is at ${listed(elsewhere)}` : '')
    const products =
      state.idbiProducts.length > 0
        ? `IDBI products held: ${state.idbiProducts.join(', ')}`
        : 'no IDBI products held'
    wallet = sheet.add(
      `Relationship value ${rupees(state.relationshipValue)}. ${share}; ${products}`,
      'snapshot',
    )
  }

  /* The goal and the plan ------------------------------------------------- */

  const goal = sheet.add(
    `${first}'s goal: ${goalLabel(state.goal)}, ${rupees(state.goal.targetAmount)} by ${dated(state.goal.targetDate)}. ` +
      `It is ${HEALTH_WORDS[state.health]}: ${healthReason(state)}`,
    'roadmap',
  )

  const stages = state.roadmap.stages
  const current = stages[state.roadmap.currentStageIndex]
  const roadmap =
    current === undefined
      ? null
      : sheet.add(
          `${first}'s plan has ${plural(stages.length, 'stage')} and takes ${rupees(state.roadmap.monthlyCommitment)} a month. ` +
            `Stage ${current.index} now: ${unstop(revoice(current.label))}. Why first: ${unstop(revoice(current.why))}` +
            (stages.length > current.index
              ? `. After it: ${stages
                  .slice(current.index)
                  .map((s) => unstop(revoice(s.label)))
                  .join('; ')}`
              : ''),
          'roadmap',
          `v${state.roadmap.version}`,
        )

  /* What the engine found ------------------------------------------------- */

  const SEVERITY = { urgent: 'Urgent', important: 'Important', opportunity: 'Opportunity' } as const
  const signals = state.signals.slice(0, MAX_SIGNALS).map((s) => ({
    id: sheet.add(`${SEVERITY[s.severity]}: ${unstop(s.title)}. ${s.detail}`, 'insight', s.kind),
    of: s,
  }))

  const gaps =
    state.gaps.length === 0
      ? null
      : sheet.add(
          `${first} does not hold these yet, and the rules pass them for ${first} today: ${state.gaps
            .map((g) => `${g.productName} (${unstop(g.why)})`)
            .join('; ')}`,
          'snapshot',
        )

  // A deposit renewing by default or a loan's last instalment is a reason to call; a SIP date
  // is a reminder. The reasons go first, so a short list keeps them.
  const soon = [...state.upcoming]
    .sort((a, b) => UPCOMING_RANK[a.kind] - UPCOMING_RANK[b.kind] || (a.date < b.date ? -1 : 1))
    .slice(0, MAX_UPCOMING)
  const upcoming = {
    id: sheet.add(
      soon.length > 0
        ? `In the next ${UPCOMING_DAYS} days: ${soon.map((u) => `${dated(u.date)}, ${unstop(u.label)}`).join('; ')}`
        : `Nothing falls due for ${first} in the next ${UPCOMING_DAYS} days`,
      'snapshot',
    ),
    of: soon,
  }

  const ledger = latestFirst(
    state.ledgerEvents.filter((e) => daysBetween(e.at, asOf) <= LEDGER_NEWS_DAYS),
  )
    .slice(0, MAX_LEDGER)
    .map((e) => ({
      id: sheet.add(
        `On ${dated(e.at)} the statement shows: ${unstop(e.title)}${e.detail ? `. ${e.detail}` : ''}`,
        'ledger',
        e.id,
      ),
      of: e,
    }))

  /* What happened on the record ----------------------------------------- */

  const act = record.activity
  const lastActive =
    act.lastActivityAt === null
      ? `No activity by ${first} is on record`
      : `${first} was last active on ${dated(act.lastActivityAt)}, ${plural(Math.max(0, daysBetween(act.lastActivityAt, asOf)), 'day')} before ${dated(asOf)}`
  const calls =
    act.udayCalls > 0
      ? `; ${plural(act.udayCalls, 'call')} with Uday${act.lastCallAt ? `, the last on ${dated(act.lastCallAt.slice(0, 10))}` : ''}`
      : '; no calls with Uday'
  const activity = { id: sheet.add(`${lastActive}${calls}`, 'decision'), of: act }

  const contactEvent = lastContact(record.journey)
  const contact = {
    id:
      contactEvent === null
        ? sheet.add(`No RM contact with ${first} is on record`, 'decision')
        : sheet.add(
            `The last RM contact on record was on ${dated(contactEvent.at)}: ${unstop(contactEvent.title)}${contactEvent.detail ? `. "${unstop(contactEvent.detail)}"` : ''}`,
            SOURCE_FOR_JOURNEY[contactEvent.kind],
            contactEvent.id,
          ),
    of: contactEvent,
  }

  // The request still waiting longest is the one to answer first.
  const waiting = record.handoffs.filter((h) => h.status !== 'resolved')[0] ?? null
  const handoff = {
    id:
      waiting === null
        ? sheet.add(`${first} has no open request to talk to the RM`, 'decision')
        : sheet.add(
            `${first} asked to talk to the RM on ${dated(waiting.requestedOn)} and has waited ${plural(waiting.waitingDays, 'day')}; ` +
              `status ${waiting.status}${waiting.reason ? `. The request: "${unstop(waiting.reason)}"` : ''}` +
              (waiting.context.length > 0
                ? `. Context: ${waiting.context.map(unstop).join('; ')}`
                : ''),
            'decision',
            waiting.id,
          ),
    of: waiting,
  }

  const blocked = record.refusals.filter((r) => r.verdict === 'BLOCKED')
  const refusals = blocked.slice(0, MAX_REFUSALS).map((r) => ({
    id: sheet.add(
      `On ${dated(r.at)} Uday refused ${r.productName ?? 'a product'} for ${first} under the rule "${ruleLabel(r.ruleId ?? '')}"` +
        (r.spoken ? `. ${first} was told: "${r.spoken}"` : ''),
      'advice',
      r.id,
    ),
    of: r,
  }))
  const noRefusals =
    blocked.length === 0 ? sheet.add(`No refusals are on ${first}'s record`, 'advice') : null

  const decisions = latestFirst(record.journey.filter((e) => e.kind === 'decision'))
    .slice(0, MAX_DECISIONS)
    .map((e) => ({
      id: sheet.add(
        `On ${dated(e.at)}${decided(first, e.title)}${e.detail ? `. ${e.detail}` : ''}`,
        'decision',
        e.id,
      ),
      of: e,
    }))

  return {
    facts: sheet.facts,
    first,
    index: {
      profile,
      consent,
      income,
      spending,
      buffer,
      loans,
      noLoans,
      protection,
      policies,
      investments,
      wallet,
      goal,
      roadmap,
      signals,
      gaps,
      upcoming,
      ledger,
      activity,
      contact,
      handoff,
      refusals,
      noRefusals,
      decisions,
    },
  }
}

/**
 * The verdict of a check the RM's question triggered, as one more line after the record's own.
 * Appended rather than inserted so the record's numbering does not move between a question that
 * names a product and one that does not.
 */
export function withVerdict(
  sheet: FactSheet,
  check: {
    productName: string
    verdict: 'PASS' | 'BLOCKED'
    ruleId: string | null
    spoken: string | null
  },
): { sheet: FactSheet; id: string } {
  const id = `F${sheet.facts.length + 1}`
  const outcome =
    check.verdict === 'PASS'
      ? `pass ${check.productName} for ${sheet.first}`
      : `refuse ${check.productName} for ${sheet.first}, under the rule "${ruleLabel(check.ruleId ?? '')}"`
  const said = check.spoken ? `. ${sheet.first} would be told: "${check.spoken}"` : ''
  const fact: Fact = {
    id,
    text: stop(`Checked just now: the suitability rules ${outcome}${said}`),
    // Not an advice record: the check was the desk's, and the customer was told nothing.
    source: { kind: 'snapshot', ref: null },
  }
  return { sheet: { ...sheet, facts: [...sheet.facts, fact] }, id }
}
