/**
 * Zod mirrors of the domain types that cross the wire.
 *
 * `@dhan/core` owns the types; these schemas exist so the API can validate what it returns and
 * a client can import the same shape without depending on the engine. Every field a screen
 * reads is typed here — no `z.unknown()` on anything a rupee figure passes through. The block
 * at the bottom checks at compile time that a core value is always a valid instance of its
 * mirror, so a change to core breaks this package before it breaks a client.
 *
 * Wire-only shapes (session state, the View envelope, the record) live here too, after the
 * mirrors, because they are what the routes return.
 */
import type {
  Account as CoreAccount,
  Action as CoreAction,
  Answer as CoreAnswer,
  Customer as CoreCustomer,
  DailyPlan as CoreDailyPlan,
  Decision as CoreDecision,
  Goal as CoreGoal,
  Holding as CoreHolding,
  Insight as CoreInsight,
  Liability as CoreLiability,
  Product as CoreProduct,
  Roadmap as CoreRoadmap,
  Snapshot as CoreSnapshot,
  Transaction as CoreTransaction,
  Verdict as CoreVerdict,
} from '@dhan/core'
import { z } from 'zod'
import {
  ActionIdSchema,
  AdviceRecordIdSchema,
  CifSchema,
  IsoDateSchema,
  MoneySchema,
  ProductIdSchema,
  RunwaySessionIdSchema,
  SessionIdSchema,
  Sha256Schema,
  SnapshotIdSchema,
  TicketSchema,
  TimestampSchema,
} from './common.ts'

/* ------------------------------------------------------------------ *
 * Bank data (core/types.ts)
 * ------------------------------------------------------------------ */

export const TxnTypeSchema = z.enum(['CREDIT', 'DEBIT'])
export const TxnModeSchema = z.enum(['UPI', 'CARD', 'NEFT', 'IMPS', 'ACH-D', 'SI', 'CASH', 'CHQ'])
export const SpendCategorySchema = z.enum([
  'Income',
  'Rent & bills',
  'Groceries',
  'Food & dining',
  'Transport',
  'Shopping',
  'Entertainment',
  'Health',
  'Education',
  'Investment',
  'Insurance',
  'Loan EMI',
  'Cash',
  'Transfers',
  'Fees & charges',
])
export type SpendCategory = z.infer<typeof SpendCategorySchema>

export const TransactionSchema = z.object({
  txnId: z.string(),
  txnDate: IsoDateSchema,
  txnAmount: MoneySchema,
  txnType: TxnTypeSchema,
  txnMode: TxnModeSchema,
  narration: z.string(),
  spendCategory: SpendCategorySchema,
  balanceAfterTxn: MoneySchema.nullable(),
  isSalaryCredit: z.boolean(),
  isRecurring: z.boolean(),
})
export type Transaction = z.infer<typeof TransactionSchema>

export const AccountTypeSchema = z.enum(['Savings', 'Current', 'FD', 'RD', 'PPF', 'NPS'])

export const AccountSchema = z.object({
  accountNumberMasked: z.string(),
  accountType: AccountTypeSchema,
  currentBalance: MoneySchema,
  accountOpeningDate: IsoDateSchema,
  avgMonthlyBalance3m: MoneySchema.optional(),
  avgMonthlyBalance12m: MoneySchema.optional(),
  minBalance12m: MoneySchema.optional(),
  maturityDate: IsoDateSchema.optional(),
  interestRate: z.number().optional(),
})
export type Account = z.infer<typeof AccountSchema>

export const RiskProfileSchema = z.enum(['Conservative', 'Balanced', 'Growth'])
export const EmploymentTypeSchema = z.enum(['Salaried', 'Self-employed', 'Business'])
export const TaxRegimeSchema = z.enum(['old', 'new'])

export const CustomerSchema = z.object({
  cif: CifSchema,
  custId: z.string(),
  custName: z.string(),
  dateOfBirth: IsoDateSchema,
  gender: z.string(),
  maritalStatus: z.string(),
  dependents: z.number().int(),
  employmentType: EmploymentTypeSchema,
  declaredAnnualIncome: MoneySchema,
  city: z.string(),
  stateCode: z.string(),
  preferredLanguage: z.string(),
  riskProfile: RiskProfileSchema,
  kycStatus: z.string(),
  customerSince: IsoDateSchema,
  taxRegime: TaxRegimeSchema,
})
export type Customer = z.infer<typeof CustomerSchema>

export const LiabilitySchema = z.object({
  loanType: z.string(),
  outstandingPrincipal: MoneySchema,
  emiAmount: MoneySchema,
  loanInterestRate: z.number(),
  tenureRemainingMonths: z.number().int(),
  dpdStatus: z.number().int(),
  isRevolving: z.boolean().optional(),
})
export type Liability = z.infer<typeof LiabilitySchema>

