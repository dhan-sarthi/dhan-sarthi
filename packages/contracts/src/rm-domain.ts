/**
 * The shapes the relationship manager's console reads.
 *
 * Everything here is wire-only: the RM desk sees a book of customers through definitions that
 * live in `packages/core/src/rm` (segment, goal health, strength, attrition, the call queue), and
 * these are what those definitions look like once they cross the wire. The build spec is
 * `docs/product/rm-console.md`; its Definitions table is what every field below means.
 *
 * Where a customer-side mirror already says the same thing — an insight kind, a rule's verdict,
 * a projection band, a stage — it is reused rather than restated, so the console and the app
 * cannot drift on what a word means. Nulls are explicit: a figure the engine does not have is
 * `null`, never an absent key, because the console has to say "not known" out loud.
 *
 * Dates are simulated dates (`YYYY-MM-DD`, the RM clock is the data anchor) unless a field says
 * it is a real instant: the access log and token expiry are the only wall-clock times.
 */
import { z } from 'zod'
import {
  ActionIdSchema,
  AdviceRecordIdSchema,
  CifSchema,
  IsoDateSchema,
  MoneySchema,
  ProductIdSchema,
  Sha256Schema,
  TimestampSchema,
} from './common.ts'
import {
  AccountTypeSchema,
  ActionKindSchema,
  AdviceSourceSchema,
  AnswerSchema,
  AssetClassSchema,
  ConsentScopeSchema,
  ConsentStatusSchema,
  EmploymentTypeSchema,
  GoalKindSchema,
  HoldingSchema,
  IncomeFactsSchema,
  InsightKindSchema,
  InsightSchema,
  ProjectionSchema,
  RiskProfileSchema,
  SpendCategorySchema,
  StageKindSchema,
  StageSchema,
  VerdictOutcomeSchema,
  VerdictSchema,
} from './domain.ts'

/** A calendar month, `YYYY-MM`: the bucket every 12-month series on the console is cut into. */
export const YearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'expected YYYY-MM')
  .describe('Calendar month, YYYY-MM')
export type YearMonth = z.infer<typeof YearMonthSchema>

/* ------------------------------------------------------------------ *
 * The RM
 * ------------------------------------------------------------------ */

export const RmProfileSchema = z.object({
  rmId: z.string(),
  employeeNo: z.string(),
  name: z.string(),
  initials: z.string(),
  desk: z.string(),
  city: z.string(),
})
export type RmProfile = z.infer<typeof RmProfileSchema>

/* ------------------------------------------------------------------ *
 * Classifications (core/rm definitions)
 * ------------------------------------------------------------------ */

/** By relationship value: Mass < ₹10L, Affluent ₹10L–₹50L, Priority ≥ ₹50L. */
export const SegmentSchema = z.enum(['priority', 'affluent', 'mass'])
export type Segment = z.infer<typeof SegmentSchema>

export const GoalHealthSchema = z.enum(['on_track', 'at_risk', 'off_track'])
export type GoalHealth = z.infer<typeof GoalHealthSchema>

/** The reason is always present: a badge the RM cannot interrogate is a badge they ignore. */
export const StrengthSchema = z.object({
  level: z.enum(['high', 'medium', 'low']),
  reason: z.string(),
})
export type Strength = z.infer<typeof StrengthSchema>

/** Flagged only with reasons. `flagged: false` comes with an empty list, never a stale one. */
export const AttritionSchema = z.object({
  flagged: z.boolean(),
  reasons: z.array(z.string()),
})
export type Attrition = z.infer<typeof AttritionSchema>

/**
 * An engine insight re-voiced for the RM, in the third person.
 *
 * `human_handoff` is excluded from the kind rather than filtered by convention: the engine adds
 * it to every customer, so on the console it would be a signal on every row and mean nothing.
 * A request to talk to the RM reaches the console as a `Handoff` instead.
 */
export const SignalKindSchema = InsightKindSchema.exclude(['human_handoff'])
export type SignalKind = z.infer<typeof SignalKindSchema>

