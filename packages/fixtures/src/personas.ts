/**
 * The synthetic customers.
 *
 * A persona here describes *behaviour*, not transactions. The generator turns behaviour into
 * a ledger, so the headline numbers on any screen are arithmetic over data rather than
 * strings typed next to it. That distinction is the whole reason this package exists: the
 * prototype's fixture quoted an outflow of ₹49,600 in the demo script while the transactions
 * summed to ₹51,630, and nobody could see it until someone added them up.
 *
 * Four customers, chosen so a different suitability rule fires for each. A shelf of
 * suitable products cannot demonstrate suitability, and neither can one customer.
 *
 * The realism pass added the facts a *rail* needs rather than the facts a story needs: the
 * employer's own bank, the branch the account sits at, the beneficiary behind a rent transfer,
 * the creditor name a NACH mandate is registered under. None of it changes who these people
 * are; all of it is what makes the statement they generate look like one.
 */
import type { Account, Customer, Holding, Institution, SpendCategory } from '@dhan/core'
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

/* ------------------------------------------------------------------ *
 * Accounts at other banks
 * ------------------------------------------------------------------ */

/**
 * The banks a persona can hold an account at.
 *
 * IDBI is the only one with `isHome`. Everything else is visible only through an Account
 * Aggregator consent, and the screens have to be able to say which is which without
 * comparing strings.
 */
export const IDBI: Institution = { name: 'IDBI Bank', ifscPrefix: 'IBKL', isHome: true }
export const HDFC: Institution = { name: 'HDFC Bank', ifscPrefix: 'HDFC', isHome: false }
export const KOTAK: Institution = { name: 'Kotak Mahindra Bank', ifscPrefix: 'KKBK', isHome: false }
export const ICICI: Institution = { name: 'ICICI Bank', ifscPrefix: 'ICIC', isHome: false }

/** A one-off on a satellite account: a bonus landing, a car sold, a transfer out. */
export interface SatelliteLump {
  monthsAgo: number
  day: number
  amount: number
  type: 'CREDIT' | 'DEBIT'
  narration: string
  category: SpendCategory
  mode: 'NEFT' | 'IMPS' | 'UPI' | 'CHQ'
  /** Money moved to another account the same customer owns, not spent. */
  isSelfTransfer?: boolean
}

/**
 * A bank account the customer holds somewhere other than their primary one.
 *
 * The point of this type is that a satellite carries **real flows**, not a declared balance.
 * A household account that pays the rent has rent debits in it; an account nobody has touched
 * for fourteen months has nothing in it but the interest the bank credited. Declaring the
 * balance instead would put a number on the aggregation screen that no statement supports,
 * which is the exact failure `packages/fixtures` exists to prevent.
 *
 * Routing is by category, and a category may be claimed by at most one satellite — anything
 * unclaimed stays on the primary account. That is checked in the tests rather than trusted.
 */