export const AssetClassSchema = z.enum(['Equity', 'Debt', 'Hybrid', 'Protection', 'Gold'])

export const HoldingSchema = z.object({
  holdingType: z.enum(['MUTUAL_FUND', 'FD', 'RD', 'INSURANCE', 'NPS', 'PPF']),
  name: z.string(),
  assetClass: AssetClassSchema,
  investedAmount: MoneySchema,
  currentValue: MoneySchema,
  sipActive: z.boolean(),
  sipAmount: MoneySchema.optional(),
  sipDebitDay: z.number().int().optional(),
  maturityDate: IsoDateSchema.optional(),
  interestRate: z.number().optional(),
  heldOutsideIdbi: z.boolean().optional(),
})
export type Holding = z.infer<typeof HoldingSchema>

export const RiskometerSchema = z.enum([
  'Low',
  'Low to Moderate',
  'Moderate',
  'Moderately High',
  'High',
  'Very High',
])

export const ProductCategorySchema = z.enum([
  'Sweep-in FD',
  'Fixed Deposit',
  'Recurring Deposit',
  'Liquid',
  'Debt',
  'Index Fund',
  'Equity',
  'ELSS',
  'Term Insurance',
  'Health Insurance',
  'Government Insurance',
  'NPS',
  'PPF',
  'ULIP',
  'Endowment',
])

export const ProductSchema = z.object({
  productId: ProductIdSchema,
  name: z.string(),
  category: ProductCategorySchema,
  riskometer: RiskometerSchema,
  minInvestment: MoneySchema,
  lockInYears: z.number(),
  transactable: z.boolean(),
  manufacturer: z.string(),
  expenseRatio: z.number().optional(),
  insuranceProduct: z.boolean().optional(),
  bundlesProtectionAndInvestment: z.boolean().optional(),
  coverAmount: MoneySchema.optional(),
  coverType: z.enum(['life', 'health', 'accident']).optional(),
  indicativeReturn: z.number().optional(),
  note: z.string().optional(),
})
export type Product = z.infer<typeof ProductSchema>

/** What /shelf returns: the product plus how it got onto the shelf. */
export const ShelfProductSchema = ProductSchema.extend({
  /** Names a customer might use for it. What the avatar's product resolution matches on. */
  aliases: z.array(z.string()),
  source: z.enum(['fixture', 'idbi']),
  /** True once a banker has confirmed the rate and the name. */
  verified: z.boolean(),
})
export type ShelfProduct = z.infer<typeof ShelfProductSchema>

/* ------------------------------------------------------------------ *
 * Snapshot (core/derive.ts, core/recurring.ts)
 * ------------------------------------------------------------------ */

export const CadenceSchema = z.enum([
  'weekly',
  'fortnightly',
  'monthly',
  'quarterly',
  'annual',
  'irregular',
])

export const SeriesKindSchema = z.enum([
  'income',
  'rent',
  'emi',
  'sip',
  'insurance',
  'subscription',
  'bill',
  'transfer',
  'obligation',
  'unknown',
])

export const PriceChangeSchema = z.object({
  on: IsoDateSchema,
  from: MoneySchema,
  to: MoneySchema,
})

export const SeriesSchema = z.object({
  key: z.string(),
  merchant: z.string().nullable(),
  category: SpendCategorySchema,
  kind: SeriesKindSchema,
  mode: TxnModeSchema,
  cadence: CadenceSchema,
  intervalDays: z.number(),
  dayOfMonth: z.number().nullable(),
  occurrences: z.number().int(),
  firstSeen: IsoDateSchema,
  lastSeen: IsoDateSchema,
  amount: MoneySchema,
  monthlyCost: MoneySchema,
  annualCost: MoneySchema,
  amountVariation: z.number(),
  fixed: z.boolean(),
  active: z.boolean(),
  priceChanges: z.array(PriceChangeSchema),
  reason: z.enum(['mandate', 'fixed-monthly', 'utility', 'regular-obligation', 'income']),
  txnIds: z.array(z.string()),
})
export type Series = z.infer<typeof SeriesSchema>

export const HabitSchema = z.object({
  key: z.string(),
  merchant: z.string().nullable(),
  category: SpendCategorySchema,
  occurrences: z.number().int(),
  firstSeen: IsoDateSchema,
  lastSeen: IsoDateSchema,
  typicalAmount: MoneySchema,
  monthlyAverage: MoneySchema,
  annualTotal: MoneySchema,
  timesPerMonth: z.number(),
  txnIds: z.array(z.string()),
})
export type Habit = z.infer<typeof HabitSchema>