/** The engine's three levels, kept as they are so the queue ranks the way the app does. */
export const SignalSeveritySchema = InsightSchema.shape.severity
export type SignalSeverity = z.infer<typeof SignalSeveritySchema>

export const SignalSchema = z.object({
  kind: SignalKindSchema,
  severity: SignalSeveritySchema,
  /** RM-voiced, third person, leading with the figure where there is one. */
  title: z.string(),
  detail: z.string(),
  /** The rupee figure the title leads with, or null where the signal has none. */
  figure: MoneySchema.nullable(),
  deadlineDays: z.number().nullable(),
  evidence: z.array(z.string()),
})
export type Signal = z.infer<typeof SignalSchema>

/* ------------------------------------------------------------------ *
 * The book
 * ------------------------------------------------------------------ */

/**
 * One month-end in a balance history: balances only, never holdings or debt.
 *
 * Holdings and loans are flat before the anchor in the generator, so a net-worth line over the
 * past would draw a flat line and call it growth. Balances move with the ledger and are the
 * honest series; holdings are shown "as at" the as-of date instead.
 */
export const BalancePointSchema = z.object({
  month: YearMonthSchema,
  total: MoneySchema,
  withIdbi: MoneySchema,
})
export type BalancePoint = z.infer<typeof BalancePointSchema>

/** Rupees in each bucket, not percentages, so a bar and its tooltip read the same numbers. */
export const AllocationSchema = z.object({
  cash: MoneySchema,
  equity: MoneySchema,
  fixed: MoneySchema,
})
export type Allocation = z.infer<typeof AllocationSchema>

export const GoalSummarySchema = z.object({
  kind: GoalKindSchema,
  label: z.string(),
  targetAmount: MoneySchema,
  targetDate: IsoDateSchema,
  health: GoalHealthSchema,
})
export type GoalSummary = z.infer<typeof GoalSummarySchema>

/** What the RM can offer against what the customer holds with IDBI, by product name. */
export const BookProductsSchema = z.object({
  idbi: z.array(z.string()),
  gaps: z.array(z.string()),
})
export type BookProducts = z.infer<typeof BookProductsSchema>

/** One row of the book table: enough to sort, filter and draw the preview rail. */
export const BookRowSchema = z.object({
  cif: CifSchema,
  name: z.string(),
  initials: z.string(),
  age: z.number().int().nonnegative(),
  gender: z.string(),
  city: z.string(),
  employmentType: EmploymentTypeSchema,
  riskProfile: RiskProfileSchema,
  segment: SegmentSchema,
  /** Assets we can see: every balance at any bank plus holdings. */
  relationshipValue: MoneySchema,
  withIdbi: MoneySchema,
  /** Null when the customer holds no balance at any bank: there is no share to divide out. */
  walletSharePct: z.number().nullable(),
  netWorth: MoneySchema,
  monthlyIncome: MoneySchema,
  monthlySurplus: MoneySchema,
  sipMonthly: MoneySchema,
  allocation: AllocationSchema,
  /**
   * The last twelve complete month-ends at or before the as-of date, oldest first. The as-of
   * balance is not the last point unless the as-of date is itself a month-end.
   */
  balanceSeries: z.array(BalancePointSchema),
  /** Null where three months ago had nothing to measure a change against. */
  balanceChange3mPct: z.number().nullable(),
  goal: GoalSummarySchema,
  topSignal: SignalSchema.nullable(),
  signalCount: z.number().int().nonnegative(),
  strength: StrengthSchema,
  attrition: AttritionSchema,
  lastActivityAt: IsoDateSchema.nullable(),
  openHandoff: z.boolean(),
  /** Advice records with verdict BLOCKED: mis-sales the rules prevented for this customer. */
  refusals: z.number().int().nonnegative(),
  products: BookProductsSchema,
})
export type BookRow = z.infer<typeof BookRowSchema>

/**
 * The tabs over the book table. Three are segments; the rest are views a desk asks for by name:
 * `at_risk` is goal health other than on track, `idle_cash` a customer with an idle-cash signal,
 * `asked_for_rm` an open handoff.
 */