export interface SatelliteSpec {
  accountNumberMasked: string
  institution: Institution
  accountType: 'Savings' | 'Current'
  accountOpeningDate: string
  /** The home branch. Must begin with the institution's own prefix. */
  branchIfsc: string
  /** Which spend categories this account carries. Empty means it carries only its own lumps. */
  carries: readonly SpendCategory[]
  /**
   * Routed flows stop this many months before the anchor, and the account goes quiet.
   *
   * This is what makes a dormant account *look* dormant on its own statement rather than
   * merely being asserted to be: the lines stop, and the only thing after them is the
   * quarterly interest the bank paid into it regardless.
   */
  quietAfterMonthsAgo?: number
  lumps?: readonly SatelliteLump[]
  /**
   * A standing transfer from the primary account into this one, every month.
   *
   * An account that pays the rent has to be *funded*, or its balance runs to a large negative
   * number and the solved opening balance quietly absorbs it. Modelling the transfer instead
   * produces both halves of one movement — a debit on the primary, a credit here — which is
   * what the customer's own two statements show and what makes the aggregate net to zero.
   */
  monthlyFunding?: { amount: number; day: number }
  /**
   * The balance this account must show at the anchor.
   *
   * The opening balance is **solved** from this rather than declared: whatever the flows and
   * lumps come to, the opening balance is set so the ledger closes on exactly this figure. A
   * balance and the statement behind it therefore cannot disagree, which is the property the
   * whole aggregation screen rests on.
   */
  balanceAtAnchor: number
  /** Annual savings rate, for the interest the bank credits each quarter. */
  interestRate: number
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
  /**
   * Bank accounts held elsewhere, each with its own ledger.
   *
   * Absent means the customer banks in one place, which is what every persona meant before
   * aggregation was the product's pitch.
   */
  satellites?: readonly SatelliteSpec[]
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
      name: 'NPS Tier-I, Acme corporate scheme',
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
    /*
     * Two folios off a consolidated account statement he imported months ago.
     *
     * The CAS flow matched an imported folio back to the record **by name** — `HoldingSchema`
     * still carries no folio number — so these two names were `CAS_FOLIOS[1]` and
     * `CAS_FOLIOS[2]` in `apps/web/src/screens/external/cas.ts`, character for character, with
     * that statement's own invested and current figures, and a `cas.test.ts` beside them held
     * the two files to each other.
     *
     * That screen, its fixture and that test went with `apps/web` on 20 September 2026
     * (`docs/architecture/adr/ADR-0001.md`). **The names below are now unpinned**: nothing in the
     * tree asserts them against a statement any more, and `apps/mobile` has no CAS import yet.
     * Match-by-name is still the only join available, so whoever rebuilds that flow should
     * restore a test like it rather than trust these strings to have stayed put.
     *
     * **Only the two folios with no mandate.** The other two on that statement run SIPs, and a
     * declared holding with an active mandate that has no matching ACH debit in the ledger is
     * two screens disagreeing: Holdings would report ₹7,000 a month going in that Commitments —
     * which reads the statement — has never seen. Leaving them unimported is also what keeps the
     * import flow worth opening: there is still something on the statement to bring in.
     *
     * They are what gives the Analytics pane a fourth asset class and a portfolio worth cutting
     * up. Neither breaks the shortfall the Plan screen is built around: ₹1.42 lakh more equity
     * against a ₹2.20 crore target thirty-one years out moves the required monthly by a few
     * hundred rupees, and `roadmap.test.ts` holds the route to still being infeasible.
     */
    {
      holdingType: 'MUTUAL_FUND',
      name: 'Flexi Cap Fund - Regular Growth',
      assetClass: 'Equity',
      investedAmount: 120_000,
      currentValue: 141_750,
      sipActive: false,
      heldOutsideIdbi: true,
    },
    {
      holdingType: 'MUTUAL_FUND',
      name: 'Corporate Bond Fund - Direct Growth',
      assetClass: 'Debt',
      investedAmount: 90_000,
      currentValue: 98_460,
      sipActive: false,
      heldOutsideIdbi: true,
    },
  ],
  // Two dependents and nothing in force. This is what BUNDLED_PROTECTION needs in order to
  // be the rule that fires when the ULIP is proposed.
  policies: [],
  pitch: '29, Indore. ₹85,000 a month, two dependents, no life cover.',
  demonstrates:
    'BUNDLED_PROTECTION: the ULIP refusal, plus idle surplus and a forgotten subscription',
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
      name: 'NPS Tier-I, Zeta corporate scheme',
      assetClass: 'Hybrid',
      investedAmount: 285_600,
      currentValue: 331_100,
      sipActive: false,
    },
    {
      holdingType: 'PPF',
      name: 'Public Provident Fund, opened 2019',
      assetClass: 'Debt',
      investedAmount: 105_000,
      currentValue: 118_260,
      sipActive: false,
      interestRate: PPF_RATE_PA,
      maturityDate: '2034-04-01',
    },
  ],
  policies: [],
  pitch: '34, Kochi. ₹1.4 lakh a month, and a credit card at 34.8%.',
  demonstrates: 'HIGH_INTEREST_DEBT: the advisor refuses to invest anything at all',
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
      name: 'Public Provident Fund, Nagpur GPO',
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
      name: 'PMJJBY, Pradhan Mantri Jeevan Jyoti Bima Yojana',
      assetClass: 'Protection',
      investedAmount: GOVT_COVER.coverAmount,
      currentValue: 0,
      sipActive: false,
    },
    {
      holdingType: 'INSURANCE',
      name: 'PMSBY, Pradhan Mantri Suraksha Bima Yojana (accident)',
      assetClass: 'Protection',
      investedAmount: GOVT_COVER.coverAmount,
      currentValue: 0,
      sipActive: false,
    },
  ],
  pitch: '47, Nagpur. Shop owner, income different every month, four dependents.',
  demonstrates: 'MISSED_REPAYMENT and RISK_CEILING: a Conservative profile equity cannot serve',
}

