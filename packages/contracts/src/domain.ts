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
/** `UNKNOWN` is what IDBI's own statement forces: 393 sends no mode. See core's TxnMode. */
export const TxnModeSchema = z.enum([
  'UPI',
  'CARD',
  'NEFT',
  'IMPS',
  'ACH-D',
  'SI',
  'CASH',
  'CHQ',
  'UNKNOWN',
])
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
  /** Same-day on UPI and IMPS; the day before on a card line, which posts after the purchase. */
  valueDate: IsoDateSchema,
  txnAmount: MoneySchema,
  txnType: TxnTypeSchema,
  txnMode: TxnModeSchema,
  narration: z.string(),
  spendCategory: SpendCategorySchema,
  balanceAfterTxn: MoneySchema.nullable(),
  isSalaryCredit: z.boolean(),
  isRecurring: z.boolean(),
  /** ISO 18245, on the rails that carry one. Person-to-person payments never do. */
  mccCode: z.string().optional(),
  /** The bank's own guess at the merchant, present on a subset of lines only. */
  merchantName: z.string().optional(),
  counterpartyVpa: z.string().optional(),
  /**
   * Which account carried this line. Absent means the customer's primary account.
   *
   * Four interleaved ledgers have four running balances, so anything reading
   * `balanceAfterTxn` as a series has to group by this first.
   */
  accountNumberMasked: z.string().optional(),
  /**
   * Both legs of a movement between two accounts the same customer owns. Not spent, not
   * earned — moved. A single bank cannot know this; an aggregator holding both sides can.
   */
  isSelfTransfer: z.boolean().optional(),
})
export type Transaction = z.infer<typeof TransactionSchema>

export const AccountTypeSchema = z.enum(['Savings', 'Current', 'FD', 'RD', 'PPF', 'NPS'])

/**
 * The bank an account is held at. IDBI's own are the ones with `isHome`; everything else
 * reached us through an Account Aggregator consent, and the screens have to say so.
 */
export const InstitutionSchema = z.object({
  name: z.string(),
  /** The four letters that open every IFSC it issues — `IBKL`, `HDFC`, `KKBK`, `ICIC`. */
  ifscPrefix: z.string().regex(/^[A-Z]{4}$/),
  isHome: z.boolean(),
})
export type Institution = z.infer<typeof InstitutionSchema>

export const AccountSchema = z.object({
  accountNumberMasked: z.string(),
  accountType: AccountTypeSchema,
  currentBalance: MoneySchema,
  accountOpeningDate: IsoDateSchema,
  /** The home branch's IFSC, on the header of every statement. IDBI's prefix is `IBKL`. */
  branchIfsc: z.string().optional(),
  avgMonthlyBalance3m: MoneySchema.optional(),
  avgMonthlyBalance12m: MoneySchema.optional(),
  minBalance12m: MoneySchema.optional(),
  maturityDate: IsoDateSchema.optional(),
  interestRate: z.number().optional(),
  /**
   * What the customer may actually spend today, and the hold that explains the gap.
   *
   * IDBI's account enquiry sends seven balance types and the arithmetic between two of them is
   * exact on every account captured: `EFFAVL` is `AVAIL` less `LIEN`, to the paisa. That makes
   * `EFFAVL` the spendable floor rather than a figure to derive, which is what we had been
   * doing by hand — and it is the number a "can I afford this" answer has to be built on,
   * because `currentBalance` includes money a lien has already promised to someone else. 393
   * calls the same quantity `userDefinedBalance`. Absent on a feed that sends one balance.
   */
  effectiveAvailableBalance: MoneySchema.optional(),
  lienAmount: MoneySchema.optional(),
  /** Which bank holds it. Absent means IDBI. */
  institution: InstitutionSchema.optional(),
  /**
   * The last transaction the customer initiated, as distinct from interest the bank credited.
   * Dormant and quiet are different states and only this separates them.
   */
  lastCustomerActivity: IsoDateSchema.optional(),
})
export type Account = z.infer<typeof AccountSchema>

export const RiskProfileSchema = z.enum(['Conservative', 'Balanced', 'Growth'])
/**
 * Exported as a type, not only a schema, because a client that restates this union by hand
 * will drift from it — and the drift shows up as a 400 at the one screen that commits a whole
 * signup, not at the screen that caused it. Import this instead of retyping the three.
 */
