/**
 * Hand-built inputs for core's own tests.
 *
 * `index.ts` claims this package is exercisable "from a test with no fixtures beyond a literal".
 * That claim was true of the code and false of the tests: every suite that covered `roadmap`,
 * `suitability`, `goal` and `query` lived in `@dhan/fixtures` and started by generating a
 * persona, so core could not be validated without the package downstream of it. This file is
 * what makes the claim hold — a complete `Snapshot` written out once, and a shallow-merge
 * override so a test can say "the same customer, but carrying a card at 34.8%" in three lines.
 *
 * It is deliberately **not** a second fixture generator. There is no randomness, no persona and
 * no ledger here. `BASE` is one unremarkable customer with nothing wrong: every suitability rule
 * passes against it, so a rule test flips exactly the one fact it is about and any block it sees
 * has exactly one cause. A generated persona cannot make that promise, which is why the fixture
 * suites test *outcomes over realistic data* and these test *rules*. The two are different jobs
 * and both are worth having — see the note at the head of `suitability.test.ts`.
 *
 * `.testkit.ts` rather than `.test.ts` because `node --test` must not load it looking for tests;
 * `tsconfig.json` excludes the suffix from the build so it never reaches `dist`, and
 * `tsconfig.test.json` includes it so it is typechecked like everything else.
 *
 * The merge is written out field by field on purpose. A generic deep-merge would need a cast,
 * and this way adding a group to `Snapshot` fails to compile here until the default is written
 * — which is the reminder a new fact needs.
 */
import { CREDIT_BLIND_SPOTS } from './credit.ts'
import type { Snapshot } from './derive.ts'
import type { Habit } from './recurring.ts'
import type { CustomerFile, Product, Transaction } from './types.ts'

/**
 * A customer with nothing wrong: money spare, buffer funded, no debt, no dependents.
 *
 * Every figure is internally consistent — `surplus.monthly` really is income less commitments
 * less discretionary, and `buffer.monthsCovered` really is `balances.total` over the monthly
 * outflow — because a test that blocks on an inconsistency nobody meant is worse than no test.
 */
const BASE: Snapshot = {
  asOf: '2026-09-01',
  customer: {
    name: 'Test Customer',
    age: 35,
    dependents: 0,
    city: 'Mumbai',
    riskProfile: 'Growth',
    employmentType: 'Salaried',
    language: 'English',
    taxRegime: 'old',
    declaredMonthlyIncome: 100_000,
  },
  income: {
    monthly: 100_000,
    stability: 'regular',
    variation: 0.02,
    payDay: 1,
    nextPayDate: '2026-10-01',
    daysToNextPay: 30,
    source: 'salary-series',
  },
  commitments: {
    total: 40_000,
    rent: 25_000,
    emis: 0,
    bills: 10_000,
    obligations: 0,
    subscriptions: 5_000,
    investments: 0,
    series: [],
  },
  discretionary: {
    monthly: 20_000,
    byCategory: [],
    topHabits: [],
    trend: 'flat',
    trendPct: 0,
    categoryTrends: [],
  },
  irregular: { oneOffs: [], total: 0, monthlyRunRate: 0, monthlyProvision: 0 },
  // 100,000 in, 40,000 committed, 20,000 discretionary. Nothing held back for irregulars,
  // so deployable and monthly agree — a test about the provision sets both.
  surplus: { monthly: 40_000, alreadyInvested: 0, deployable: 40_000 },
  balances: {
    savings: 480_000,
    deposits: 0,
    total: 480_000,
    idleFloor: 300_000,
    idleMonths: 6,
    maturingSoon: null,
  },
  // 480,000 over a 60,000 monthly outflow.
  buffer: { monthsCovered: 8, targetMonths: 6, shortfall: 0 },
  debt: {
    total: 0,
    hasHighInterest: false,
    highInterestTotal: 0,
    highestRate: 0,
    missedRepayment: false,
    monthlyOutgo: 0,
    endingSoon: null,
  },
  // Nothing borrowed, so there is nothing to judge: `conductScore` is null rather than zero,
  // which would be a verdict against a customer whose file is clean. `emiToIncome` is 0 and
  // not null for the same reason in the other direction — no EMIs against an income the
  // statement plainly shows is a ratio we read, not one we failed to.
  credit: {
    conductScore: null,
    outOf: null,
    capped: false,
    components: [],
    dpdDays: 0,
    highestRate: 0,
    emiToIncome: 0,
    revolvingBalance: 0,
    instalmentBalance: 0,
    liabilityCount: 0,
    blind: CREDIT_BLIND_SPOTS,
  },
  protection: {
    dependents: 0,
    lifeCoverInForce: 0,
    healthCoverInForce: 0,
    lifeCoverNeeded: 0,
    gap: 0,
  },
  holdings: { total: 0, equity: 0, debt: 0, sipMonthly: 0 },
  quality: {
    transactions: 300,
    monthsOfHistory: 12,
    categorisedShare: 0.92,
    unexplainedShare: 0.04,
  },
}