export const IncomeFactsSchema = z.object({
  monthly: MoneySchema,
  stability: z.enum(['regular', 'variable']),
  variation: z.number(),
  payDay: z.number().nullable(),
  nextPayDate: IsoDateSchema,
  daysToNextPay: z.number(),
  source: z.enum(['salary-series', 'monthly-credits']),
})

export const CommitmentFactsSchema = z.object({
  total: MoneySchema,
  rent: MoneySchema,
  emis: MoneySchema,
  bills: MoneySchema,
  obligations: MoneySchema,
  subscriptions: MoneySchema,
  investments: MoneySchema,
  series: z.array(SeriesSchema),
})

export const DiscretionaryFactsSchema = z.object({
  monthly: MoneySchema,
  byCategory: z.array(z.tuple([SpendCategorySchema, MoneySchema])),
  topHabits: z.array(HabitSchema),
  trend: z.enum(['rising', 'flat', 'falling']),
  trendPct: z.number(),
  categoryTrends: z.array(
    z.object({
      category: SpendCategorySchema,
      recent: MoneySchema,
      prior: MoneySchema,
      changePct: z.number(),
    }),
  ),
})

export const IrregularFactsSchema = z.object({
  oneOffs: z.array(
    z.object({
      date: IsoDateSchema,
      narration: z.string(),
      amount: MoneySchema,
      category: SpendCategorySchema,
    }),
  ),
  total: MoneySchema,
  monthlyRunRate: MoneySchema,
  monthlyProvision: MoneySchema,
})

export const BalanceFactsSchema = z.object({
  savings: MoneySchema,
  deposits: MoneySchema,
  total: MoneySchema,
  idleFloor: MoneySchema,
  idleMonths: z.number(),
})

export const BufferFactsSchema = z.object({
  monthsCovered: z.number(),
  targetMonths: z.number(),
  shortfall: MoneySchema,
})

export const DebtFactsSchema = z.object({
  total: MoneySchema,
  hasHighInterest: z.boolean(),
  highestRate: z.number(),
  missedRepayment: z.boolean(),
  monthlyOutgo: MoneySchema,
  endingSoon: z
    .object({ loanType: z.string(), emiAmount: MoneySchema, monthsLeft: z.number() })
    .nullable(),
})

export const ProtectionFactsSchema = z.object({
  dependents: z.number().int(),
  lifeCoverInForce: MoneySchema,
  healthCoverInForce: MoneySchema,
  lifeCoverNeeded: MoneySchema,
  gap: MoneySchema,
})

export const QualityFactsSchema = z.object({
  transactions: z.number().int(),
  monthsOfHistory: z.number(),
  categorisedShare: z.number(),
  unexplainedShare: z.number(),
})

export const SnapshotCustomerSchema = z.object({
  name: z.string(),
  age: z.number(),
  dependents: z.number().int(),
  city: z.string(),
  riskProfile: RiskProfileSchema,
  employmentType: EmploymentTypeSchema,
  language: z.string(),
  taxRegime: TaxRegimeSchema,
})

export const SnapshotSchema = z.object({
  asOf: IsoDateSchema,
  customer: SnapshotCustomerSchema,
  income: IncomeFactsSchema,
  commitments: CommitmentFactsSchema,
  discretionary: DiscretionaryFactsSchema,
  irregular: IrregularFactsSchema,
  surplus: z.object({
    monthly: MoneySchema,
    alreadyInvested: MoneySchema,
    deployable: MoneySchema,
  }),
  balances: BalanceFactsSchema,
  buffer: BufferFactsSchema,
  debt: DebtFactsSchema,
  protection: ProtectionFactsSchema,
  holdings: z.object({ total: MoneySchema, equity: MoneySchema, debt: MoneySchema }),
  quality: QualityFactsSchema,
})
export type Snapshot = z.infer<typeof SnapshotSchema>

/* ------------------------------------------------------------------ *
 * Suitability (core/suitability.ts)
 * ------------------------------------------------------------------ */

export const AlternativeSchema = z.object({
  productId: ProductIdSchema,
  name: z.string(),
  monthly: MoneySchema,
})
export type Alternative = z.infer<typeof AlternativeSchema>

export const VerdictSchema = z.object({
  verdict: z.enum(['PASS', 'BLOCKED']),
  ruleId: z.string().nullable(),
  spoken: z.string().nullable(),
  recorded: z.string(),
  alternative: AlternativeSchema.nullable(),
  passed: z.array(z.string()),
})
export type Verdict = z.infer<typeof VerdictSchema>

export const RuleSchema = z.object({ id: z.string(), description: z.string() })
export type Rule = z.infer<typeof RuleSchema>

/* ------------------------------------------------------------------ *
 * Goal, roadmap, projection (core/roadmap.ts, core/projection.ts)
 * ------------------------------------------------------------------ */

export const GoalKindSchema = z.enum([
  'emergency_fund',
  'debt_payoff',
  'protection',
  'wealth_target',
  'retirement',
])