export type RiskProfile = z.infer<typeof RiskProfileSchema>
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
  holdingType: z.enum(['MUTUAL_FUND', 'FD', 'RD', 'INSURANCE', 'NPS', 'PPF', 'EQUITY', 'EPF']),
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
  /** Who holds it — `Zerodha`, `Groww`, `IDBI`, `EPFO`. The honest form of `heldOutsideIdbi`. */
  custodian: z.string().optional(),
  /** Exchange symbol. Present only on `EQUITY`; a fund has no ticker. */
  ticker: z.string().optional(),
  isin: z.string().optional(),
  units: z.number().optional(),
  /** `units * avgCost` must equal `investedAmount`. */
  avgCost: z.number().optional(),
  purchasedOn: IsoDateSchema.optional(),
  /** Sum assured. Never the same number as `currentValue`, and conflating them is the confusion. */
  sumAssured: MoneySchema.optional(),
  annualPremium: MoneySchema.optional(),
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
  /** The next term deposit to mature, where one falls inside the window. */
  maturingSoon: z
    .object({
      accountType: z.string(),
      amount: MoneySchema,
      maturityDate: IsoDateSchema,
      daysLeft: z.number(),
      interestRate: z.number().nullable(),
    })
    .nullable(),
})

export const BufferFactsSchema = z.object({
  /** Null where the monthly outflow is unknown, which a sparse statement makes common. */
  monthsCovered: z.number().nullable(),
  targetMonths: z.number(),
  shortfall: MoneySchema,
})

export const DebtFactsSchema = z.object({
  total: MoneySchema,
  hasHighInterest: z.boolean(),
  /** Only the balances at a high rate. A car loan at 9.4% is not what a payoff goal targets. */
  highInterestTotal: MoneySchema,
  highestRate: z.number(),
  missedRepayment: z.boolean(),
  monthlyOutgo: MoneySchema,
  endingSoon: z
    .object({ loanType: z.string(), emiAmount: MoneySchema, monthsLeft: z.number() })
    .nullable(),
})

export const CreditBlindSpotSchema = z.enum([
  'utilisation',
  'credit_age',
  'enquiries',
  'other_lenders',
])
export type CreditBlindSpot = z.infer<typeof CreditBlindSpotSchema>
/** The members as an array, for a client that iterates them. `ConsentScopeSchema`'s idiom. */
export const CREDIT_BLIND_SPOTS = CreditBlindSpotSchema.options

export const CreditComponentSchema = z.object({
  id: z.enum(['repayment', 'cost', 'load']),
  weight: z.number(),
  /** Null where the input is unreadable. Never zero, which is a verdict rather than a gap. */
  earned: z.number().nullable(),
})
export type CreditComponent = z.infer<typeof CreditComponentSchema>

/**
 * What IDBI can see about how somebody borrows, and the typed list of what it cannot.
 *
 * `.nullable()` throughout rather than `.optional()`: core writes `T | null`, and `?: T |
 * undefined` is a different type that would fail the parity assert at the foot of this file.
 *
 * `components` is on the wire on purpose. The figure rides inside `meta.snapshotHash`, so a
 * bank could be asked to reproduce it — and a composite whose parts are not carried is a
 * number nobody can reproduce from the payload they were given.
 *
 * The two arrays are `.readonly()`, which no other array in this file is, and that is not a
 * stylistic drift. `core`'s `CreditFacts` declares both `readonly`, and `ReadonlyArray<T>` is
 * the *supertype* of `T[]` — so a plain `z.array` here makes `Extends<CoreSnapshot, Snapshot>`
 * false and takes the whole parity block at the foot of this file down with it. The mirror
 * follows the type; widening core to a mutable array so a schema could stay uniform would be
 * the wire telling the engine what to be.
 */
