/**
 * The synthetic customers.
 *
 * A persona here describes *behaviour*, not transactions. The generator turns behaviour into
 * a ledger, so the headline numbers on any screen are arithmetic over data rather than
 * strings typed next to it. That distinction is the whole reason this package exists: the
 * prototype's fixture quoted an outflow of ₹49,600 in the demo script while the transactions
 * summed to ₹51,630, and nobody could see it until someone added them up.
 *
 * Three customers, chosen so a different suitability rule fires for each. A shelf of
 * suitable products cannot demonstrate suitability, and neither can one customer.
 */
import type { Account, Customer, Holding, Liability, SpendCategory } from '@dhan/core'

/** A subscription: same merchant, same amount, same day. Detectable precisely because of that. */
export interface SubscriptionSpec {
  merchant: string
  amount: number
  /** Day of month it debits. */
  day: number
  category: SpendCategory
  /** How many months before the ledger's end date it started. */
  startsMonthsAgo: number
  /** Cancelled this many months ago, if it was. */
  endsMonthsAgo?: number
  /**
   * True where the customer is paying for something they no longer use. The generator emits
   * no matching activity, so `@dhan/core` can find it the same way it would in real data —
   * a live mandate with nothing around it.
   */
  forgotten?: boolean
  /**
   * Price rises, newest last. A streaming service that quietly went up ₹150 is one of the very
   * few things we can genuinely detect *without asking* — unlike "a subscription you forgot",
   * which no bank statement can know. Worth having in the data so the detector is exercised.
   */
  priceHistory?: { fromMonthsAgo: number; amount: number }[]
}

export interface EmiSpec {
  lender: string
  loanType: string
  amount: number
  day: number
  rate: number
  /** Months still to run as at the ledger's end date. Small values make "your EMI ends in
   *  March, that is ₹8,200 a month freed up" a live insight rather than a mock. */
  remainingMonths: number
  /** How long it has already been running, so the ledger shows the history. */
  elapsedMonths: number
  isRevolving?: boolean
  /** Days past due. Non-zero blocks every investment recommendation. */
  dpd?: number
}

export interface SipSpec {
  scheme: string
  amount: number
  day: number
  startsMonthsAgo: number
  assetClass: Holding['assetClass']
  /** Bought elsewhere. We do not churn what another distributor sold well. */
  heldOutsideIdbi?: boolean
}

/** A one-off that a real life contains and a clean fixture never does. */
export interface LumpSpec {
  narration: string
  category: SpendCategory
  amount: number
  /** Months before the end date. */
  monthsAgo: number
  day: number
}

export interface PersonaSpec {
  slug: string
  seed: number
  customer: Customer
  employer: string
  /** Monthly credit. `variancePct` above zero makes it irregular, as a trader's income is. */
  income: { amount: number; day: number; variancePct: number; splits: number }
  rent?: { amount: number; day: number }
  /** Electricity, mobile, broadband, gas. Recurring but variable — unlike a subscription. */
  utilities: boolean
  /**
   * Money that leaves every month and is not discretionary. Supporting parents is a
   * commitment, not a leak, and an advisor that suggests cutting it has lost the customer.
   */
  obligations: { narration: string; category: SpendCategory; amount: number; day: number }[]
  subscriptions: SubscriptionSpec[]
  emis: EmiSpec[]
  sips: SipSpec[]
  /** Envelope the generator spends inside, and the split across categories. */
  discretionary: {
    monthlyBudget: number
    mix: Partial<Record<keyof typeof MIX_KEYS, number>>
    /** How hard spending clusters after payday. Cleo: 35% spend most of it within five days. */
    paydayBias: number
  }
  /** One category quietly trending up. The "your food spend is up 40%" insight. */
  drift?: { category: string; overMonths: number; endMultiplier: number }
  lumps: LumpSpec[]
  openingBalance: number
  /** Deposits and other accounts. Savings balances are derived from the ledger, not set here. */
  extraAccounts: Account[]
  holdings: Holding[]
  /** Protection in force. An empty array is the setup for the whole protection story. */
  policies: Holding[]
  /** Written into the customer picker so a judge knows which story they are opening. */
  pitch: string
  /** The rule this customer exists to exercise. Asserted in the tests. */
  demonstrates: string
}

