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
 *
 * The realism pass added the facts a *rail* needs rather than the facts a story needs: the
 * employer's own bank, the branch the account sits at, the beneficiary behind a rent transfer,
 * the creditor name a NACH mandate is registered under. None of it changes who these people
 * are; all of it is what makes the statement they generate look like one.
 */
import type { Account, Customer, Holding, SpendCategory } from '@dhan/core'
import {
  CARD_FINANCE_RATE_PA,
  GOVT_COVER,
  NETFLIX_TIERS,
  PPF_RATE_PA,
  cityProfile,
} from './calibration.ts'

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
   * Price rises, newest last. A streaming service that quietly went up is one of the very few
   * things we can genuinely detect *without asking* — unlike "a subscription you forgot",
   * which no bank statement can know. Both prices are published tiers, because a step between
   * two invented numbers is a finding the customer cannot check.
   */
  priceHistory?: { fromMonthsAgo: number; amount: number }[]
}

export interface EmiSpec {
  lender: string
  /**
   * The name the mandate is registered under, which is the only thing a NACH narration
   * carries. Not the same string as `lender`: a bank registers retail loans under a business
   * unit, so recognising the instalment means recognising that name and nothing else.
   */
  creditor: string
  /** The four letters that open the mandate's UMRN. */
  mandateBank4: string
  loanType: string
  amount: number
  day: number
  rate: number
  /** Months still to run as at the ledger's end date. Small values make "your EMI ends in
   *  March, that is ₹8,200 a month freed up" a live insight rather than a mock. */
  remainingMonths: number
  /** How long it has already been running, so the ledger shows the history. */
  elapsedMonths: number
  /**
   * A revolving card balance, paid down by a variable amount every month rather than by a
   * fixed instalment. It is not an EMI and is not generated as one — the variability is
   * exactly why the balance never clears.
   */
  isRevolving?: boolean
  /** Last four of the card, for the payment line. */
  cardLast4?: string
  /** Days past due. Non-zero blocks every investment recommendation. */
  dpd?: number
  /**
   * The month the mandate was presented against an account that could not pay it.
   *
   * Measured back from the anchor. It is what makes `dpdStatus` visible in the ledger rather
   * than only asserted on the liability: the debit is missing, a return charge lands, and the
   * instalment is paid by hand twelve days later.
   */
  returnedMonthsAgo?: number
}

export interface SipSpec {
  scheme: string
  /**
   * The clearing corporation that actually collects the mandate. A SIP does not debit in the
   * fund's name, which is what makes recognising one hard and worth generating honestly.
   */
  clearer: string
  amount: number
  day: number
  startsMonthsAgo: number
  assetClass: Holding['assetClass']
  /** Bought elsewhere. We do not churn what another distributor sold well. */
  heldOutsideIdbi?: boolean
}

/** Who is on the other end of a transfer, and how the rail names them. */
export interface PayeeSpec {
  /** The beneficiary or merchant as the line prints it. */
  name: string
  /** Eleven characters, `^[A-Z]{4}0[A-Z0-9]{6}$`. Required on IMPS and NEFT. */
  ifsc?: string
  /** The remark the payer attached. Kept clear of any token the dictionary matches on. */
  remark?: string
}

/** A one-off that a real life contains and a clean fixture never does. */
export interface LumpSpec {
  /** How the money left. A hospital bill is a card swipe or a bank transfer, never a UPI
   *  micro-payment — the per-transaction cap makes that impossible. */
  rail: 'pos' | 'ecom' | 'imps' | 'neft'
  payee: PayeeSpec
  category: SpendCategory
  /** ISO 18245 code, where the rail carries one. */
  mcc?: string
  amount: number
  /** Months before the end date. */
  monthsAgo: number
  day: number
}