export const CreditFactsSchema = z.object({
  conductScore: z.number().nullable(),
  outOf: z.number().nullable(),
  capped: z.boolean(),
  components: z.array(CreditComponentSchema).readonly(),
  dpdDays: z.number().int(),
  highestRate: z.number(),
  emiToIncome: z.number().nullable(),
  revolvingBalance: MoneySchema,
  instalmentBalance: MoneySchema,
  liabilityCount: z.number().int(),
  blind: z.array(CreditBlindSpotSchema).readonly(),
})
export type CreditFacts = z.infer<typeof CreditFactsSchema>

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
  /**
   * A twelfth of the declared annual income, carried beside `income.monthly` rather than
   * instead of it. The observed figure is always preferred; this is the fallback for a
   * statement too sparse to show a salary, which over IDBI's own feed is the normal case.
   */
  declaredMonthlyIncome: MoneySchema,
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
  /**
   * Named here because this object is not `.strict()` and therefore *strips* what it does not
   * name. Without this line the engine computes `credit`, the store holds it, `meta.snapshotHash`
   * covers it — and no client is ever told, with the parity assert below still green, because
   * `Extends<CoreSnapshot, Snapshot>` is core → wire and a core type with an extra field still
   * extends the narrower mirror. See `domain.test.ts`.
   *
   * That assert is also why there is no new `_Parity` row for `CreditFacts`: the key rides
   * inside `Snapshot`, which already has one, so a separate row would check the same thing
   * twice. This sentence is here so the next reader does not add it.
   */
  credit: CreditFactsSchema,
  protection: ProtectionFactsSchema,
  holdings: z.object({
    total: MoneySchema,
    equity: MoneySchema,
    debt: MoneySchema,
    /** What the holdings say goes in monthly, as against the SIP debits found in the statement. */
    sipMonthly: MoneySchema,
  }),
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
export type GoalKind = z.infer<typeof GoalKindSchema>

/**
 * Which rupees `Goal.targetAmount` is counted in. Absent means `today`.
 *
 * Optional rather than defaulted, and that is load-bearing on both sides of the wire: a
 * goal written before this field existed has to come back out meaning exactly what it meant
 * going in, and `core`'s `fundingRatePct` reads the absence itself. Defaulting it here would
 * stamp `today` onto every historical roadmap version the moment it was read back.
 */
export const GoalAmountBasisSchema = z.enum(['today', 'at_horizon'])
export type GoalAmountBasis = z.infer<typeof GoalAmountBasisSchema>

export const GoalSchema = z.object({
  id: z.string(),
  kind: GoalKindSchema,
  purpose: z.string().optional(),
  targetAmount: MoneySchema,
  /**
   * `at_horizon` where the customer inflated the figure themselves and typed the rupees of
   * the year it lands. The engine funds such a target at the nominal rate however long the
   * horizon; discounting it again is the double-discount `core/roadmap.ts` describes.
   *
   * This schema is not `.strict()`, so it *strips* what it does not name — which is how the
   * field could exist in the engine and reach no client at all.
   */
  amountBasis: GoalAmountBasisSchema.optional(),
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
  /** How `amount` is read by the gate: a monthly commitment, or a one-off move of money held. */
  cadence: z.enum(['monthly', 'lump_sum']).optional(),
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
  /** The month's allowance before anything was spent out of it. `pot` is this less what has gone. */
  envelope: MoneySchema,
  /** The customer's own monthly ceiling, or null where they never set one. */
  limit: MoneySchema.nullable(),
  /** What the month leaves after everything owed, before any limit is applied. */
  affordable: MoneySchema,
  pot: MoneySchema,
  perDay: MoneySchema,
  daysToSalary: z.number(),
  nextSalaryDate: IsoDateSchema,
  incomeStability: z.enum(['regular', 'variable']),
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
  'deposit_maturing',
  'human_handoff',
])