export const BookTabSchema = z.enum([
  'all',
  'priority',
  'affluent',
  'mass',
  'at_risk',
  'idle_cash',
  'asked_for_rm',
])
export type BookTab = z.infer<typeof BookTabSchema>

/* ------------------------------------------------------------------ *
 * Today: the queue, the handoffs, what is coming up
 * ------------------------------------------------------------------ */

/**
 * One line of "Call today". Open handoffs come first, oldest first, then one top signal per
 * customer in the engine's own ranking.
 */
export const QueueItemSchema = z.object({
  id: z.string(),
  cif: CifSchema,
  name: z.string(),
  initials: z.string(),
  segment: SegmentSchema,
  source: z.enum(['handoff', 'signal']),
  /** Null on a handoff the customer raised without a signal behind it. */
  signal: SignalSchema.nullable(),
  /** One sentence, with its figure. */
  why: z.string(),
  /** A suggested first line for the call. Suggested, never scripted. */
  opener: z.string(),
})
export type QueueItem = z.infer<typeof QueueItemSchema>

export const HandoffStatusSchema = z.enum(['open', 'contacted', 'resolved'])
export type HandoffStatus = z.infer<typeof HandoffStatusSchema>

/** A customer's "Talk to your relationship manager", keyed by the decision that recorded it. */
export const HandoffSchema = z.object({
  /** The decision id: the request is a row in the customer's own record, not a copy of one. */
  id: z.string(),
  cif: CifSchema,
  name: z.string(),
  /** The simulated date the customer asked on. */
  requestedOn: IsoDateSchema,
  waitingDays: z.number().int().nonnegative(),
  status: HandoffStatusSchema,
  reason: z.string(),
  context: z.array(z.string()),
  /** The RM's note on the last status change, if they left one. */
  note: z.string().nullable(),
})
export type Handoff = z.infer<typeof HandoffSchema>

export const UpcomingKindSchema = z.enum([
  'deposit_maturing',
  'emi_ending',
  'sip_date',
  'policy_renewal',
])
export type UpcomingKind = z.infer<typeof UpcomingKindSchema>

export const UpcomingItemSchema = z.object({
  cif: CifSchema,
  name: z.string(),
  kind: UpcomingKindSchema,
  date: IsoDateSchema,
  label: z.string(),
  amount: MoneySchema.nullable(),
})
export type UpcomingItem = z.infer<typeof UpcomingItemSchema>

export const KpiSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number(),
  unit: z.enum(['inr', 'count', 'pct']),
  /** In the KPI's own unit; null where there is no earlier figure to compare with. */
  delta: z.number().nullable(),
  deltaLabel: z.string().nullable(),
  /** A sparkline, oldest first, where the KPI has a history. */
  series: z.array(z.number()).nullable(),
})
export type Kpi = z.infer<typeof KpiSchema>

/* ------------------------------------------------------------------ *
 * The record, as the RM sees it
 * ------------------------------------------------------------------ */

/**
 * One advice record, flattened for a table and named for a person.
 *
 * The verdict keeps the record's three outcomes: an avatar call that named a product off the
 * shelf writes UNKNOWN_PRODUCT into the chain, and a console that could not show that row would
 * be hiding part of the record it exists to prove.
 */
export const AdviceItemSchema = z.object({
  id: AdviceRecordIdSchema,
  /** The simulated date the advice was given on. */
  at: IsoDateSchema,
  cif: CifSchema,
  name: z.string(),
  productId: ProductIdSchema.nullable(),
  productName: z.string().nullable(),
  amount: MoneySchema.nullable(),
  source: AdviceSourceSchema,
  verdict: VerdictOutcomeSchema,
  ruleId: z.string().nullable(),
  /** The ids of the rules that passed, as on the record: all nine on a PASS. */
  rulesPassed: z.array(z.string()),
  /** The sentence the customer heard, verbatim. Null on a PASS. */
  spoken: z.string().nullable(),
  /** The reviewer wording, always present. */
  recorded: z.string(),
  hash: Sha256Schema,
  prevHash: Sha256Schema,
})
export type AdviceItem = z.infer<typeof AdviceItemSchema>