export const GoalSchema = z.object({
  id: z.string(),
  kind: GoalKindSchema,
  purpose: z.string().optional(),
  targetAmount: MoneySchema,
  targetDate: IsoDateSchema,
  createdAt: IsoDateSchema,
})
export type Goal = z.infer<typeof GoalSchema>

export const ScenarioSchema = z.object({
  label: z.string(),
  ratePct: z.number(),
  corpus: MoneySchema,
  realCorpus: MoneySchema,
  contributed: MoneySchema,
})

export const ProjectionSchema = z.object({
  monthlyContribution: MoneySchema,
  existingCorpus: MoneySchema,
  years: z.number(),
  inflationPct: z.number(),
  scenarios: z.array(ScenarioSchema),
  disclaimer: z.string(),
})
export type Projection = z.infer<typeof ProjectionSchema>

export const StageKindSchema = z.enum([
  'free_up',
  'get_cover',
  'clear_debt',
  'build_buffer',
  'grow',
])

export const StageSchema = z.object({
  index: z.number().int(),
  kind: StageKindSchema,
  label: z.string(),
  why: z.string(),
  productId: ProductIdSchema.nullable(),
  productName: z.string().nullable(),
  monthly: MoneySchema,
  targetAmount: MoneySchema,
  monthsToComplete: z.number(),
  startsOn: IsoDateSchema,
  completesOn: IsoDateSchema,
  cadence: z.enum(['ongoing', 'sequential']),
  verdict: VerdictSchema.nullable(),
  isGoal: z.boolean(),
})
export type Stage = z.infer<typeof StageSchema>

export const RoadmapSchema = z.object({
  version: z.number().int(),
  createdAt: IsoDateSchema,
  reasonForChange: z.string(),
  goal: GoalSchema,
  stages: z.array(StageSchema),
  currentStageIndex: z.number().int(),
  monthlyCommitment: MoneySchema,
  totalMonths: z.number(),
  completesOn: IsoDateSchema,
  feasible: z.boolean(),
  shortfallMonthly: MoneySchema,
  projection: ProjectionSchema.nullable(),
  disclaimer: z.string(),
})
export type Roadmap = z.infer<typeof RoadmapSchema>

/* ------------------------------------------------------------------ *
 * Actions, decisions, the daily plan (core/actions.ts, core/dailyplan.ts)
 * ------------------------------------------------------------------ */

export const ActionKindSchema = z.enum([
  'open_sweep_in',
  'start_ssp',
  'move_to_liquid_fund',
  'start_sip',
  'increase_sip',
  'pause_sip',
  'buy_term_cover',
  'enrol_pmjjby',
  'buy_health_cover',
  'pay_down_card',
  'cancel_subscription',
  'set_category_cap',
  'talk_to_rm',
])
export type ActionKind = z.infer<typeof ActionKindSchema>

export const ActionSchema = z.object({
  id: ActionIdSchema,
  kind: ActionKindSchema,
  label: z.string(),
  detail: z.string(),
  amount: MoneySchema,
  productId: ProductIdSchema.optional(),
  productName: z.string().optional(),
  evidence: z.array(z.string()),
  verdictId: z.string().nullable().optional(),
  projected: z.object({ years: z.number(), ratePct: z.number(), becomes: MoneySchema }).optional(),
})
export type Action = z.infer<typeof ActionSchema>

export const DecisionKindSchema = z.enum(['did_it', 'declined', 'deferred', 'pushed_back'])
export type DecisionKind = z.infer<typeof DecisionKindSchema>

export const DecisionSchema = z.object({
  actionId: ActionIdSchema,
  kind: DecisionKindSchema,
  note: z.string().optional(),
  at: IsoDateSchema,
})
export type Decision = z.infer<typeof DecisionSchema>

export const SafeToSpendSchema = z.object({
  pot: MoneySchema,
  perDay: MoneySchema,
  daysToSalary: z.number(),
  nextSalaryDate: IsoDateSchema,
  reserved: z.array(z.object({ label: z.string(), amount: MoneySchema })),
})
export type SafeToSpend = z.infer<typeof SafeToSpendSchema>

export const InsightKindSchema = z.enum([
  'idle_cash',
  'emi_ending',
  'subscription_review',
  'price_increase',
  'category_drift',
  'protection_gap',
  'expensive_debt',
  'missed_repayment',
  'buffer_thin',
  'habit_cost',
])

export const InsightSchema = z.object({
  kind: InsightKindSchema,
  severity: z.enum(['urgent', 'important', 'opportunity']),
  headline: z.string(),
  detail: z.string(),
  monthlyValue: MoneySchema,
  evidence: z.array(z.string()),
  suggests: ActionKindSchema.nullable(),
})
export type Insight = z.infer<typeof InsightSchema>