export const InsightSchema = z.object({
  kind: InsightKindSchema,
  severity: z.enum(['urgent', 'important', 'opportunity']),
  headline: z.string(),
  detail: z.string(),
  monthlyValue: MoneySchema,
  /** Days until it stops being actionable, where it has a date. Absent on undated insights. */
  deadlineDays: z.number().optional(),
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
  /**
   * Who wrote the sentence in `text`. Never who computed the numbers — that is always the
   * engine, in both cases, and `evidence` is the engine's either way.
   *
   * Surfaced rather than hidden because a bank reviewing this has a right to know which
   * sentences a model touched, and because `rules` appearing under a live key is how a
   * failed completion shows up as something other than silence. Absent means `rules`.
   */
  phrasedBy: z.enum(['rules', 'model']).optional(),
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

/**
 * Where a block of the file came from. Shown per block on Record → Your data.
 *
 * `declared` is the customer's own account of something no bank endpoint carries — their
 * holdings, and the profile facts IDBI has no operation for. It is deliberately distinct from
 * `fixture`: a generated portfolio and a portfolio the customer told us about are different
 * claims, and labelling the second one "from the synthetic ledger" was telling a reviewer that
 * real declared data was invented.
 */
export const ProvenanceSchema = z.enum(['idbi', 'declared', 'fixture', 'postgres', 'memory'])
export type Provenance = z.infer<typeof ProvenanceSchema>

export const ProvenanceMapSchema = z.object({
  PROFILE: ProvenanceSchema,
  ACCOUNTS: ProvenanceSchema,
  TXN: ProvenanceSchema,
  LIABILITIES: ProvenanceSchema,
  HOLDINGS: ProvenanceSchema,
})
export type ProvenanceMap = z.infer<typeof ProvenanceMapSchema>

export const AvatarProviderNameSchema = z.enum(['runway', 'anam', 'none'])
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
  /**
   * Which money `goalTarget` is in, or null where the customer never said — which reads as
   * today's money, the same as an absent `Goal.amountBasis`. Nullable rather than optional
   * because the override is a pair: an amount stored without the basis it was stated in is
   * the half-carry that had the engine discounting an inflated target twice.
   */
  goalBasis: GoalAmountBasisSchema.nullable(),
  caps: z.array(CategoryCapSchema),
  /**
   * A monthly ceiling on discretionary spending, set by the customer. Null means none, and
   * the envelope is then whatever their income leaves after everything owed.
   */
  spendLimit: MoneySchema.nullable(),
  scopeOverrides: z.array(ConsentScopeSchema),
  version: z.number().int(),
  ledgerHorizon: LedgerHorizonSchema,
  expiresAt: TimestampSchema,
  capabilities: SessionCapabilitiesSchema,
})
export type SessionState = z.infer<typeof SessionStateSchema>

/* ------------------------------------------------------------------ *
 * Wire-only shapes: the savings pot and the challenge
 * ------------------------------------------------------------------ */

/**
 * The five ways money reaches the pot without anybody deciding to move it.
 *
 * The enum is written in the order the screen lists them and both clients read it in that
 * order rather than sorting for themselves: which habit to offer first is an editorial
 * decision about what a customer will actually turn on, not an alphabetical accident, and a
 * client that re-sorted would quietly disagree with the next one. `manual` is deliberately
 * not a member — a deposit the customer typed is not a hack, and it is only ever seen as a
 * `source` on a deposit.
 */
export const SaveHackIdSchema = z.enum([
  'roundups',
  'set_forget',
  'smart_save',
  'swear_jar',
  'payday_saver',
])
export type SaveHackId = z.infer<typeof SaveHackIdSchema>

/** How hard Smart Save pushes. Named rather than a raw multiplier: nobody chooses 0.6. */
export const SmartSaveLevelSchema = z.enum(['gentle', 'normal', 'tough'])
export type SmartSaveLevel = z.infer<typeof SmartSaveLevelSchema>

/**
 * Every hack's configuration, whether or not it is on.
 *
 * The configuration sits beside `enabled` rather than under it, so turning a hack off does
 * not throw away what was chosen for it. Somebody who pauses Set & Forget in a thin month and
 * turns it back on in the next one should not have to remember they were putting ₹500 aside,
 * and a shape with no room for a disabled hack's weekly figure would have made them.
 */
export const SaveHacksSchema = z.object({
  /** Every purchase rounded up to the next ₹10, the difference put aside. */
  roundups: z.object({ enabled: z.boolean(), toNearest: z.number().int().positive() }),
  /** A fixed amount, once a week, whatever the week turned out to look like. */
  setForget: z.object({ enabled: z.boolean(), weekly: MoneySchema }),
  /** The engine picks the amount from what the spending can actually spare. */
  smartSave: z.object({ enabled: z.boolean(), level: SmartSaveLevelSchema }),
  /** A fixed amount every time they spend at one merchant they would rather not. */
  swearJar: z.object({
    enabled: z.boolean(),
    merchant: z.string().nullable(),
    perSpend: MoneySchema,
  }),
  /** A percentage of every salary credit, taken off the top. */
  paydaySaver: z.object({ enabled: z.boolean(), percent: z.number() }),
})
export type SaveHacks = z.infer<typeof SaveHacksSchema>

