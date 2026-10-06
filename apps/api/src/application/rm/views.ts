/**
 * The wire shapes of the console, from a customer's state and their activity.
 *
 * Mapping only. Every figure is one the state already holds — the snapshot, the roadmap, a
 * `@dhan/core` RM definition — so a number on the console can be traced to the engine's output
 * for the same file on the same date, and this file introduces no quantity of its own. Where the
 * engine has no figure the wire says null rather than inventing a zero.
 */
import {
  attritionWatch,
  conductBand,
  evaluate,
  figureBasis,
  goalLabel,
  initials,
  relationshipStrength,
  revoice,
  toSignal,
} from '@dhan/core'
import type { Action, Liability } from '@dhan/core'
import type {
  BookRow,
  ConsentScope,
  Customer360,
  Customer360Action,
  Customer360Consent,
  Customer360Liability,
  Customer360Stage,
  GoalSummary,
  RmProfile,
  SignalKind,
} from '@dhan/contracts'
import type { ActivityFacts } from './activity.service.ts'
import { BALANCE_SERIES_MONTHS, HIGH_INTEREST_PCT } from './customer-state.ts'
import type { CustomerState } from './customer-state.ts'

const round1 = (n: number): number => Math.round(n * 10) / 10

/** The income an RM plans with: observed on the statement, else what the customer declared. */
function monthlyIncome(s: CustomerState): number {
  return s.snapshot.income.monthly > 0
    ? s.snapshot.income.monthly
    : s.snapshot.customer.declaredMonthlyIncome
}

export function goalSummary(s: CustomerState): GoalSummary {
  return {
    kind: s.goal.kind,
    label: goalLabel(s.goal),
    targetAmount: s.goal.targetAmount,
    // The engine reads an absent basis as today's money, so the wire says so rather than null.
    amountBasis: s.goal.amountBasis ?? 'today',
    targetDate: s.goal.targetDate,
    health: s.health,
  }
}

/** Each kind among the signals once, in the engine's order. */
function kindsOf(signals: readonly { kind: SignalKind }[]): SignalKind[] {
  return [...new Set(signals.map((x) => x.kind))]
}

export function strengthOf(s: CustomerState, f: ActivityFacts): BookRow['strength'] {
  return relationshipStrength({
    lastActivityAt: f.lastActivityAt,
    idbiProducts: s.idbiProducts.length,
    walletSharePct: s.walletSharePct,
    asOf: s.asOf,
  })
}

export function attritionOf(s: CustomerState, f: ActivityFacts): BookRow['attrition'] {
  return attritionWatch({
    balanceSeries: s.balanceSeries,
    walletSharePct: s.walletSharePct,
    lastActivityAt: f.lastActivityAt,
    sipPaused: f.sipPaused,
    asOf: s.asOf,
  })
}

export function bookRow(s: CustomerState, f: ActivityFacts): BookRow {
  const customer = s.file.customer
  return {
    cif: s.cif,
    name: customer.custName,
    initials: initials(customer.custName),
    age: s.snapshot.customer.age,
    gender: customer.gender,
    city: customer.city,
    employmentType: customer.employmentType,
    riskProfile: customer.riskProfile,
    segment: s.segment,
    relationshipValue: s.relationshipValue,
    withIdbi: s.withIdbi,
    walletSharePct: s.walletSharePct,
    netWorth: s.netWorth.net,
    monthlyIncome: monthlyIncome(s),
    monthlySurplus: s.snapshot.surplus.monthly,
    sipMonthly: s.snapshot.holdings.sipMonthly,
    allocation: s.netWorth.allocation,
    balanceSeries: s.balanceSeries,
    balanceChange3mPct: s.balanceChange3mPct,
    goal: goalSummary(s),
    topSignal: s.signals[0] ?? null,
    signalCount: s.signals.length,
    signals: s.signals,
    signalKinds: kindsOf(s.signals),
    strength: strengthOf(s, f),
    attrition: attritionOf(s, f),
    lastActivityAt: f.lastActivityAt,
    openHandoff: f.openHandoff,
    refusals: f.refusals,
    products: { idbi: s.idbiProducts, gaps: s.gaps.map((g) => g.productName) },
  }
}

/* ------------------------------------------------------------------ *
 * Customer 360
 * ------------------------------------------------------------------ */

const SCOPE_LABEL: Readonly<Record<ConsentScope, string>> = {
  PROFILE: 'Profile',
  ACCOUNTS: 'Balances',
  TXN: 'Transactions',
  LIABILITIES: 'Loans',
  HOLDINGS: 'Investments and policies',
}
const SCOPES = Object.keys(SCOPE_LABEL) as ConsentScope[]

/** "••/••/1992": the year alone, which the age on the same header already gives away. */
function maskedDateOfBirth(dob: string): string {
  return `••/••/${dob.slice(0, 4)}`
}