export const DailyPlanSchema = z.object({
  date: IsoDateSchema,
  since: z.object({
    from: IsoDateSchema,
    transactions: z.array(TransactionSchema),
    spent: MoneySchema,
    capBreached: z.boolean(),
  }),
  onRoute: z.boolean(),
  routeNote: z.string(),
  safeToSpend: SafeToSpendSchema,
  primary: ActionSchema.nullable(),
  secondary: z.array(ActionSchema),
  insights: z.array(InsightSchema),
})
export type DailyPlan = z.infer<typeof DailyPlanSchema>

/* ------------------------------------------------------------------ *
 * Conversation (core/query.ts)
 * ------------------------------------------------------------------ */

export const AnswerSchema = z.object({
  text: z.string(),
  evidence: z.array(z.string()),
  resolved: z
    .object({
      category: SpendCategorySchema.optional(),
      from: IsoDateSchema.optional(),
      to: IsoDateSchema.optional(),
      merchant: z.string().optional(),
    })
    .optional(),
  matched: z.boolean(),
})
export type Answer = z.infer<typeof AnswerSchema>

/* ------------------------------------------------------------------ *
 * Wire-only shapes: customers, consent, sessions
 * ------------------------------------------------------------------ */

/** One row on the picker. */
export const CustomerSummarySchema = z.object({
  cif: CifSchema,
  slug: z.string(),
  name: z.string(),
  age: z.number().int(),
  city: z.string(),
  pitch: z.string(),
  demonstrates: z.string(),
})
export type CustomerSummary = z.infer<typeof CustomerSummarySchema>

/** The blocks of a customer file that consent is granted per block. */
export const ConsentScopeSchema = z.enum(['PROFILE', 'ACCOUNTS', 'TXN', 'LIABILITIES', 'HOLDINGS'])
export type ConsentScope = z.infer<typeof ConsentScopeSchema>
export const CONSENT_SCOPES = ConsentScopeSchema.options

export const ConsentStatusSchema = z.enum(['ACTIVE', 'EXPIRED', 'REVOKED'])

/** Block 08 of the IDBI data requirements: the consent artefact echoed on every advice record. */
export const ConsentSchema = z.object({
  consentId: z.string(),
  purpose: z.string(),
  scopes: z.array(ConsentScopeSchema),
  status: ConsentStatusSchema,
  validFrom: IsoDateSchema,
  validTo: IsoDateSchema,
})
export type Consent = z.infer<typeof ConsentSchema>

export const CategoryCapSchema = z.object({
  category: z.string(),
  monthlyLimit: MoneySchema,
})
export type CategoryCap = z.infer<typeof CategoryCapSchema>

export const BankSourceSchema = z.enum(['postgres', 'memory', 'idbi-sandbox'])
export type BankSource = z.infer<typeof BankSourceSchema>

/** Where a block of the file came from. Shown per block on Record → Your data. */
export const ProvenanceSchema = z.enum(['idbi', 'fixture', 'postgres', 'memory'])
export type Provenance = z.infer<typeof ProvenanceSchema>

export const ProvenanceMapSchema = z.object({
  PROFILE: ProvenanceSchema,
  ACCOUNTS: ProvenanceSchema,
  TXN: ProvenanceSchema,
  LIABILITIES: ProvenanceSchema,
  HOLDINGS: ProvenanceSchema,
})
export type ProvenanceMap = z.infer<typeof ProvenanceMapSchema>

export const AvatarProviderNameSchema = z.enum(['runway', 'none'])
export type AvatarProviderName = z.infer<typeof AvatarProviderNameSchema>

export const LedgerHorizonSchema = z.object({ from: IsoDateSchema, to: IsoDateSchema })
export type LedgerHorizon = z.infer<typeof LedgerHorizonSchema>

export const SessionCapabilitiesSchema = z.object({
  /** False under a real bank feed, where today is today. The UI hides the clock control. */
  simulatedClock: z.boolean(),
  avatar: AvatarProviderNameSchema,
})

/** What a client may know about its own session. The token is never echoed. */
export const SessionStateSchema = z.object({
  id: SessionIdSchema,
  cif: CifSchema,
  asOf: IsoDateSchema,
  lastSeen: IsoDateSchema,
  goalTarget: MoneySchema.nullable(),
  caps: z.array(CategoryCapSchema),
  scopeOverrides: z.array(ConsentScopeSchema),
  version: z.number().int(),
  ledgerHorizon: LedgerHorizonSchema,
  expiresAt: TimestampSchema,
  capabilities: SessionCapabilitiesSchema,
})
export type SessionState = z.infer<typeof SessionStateSchema>

/* ------------------------------------------------------------------ *
 * Wire-only shapes: the View
 * ------------------------------------------------------------------ */