/**
 * One line in the pot's activity list.
 *
 * `atSim` is the simulated date the money landed, not the instant the server worked it out.
 * The hacks accrue lazily when the pot is read, so a deposit computed in one request can
 * belong to a Monday three weeks back — dating it by the computation would stack the whole
 * pot onto whichever day the customer happened to open the screen.
 */
export const SaveDepositSchema = z.object({
  id: z.string(),
  atSim: IsoDateSchema,
  amount: MoneySchema,
  source: z.union([SaveHackIdSchema, z.literal('manual')]),
  /** One short line the Activity list prints under the amount. */
  note: z.string(),
})
export type SaveDeposit = z.infer<typeof SaveDepositSchema>

/**
 * The pot itself, which is the roadmap's goal seen from the saving end.
 *
 * `purpose`, `target` and `targetDate` are the goal's own and are not set a second time here:
 * two places to say what the money is for is two places to disagree about it, and the roadmap
 * already owns that answer. `progress` is served rather than left to each client to divide,
 * because a zero target is a real state early in a session and every client would otherwise
 * have to guard the division separately.
 */
export const SavePotSchema = z.object({
  /** The goal this pot is filling, in the roadmap's own words. */
  purpose: z.string(),
  target: MoneySchema,
  saved: MoneySchema,
  targetDate: IsoDateSchema,
  daysLeft: z.number().int(),
  /** 0..1. */
  progress: z.number(),
  /** What the enabled hacks put in each month, projected. */
  monthlyInflow: MoneySchema,
})
export type SavePot = z.infer<typeof SavePotSchema>

/**
 * What the pot earned by sitting in a savings account, at the rate its balance attracts.
 *
 * `ratePct` travels with the figure rather than being a constant a client can hold, because
 * the rate steps at ₹5 lakh: a screen that hard-coded 2.70% would start lying to exactly the
 * customers who saved the most.
 */
export const SaveInterestSchema = z.object({
  ratePct: z.number(),
  earned: MoneySchema,
  asOf: IsoDateSchema,
})
export type SaveInterest = z.infer<typeof SaveInterestSchema>

/**
 * One hack, as the list screen prints it.
 *
 * `title` and `detail` are written server-side rather than derived on the client from
 * `hacks`, because the sentence under the title changes meaning with the state — it is the
 * current configuration when the hack is on and the pitch for it when it is off — and two
 * clients writing that sentence independently is the same editorial decision taken twice and
 * drifting once.
 */
export const SaveHackCardSchema = z.object({
  id: SaveHackIdSchema,
  title: z.string(),
  detail: z.string(),
  enabled: z.boolean(),
  /** What it put aside over the last four weeks, or would have done had it been on. */
  lastFourWeeks: MoneySchema,
})
export type SaveHackCard = z.infer<typeof SaveHackCardSchema>

/**
 * Everything Save and the screens pushed from it read, in one object.
 *
 * Whole rather than split per screen, for the reason `/view` is whole: the configuration
 * screens are pushed over the tabs and each one fetches for itself, so a shape that made the
 * swear jar's merchant list or the payday figure a second request would have every one of
 * them waiting twice for numbers already computed off the statement that was read anyway.
 */
export const SaveViewSchema = z.object({
  pot: SavePotSchema,
  hacks: SaveHacksSchema,
  cards: z.array(SaveHackCardSchema),
  deposits: z.array(SaveDepositSchema),
  interest: SaveInterestSchema,
  /** Smart Save's "Normal" figure, and the ceiling every hack is held to. */
  recommendedWeekly: MoneySchema,
  /** Merchants the swear jar can be set over, biggest four-week spend first. */
  swearJarCandidates: z.array(z.object({ merchant: z.string(), fourWeekSpend: MoneySchema })),
  /**
   * The salary credit the payday saver rides on — read off the statement, never typed. A
   * percentage of a figure somebody guessed at is a standing instruction the account cannot
   * honour, and the statement already knows the day and the amount.
   */
  payday: z.object({
    monthly: MoneySchema,
    stability: z.string(),
    nextPayDate: IsoDateSchema,
    payDay: z.number().int(),
  }),
  asOf: IsoDateSchema,
})
export type SaveView = z.infer<typeof SaveViewSchema>