function consentOf(s: CustomerState): Customer360Consent {
  const status = s.consent.status
  return {
    status,
    scopes: SCOPES.map((scope) => {
      const active = s.granted.has(scope)
      const reason = active
        ? null
        : status !== 'ACTIVE'
          ? `The consent on file is ${status.toLowerCase()}, so nothing from it is shown.`
          : 'Not covered by the consent the customer gave.'
      return { scope, label: SCOPE_LABEL[scope], active, reason }
    }),
  }
}

function liabilityOf(s: CustomerState, l: Liability, i: number): Customer360Liability {
  return {
    // Where the statement names nobody, the wire says so in words rather than guessing a name.
    lender: s.lenders[i] ?? 'Not named on the statement',
    loanType: l.loanType,
    outstanding: l.outstandingPrincipal,
    ratePct: l.loanInterestRate,
    emi: l.emiAmount,
    monthsLeft: l.isRevolving === true ? null : Math.max(0, l.tenureRemainingMonths),
    // The same threshold the state's snapshot was derived with, so this flag and the engine's
    // `debt.hasHighInterest` cannot disagree about a loan.
    highInterest: l.loanInterestRate >= HIGH_INTEREST_PCT,
    missedRepayment: l.dpdStatus > 0,
  }
}

function stageOf(stage: CustomerState['roadmap']['stages'][number]): Customer360Stage {
  return {
    index: stage.index,
    kind: stage.kind,
    // The engine wrote these to the customer; the RM reads about them.
    label: revoice(stage.label),
    why: revoice(stage.why),
    monthly: stage.monthly,
    targetAmount: stage.targetAmount > 0 ? stage.targetAmount : null,
    startsOn: stage.startsOn,
    // `monthsToComplete: 0` is the engine's only way of saying "no end"; its date is not a date.
    completesOn: stage.monthsToComplete === 0 ? null : stage.completesOn,
    cadence: stage.cadence,
    isGoal: stage.isGoal,
  }
}

/**
 * The horizon the daily plan gated each kind of action at (`dailyplan.ts`, `toAction`): none for
 * a sweep, which is money already held; thirty years for cover; the plan's own for the rest.
 * Re-running the gate at any other horizon could reach a different verdict than the one that
 * put the action on screen.
 */
function horizonFor(action: Action, s: CustomerState): number {
  if (action.kind === 'open_sweep_in') return 0
  if (action.kind === 'buy_term_cover' || action.kind === 'enrol_pmjjby') return 30
  return s.horizonYears
}

/**
 * Actions whose customer-facing line makes no sense said to the RM, in the RM's words.
 *
 * The rest are re-voiced as they are ("Take ₹1 crore of cover for ₹985 a month" reads the same
 * either side of the desk). "Talk to your relationship manager" re-voiced would be the RM being
 * told to talk to themselves.
 */
const RM_LINES: Partial<Record<Action['kind'], { label: string; detail: string }>> = {
  talk_to_rm: {
    label: 'Call them',
    detail: 'Uday suggests a person handles this one, and the customer has been offered a call.',
  },
}

/** The insight an action came from: its id is `${asOf}:${insightKind}:${actionKind}`. */
function insightKindOf(action: Action): string | null {
  return action.id.split(':')[1] ?? null
}

/**
 * A next action and its "Why?": the signal behind it, its evidence, and — for an action that
 * names a product — the rules run again over the same inputs the daily plan gated it with. The
 * plan already dropped anything the rules refused, so the verdict here is the one that put the
 * action on screen, re-stated with its count rather than taken on trust.
 */
function actionOf(s: CustomerState, action: Action): Customer360Action {
  const kind = insightKindOf(action)
  const insight = s.insights.find((i) => i.kind === kind)
  const horizon = horizonFor(action, s)
  const product =
    action.productId === undefined
      ? undefined
      : s.shelf.find((p) => p.productId === action.productId)
  const verdict =
    product === undefined
      ? null
      : evaluate({
          product,
          snapshot: s.snapshot,
          amount: action.amount,
          cadence: action.cadence ?? 'monthly',
          goal: horizon > 0 ? { kind: 'suggested', horizonYears: horizon } : null,
          alternatives: s.shelf,
        })
  const voiced = RM_LINES[action.kind]
  return {
    id: action.id,
    kind: action.kind,
    label: voiced?.label ?? revoice(action.label),
    detail: voiced?.detail ?? revoice(action.detail),
    amount: action.amount,
    why: {
      signal: insight === undefined ? null : toSignal(insight),
      evidence: action.evidence.map(revoice),
      rulesPassed: verdict === null ? null : verdict.passed.length,
      verdict: verdict === null ? null : verdict.verdict,
    },
  }
}

export interface Customer360Input {
  state: CustomerState
  facts: ActivityFacts
  assignedRm: RmProfile
  prompts: string[]
}