export const ViewMetaSchema = z.object({
  asOf: IsoDateSchema,
  ledgerHorizon: LedgerHorizonSchema,
  /** The last date the source has data for. Under a real feed, the last sync. */
  dataFreshnessDate: IsoDateSchema,
  source: BankSourceSchema,
  simulatedClock: z.boolean(),
  snapshotId: SnapshotIdSchema,
  snapshotHash: Sha256Schema,
  roadmapVersion: z.number().int(),
  provenance: ProvenanceMapSchema,
  /** Which tier produced this. The offline chunk stamps its own. */
  tier: z.enum(['server', 'offline']),
})
export type ViewMeta = z.infer<typeof ViewMetaSchema>

/** The one object every screen reads. */
export const ViewSchema = z.object({
  snapshot: SnapshotSchema,
  goal: GoalSchema,
  roadmap: RoadmapSchema,
  plan: DailyPlanSchema,
  insights: z.array(InsightSchema),
  shelf: z.array(ShelfProductSchema),
  rules: z.array(RuleSchema),
  meta: ViewMetaSchema,
})
export type View = z.infer<typeof ViewSchema>

/* ------------------------------------------------------------------ *
 * Wire-only shapes: the record
 * ------------------------------------------------------------------ */

export const AdviceSourceSchema = z.enum(['screen', 'avatar_tool', 'text', 'api'])
export type AdviceSource = z.infer<typeof AdviceSourceSchema>

/** The gate's outcome, plus the honest answer when the model names something not on the shelf. */
export const VerdictOutcomeSchema = z.enum(['PASS', 'BLOCKED', 'UNKNOWN_PRODUCT'])
export type VerdictOutcome = z.infer<typeof VerdictOutcomeSchema>

/**
 * One row per proposal — including tool calls the customer never decided on. The exact
 * sentence shown, the rule, the snapshot it was judged against, and the hash chain.
 */
export const AdviceRecordSchema = z.object({
  id: AdviceRecordIdSchema,
  seq: z.number().int(),
  sessionId: SessionIdSchema,
  snapshotId: SnapshotIdSchema,
  consentId: z.string(),
  source: AdviceSourceSchema,
  actionId: ActionIdSchema.nullable(),
  actionKind: ActionKindSchema.nullable(),
  productId: ProductIdSchema.nullable(),
  amount: MoneySchema.nullable(),
  verdict: VerdictOutcomeSchema,
  ruleId: z.string().nullable(),
  rulesPassed: z.array(z.string()),
  spoken: z.string().nullable(),
  recorded: z.string(),
  alternative: AlternativeSchema.nullable(),
  evidence: z.array(z.string()),
  engineVersion: z.string(),
  runwaySessionId: RunwaySessionIdSchema.nullable(),
  verifiedInTranscript: z.boolean().nullable(),
  /** The simulated date the advice was given on. */
  atSim: IsoDateSchema,
  prevHash: Sha256Schema,
  recordHash: Sha256Schema,
  createdAt: TimestampSchema,
})
export type AdviceRecord = z.infer<typeof AdviceRecordSchema>

export const DecisionRecordSchema = z.object({
  id: z.string(),
  sessionId: SessionIdSchema,
  adviceRecordId: AdviceRecordIdSchema.nullable(),
  actionId: ActionIdSchema,
  actionKind: ActionKindSchema,
  kind: DecisionKindSchema,
  amount: MoneySchema,
  productId: ProductIdSchema.nullable(),
  /** The button label the customer tapped, verbatim. */
  shown: z.string(),
  evidence: z.array(z.string()),
  note: z.string().nullable(),
  atSim: IsoDateSchema,
  createdAt: TimestampSchema,
})
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>

export const RoadmapVersionSummarySchema = z.object({
  version: z.number().int(),
  snapshotId: SnapshotIdSchema,
  goal: GoalSchema,
  reasonForChange: z.string(),
  createdAt: TimestampSchema,
})
export type RoadmapVersionSummary = z.infer<typeof RoadmapVersionSummarySchema>

export const GateCoverageSchema = z.object({
  fired: z.number().int(),
  expected: z.number().int(),
  /** Shelf products named in an assistant turn without a preceding check_suitability. */
  misses: z.array(z.string()),
})
export type GateCoverage = z.infer<typeof GateCoverageSchema>

export const ReconciliationSchema = z.object({
  verified: z.array(z.string()),
  unverified: z.array(z.string()),
  gateCoverage: GateCoverageSchema,
})
export type Reconciliation = z.infer<typeof ReconciliationSchema>

export const TranscriptStatusSchema = z.enum(['pending', 'fetched', 'unavailable'])
export type TranscriptStatus = z.infer<typeof TranscriptStatusSchema>