/** Refusals counted by the rule that made them. */
export const RuleCountSchema = z.object({
  ruleId: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
})
export type RuleCount = z.infer<typeof RuleCountSchema>

/* ------------------------------------------------------------------ *
 * The journey
 * ------------------------------------------------------------------ */

export const JourneyEventKindSchema = z.enum([
  'joined',
  'plan',
  'decision',
  'advice',
  'handoff',
  'call',
  'note',
  'contact',
  'ledger',
])
export type JourneyEventKind = z.infer<typeof JourneyEventKindSchema>

export const JourneySourceSchema = z.enum(['engine', 'customer', 'uday', 'rm', 'ledger'])
export type JourneySource = z.infer<typeof JourneySourceSchema>

/** One field of a plan version that moved. A field that appeared or went away has a null side. */
export const JourneyDiffSchema = z.object({
  field: z.string(),
  before: z.union([z.string(), z.number()]).nullable(),
  after: z.union([z.string(), z.number()]).nullable(),
})
export type JourneyDiff = z.infer<typeof JourneyDiffSchema>

export const JourneyEventSchema = z.object({
  id: z.string(),
  at: IsoDateSchema,
  kind: JourneyEventKindSchema,
  source: JourneySourceSchema,
  title: z.string(),
  detail: z.string().nullable(),
  /** Present on a plan version: what changed, before and after. */
  diff: z.array(JourneyDiffSchema).nullable(),
  /** Present on advice. The record's outcome, for the same reason as `AdviceItem.verdict`. */
  verdict: VerdictOutcomeSchema.nullable(),
  ruleId: z.string().nullable(),
  amount: MoneySchema.nullable(),
})
export type JourneyEvent = z.infer<typeof JourneyEventSchema>

/* ------------------------------------------------------------------ *
 * The copilot: numbered facts and the sentences that cite them
 * ------------------------------------------------------------------ */

/** `F1`, `F2` … assigned by the server in the order the facts are assembled. */
export const FactIdSchema = z.string().regex(/^F[1-9]\d*$/, 'expected F1, F2, …')
export type FactId = z.infer<typeof FactIdSchema>

export const FactSourceKindSchema = z.enum([
  'snapshot',
  'roadmap',
  'insight',
  'advice',
  'decision',
  'ledger',
  'profile',
])
export type FactSourceKind = z.infer<typeof FactSourceKindSchema>

/** A line assembled on the server, deterministically, before any model sees it. */
export const FactSchema = z.object({
  id: FactIdSchema,
  text: z.string(),
  source: z.object({
    kind: FactSourceKindSchema,
    /** The row it came from where it has one: an advice record id, a decision id, a version. */
    ref: z.string().nullable(),
  }),
})
export type Fact = z.infer<typeof FactSchema>

/**
 * A sentence and the facts it rests on. The server keeps a model's sentence only when every id
 * exists and every figure in it appears in a cited fact, so `cites` is the footnote the UI draws.
 */
export const CitedSentenceSchema = z.object({
  text: z.string(),
  cites: z.array(FactIdSchema),
})
export type CitedSentence = z.infer<typeof CitedSentenceSchema>

/** Who wrote the words. The facts and any verdict are the engine's either way. */
export const PhrasedBySchema = AnswerSchema.shape.phrasedBy.unwrap()
export type PhrasedBy = z.infer<typeof PhrasedBySchema>

/* ------------------------------------------------------------------ *
 * The access log
 * ------------------------------------------------------------------ */

export const AccessActionSchema = z.enum([
  'viewed',
  'revealed',
  'checked',
  'briefed',
  'asked',
  'noted',
  'contacted',
])
export type AccessAction = z.infer<typeof AccessActionSchema>

/** Every open, reveal and check an RM made, with the purpose they gave. */
export const AccessEntrySchema = z.object({
  id: z.string(),
  /** A real instant, not the simulated date: the log records when the RM looked. */
  at: TimestampSchema,
  cif: CifSchema,
  name: z.string(),
  action: AccessActionSchema,
  purpose: z.string(),
  detail: z.string().nullable(),
})
export type AccessEntry = z.infer<typeof AccessEntrySchema>