export interface PersonaSpec {
  slug: string
  seed: number
  customer: Customer
  /**
   * The employer, and the bank that remits the salary. Never IDBI: an inward NEFT is stamped
   * by the bank that sent it, and the line used to carry `IDIB000M###` — Indian Bank's prefix,
   * on the receiving side, which is wrong twice over.
   */
  employer: { name: string; ifsc: string }
  /** Unique per persona. All three used to share one masked number. */
  accountNumberMasked: string
  /** Last four of the debit card, printed on every POS line. */
  cardLast4: string
  /** The policy reference a government micro-cover premium quotes. */
  coverReference: string
  /** Which of PMJJBY and PMSBY this account's mandate carries. */
  govtCover: readonly ('pmjjby' | 'pmsby')[]
  /** Monthly credit. `variancePct` above zero makes it irregular, as a trader's income is. */
  income: {
    amount: number
    day: number
    variancePct: number
    splits: number
    /** Where a business's money actually comes from: customers, and a QR aggregator. */
    payers?: readonly PayeeSpec[]
    settlementAgent?: PayeeSpec
  }
  rent?: { amount: number; day: number; payee: PayeeSpec }
  /** Electricity, mobile, broadband, gas. Recurring but variable — unlike a subscription. */
  utilities: boolean
  /**
   * Money that leaves every month and is not discretionary. Supporting parents is a
   * commitment, not a leak, and an advisor that suggests cutting it has lost the customer.
   */
  obligations: { payee: PayeeSpec; category: SpendCategory; amount: number; day: number }[]
  subscriptions: SubscriptionSpec[]
  emis: EmiSpec[]
  sips: SipSpec[]
  /** Envelope the generator spends inside, and the split across categories. */
  discretionary: {
    monthlyBudget: number
    mix: Partial<Record<MixKey, number>>
    /** How hard spending clusters after payday. Cleo: 35% spend most of it within five days. */
    paydayBias: number
    /**
     * The share of the envelope that goes on a card rather than through UPI.
     *
     * A behavioural knob, not a cosmetic one: it decides how many UPI debits a month the
     * account carries, and therefore whether the persona lands inside NPCI's published 36-44
     * transactions per user. Someone who puts everything on a card makes forty large payments
     * a month, not four hundred small ones, and no amount of tuning the envelope fixes that.
     */
    cardShare: number
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

/** The discretionary categories a persona's monthly budget is split across. */
type MixKey = 'Food & dining' | 'Groceries' | 'Transport' | 'Shopping' | 'Entertainment' | 'Health'

/** The IDBI branch a persona's account is held at, from the city table. */
export const branchIfscFor = (spec: PersonaSpec): string =>
  cityProfile(spec.customer.city).branchIfsc

/* ------------------------------------------------------------------ *
 * Rohan — the headline customer. Surplus and a protection gap.
 * ------------------------------------------------------------------ */

export const ROHAN: PersonaSpec = {
  slug: 'rohan',
  seed: 20260901,
  employer: { name: 'Acme Technologies Pvt Ltd', ifsc: 'HDFC0000523' },
  accountNumberMasked: 'XXXXXXXXXXXX7412',
  cardLast4: '5188',
  coverReference: '500110042882',
  // Deliberately none. A ₹436 debit on the statement implies ₹2 lakh of life cover in force,
  // and his story — with the ULIP refusal resting on it — needs the protection register to be
  // genuinely empty. Emitting the premium while holding no policy is the kind of incoherence a
  // banker spots faster than any figure.
  govtCover: [],
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
  rent: {
    amount: 24_500,
    day: 2,
    payee: { name: 'Sudhir Patel', ifsc: 'SBIN0030164', remark: 'RENT' },
  },
  utilities: true,
  obligations: [
    // Not a leak. An advisor that proposes cutting this has misread the customer entirely.
    {
      payee: { name: 'Meena Mehta', ifsc: 'PUNB0123400', remark: 'FAMILY' },
      category: 'Transfers',
      amount: 8_000,
      day: 8,
    },
  ],
  subscriptions: [
    {
      merchant: 'Netflix',
      amount: NETFLIX_TIERS.premium,
      day: 6,
      category: 'Entertainment',
      startsMonthsAgo: 22,
      // Standard to Premium five months ago: ₹150 a month, ₹1,800 a year, that nobody agreed
      // to. Both are published Netflix India prices, so the finding is one he can check.
      priceHistory: [
        { fromMonthsAgo: 22, amount: NETFLIX_TIERS.standard },
        { fromMonthsAgo: 5, amount: NETFLIX_TIERS.premium },
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
      creditor: 'IDBI BANK RETAIL ASSETS',
      mandateBank4: 'IBKL',
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
      clearer: 'INDIAN CLEARING CORP',
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
    // A salaried thirty-year-old in 2026 pays for almost everything by QR. The card comes out
    // for fuel, an electronics order and the hypermarket run.
    cardShare: 0.27,
  },
  drift: { category: 'Food & dining', overMonths: 6, endMultiplier: 1.9 },
  lumps: [
    {
      rail: 'ecom',
      payee: { name: 'MakeMyTrip' },
      category: 'Shopping',
      mcc: '4722',
      amount: 38_400,
      monthsAgo: 14,
      day: 18,
    },
    {
      rail: 'pos',
      payee: { name: 'Croma' },
      category: 'Shopping',
      mcc: '5732',
      amount: 52_900,
      monthsAgo: 9,
      day: 22,
    },
    {
      rail: 'pos',
      payee: { name: 'Choithram Hospital' },
      category: 'Health',
      mcc: '8062',
      amount: 31_600,
      monthsAgo: 6,
      day: 11,
    },
    {
      rail: 'imps',
      payee: { name: 'Arjun Mehta', ifsc: 'ICIC0000456', remark: 'GIFT' },
      category: 'Transfers',
      amount: 21_000,
      monthsAgo: 3,
      day: 26,
    },
  ],
  openingBalance: 22_000,
  // The ₹2 lakh Suvidha FD, and it belongs here rather than in `holdings`.
  //
  // A term deposit held *at IDBI* arrives as an account on 394 and 365 and is already in the
  // accounts block — `derive` counts it in `balances.deposits`, which is also what makes his
  // buffer cover six months. `packages/contracts/src/routes/holdings.ts` says outright that
  // recording it a second time "would count it twice in every net-worth figure", and it did:
  // the same ₹2,00,000 was in `balances.deposits` and in `holdings.debt`, so the dashboard's
  // net worth read ₹2 lakh higher than Rohan has.
  extraAccounts: [
    {
      accountNumberMasked: 'XXXXXXXXXXXX9930',
      accountType: 'FD',
      currentBalance: 200_000,
      accountOpeningDate: '2024-09-11',
      maturityDate: '2026-09-11',
      interestRate: 7.1,
      branchIfsc: 'IBKL0000155',
    },
  ],
  /*
   * What he owns beyond the flexi-cap — which is *not* listed here, because the generator rolls
   * that one forward from `sips` and declaring it would double it, exactly as the FD would be
   * doubled if it were moved out of `extraAccounts`.
   *
   * Neither of these is an IDBI account and neither shows in the statement, which is the point
   * of the declared block: the employer's NPS contribution never touches this savings account,
   * and a gold fund bought through another distributor is invisible to the feed. Both are also
   * deliberately *not* equity. `roadmap.ts` funds a retirement goal against `holdings.equity`
   * alone, so a Hybrid pension pot and a gold fund deepen the picture on Analytics without
   * quietly making his target reachable — the shortfall the whole Plan screen is built around
   * has to survive him owning things.
   */
  holdings: [
    {
      // 80CCD(2) only: he is on the new regime, where the employer's contribution is the one
      // NPS deduction still available, so a voluntary Tier-I for the tax break would be wrong.
      holdingType: 'NPS',
      name: 'NPS Tier-I — Acme corporate scheme',
      assetClass: 'Hybrid',
      investedAmount: 118_800,
      currentValue: 142_640,
      sipActive: false,
    },
    {
      holdingType: 'MUTUAL_FUND',
      name: 'Nippon India Gold Savings Fund',
      assetClass: 'Gold',
      investedAmount: 60_000,
      currentValue: 78_420,
      sipActive: false,
    },
  ],
  // Two dependents and nothing in force. This is what BUNDLED_PROTECTION needs in order to
  // be the rule that fires when the ULIP is proposed.
  policies: [],
  pitch: '29, Indore. ₹85,000 a month, two dependents, no life cover.',
  demonstrates:
    'BUNDLED_PROTECTION — the ULIP refusal, plus idle surplus and a forgotten subscription',
}

/* ------------------------------------------------------------------ *
 * Priya — earns well, and none of it can be invested yet.
 * ------------------------------------------------------------------ */

export const PRIYA: PersonaSpec = {
  slug: 'priya',
  seed: 19940714,
  employer: { name: 'Zeta Consulting India', ifsc: 'ICIC0000104' },
  accountNumberMasked: 'XXXXXXXXXXXX2286',
  cardLast4: '1184',
  coverReference: '500110051147',
  govtCover: [],
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
  rent: {
    amount: 38_000,
    day: 3,
    payee: { name: 'Anjali Menon', ifsc: 'FDRL0001234', remark: 'RENT' },
  },
  utilities: true,
  obligations: [
    // A commitment, not a leak — and the reason she accumulates nothing despite ₹1.4 lakh a
    // month. Worth having on one persona so the engine has to tell the two apart.
    {
      payee: { name: 'Lakshmi Nair', ifsc: 'SBIN0070234', remark: 'HOME' },
      category: 'Transfers',
      amount: 6_000,
      day: 6,
    },
  ],
  subscriptions: [
    {
      merchant: 'Netflix',
      amount: NETFLIX_TIERS.premium,
      day: 4,
      category: 'Entertainment',
      startsMonthsAgo: 23,
    },
    { merchant: 'Cultfit', amount: 2_499, day: 2, category: 'Health', startsMonthsAgo: 12 },
    { merchant: 'Audible', amount: 199, day: 15, category: 'Entertainment', startsMonthsAgo: 20 },
    {
      merchant: 'Adobe',
      amount: 1_675,
      day: 20,
      category: 'Shopping',
      startsMonthsAgo: 18,
      forgotten: true,
    },
  ],
  emis: [
    // IDBI's own published finance charge: 2.90% a month, which is 34.8% a year. The persona
    // used to carry 42% — the top of what any Indian issuer charges, and not IDBI's number. A
    // rate a banker cannot look up makes every other figure suspect, and nothing on the shelf
    // comes close to 34.8% either, so the refusal itself is unchanged.
    {
      lender: 'IDBI Credit Card',
      creditor: 'IDBI CREDIT CARD',
      mandateBank4: 'IBKL',
      loanType: 'Credit Card Revolving Balance',
      amount: 9_400,
      day: 18,
      rate: CARD_FINANCE_RATE_PA,
      remainingMonths: 34,
      elapsedMonths: 16,
      isRevolving: true,
      cardLast4: '1184',
    },
    {
      lender: 'Bajaj Finserv',
      creditor: 'BAJAJ FINANCE LTD',
      mandateBank4: 'UTIB',
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
  // paying a third a year on a card is a story no banker believes for a second.
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
    // The card is how she got here. Most of what she spends is a swipe, which is also why her
    // UPI count sits at the low end of the national band while her outflow sits at the top.
    cardShare: 0.79,
  },
  drift: { category: 'Shopping', overMonths: 6, endMultiplier: 1.6 },
  // No purchase lumps: her big buys went on the card, which is where the revolving balance
  // came from, so debiting them from savings would double-count the spending and hand her a
  // cash pile the card debt says she cannot have.
  lumps: [],
  // She runs roughly flat — spends what she earns, month after month. That matters more than
  // it looks: a *rising* balance puts the twelve-month floor at the start of the window and a
  // *falling* one puts it at the end, and either way one of "never negative" or "has no
  // buffer" breaks. Flat satisfies both, and it is also the true shape of her problem: she is
  // not sinking, she is simply never getting anywhere.
  openingBalance: 55_000,
  extraAccounts: [],
  /*
   * Everything she owns is locked, and that is the enrichment rather than a softening of it.
   *
   * Seven years of salaried consulting produces a pension pot whether or not the person is any
   * good with money — the employer routes it before the salary is paid, which is why none of it
   * appears in this ledger. The PPF is from 2019, when she was on the old regime and 80C was
   * worth something; contributions stopped when she moved to the new one, and the account still
   * runs to its fifteen-year term.
   *
   * Nothing here is redeemable against the card. NPS Tier-I is shut until 60 and PPF until 2034,
   * so ₹4.5 lakh sits on the Holdings tab that cannot pay down ₹5.83 lakh at 34.8% — which is a
   * sharper version of HIGH_INTEREST_DEBT than an empty portfolio was, not a weaker one. A
   * redeemable fund would have been the wrong choice: it would raise "why not just sell it",
   * which is a good question the app does not currently answer.
   */
  holdings: [
    {
      holdingType: 'NPS',
      name: 'NPS Tier-I — Zeta corporate scheme',
      assetClass: 'Hybrid',
      investedAmount: 285_600,
      currentValue: 331_100,
      sipActive: false,
    },
    {
      holdingType: 'PPF',
      name: 'Public Provident Fund — opened 2019',
      assetClass: 'Debt',
      investedAmount: 105_000,
      currentValue: 118_260,
      sipActive: false,
      interestRate: PPF_RATE_PA,
      maturityDate: '2034-04-01',
    },
  ],
  policies: [],
  pitch: '34, Kochi. ₹1.4 lakh a month — and a credit card at 34.8%.',
  demonstrates: 'HIGH_INTEREST_DEBT — the advisor refuses to invest anything at all',
}

/* ------------------------------------------------------------------ *
 * Sunil — irregular income, no buffer, and equity is the wrong answer.
 * ------------------------------------------------------------------ */

export const SUNIL: PersonaSpec = {
  slug: 'sunil',
  seed: 19790423,
  employer: { name: 'Kumar Hardware & Sanitary', ifsc: 'HDFC0000060' },
  accountNumberMasked: 'XXXXXXXXXXXX5107',
  cardLast4: '9042',
  coverReference: '500110066214',
  // Both covers, auto-debited before 1 June. Nearly every small-business account in the country
  // carries them, together they cost ₹456 a year, and the matching policies are on his file so
  // the statement and the protection register agree with each other.
  govtCover: ['pmjjby', 'pmsby'],
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
  // what makes "safe to spend today" hard and worth doing — and not one of these lines carries
  // a payroll flag, because not one of them is payroll.
  income: {
    amount: 70_000,
    day: 1,
    variancePct: 0.45,
    splits: 4,
    payers: [
      { name: 'Vinod Sharma', ifsc: 'SBIN0011045', remark: 'SHOP SALE' },
      { name: 'Deepak Traders', ifsc: 'BARB0NAGPUR', remark: 'SHOP SALE' },
      { name: 'Anil Contractors', ifsc: 'MAHB0000521', remark: 'SHOP SALE' },
    ],
    settlementAgent: { name: 'Razorpay Software Pvt Ltd', ifsc: 'HDFC0000060' },
  },
  utilities: true,
  obligations: [
    {
      payee: { name: 'Ramesh Kumar', ifsc: 'BARB0NAGPUR', remark: 'FAMILY' },
      category: 'Transfers',
      amount: 10_000,
      day: 10,
    },
    {
      payee: { name: 'Saraswati Vidyalaya', ifsc: 'MAHB0000521', remark: 'SCHOOL FEE' },
      category: 'Education',
      amount: 12_400,
      day: 12,
    },
  ],
  subscriptions: [
    { merchant: 'JioHotstar', amount: 299, day: 9, category: 'Entertainment', startsMonthsAgo: 14 },
  ],
  emis: [
    {
      lender: 'IDBI Bank',
      creditor: 'IDBI BANK RETAIL ASSETS',
      mandateBank4: 'IBKL',
      loanType: 'Shop Loan',
      amount: 11_600,
      day: 15,
      rate: 11.4,
      remainingMonths: 26,
      elapsedMonths: 34,
      // One missed instalment on record. MISSED_REPAYMENT outranks everything but the card —
      // and it is in the ledger, not only on the liability: four months before the anchor the
      // mandate was presented against an account that could not pay it.
      dpd: 12,
      returnedMonthsAgo: 4,
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
    // A shopkeeper in Nagpur pays by QR. The card is for the monthly trip to the mall and the
    // fuel, and that is all.
    cardShare: 0.27,
  },
  lumps: [
    {
      rail: 'neft',
      payee: { name: 'Orange City Hospital', ifsc: 'HDFC0000212', remark: 'ADMISSION' },
      category: 'Health',
      amount: 74_000,
      monthsAgo: 11,
      day: 9,
    },
    {
      rail: 'imps',
      payee: { name: 'Saraswati Vidyalaya', ifsc: 'MAHB0000521', remark: 'ANNUAL FEE' },
      category: 'Education',
      amount: 46_000,
      monthsAgo: 5,
      day: 3,
    },
  ],
  // He had savings and the hospital took most of them. What the data has to show is not a
  // dramatic zero — it is a buffer that never gets past about two months of outgoings while
  // four people depend on him, which is the whole argument for building one and is an argument
  // that lives in the ledger rather than in a sentence somebody wrote.
  openingBalance: 68_000,
  extraAccounts: [],
  /*
   * The classic small-business balance sheet: assets, and no liquidity.
   *
   * He is on the old regime, so 80C is worth something to him and the PPF is where it went —
   * the persona's tax note above is only true of somebody who actually used it. The gold fund
   * is the other half of how a Nagpur trader stores value, and neither of them is equity, which
   * is what makes the Analytics tab argue his case rather than contradict it: a Conservative
   * profile whose whole portfolio is debt and gold is a picture, not a label.
   *
   * None of it touches the buffer. `buffer` is computed from `balances`, and PPF at a post
   * office is not reachable on a bad month — so "2.5 months of outgoings and four dependents"
   * survives intact while "you are not poor, you are illiquid" becomes visible beside it.
   */
  holdings: [
    {
      holdingType: 'PPF',
      name: 'Public Provident Fund — Nagpur GPO',
      assetClass: 'Debt',
      investedAmount: 216_000,
      currentValue: 284_300,
      sipActive: false,
      interestRate: PPF_RATE_PA,
      // Opened 2014, run to term and extended once in five-year blocks, as the scheme allows.
      maturityDate: '2029-04-01',
    },
    {
      holdingType: 'MUTUAL_FUND',
      name: 'Nippon India Gold Savings Fund',
      assetClass: 'Gold',
      investedAmount: 74_000,
      currentValue: 112_450,
      sipActive: false,
      heldOutsideIdbi: true,
    },
  ],
  // ₹2 lakh of life cover and ₹2 lakh of accident cover, which the May debits pay for. It does
  // not close a gap of several crore and the roadmap says so — but a statement that debits a
  // premium against an empty protection register is a contradiction that costs more credibility
  // than the cover is worth.
  policies: [
    {
      holdingType: 'INSURANCE',
      name: 'PMJJBY — Pradhan Mantri Jeevan Jyoti Bima Yojana',
      assetClass: 'Protection',
      investedAmount: GOVT_COVER.coverAmount,
      currentValue: 0,
      sipActive: false,
    },
    {
      holdingType: 'INSURANCE',
      name: 'PMSBY — Pradhan Mantri Suraksha Bima Yojana (accident)',
      assetClass: 'Protection',
      investedAmount: GOVT_COVER.coverAmount,
      currentValue: 0,
      sipActive: false,
    },
  ],
  pitch: '47, Nagpur. Shop owner, income different every month, four dependents.',
  demonstrates: 'MISSED_REPAYMENT and RISK_CEILING — a Conservative profile equity cannot serve',
}

export const PERSONAS: readonly PersonaSpec[] = [ROHAN, PRIYA, SUNIL]

export function personaBySlug(slug: string): PersonaSpec {
  const found = PERSONAS.find((p) => p.slug === slug)
  if (!found)
    throw new Error(`no persona "${slug}" — have ${PERSONAS.map((p) => p.slug).join(', ')}`)
  return found
}