export const AvatarEndReasonSchema = z.enum([
  'client',
  'reaped',
  'failed_grant',
  'release_all',
  'deploy',
])
export type AvatarEndReason = z.infer<typeof AvatarEndReasonSchema>

export const AvatarSessionRecordSchema = z.object({
  runwaySessionId: RunwaySessionIdSchema,
  sessionId: SessionIdSchema,
  credentialLabel: z.string(),
  taskId: z.string(),
  openedAt: TimestampSchema,
  readyAt: TimestampSchema.nullable(),
  rpcConnectedAt: TimestampSchema.nullable(),
  grantedAt: TimestampSchema.nullable(),
  endedAt: TimestampSchema.nullable(),
  endReason: AvatarEndReasonSchema.nullable(),
  minutesCharged: z.number().nullable(),
  transcriptStatus: TranscriptStatusSchema,
  gateCoverage: GateCoverageSchema.nullable(),
})
export type AvatarSessionRecord = z.infer<typeof AvatarSessionRecordSchema>

export const ToolNameSchema = z.enum(['check_suitability', 'query_spend', 'get_plan'])
export type ToolName = z.infer<typeof ToolNameSchema>

export const AvatarToolCallSchema = z.object({
  id: z.string(),
  runwaySessionId: RunwaySessionIdSchema,
  tool: ToolNameSchema,
  args: z.record(z.unknown()),
  result: z.record(z.unknown()),
  adviceRecordId: AdviceRecordIdSchema.nullable(),
  latencyMs: z.number().int(),
  verifiedInTranscript: z.boolean().nullable(),
  createdAt: TimestampSchema,
})
export type AvatarToolCall = z.infer<typeof AvatarToolCallSchema>

/**
 * One turn of the provider's conversation record. Runway's shape is not pinned down, so this
 * keeps what the reconciler reads and passes the rest through untouched.
 */
export const ConversationTurnSchema = z
  .object({
    role: z.string(),
    text: z.string(),
    toolCalls: z.array(z.object({ name: z.string(), args: z.unknown() })).optional(),
    toolResults: z.array(z.object({ name: z.string(), result: z.unknown() })).optional(),
  })
  .passthrough()
export type ConversationTurn = z.infer<typeof ConversationTurnSchema>

/** Where the bank rows came from: the seed run, with its content hash. */
export const SeedProvenanceSchema = z.object({
  seedRunId: z.string(),
  generatorVersion: z.string(),
  anchor: IsoDateSchema,
  historyFrom: IsoDateSchema,
  horizonTo: IsoDateSchema,
  personas: z.array(z.string()),
  contentSha256: Sha256Schema,
  ranAt: TimestampSchema,
})
export type SeedProvenance = z.infer<typeof SeedProvenanceSchema>

/** Everything the Record tab shows. */
export const RecordViewSchema = z.object({
  adviceRecords: z.array(AdviceRecordSchema),
  decisions: z.array(DecisionRecordSchema),
  roadmapVersions: z.array(RoadmapVersionSummarySchema),
  consent: ConsentSchema.nullable(),
  scopeOverrides: z.array(ConsentScopeSchema),
  provenance: SeedProvenanceSchema.nullable(),
  avatarSessions: z.array(AvatarSessionRecordSchema),
  chainVerified: z.boolean(),
})
export type RecordView = z.infer<typeof RecordViewSchema>

export const ChainVerificationSchema = z.object({
  ok: z.boolean(),
  length: z.number().int(),
  /** The id of the first record whose hash did not verify. */
  brokenAt: AdviceRecordIdSchema.optional(),
})
export type ChainVerification = z.infer<typeof ChainVerificationSchema>

/* ------------------------------------------------------------------ *
 * Wire-only shapes: the avatar
 * ------------------------------------------------------------------ */

export const BreakerStateSchema = z.enum(['closed', 'open', 'half-open'])
export type BreakerState = z.infer<typeof BreakerStateSchema>

export const AvatarAvailabilitySchema = z.object({
  available: z.boolean(),
  enabled: z.boolean(),
  minutesLeftToday: z.number(),
  queueLength: z.number().int(),
  estimatedWaitSeconds: z.number().nullable(),
  breaker: BreakerStateSchema,
})
export type AvatarAvailability = z.infer<typeof AvatarAvailabilitySchema>

export const AvatarGrantSchema = z.object({
  url: z.string(),
  token: z.string(),
  runwaySessionId: RunwaySessionIdSchema,
  /** The worker needs about five seconds after READY before it publishes a decodable frame. */
  expectVideoAfterMs: z.number().int(),
  expiresInSeconds: z.number().int(),
})
export type AvatarGrant = z.infer<typeof AvatarGrantSchema>

export const WaitlistTicketSchema = z.object({
  ticket: TicketSchema,
  position: z.number().int(),
  estimatedWaitSeconds: z.number(),
})
export type WaitlistTicket = z.infer<typeof WaitlistTicketSchema>