/** One group of facts at a time. Nested groups are replaced whole, not merged further. */
export interface SnapshotOverrides {
  asOf?: string
  customer?: Partial<Snapshot['customer']>
  income?: Partial<Snapshot['income']>
  commitments?: Partial<Snapshot['commitments']>
  discretionary?: Partial<Snapshot['discretionary']>
  irregular?: Partial<Snapshot['irregular']>
  surplus?: Partial<Snapshot['surplus']>
  balances?: Partial<Snapshot['balances']>
  buffer?: Partial<Snapshot['buffer']>
  debt?: Partial<Snapshot['debt']>
  credit?: Partial<Snapshot['credit']>
  protection?: Partial<Snapshot['protection']>
  holdings?: Partial<Snapshot['holdings']>
  quality?: Partial<Snapshot['quality']>
}

export function snapshot(overrides: SnapshotOverrides = {}): Snapshot {
  return {
    asOf: overrides.asOf ?? BASE.asOf,
    customer: { ...BASE.customer, ...overrides.customer },
    income: { ...BASE.income, ...overrides.income },
    commitments: { ...BASE.commitments, ...overrides.commitments },
    discretionary: { ...BASE.discretionary, ...overrides.discretionary },
    irregular: { ...BASE.irregular, ...overrides.irregular },
    surplus: { ...BASE.surplus, ...overrides.surplus },
    balances: { ...BASE.balances, ...overrides.balances },
    buffer: { ...BASE.buffer, ...overrides.buffer },
    debt: { ...BASE.debt, ...overrides.debt },
    credit: { ...BASE.credit, ...overrides.credit },
    protection: { ...BASE.protection, ...overrides.protection },
    holdings: { ...BASE.holdings, ...overrides.holdings },
    quality: { ...BASE.quality, ...overrides.quality },
  }
}

/** A plain index fund, overridden a field at a time. */
export function product(overrides: Partial<Product> = {}): Product {
  return {
    productId: 'TEST_PRODUCT',
    name: 'Test Product',
    category: 'Index Fund',
    riskometer: 'Very High',
    minInvestment: 1_000,
    lockInYears: 0,
    transactable: true,
    manufacturer: 'Test AMC',
    ...overrides,
  }
}

export function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    key: 'merchant:test',
    merchant: 'Test Merchant',
    category: 'Food & dining',
    occurrences: 24,
    firstSeen: '2025-09-05',
    lastSeen: '2026-08-28',
    typicalAmount: 400,
    monthlyAverage: 4_000,
    annualTotal: 48_000,
    timesPerMonth: 10,
    txnIds: [],
    ...overrides,
  }
}

/**
 * One statement line. Debit by default, because almost everything a test asks about is one.
 *
 * `spendCategory` is what the *bank* filed the line as. Core's own categoriser reads the
 * narration and may disagree, which is the point of `disagreements()` — so a test about
 * categorisation sets the narration and leaves this alone.
 */
export function txn(overrides: Partial<Transaction> = {}): Transaction {
  const date = overrides.txnDate ?? '2026-08-15'
  return {
    txnId: `T-${date}-${overrides.txnAmount ?? 0}`,
    txnDate: date,
    valueDate: date,
    txnAmount: 500,
    txnType: 'DEBIT',
    txnMode: 'UPI',
    narration: 'UPI/SOMEONE/PAYMENT',
    spendCategory: 'Shopping',
    balanceAfterTxn: null,
    isSalaryCredit: false,
    isRecurring: false,
    ...overrides,
  }
}