const MIX_KEYS = {
  'Food & dining': 0,
  Groceries: 0,
  Transport: 0,
  Shopping: 0,
  Entertainment: 0,
  Health: 0,
}

/* ------------------------------------------------------------------ *
 * Rohan — the headline customer. Surplus and a protection gap.
 * ------------------------------------------------------------------ */

export const ROHAN: PersonaSpec = {
  slug: 'rohan',
  seed: 20260901,
  employer: 'Acme Technologies Pvt Ltd',
  customer: {
    cif: 'IDBI0009182731',
    custId: 'demo-rohan',
    custName: 'Rohan Mehta',
    dateOfBirth: '1997-03-14',
    gender: 'Male',
    maritalStatus: 'Married',
    dependents: 2,
    employmentType: 'Salaried',
    declaredAnnualIncome: 1_020_000,
    city: 'Indore',
    stateCode: '23',
    preferredLanguage: 'en-IN',
    riskProfile: 'Balanced',
    kycStatus: 'Verified',
    customerSince: '2016-11-08',
    taxRegime: 'new',
  },
  income: { amount: 85_000, day: 1, variancePct: 0, splits: 1 },
  rent: { amount: 24_500, day: 2 },
  utilities: true,
  obligations: [
    // Not a leak. An advisor that proposes cutting this has misread the customer entirely.
    { narration: 'IMPS/P2A/FAMILY SUPPORT', category: 'Transfers', amount: 8_000, day: 8 },
  ],
  subscriptions: [
    {
      merchant: 'Netflix',
      amount: 799,
      day: 6,
      category: 'Entertainment',
      startsMonthsAgo: 22,
      // Went up ₹150 five months ago. ₹1,800 a year that nobody agreed to.
      priceHistory: [
        { fromMonthsAgo: 22, amount: 649 },
        { fromMonthsAgo: 5, amount: 799 },
      ],
    },
    { merchant: 'Spotify', amount: 119, day: 12, category: 'Entertainment', startsMonthsAgo: 19 },
    // Sixteen identical charges and not one gym-adjacent transaction anywhere near them.
    {
      merchant: 'Cultfit',
      amount: 1_499,
      day: 3,
      category: 'Health',
      startsMonthsAgo: 16,
      forgotten: true,
    },
  ],
  emis: [
    // Five months left. That makes "₹8,200 a month is about to free up — route it before it
    // disappears into spending" a computed insight, not a scripted line.
    {
      lender: 'IDBI Bank',
      loanType: 'Education Loan',
      amount: 8_200,
      day: 7,
      rate: 9.15,
      remainingMonths: 5,
      elapsedMonths: 55,
    },
  ],
  sips: [
    {
      scheme: 'Axis Flexi Cap Fund',
      amount: 5_000,
      day: 5,
      startsMonthsAgo: 21,
      assetClass: 'Equity',
      heldOutsideIdbi: true,
    },
  ],
  discretionary: {
    monthlyBudget: 18_000,
    mix: {
      'Food & dining': 30,
      Groceries: 26,
      Transport: 14,
      Shopping: 18,
      Entertainment: 8,
      Health: 4,
    },
    paydayBias: 0.62,
  },
  drift: { category: 'Food & dining', overMonths: 6, endMultiplier: 1.9 },
  lumps: [
    { narration: 'POS/MAKEMYTRIP/4471', category: 'Shopping', amount: 38_400, monthsAgo: 14, day: 18 },
    { narration: 'POS/CROMA/2210', category: 'Shopping', amount: 52_900, monthsAgo: 9, day: 22 },
    { narration: 'UPI/CHOITHRAM HOSPITAL/418293047711', category: 'Health', amount: 31_600, monthsAgo: 6, day: 11 },
    { narration: 'IMPS/P2A/WEDDING GIFT', category: 'Transfers', amount: 21_000, monthsAgo: 3, day: 26 },
  ],
  openingBalance: 22_000,
  extraAccounts: [
    {
      accountNumberMasked: 'XXXXXX9930',
      accountType: 'FD',
      currentBalance: 200_000,
      accountOpeningDate: '2024-09-11',
      maturityDate: '2026-09-11',
      interestRate: 7.1,
    },
  ],
  holdings: [
    {
      holdingType: 'FD',
      name: 'IDBI Suvidha Fixed Deposit',
      assetClass: 'Debt',
      investedAmount: 200_000,
      currentValue: 200_000,
      sipActive: false,
      maturityDate: '2026-09-11',
      interestRate: 7.1,
    },
  ],
  // Two dependents and nothing in force. This is what BUNDLED_PROTECTION needs in order to
  // be the rule that fires when the ULIP is proposed.
  policies: [],
  pitch: '29, Indore. ₹85,000 a month, two dependents, no life cover.',
  demonstrates: 'BUNDLED_PROTECTION — the ULIP refusal, plus idle surplus and a forgotten subscription',
}