export const WaitlistStatusSchema = z.object({
  ticket: TicketSchema,
  position: z.number().int(),
  estimatedWaitSeconds: z.number(),
  claimable: z.boolean(),
  holdUntil: TimestampSchema.nullable(),
})
export type WaitlistStatus = z.infer<typeof WaitlistStatusSchema>

export const AvatarCallRecordSchema = z.object({
  runwaySessionId: RunwaySessionIdSchema,
  session: AvatarSessionRecordSchema,
  toolCalls: z.array(AvatarToolCallSchema),
  adviceRecords: z.array(AdviceRecordSchema),
  transcriptStatus: TranscriptStatusSchema,
  transcript: z.array(ConversationTurnSchema).nullable(),
  reconciliation: ReconciliationSchema.nullable(),
  /** 'Gate fired 3/3 · verified against provider transcript', or the honest alternative. */
  summary: z.string(),
})
export type AvatarCallRecord = z.infer<typeof AvatarCallRecordSchema>

/* ------------------------------------------------------------------ *
 * Wire-only shapes: health and operator
 * ------------------------------------------------------------------ */

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  at: TimestampSchema,
  version: z.string(),
  engineVersion: z.string(),
  bank: z.object({
    source: BankSourceSchema,
    ok: z.boolean(),
    latencyMs: z.number(),
    seedHash: Sha256Schema.nullable(),
  }),
  avatar: z.object({
    provider: AvatarProviderNameSchema,
    enabled: z.boolean(),
    breaker: BreakerStateSchema,
    rpcOpen: z.number().int(),
  }),
  faultInject: z.array(z.string()),
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>

export const LeaseViewSchema = z.object({
  credentialLabel: z.string(),
  sessionId: SessionIdSchema,
  runwaySessionId: RunwaySessionIdSchema.nullable(),
  taskId: z.string(),
  claimedAt: TimestampSchema,
  expiresAt: TimestampSchema,
})
export type LeaseView = z.infer<typeof LeaseViewSchema>

export const OperatorAvatarStatusSchema = z.object({
  credentials: z.array(z.object({ label: z.string(), held: z.boolean() })),
  leases: z.array(LeaseViewSchema),
  waitlist: z.array(
    z.object({
      ticket: TicketSchema,
      sessionId: SessionIdSchema,
      position: z.number().int(),
      claimable: z.boolean(),
      holdUntil: TimestampSchema.nullable(),
    }),
  ),
  minutesUsedToday: z.number(),
  minutesLeftToday: z.number(),
  breaker: BreakerStateSchema,
  rpcOpen: z.number().int(),
  taskId: z.string(),
})
export type OperatorAvatarStatus = z.infer<typeof OperatorAvatarStatusSchema>

export const ReleaseAllResponseSchema = z.object({ released: z.array(z.string()) })
export type ReleaseAllResponse = z.infer<typeof ReleaseAllResponseSchema>

export const SeedStatusSchema = z.object({
  seedRun: SeedProvenanceSchema.nullable(),
  drift: z.object({
    checked: z.boolean(),
    ok: z.boolean().nullable(),
    expectedSha256: Sha256Schema.nullable(),
    actualSha256: Sha256Schema.nullable(),
  }),
  bankSource: BankSourceSchema,
  provenance: ProvenanceMapSchema,
})
export type SeedStatus = z.infer<typeof SeedStatusSchema>

/* ------------------------------------------------------------------ *
 * Compile-time parity with core
 * ------------------------------------------------------------------ */

/**
 * A core value must always be a valid instance of its mirror, or the API could compute
 * something it cannot return. Checked in the direction that matters: core → wire. (Wire → core
 * is looser only by `?: T | undefined`, which is how zod spells an optional field.)
 */
type Extends<A, B> = [A] extends [B] ? true : false
type Assert<T extends true> = T

type _Parity = [
  Assert<Extends<CoreTransaction, Transaction>>,
  Assert<Extends<CoreAccount, Account>>,
  Assert<Extends<CoreCustomer, Customer>>,
  Assert<Extends<CoreLiability, Liability>>,
  Assert<Extends<CoreHolding, Holding>>,
  Assert<Extends<CoreProduct, Product>>,
  Assert<Extends<CoreSnapshot, Snapshot>>,
  Assert<Extends<CoreVerdict, Verdict>>,
  Assert<Extends<CoreGoal, Goal>>,
  Assert<Extends<CoreRoadmap, Roadmap>>,
  Assert<Extends<CoreAction, Action>>,
  Assert<Extends<CoreDecision, Decision>>,
  Assert<Extends<CoreDailyPlan, DailyPlan>>,
  Assert<Extends<CoreInsight, Insight>>,
  Assert<Extends<CoreAnswer, Answer>>,
]