/**
 * What a challenge is set over: one merchant, or one derived spending category.
 *
 * `name` is the merchant `categorize()` resolved or the category it assigned, and never the
 * raw narration — an IDBI narration is `S1 TXN 20`, and a challenge named after one is a
 * challenge nobody can tell they are winning.
 */
export const SpendTargetSchema = z.object({
  kind: z.enum(['merchant', 'category']),
  name: z.string(),
})
export type SpendTarget = z.infer<typeof SpendTargetSchema>

export const TargetSpendSchema = z.object({
  target: SpendTargetSchema,
  spent: MoneySchema,
  occurrences: z.number().int(),
  /** The engine's pick. Exactly one target across both lists carries true. */
  recommended: z.boolean(),
})
export type TargetSpend = z.infer<typeof TargetSpendSchema>

export const ChallengeLimitOptionSchema = z.object({
  limit: MoneySchema,
  predictedSaving: MoneySchema,
  recommended: z.boolean(),
})
export type ChallengeLimitOption = z.infer<typeof ChallengeLimitOptionSchema>

/**
 * One day of a challenge. `elapsed` is the whole reason this is a shape and not a number:
 * a day that has not happened yet also has no spend on it, and a client that could not tell
 * the two apart would count the future as a winning streak.
 */
export const ChallengeDaySchema = z.object({
  date: IsoDateSchema,
  spent: MoneySchema,
  elapsed: z.boolean(),
})
export type ChallengeDay = z.infer<typeof ChallengeDaySchema>

/**
 * The one challenge that can be running, with everything its screen shows already worked out.
 *
 * `name`, `tip` and `predictedSaving` are written on the server rather than assembled from
 * the numbers on the client. Two clients deciding independently whether somebody is ahead is
 * two definitions of ahead, and this one is arguable enough to be worth having exactly once:
 * it compares what they have spent against the share of the limit the elapsed days have
 * earned them, not against the limit itself.
 */
export const ActiveChallengeSchema = z.object({
  id: z.string(),
  target: SpendTargetSchema,
  /** "Swiggy Challenge" / "Eating out Challenge" — built server-side so both clients agree. */
  name: z.string(),
  limit: MoneySchema,
  days: z.number().int(),
  startDate: IsoDateSchema,
  endDate: IsoDateSchema,
  dayIndex: z.number().int(),
  spent: MoneySchema,
  remaining: MoneySchema,
  overspent: z.boolean(),
  daily: z.array(ChallengeDaySchema),
  zeroDays: z.number().int(),
  longestZeroStreak: z.number().int(),
  complete: z.boolean(),
  /** Null while it is still running: not-yet-won and lost are different things to print. */
  won: z.boolean().nullable(),
  predictedSaving: MoneySchema,
  /** The lines that count against the limit, newest first, capped at 20. */
  transactions: z.array(TransactionSchema),
  /** The written check-in Cleo calls a Challenge tip. */
  tip: z.object({
    headline: z.string(),
    detail: z.string(),
    tone: z.enum(['ahead', 'behind', 'early']),
  }),
})
export type ActiveChallenge = z.infer<typeof ActiveChallengeSchema>

/**
 * The challenge screen and the whole of the wizard behind it.
 *
 * `targets` and `lengths` are present even while a challenge is running, so the four steps of
 * the wizard need no second fetch and no loading state between them. They cost one pass over
 * the statement the view already read, and a wizard that fetched per step would spend that
 * saving on four round trips instead.
 */
export const ChallengeViewSchema = z.object({
  active: ActiveChallengeSchema.nullable(),
  /** Everything the wizard needs, always present so the four steps need no second fetch. */
  targets: z.object({
    merchants: z.array(TargetSpendSchema),
    categories: z.array(TargetSpendSchema),
  }),
  lengths: z.array(
    z.object({
      days: z.number().int(),
      label: z.string(),
      recommended: z.boolean(),
    }),
  ),
  windowDays: z.number().int(),
  asOf: IsoDateSchema,
})
export type ChallengeView = z.infer<typeof ChallengeViewSchema>