export function customer360({
  state: s,
  facts: f,
  assignedRm,
  prompts,
}: Customer360Input): Customer360 {
  const customer = s.file.customer
  const snap = s.snapshot
  const credit = snap.credit
  const actions = [s.plan.primary, ...s.plan.secondary].filter((a): a is Action => a !== null)

  return {
    asOf: s.asOf,
    basis: figureBasis(s.asOf, BALANCE_SERIES_MONTHS),
    profile: {
      cif: s.cif,
      name: customer.custName,
      initials: initials(customer.custName),
      age: snap.customer.age,
      gender: customer.gender,
      city: customer.city,
      maritalStatus: customer.maritalStatus,
      dependents: customer.dependents,
      employmentType: customer.employmentType,
      riskProfile: customer.riskProfile,
      kycStatus: customer.kycStatus,
      customerSince: customer.customerSince,
      language: customer.preferredLanguage,
      dateOfBirthMasked: maskedDateOfBirth(customer.dateOfBirth),
      assignedRm,
    },
    segment: s.segment,
    strength: strengthOf(s, f),
    attrition: attritionOf(s, f),
    highlights: {
      relationshipValue: s.relationshipValue,
      netWorth: s.netWorth.net,
      monthlySurplus: snap.surplus.monthly,
      goalHealth: s.health,
      lastActivityAt: f.lastActivityAt,
    },
    money: {
      accounts: s.file.accounts.map((a) => ({
        id: a.accountNumberMasked,
        institution: a.institution?.name ?? 'IDBI Bank',
        type: a.accountType,
        masked: a.accountNumberMasked,
        balance: a.currentBalance,
        isIdbi: a.institution?.isHome ?? true,
      })),
      walletSharePct: s.walletSharePct,
      holdings: s.file.holdings.map((h) => ({
        holdingType: h.holdingType,
        name: h.name,
        assetClass: h.assetClass,
        invested: h.investedAmount,
        current: h.currentValue,
        sipMonthly: h.sipActive ? (h.sipAmount ?? null) : null,
      })),
      liabilities: s.file.liabilities.map((l, i) => liabilityOf(s, l, i)),
      protection: {
        lifeCover: snap.protection.lifeCoverInForce,
        lifeCoverNeeded: snap.protection.lifeCoverNeeded,
        gap: snap.protection.gap,
        healthCover: snap.protection.healthCoverInForce > 0,
        policies: s.file.policies.map((p) => ({ name: p.name, cover: p.sumAssured ?? null })),
      },
      netWorth: s.netWorth,
      balances: s.balances,
      withIdbi: s.withIdbi,
      balanceSeries: s.balanceSeries,
    },
    income: {
      monthly: monthlyIncome(s),
      stability: snap.income.stability,
      payDay: snap.income.payDay,
    },
    spend: {
      commitments: snap.commitments.total,
      discretionary: snap.discretionary.monthly,
      // `byCategory` is a running total over the statement window, not a month; divided down
      // by the months of history exactly as the app's Spend tab does, so the two agree.
      topCategories: snap.discretionary.byCategory.slice(0, 5).map(([category, total]) => ({
        category,
        monthly: Math.round(total / Math.max(1, snap.quality.monthsOfHistory)),
      })),
    },
    buffer: {
      monthsCovered: snap.buffer.monthsCovered,
      targetMonths: snap.buffer.targetMonths,
    },
    credit: {
      conductScore: credit.conductScore,
      // Null on the engine's side only with a null score (no borrowing to judge); the wire's
      // denominator is a number, and a zero beside a null score reads as "nothing to judge".
      outOf: credit.outOf ?? 0,
      band: revoice(conductBand(credit.conductScore, credit.outOf)),
      highestRate: snap.debt.total > 0 ? credit.highestRate : null,
      emiToIncomePct: credit.emiToIncome === null ? null : round1(credit.emiToIncome * 100),
    },
    goal: goalSummary(s),
    roadmap: {
      stages: s.roadmap.stages.map(stageOf),
      feasible: s.roadmap.feasible,
      shortfallMonthly: s.roadmap.shortfallMonthly,
      monthlyCommitment: s.roadmap.monthlyCommitment,
      // An infeasible plan's end date is the date of a plan that does not work; a plan whose
      // goal stage never ends has no end date at all.
      completesOn:
        !s.roadmap.feasible || s.roadmap.stages.some((st) => st.isGoal && st.monthsToComplete === 0)
          ? null
          : s.roadmap.completesOn,
      currentStageIndex: s.roadmap.currentStageIndex,
    },
    projection: s.roadmap.projection,
    signals: s.signals,
    nextActions: actions.map((a) => actionOf(s, a)),
    upcoming: s.upcoming,
    consent: consentOf(s),
    uday: { calls: f.udayCalls, lastCallAt: f.lastCallAt },
    products: { held: s.idbiProducts, gaps: s.gaps.map((g) => g.productName) },
    copilotPrompts: prompts,
  }
}