/* ------------------------------------------------------------------ *
 * Priya — earns well, and none of it can be invested yet.
 * ------------------------------------------------------------------ */

export const PRIYA: PersonaSpec = {
  slug: 'priya',
  seed: 19940714,
  employer: 'Zeta Consulting India',
  customer: {
    cif: 'IDBI0004471902',
    custId: 'demo-priya',
    custName: 'Priya Nair',
    dateOfBirth: '1992-07-14',
    gender: 'Female',
    maritalStatus: 'Single',
    dependents: 0,
    employmentType: 'Salaried',
    declaredAnnualIncome: 1_680_000,
    city: 'Kochi',
    stateCode: '32',
    preferredLanguage: 'en-IN',
    riskProfile: 'Growth',
    kycStatus: 'Verified',
    customerSince: '2019-02-19',
    taxRegime: 'new',
  },
  income: { amount: 140_000, day: 1, variancePct: 0, splits: 1 },
  rent: { amount: 38_000, day: 3 },
  utilities: true,
  obligations: [
    // A commitment, not a leak — and the reason she accumulates nothing despite ₹1.4 lakh a
    // month. Worth having on one persona so the engine has to tell the two apart.
    { narration: 'IMPS/P2A/HOME TRANSFER', category: 'Transfers', amount: 6_000, day: 6 },
  ],
  subscriptions: [
    { merchant: 'Netflix', amount: 649, day: 4, category: 'Entertainment', startsMonthsAgo: 23 },
    { merchant: 'Cultfit', amount: 2_499, day: 2, category: 'Health', startsMonthsAgo: 12 },
    { merchant: 'Audible', amount: 199, day: 15, category: 'Entertainment', startsMonthsAgo: 20 },
    { merchant: 'Adobe', amount: 1_675, day: 20, category: 'Shopping', startsMonthsAgo: 18, forgotten: true },
  ],
  emis: [
    // 42% a year. No fund on any shelf beats paying this off, which is exactly the point.
    {
      lender: 'IDBI Credit Card',
      loanType: 'Credit Card Revolving Balance',
      amount: 9_400,
      day: 18,
      rate: 42,
      remainingMonths: 34,
      elapsedMonths: 16,
      isRevolving: true,
    },
    {
      lender: 'Bajaj Finserv',
      loanType: 'Personal Loan',
      amount: 14_800,
      day: 5,
      rate: 16.5,
      remainingMonths: 19,
      elapsedMonths: 17,
    },
  ],
  sips: [],
  // She has card debt because she outspends a ₹1.4 lakh salary, not because she is unlucky.
  // The envelope has to leave almost no surplus: a customer sitting on months of cash while
  // paying 42% on a card is a story no banker believes for a second.
  discretionary: {
    monthlyBudget: 66_000,
    mix: {
      'Food & dining': 30,
      Groceries: 12,
      Transport: 12,
      Shopping: 32,
      Entertainment: 12,
      Health: 2,
    },
    paydayBias: 0.78,
  },
  drift: { category: 'Shopping', overMonths: 6, endMultiplier: 1.6 },
  // No purchase lumps: her big buys went on the card, which is where the ₹1.8 lakh revolving
  // balance came from, so debiting them from savings would double-count the spending and hand
  // her a cash pile the card debt says she cannot have.
  lumps: [],
  // She runs roughly flat — spends what she earns, month after month. That matters more than
  // it looks: a *rising* balance puts the twelve-month floor at the start of the window and a
  // *falling* one puts it at the end, and either way one of "never negative" or "has no
  // buffer" breaks. Flat satisfies both, and it is also the true shape of her problem: she is
  // not sinking, she is simply never getting anywhere.
  openingBalance: 55_000,
  extraAccounts: [],
  holdings: [],
  policies: [],
  pitch: '34, Kochi. ₹1.4 lakh a month — and a credit card at 42%.',
  demonstrates: 'HIGH_INTEREST_DEBT — the advisor refuses to invest anything at all',
}