/** Limits for one target over one length. A pure question, so it rides on the query. */
export const ChallengeQuoteSchema = z.object({
  target: SpendTargetSchema,
  days: z.number().int(),
  baseline: MoneySchema,
  options: z.array(ChallengeLimitOptionSchema),
  repeated: z.array(z.object({ days: z.number().int(), saved: MoneySchema })),
})
export type ChallengeQuote = z.infer<typeof ChallengeQuoteSchema>

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
  /**
   * Which tier produced this. In practice always `'server'`: `'offline'` was stamped by the
   * badged simulation chunk inside `apps/web`, and that app was deleted on 20 September 2026,
   * so the member is the last structural trace of a tier with no producer left. Narrowing the
   * enum is a contract change and is not made here — see the amendment on
   * `docs/architecture/adr/ADR-0011.md`.
   */
  tier: z.enum(['server', 'offline']),
})
export type ViewMeta = z.infer<typeof ViewMetaSchema>

/** The one object every screen reads. */
export const ViewSchema = z.object({
  snapshot: SnapshotSchema,
  /**
   * The accounts themselves, not just the totals the snapshot carries.
   *
   * The snapshot has `balances.savings` and `balances.deposits`, which is what the engine
   * needs and not what a customer opening a banking app expects to see: they have four
   * accounts and want four rows. It also strips the per-account detail we went to some trouble
   * to read off IDBI — the spendable floor, the lien behind it, the branch and the vintage —
   * none of which survives being summed.
   *
   * Scoped like everything else here: an account block the customer has withdrawn arrives
   * empty, because this is built from the scoped file.
   */
  accounts: z.array(AccountSchema),
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
  /** The simulated date the version was cut at. What a screen shows; createdAt is the wall clock. */
  atSim: IsoDateSchema,
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

/**
 * Which client SDK the grant is for. The only part of the provider the client is allowed to
 * know, and it exists because the two providers speak different wire protocols: Runway hands
 * out a LiveKit room, Anam hands out a session token for its own WebRTC signalling. Everything
 * else about a call — how it is asked for, how it ends, what the screen does — is identical.
 *
 * Absent means `livekit`, so a client written before Anam existed reads a Runway grant correctly.
 */
export const AvatarTransportSchema = z.enum(['livekit', 'anam'])
export type AvatarTransport = z.infer<typeof AvatarTransportSchema>

export const AvatarGrantSchema = z.object({
  transport: AvatarTransportSchema.default('livekit'),
  /** The LiveKit room, on `livekit`. Empty on `anam`, which has no URL to join. */
  url: z.string(),
  /** The LiveKit access token, or the Anam session token. Either way: the thing that admits the client. */
  token: z.string(),
  runwaySessionId: RunwaySessionIdSchema,
  /** The worker needs about five seconds after READY before it publishes a decodable frame. */
  expectVideoAfterMs: z.number().int(),
  expiresInSeconds: z.number().int(),
})
export type AvatarGrant = z.infer<typeof AvatarGrantSchema>

/**
 * A call readied before the customer asked for one — created, ready and gated, not handed over.
 *
 * The next `POST /avatar/session` hands it over in one round trip instead of building a call from
 * nothing; on Runway that skips seconds of create and warm-up. `prepared: false` is not an error:
 * it means the tap will build its call as it always did.
 */
export const AvatarPreparedSchema = z.object({
  prepared: z.boolean(),
  /** How long the readied call stays worth handing over. Null when nothing was readied. */
  usableForSeconds: z.number().int().nullable(),
})
export type AvatarPrepared = z.infer<typeof AvatarPreparedSchema>

export const WaitlistTicketSchema = z.object({
  ticket: TicketSchema,
  position: z.number().int(),
  estimatedWaitSeconds: z.number(),
})
export type WaitlistTicket = z.infer<typeof WaitlistTicketSchema>

export const WaitlistStateSchema = z.enum(['waiting', 'claimable', 'expired'])
export type WaitlistState = z.infer<typeof WaitlistStateSchema>

export const WaitlistStatusSchema = z.object({
  ticket: TicketSchema,
  /** `expired`: the hold lapsed or the ticket was granted; position is 0 and a new join is needed. */
  state: WaitlistStateSchema,
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