/* ------------------------------------------------------------------ *
 * Customer 360
 * ------------------------------------------------------------------ */

export const Customer360ProfileSchema = z.object({
  cif: CifSchema,
  name: z.string(),
  initials: z.string(),
  age: z.number().int().nonnegative(),
  gender: z.string(),
  city: z.string(),
  maritalStatus: z.string(),
  dependents: z.number().int().nonnegative(),
  employmentType: EmploymentTypeSchema,
  riskProfile: RiskProfileSchema,
  kycStatus: z.string(),
  customerSince: IsoDateSchema,
  language: z.string(),
  /** Masked by default; the full date only comes back from the reveal route, which logs it. */
  dateOfBirthMasked: z.string(),
  assignedRm: RmProfileSchema,
})
export type Customer360Profile = z.infer<typeof Customer360ProfileSchema>

export const Customer360HighlightsSchema = z.object({
  relationshipValue: MoneySchema,
  netWorth: MoneySchema,
  monthlySurplus: MoneySchema,
  goalHealth: GoalHealthSchema,
  lastActivityAt: IsoDateSchema.nullable(),
})
export type Customer360Highlights = z.infer<typeof Customer360HighlightsSchema>

export const Customer360AccountSchema = z.object({
  id: z.string(),
  /** The bank's name. Accounts outside IDBI reached us through an Account Aggregator consent. */
  institution: z.string(),
  type: AccountTypeSchema,
  masked: z.string(),
  balance: MoneySchema,
  isIdbi: z.boolean(),
})
export type Customer360Account = z.infer<typeof Customer360AccountSchema>

export const Customer360HoldingSchema = z.object({
  holdingType: HoldingSchema.shape.holdingType,
  name: z.string(),
  assetClass: AssetClassSchema,
  invested: MoneySchema,
  current: MoneySchema,
  /** Null where no SIP is running. */
  sipMonthly: MoneySchema.nullable(),
})
export type Customer360Holding = z.infer<typeof Customer360HoldingSchema>

export const Customer360LiabilitySchema = z.object({
  lender: z.string(),
  loanType: z.string(),
  outstanding: MoneySchema,
  ratePct: z.number(),
  emi: MoneySchema,
  /** Null on revolving credit, which has no tenure to count down. */
  monthsLeft: z.number().int().nonnegative().nullable(),
  highInterest: z.boolean(),
  missedRepayment: z.boolean(),
})
export type Customer360Liability = z.infer<typeof Customer360LiabilitySchema>

export const Customer360ProtectionSchema = z.object({
  lifeCover: MoneySchema,
  lifeCoverNeeded: MoneySchema,
  gap: MoneySchema,
  healthCover: z.boolean(),
  policies: z.array(z.object({ name: z.string(), cover: MoneySchema.nullable() })),
})
export type Customer360Protection = z.infer<typeof Customer360ProtectionSchema>

export const Customer360MoneySchema = z.object({
  accounts: z.array(Customer360AccountSchema),
  /** Null when the customer holds no balance at any bank, as on the book row. */
  walletSharePct: z.number().nullable(),
  holdings: z.array(Customer360HoldingSchema),
  liabilities: z.array(Customer360LiabilitySchema),
  protection: Customer360ProtectionSchema,
  netWorth: z.object({
    assets: MoneySchema,
    liabilities: MoneySchema,
    net: MoneySchema,
    allocation: AllocationSchema,
  }),
  balanceSeries: z.array(BalancePointSchema),
})
export type Customer360Money = z.infer<typeof Customer360MoneySchema>

export const Customer360StageSchema = z.object({
  index: z.number().int(),
  kind: StageKindSchema,
  label: z.string(),
  why: z.string(),
  monthly: MoneySchema,
  /** Null on a stage with no amount to reach, such as a cover stage. */
  targetAmount: MoneySchema.nullable(),
  startsOn: IsoDateSchema,
  /** Null on a stage that has no end: the engine's `monthsToComplete: 0`. */
  completesOn: IsoDateSchema.nullable(),
  cadence: StageSchema.shape.cadence,
  isGoal: z.boolean(),
})
export type Customer360Stage = z.infer<typeof Customer360StageSchema>