/* ------------------------------------------------------------------ *
 * Sunil — irregular income, no buffer, and equity is the wrong answer.
 * ------------------------------------------------------------------ */

export const SUNIL: PersonaSpec = {
  slug: 'sunil',
  seed: 19790423,
  employer: 'Kumar Hardware & Sanitary',
  customer: {
    cif: 'IDBI0007729184',
    custId: 'demo-sunil',
    custName: 'Sunil Kumar',
    dateOfBirth: '1979-04-23',
    gender: 'Male',
    maritalStatus: 'Married',
    dependents: 4,
    employmentType: 'Business',
    declaredAnnualIncome: 840_000,
    city: 'Nagpur',
    stateCode: '27',
    preferredLanguage: 'hi-IN',
    riskProfile: 'Conservative',
    kycStatus: 'Verified',
    customerSince: '2011-06-30',
    // On the old regime, so 80C is worth something to him and ELSS is at least arguable.
    taxRegime: 'old',
  },
  // A trader's income: several irregular collections a month, not one salary credit. This is
  // what makes "safe to spend today" hard and worth doing.
  income: { amount: 70_000, day: 1, variancePct: 0.45, splits: 4 },
  utilities: true,
  obligations: [
    { narration: 'IMPS/P2A/PARENTS', category: 'Transfers', amount: 10_000, day: 10 },
    { narration: 'UPI/SARASWATI VIDYALAYA/418290471102', category: 'Education', amount: 12_400, day: 12 },
  ],
  subscriptions: [
    { merchant: 'Jiocinema', amount: 299, day: 9, category: 'Entertainment', startsMonthsAgo: 14 },
  ],
  emis: [
    {
      lender: 'IDBI Bank',
      loanType: 'Shop Loan',
      amount: 11_600,
      day: 15,
      rate: 11.4,
      remainingMonths: 26,
      elapsedMonths: 34,
      // One missed instalment on record. MISSED_REPAYMENT outranks everything but the card.
      dpd: 12,
    },
  ],
  sips: [],
  discretionary: {
    monthlyBudget: 21_000,
    mix: {
      'Food & dining': 16,
      Groceries: 42,
      Transport: 18,
      Shopping: 12,
      Entertainment: 4,
      Health: 8,
    },
    paydayBias: 0.35,
  },
  lumps: [
    { narration: 'UPI/ORANGE CITY HOSPITAL/771029384410', category: 'Health', amount: 74_000, monthsAgo: 11, day: 9 },
    { narration: 'IMPS/P2A/DAUGHTER FEES', category: 'Education', amount: 46_000, monthsAgo: 5, day: 3 },
  ],
  // He had savings, and the hospital took them. Sized so the balance bottoms out just above
  // zero right after that bill — which is the whole argument for a buffer, sitting in the data
  // rather than in a sentence somebody wrote.
  openingBalance: 68_000,
  extraAccounts: [],
  holdings: [],
  policies: [],
  pitch: '47, Nagpur. Shop owner, income different every month, four dependents.',
  demonstrates: 'MISSED_REPAYMENT and RISK_CEILING — a Conservative profile equity cannot serve',
}

export const PERSONAS: readonly PersonaSpec[] = [ROHAN, PRIYA, SUNIL]

export function personaBySlug(slug: string): PersonaSpec {
  const found = PERSONAS.find((p) => p.slug === slug)
  if (!found) throw new Error(`no persona "${slug}" — have ${PERSONAS.map((p) => p.slug).join(', ')}`)
  return found
}