/* ------------------------------------------------------------------ *
 * Karan — the demo customer. Four banks, nine investments, no cover.
 * ------------------------------------------------------------------ */

/**
 * The persona the product is demonstrated on.
 *
 * The other three exist to exercise one suitability rule each and are not shown in the app.
 * Karan has to carry all nine on his own, and the way he does it is by being *fragmented*
 * rather than by being broke: his money is spread across four banks and three investment
 * platforms, and nobody — himself included — has ever seen it on one screen.
 *
 * The arithmetic closes in a loop, which is the whole reason the story works:
 *
 *   he spends more than he earns        → the card balance grows every month
 *   the card balance is at 34.8%        → it outranks every investment on the shelf
 *   ₹8.2 lakh sits idle at 3% elsewhere → the expensive debt is indefensible, not unlucky
 *   clearing it frees the deficit       → which is what moves retirement from 61 to 52
 *
 * Nothing in that chain is asserted. Every link is arithmetic over a ledger a reviewer can
 * open, which is what `packages/fixtures` is for.
 */
export const KARAN: PersonaSpec = {
  slug: 'karan',
  seed: 19960212,
  employer: { name: 'Northwind Systems India Pvt Ltd', ifsc: 'HDFC0000523' },
  accountNumberMasked: 'XXXXXXXXXXXX3308',
  cardLast4: '7714',
  coverReference: '500110099431',
  // None. The whole protection story rests on the register being genuinely thin, and the
  // ULIP in `policies` is the only thing in it.
  govtCover: [],
  customer: {
    cif: 'IDBI0003308471',
    custId: 'demo-karan',
    custName: 'Karan Deshpande',
    dateOfBirth: '1996-02-12',
    gender: 'Male',
    maritalStatus: 'Married',
    // Aanya is two, and his mother in Nashik is the second. Both are load-bearing: the
    // protection gap is computed against dependents, not against marital status.
    dependents: 2,
    employmentType: 'Salaried',
    declaredAnnualIncome: 3_200_000,
    city: 'Pune',
    stateCode: '27',
    preferredLanguage: 'en-IN',
    // Last assessed in 2021 and never revisited. Stale on purpose: RISK_CEILING needs
    // something to measure a Very High product against, and the staleness is itself the
    // prompt to re-profile.
    riskProfile: 'Balanced',
    kycStatus: 'Verified',
    customerSince: '2019-06-03',
    taxRegime: 'new',
  },
  // ₹32L CTC, less employer PF and tax under the new regime, credited on the 1st.
  income: { amount: 192_000, day: 1, variancePct: 0, splits: 1 },
  // Paid out of the joint account, not this one. `satellites` routes it.
  rent: {
    amount: 42_000,
    day: 2,
    payee: { name: 'Sanjeev Kulkarni', ifsc: 'BKID0000712', remark: 'RENT' },
  },
  utilities: true,
  obligations: [
    {
      payee: { name: 'Shubhangi Deshpande', ifsc: 'MAHB0000418', remark: 'FAMILY' },
      category: 'Transfers',
      amount: 15_000,
      day: 8,
    },
    {
      payee: { name: 'Little Wings Daycare', ifsc: 'ICIC0000104', remark: 'FEES' },
      category: 'Education',
      amount: 12_000,
      day: 5,
    },
    {
      // The PPF contribution. A transfer, not a mandate — which is why it is here and not in
      // `sips`, and why missing a month costs nothing.
      payee: { name: 'PPF ACCOUNT 4471902', ifsc: 'IBKL0000105', remark: 'PPF' },
      category: 'Investment',
      amount: 5_000,
      day: 15,
    },
  ],
  subscriptions: [
    {
      merchant: 'Netflix',
      amount: NETFLIX_TIERS.premium,
      day: 6,
      category: 'Entertainment',
      startsMonthsAgo: 22,
      priceHistory: [
        { fromMonthsAgo: 22, amount: NETFLIX_TIERS.standard },
        { fromMonthsAgo: 7, amount: NETFLIX_TIERS.premium },
      ],
    },
    { merchant: 'Spotify', amount: 119, day: 12, category: 'Entertainment', startsMonthsAgo: 20 },
    {
      merchant: 'Amazon Prime',
      // The dictionary reads Amazon as Shopping, and it is right to: the same mandate name
      // covers a delivery subscription. The persona follows the categoriser rather than the
      // categoriser being bent to the persona.
      amount: 299,
      day: 14,
      category: 'Shopping',
      startsMonthsAgo: 18,
    },
    {
      merchant: 'YouTube Premium',
      amount: 149,
      day: 23,
      category: 'Entertainment',
      startsMonthsAgo: 13,
    },
    { merchant: 'Google One', amount: 130, day: 21, category: 'Shopping', startsMonthsAgo: 19 },
    // The three nobody cancelled. Live mandates with no activity around them, which is the
    // only form of "forgotten" a bank statement can actually evidence.
    {
      merchant: 'Hotstar',
      amount: 299,
      day: 9,
      category: 'Entertainment',
      startsMonthsAgo: 15,
      forgotten: true,
    },
    {
      merchant: 'Audible',
      amount: 166,
      day: 17,
      category: 'Entertainment',
      startsMonthsAgo: 11,
      forgotten: true,
    },
    {
      merchant: 'Golds Gym',
      amount: 1_599,
      day: 3,
      category: 'Health',
      startsMonthsAgo: 16,
      forgotten: true,
    },
  ],
  emis: [
    {
      lender: 'IDBI Bank',
      creditor: 'IDBI BANK RETAIL ASSETS',
      mandateBank4: 'IBKL',
      loanType: 'Car Loan',
      amount: 18_500,
      day: 7,
      rate: 9.4,
      remainingMonths: 35,
      elapsedMonths: 25,
      // March 2026. Presented against an account that could not carry it, returned, charged for,
      // and paid by hand twelve days later — which is what the ledger shows.
      //
      // `dpd` is set beside it because nothing downstream reads the ledger for this.
      // `derive.ts:596` is `file.liabilities.some((l) => l.dpdStatus > 0)`, so a bounce visible
      // in the statement and absent from the liability record is a customer two screens would
      // describe differently. The earlier comment here claimed the opposite and was wrong.
      returnedMonthsAgo: 6,
      dpd: 12,
    },
    {
      lender: 'IDBI Bank',
      creditor: 'IDBI BANK CARDS',
      mandateBank4: 'IBKL',
      loanType: 'Credit Card',
      amount: 12_000,
      day: 18,
      rate: CARD_FINANCE_RATE_PA,
      remainingMonths: 16,
      elapsedMonths: 11,
      isRevolving: true,
      cardLast4: '7714',
    },
  ],
  sips: [
    {
      // Bought well, through somebody else, and left alone. The do-not-churn case.
      scheme: 'Parag Parikh Flexi Cap Fund',
      clearer: 'INDIAN CLEARING CORP',
      amount: 12_000,
      day: 5,
      startsMonthsAgo: 23,
      assetClass: 'Equity',
      heldOutsideIdbi: true,
    },
    {
      scheme: 'Axis Bluechip Fund',
      clearer: 'INDIAN CLEARING CORP',
      amount: 8_000,
      day: 8,
      startsMonthsAgo: 20,
      assetClass: 'Equity',
      heldOutsideIdbi: true,
    },
    {
      // The overlap. Bought through IDBI two years after the Axis one, and holding
      // substantially the same companies.
      scheme: 'ICICI Prudential Bluechip Fund',
      clearer: 'NPCI NACH',
      amount: 7_000,
      day: 10,
      startsMonthsAgo: 18,
      assetClass: 'Equity',
    },
    {
      scheme: 'SBI Small Cap Fund',
      clearer: 'INDIAN CLEARING CORP',
      amount: 8_000,
      day: 12,
      startsMonthsAgo: 8,
      assetClass: 'Equity',
      heldOutsideIdbi: true,
    },
  ],
  discretionary: {
    monthlyBudget: 47_000,
    mix: {
      Groceries: 36,
      'Food & dining': 27,
      Shopping: 17,
      Transport: 13,
      Entertainment: 4,
      Health: 3,
    },
    paydayBias: 0.58,
    // Higher than the other three: a household on this income puts the weekly shop and the
    // fuel on a card, which is what keeps the UPI count inside NPCI's published band. Drop it
    // and he makes seventy small payments a month, which no onboarded user does.
    cardShare: 0.75,
  },
  drift: { category: 'Food & dining', overMonths: 18, endMultiplier: 1.58 },
  lumps: [
    {
      rail: 'neft',
      payee: { name: 'HDFC Life Insurance', ifsc: 'HDFC0000060', remark: 'ULIP PREMIUM' },
      category: 'Insurance',
      amount: 45_000,
      monthsAgo: 19,
      day: 22,
    },
    {
      rail: 'neft',
      payee: { name: 'HDFC Life Insurance', ifsc: 'HDFC0000060', remark: 'ULIP PREMIUM' },
      category: 'Insurance',
      amount: 45_000,
      monthsAgo: 7,
      day: 22,
    },
    {
      rail: 'pos',
      payee: { name: 'Vijay Sales' },
      category: 'Shopping',
      mcc: '5732',
      amount: 78_400,
      monthsAgo: 13,
      day: 19,
    },
    {
      rail: 'ecom',
      payee: { name: 'MakeMyTrip' },
      category: 'Shopping',
      mcc: '4722',
      amount: 46_500,
      monthsAgo: 10,
      day: 7,
    },
    {
      rail: 'pos',
      payee: { name: 'Sahyadri Hospital' },
      category: 'Health',
      mcc: '8062',
      amount: 42_800,
      monthsAgo: 4,
      day: 16,
    },
  ],
  openingBalance: 80_000,
  extraAccounts: [],

  /*
   * The three accounts IDBI cannot see.
   *
   * Between them they hold 73% of his cash, and the aggregation screen exists to put that
   * number in front of him for the first time. Each carries real flows rather than a declared
   * balance — the joint account pays the rent because the rent debits are in it.
   */
  satellites: [
    {
      // The previous employer's salary account. A 2024 bonus and the proceeds of his old car
      // went in, the salary stopped when he changed jobs, and nobody has touched it since.
      // Earning 3% while a card at 34.8% goes unpaid is the single most expensive fact in
      // this file, and it is invisible until all four accounts are on one screen.
      accountNumberMasked: 'XXXXXXXXXXXX2188',
      institution: HDFC,
      accountType: 'Savings',
      accountOpeningDate: '2018-07-19',
      branchIfsc: 'HDFC0000045',
      carries: [],
      quietAfterMonthsAgo: 14,
      lumps: [
        {
          monthsAgo: 20,
          day: 28,
          amount: 420_000,
          type: 'CREDIT',
          narration:
            'NEFT/HDFCN52025012845/NORTHWIND SYSTEMS INDIA PVT LTD/HDFC0000523/SALARY JAN 2025',
          category: 'Income',
          mode: 'NEFT',
        },
        {
          monthsAgo: 16,
          day: 11,
          amount: 310_000,
          type: 'CREDIT',
          narration: 'IMPS/P2A/611904428871/RAHUL JOSHI/HDFC0000712/CAR SALE',
          category: 'Transfers',
          mode: 'IMPS',
        },
        {
          monthsAgo: 15,
          day: 24,
          amount: 150_000,
          type: 'DEBIT',
          narration: 'IMPS/P2A/611952200417/SELF/IBKL0000105/TRANSFER',
          category: 'Transfers',
          mode: 'IMPS',
          isSelfTransfer: true,
        },
      ],
      balanceAtAnchor: 820_000,
      interestRate: 3.0,
    },
    {
      // The household account, joint with Ananya. Funded from the salary account on the 2nd
      // and spent down over the month, which is why its balance is small and its statement
      // is the busiest of the four.
      accountNumberMasked: 'XXXXXXXXXXXX4477',
      institution: ICICI,
      accountType: 'Savings',
      accountOpeningDate: '2021-06-15',
      branchIfsc: 'ICIC0000104',
      carries: ['Rent & bills', 'Groceries', 'Education', 'Health'],
      monthlyFunding: { amount: 79_000, day: 2 },
      balanceAtAnchor: 95_000,
      interestRate: 3.0,
    },
    {
      // The spending account. A digital-first account he moved his UPI to, kept deliberately
      // near empty, and where every subscription now debits from.
      accountNumberMasked: 'XXXXXXXXXXXX6031',
      institution: KOTAK,
      accountType: 'Savings',
      accountOpeningDate: '2023-04-02',
      branchIfsc: 'KKBK0001762',
      carries: ['Food & dining', 'Entertainment', 'Transport'],
      monthlyFunding: { amount: 22_500, day: 3 },
      balanceAtAnchor: 12_000,
      interestRate: 3.5,
    },
  ],

  /*
   * What he owns beyond the four SIPs, which the generator rolls forward from `sips` and
   * which are therefore deliberately absent here.
   *
   * The nine stocks are the second finding on the portfolio screen: ₹7.6 lakh of direct
   * equity, 61% of its value in two names, most of it bought in the back half of 2021 and
   * never looked at since. They are not a moral failing and the app does not treat them as
   * one — but concentration that large, in a portfolio its owner has not opened in four
   * years, is a fact he is entitled to be told.
   */
  holdings: [
    {
      holdingType: 'EPF',
      name: 'Employees’ Provident Fund',
      assetClass: 'Debt',
      investedAmount: 980_000,
      currentValue: 980_000,
      sipActive: false,
      custodian: 'EPFO',
    },
    {
      holdingType: 'NPS',
      name: 'NPS Tier-I, Northwind corporate scheme',
      assetClass: 'Hybrid',
      investedAmount: 185_000,
      currentValue: 210_000,
      sipActive: false,
      custodian: 'Protean CRA',
    },
    {
      holdingType: 'PPF',
      name: 'Public Provident Fund, opened 2019',
      assetClass: 'Debt',
      investedAmount: 420_000,
      currentValue: 460_000,
      sipActive: true,
      sipAmount: 5_000,
      sipDebitDay: 15,
      interestRate: PPF_RATE_PA,
      maturityDate: '2034-03-31',
      custodian: 'IDBI Bank',
    },
    // ---- The demat. Nine positions, one platform, four years of not looking. ----
    {
      holdingType: 'EQUITY',
      name: 'One 97 Communications (Paytm)',
      assetClass: 'Equity',
      ticker: 'PAYTM',
      isin: 'INE982J01020',
      units: 250,
      avgCost: 1_420,
      investedAmount: 355_000,
      currentValue: 174_000,
      sipActive: false,
      custodian: 'Zerodha',
      heldOutsideIdbi: true,
      purchasedOn: '2021-11-18',
    },
    {
      holdingType: 'EQUITY',
      name: 'Yes Bank',
      assetClass: 'Equity',
      ticker: 'YESBANK',
      isin: 'INE528G01035',
      units: 12_000,
      avgCost: 16.8,
      investedAmount: 201_600,
      currentValue: 216_000,
      sipActive: false,
      custodian: 'Zerodha',
      heldOutsideIdbi: true,
      purchasedOn: '2021-09-06',
    },
    {
      holdingType: 'EQUITY',
      name: 'Eternal (Zomato)',
      assetClass: 'Equity',
      ticker: 'ETERNAL',
      isin: 'INE758T01015',
      units: 200,
      avgCost: 125,
      investedAmount: 25_000,
      currentValue: 48_000,
      sipActive: false,
      custodian: 'Zerodha',
      heldOutsideIdbi: true,
      purchasedOn: '2021-07-27',
    },
    {
      holdingType: 'EQUITY',
      name: 'Tata Motors',
      assetClass: 'Equity',
      ticker: 'TATAMOTORS',
      isin: 'INE155A01022',
      units: 60,
      avgCost: 455,
      investedAmount: 27_300,
      currentValue: 42_000,
      sipActive: false,
      custodian: 'Zerodha',
      heldOutsideIdbi: true,
      purchasedOn: '2021-10-12',
    },
    {
      holdingType: 'EQUITY',
      name: 'Infosys',
      assetClass: 'Equity',
      ticker: 'INFY',
      isin: 'INE009A01021',
      units: 25,
      avgCost: 1_480,
      investedAmount: 37_000,
      currentValue: 40_000,
      sipActive: false,
      custodian: 'Zerodha',
      heldOutsideIdbi: true,
      purchasedOn: '2022-01-19',
    },
    {
      holdingType: 'EQUITY',
      name: 'IRCTC',
      assetClass: 'Equity',
      ticker: 'IRCTC',
      isin: 'INE335Y01020',
      units: 45,
      avgCost: 820,
      investedAmount: 36_900,
      currentValue: 31_500,
      sipActive: false,
      custodian: 'Zerodha',
      heldOutsideIdbi: true,
      purchasedOn: '2021-10-29',
    },
    {
      holdingType: 'EQUITY',
      name: 'Vedanta',
      assetClass: 'Equity',
      ticker: 'VEDL',
      isin: 'INE205A01025',
      units: 130,
      avgCost: 245,
      investedAmount: 31_850,
      currentValue: 57_200,
      sipActive: false,
      custodian: 'Zerodha',
      heldOutsideIdbi: true,
      purchasedOn: '2021-08-16',
    },
    {
      holdingType: 'EQUITY',
      name: 'Suzlon Energy',
      assetClass: 'Equity',
      ticker: 'SUZLON',
      isin: 'INE040H01021',
      units: 3_000,
      avgCost: 8.9,
      investedAmount: 26_700,
      currentValue: 19_500,
      sipActive: false,
      custodian: 'Zerodha',
      heldOutsideIdbi: true,
      purchasedOn: '2021-12-03',
    },
    {
      holdingType: 'EQUITY',
      name: 'Reliance Power',
      assetClass: 'Equity',
      ticker: 'RPOWER',
      isin: 'INE614G01033',
      units: 2_000,
      avgCost: 11.2,
      investedAmount: 22_400,
      currentValue: 11_000,
      sipActive: false,
      custodian: 'Zerodha',
      heldOutsideIdbi: true,
      purchasedOn: '2021-12-21',
    },
  ],

  /*
   * The protection register, and the reason the whole thing is a story.
   *
   * One entry, and it is not term cover. ₹4.5 lakh of sum assured against two dependents and
   * ₹32 lakh of income is 0.14 times annual income, where the conventional floor is ten —
   * so he is, to any reasonable reading, uninsured. He does not know that: he has been paying
   * ₹45,000 a year for seven years and believes it is his life insurance. BUNDLED_PROTECTION
   * exists for exactly this, and the honest sentence is that the product is a savings plan
   * with a small policy attached, returning 4.1% over seven years.
   */
  policies: [
    {
      holdingType: 'INSURANCE',
      name: 'HDFC Life Click 2 Wealth, ULIP',
      assetClass: 'Protection',
      investedAmount: 270_000,
      currentValue: 320_000,
      sumAssured: 450_000,
      annualPremium: 45_000,
      sipActive: false,
      custodian: 'HDFC Life',
      heldOutsideIdbi: true,
      purchasedOn: '2019-08-22',
    },
  ],
  pitch: '30, Pune. Four banks, nine investments, and no idea they add up.',
  demonstrates:
    'HIGH_INTEREST_DEBT and BUNDLED_PROTECTION, against a ₹5 crore goal AFFORDABILITY refuses.',
}

export const PERSONAS: readonly PersonaSpec[] = [KARAN, ROHAN, PRIYA, SUNIL]

export function personaBySlug(slug: string): PersonaSpec {
  const found = PERSONAS.find((p) => p.slug === slug)
  if (!found)
    throw new Error(`no persona "${slug}"; have ${PERSONAS.map((p) => p.slug).join(', ')}`)
  return found
}