/**
 * A customer file with only the parts a test names.
 *
 * Accounts, liabilities, holdings and policies default to empty: the functions that read them
 * go through `derive`, and anything testing *those* wants a persona rather than a literal.
 * What a literal is good for is the ledger, which is why `transactions` is the interesting
 * parameter here.
 */
export function customerFile(
  transactions: readonly Transaction[] = [],
  customer: Partial<CustomerFile['customer']> = {},
): CustomerFile {
  return {
    customer: {
      cif: 'CIF0000001',
      custId: 'TEST01',
      custName: 'Test Customer',
      dateOfBirth: '1991-04-12',
      gender: 'F',
      maritalStatus: 'Married',
      dependents: 0,
      employmentType: 'Salaried',
      declaredAnnualIncome: 1_200_000,
      city: 'Mumbai',
      stateCode: 'MH',
      preferredLanguage: 'English',
      riskProfile: 'Growth',
      kycStatus: 'VERIFIED',
      customerSince: '2018-06-01',
      taxRegime: 'old',
      ...customer,
    },
    accounts: [],
    transactions: [...transactions],
    liabilities: [],
    holdings: [],
    policies: [],
  }
}

/**
 * A minimal shelf with one product per branch the roadmap and the gate reach for.
 *
 * The two product ids are looked up by name in `roadmap.ts` (`IDBI_SWEEP_001` for the buffer
 * vehicle, `MF_INDEX_103` for a growth goal three years out or more), so they are spelled the
 * same here. Everything else is found by category, and there is exactly one candidate per
 * category so a test asserting which alternative was named cannot be satisfied by luck.
 */
export const SHELF: readonly Product[] = [
  product({
    productId: 'IDBI_SWEEP_001',
    name: 'IDBI Sweep-in FD',
    category: 'Sweep-in FD',
    riskometer: 'Low',
    minInvestment: 5_000,
    manufacturer: 'IDBI Bank',
    indicativeReturn: 6.9,
  }),
  product({
    productId: 'IDBI_LIQUID_002',
    name: 'IDBI Liquid Fund',
    category: 'Liquid',
    riskometer: 'Low to Moderate',
    minInvestment: 1_000,
  }),
  product({
    productId: 'IDBI_RD_004',
    name: 'IDBI Recurring Deposit',
    category: 'Recurring Deposit',
    riskometer: 'Low',
    minInvestment: 500,
    manufacturer: 'IDBI Bank',
    indicativeReturn: 6.9,
  }),
  product({
    productId: 'MF_DEBT_105',
    name: 'Short Duration Debt Fund',
    category: 'Debt',
    riskometer: 'Low to Moderate',
    minInvestment: 1_000,
  }),
  product({
    productId: 'MF_INDEX_103',
    name: 'Nifty 50 Index Fund',
    category: 'Index Fund',
    riskometer: 'Very High',
    minInvestment: 500,
    expenseRatio: 0.2,
  }),
  product({
    productId: 'MF_ELSS_107',
    name: 'Tax Saver ELSS',
    category: 'ELSS',
    riskometer: 'Very High',
    minInvestment: 500,
    lockInYears: 3,
  }),
  product({
    productId: 'INS_TERM_201',
    name: 'IDBI Federal Term Cover',
    category: 'Term Insurance',
    riskometer: 'Low',
    minInvestment: 1_200,
    insuranceProduct: true,
    coverAmount: 10_000_000,
    coverType: 'life',
  }),
  product({
    productId: 'INS_PMJJBY_203',
    name: 'PMJJBY',
    category: 'Government Insurance',
    riskometer: 'Low',
    minInvestment: 37,
    insuranceProduct: true,
    coverAmount: 200_000,
    coverType: 'life',
  }),
  product({
    productId: 'INS_ULIP_205',
    name: 'Wealth Assure ULIP',
    category: 'ULIP',
    riskometer: 'High',
    minInvestment: 5_000,
    lockInYears: 5,
    insuranceProduct: true,
    bundlesProtectionAndInvestment: true,
    coverAmount: 1_000_000,
    coverType: 'life',
  }),
]