export const Customer360RoadmapSchema = z.object({
  stages: z.array(Customer360StageSchema),
  feasible: z.boolean(),
  shortfallMonthly: MoneySchema,
  monthlyCommitment: MoneySchema,
  completesOn: IsoDateSchema.nullable(),
  currentStageIndex: z.number().int(),
})
export type Customer360Roadmap = z.infer<typeof Customer360RoadmapSchema>

/** The verdict outcomes `evaluate()` can return, without the record's UNKNOWN_PRODUCT. */
export const RuleVerdictSchema = VerdictSchema.shape.verdict
export type RuleVerdict = z.infer<typeof RuleVerdictSchema>

/** A suggested next action and the evidence behind its "Why?" popover. */
export const Customer360ActionSchema = z.object({
  id: ActionIdSchema,
  kind: ActionKindSchema,
  label: z.string(),
  detail: z.string(),
  amount: MoneySchema,
  why: z.object({
    signal: SignalSchema.nullable(),
    evidence: z.array(z.string()),
    /** How many of the rules passed; null on an action with no product to judge. */
    rulesPassed: z.number().int().nonnegative().nullable(),
    verdict: RuleVerdictSchema.nullable(),
  }),
})
export type Customer360Action = z.infer<typeof Customer360ActionSchema>

export const Customer360ConsentSchema = z.object({
  /** Null where the bank holds no consent artefact for the customer at all. */
  status: ConsentStatusSchema.nullable(),
  scopes: z.array(
    z.object({
      scope: ConsentScopeSchema,
      label: z.string(),
      active: z.boolean(),
      /** Why a scope is inactive, in words the RM can repeat; null while it is active. */
      reason: z.string().nullable(),
    }),
  ),
})
export type Customer360Consent = z.infer<typeof Customer360ConsentSchema>

/** Everything the customer page shows, in one read. */
export const Customer360Schema = z.object({
  asOf: IsoDateSchema,
  profile: Customer360ProfileSchema,
  segment: SegmentSchema,
  strength: StrengthSchema,
  attrition: AttritionSchema,
  highlights: Customer360HighlightsSchema,
  money: Customer360MoneySchema,
  income: z.object({
    monthly: MoneySchema,
    stability: IncomeFactsSchema.shape.stability,
    payDay: z.number().int().nullable(),
  }),
  spend: z.object({
    commitments: MoneySchema,
    discretionary: MoneySchema,
    topCategories: z.array(z.object({ category: SpendCategorySchema, monthly: MoneySchema })),
  }),
  buffer: z.object({
    monthsCovered: z.number().nullable(),
    targetMonths: z.number(),
  }),
  credit: z.object({
    /** On the engine's own scale (0 to `outOf`), never a bureau's 300–900. */
    conductScore: z.number().nullable(),
    outOf: z.number(),
    band: z.string(),
    highestRate: z.number().nullable(),
    emiToIncomePct: z.number().nullable(),
  }),
  goal: GoalSummarySchema,
  roadmap: Customer360RoadmapSchema,
  /**
   * The engine's bands with the mandatory disclaimer, never a single number. Null where the
   * roadmap has nothing to grow: a payoff or a cover goal projects nothing.
   */
  projection: ProjectionSchema.nullable(),
  signals: z.array(SignalSchema),
  nextActions: z.array(Customer360ActionSchema),
  consent: Customer360ConsentSchema,
  /** Real avatar calls only. Calls are never simulated, so zero is an honest answer. */
  uday: z.object({
    calls: z.number().int().nonnegative(),
    lastCallAt: TimestampSchema.nullable(),
  }),
  products: z.object({ held: z.array(z.string()), gaps: z.array(z.string()) }),
  copilotPrompts: z.array(z.string()),
})
export type Customer360 = z.infer<typeof Customer360Schema>
