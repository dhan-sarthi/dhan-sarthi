/**
 * The vocabulary the relationship manager's book is written in.
 *
 * The four hero personas are written out longhand because each one carries an argument, and
 * the comments beside every field are that argument. Forty-six more written the same way would
 * bury the differences between them under the fields they share. So a book customer is a
 * `BookCustomer`: who they are, what comes in and what goes out, with everything a bank fills in
 * the same way for every account (state code, customer id, the masked number's prefix, the
 * government-cover policies a premium line implies) filled in here, once.
 *
 * What this module must never do is invent behaviour. Every helper below builds the same
 * `PersonaSpec` fields a hero declares by hand, and the generator turns them into a ledger the
 * same way; nothing here is a shortcut past the generator, which is the whole point of putting
 * the book through it.
 */
import type { Account, Customer, Holding, SpendCategory } from '@dhan/core'
import { addMonths, daysInMonth, fromYmd, ymd } from '../calendar.ts'
import { CARD_FINANCE_RATE_PA, GOVT_COVER, NETFLIX_TIERS, cityProfile } from '../calibration.ts'
import { impsDebit, neftSalary } from '../narration.ts'
import { HDFC, ICICI, KOTAK } from '../personas.ts'
import type {
  EmiSpec,
  LumpSpec,
  PayeeSpec,
  PersonaSpec,
  SatelliteLump,
  SatelliteSpec,
  SipSpec,
  SubscriptionSpec,
} from '../personas.ts'
import { rng } from '../random.ts'

/** The persona anchor, which every `monthsAgo` in a spec is measured back from. */
const ANCHOR = '2026-09-01'

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

/** GSTN state codes for the cities in `CITIES`, which is also what `ref.state_codes` holds. */
const STATE_CODE: Readonly<Record<string, string>> = {
  Indore: '23',
  Kochi: '32',
  Pune: '27',
  Nagpur: '27',
  Mumbai: '27',
  Bengaluru: '29',
  Ahmedabad: '24',
  Delhi: '07',
}

/** Masked the way IDBI masks a savings account: twelve Xs and the last four digits. */
export const masked = (last4: string): string => `XXXXXXXXXXXX${last4}`

/* ------------------------------------------------------------------ *
 * Spending
 * ------------------------------------------------------------------ */

type Mix = PersonaSpec['discretionary']['mix']

/**
 * How a household splits its discretionary month, by the shape of the household.
 *
 * A starting point and not a quota: a customer overrides the mix wherever their life says
 * otherwise. These are what make forty-six envelopes differ for a reason rather than at random.
 */
export const MIX = {
  /** Eats out, orders in, shops online. */
  single: {
    'Food & dining': 32,
    Groceries: 14,
    Transport: 14,
    Shopping: 24,
    Entertainment: 12,
    Health: 4,
  },
  /** The weekly shop dominates, and the children's things land in Shopping. */
  family: {
    'Food & dining': 20,
    Groceries: 38,
    Transport: 14,
    Shopping: 18,
    Entertainment: 5,
    Health: 5,
  },
  /** A trader's household: groceries and fuel, very little that is not needed. */
  trader: {
    'Food & dining': 14,
    Groceries: 44,
    Transport: 18,
    Shopping: 12,
    Entertainment: 4,
    Health: 8,
  },
  /** Past fifty-five: the pharmacy and the doctor take what the restaurants used to. */
  senior: {
    'Food & dining': 14,
    Groceries: 40,
    Transport: 12,
    Shopping: 14,
    Entertainment: 4,
    Health: 16,
  },
} as const satisfies Record<string, Mix>

/* ------------------------------------------------------------------ *
 * Commitments
 * ------------------------------------------------------------------ */

/** A loan instalment by NACH mandate. `remaining` and `elapsed` are months, at the anchor. */
export function loan(
  lender: 'IDBI' | 'BAJAJ' | 'HDB' | 'TATA' | 'CHOLA',
  loanType: string,
  amount: number,
  day: number,
  rate: number,
  remaining: number,
  elapsed: number,
  missed?: { monthsAgo: number; dpd: number },
): EmiSpec {
  // Only creditors the recognition dictionary names. A mandate under any other string is a
  // line the engine cannot call an instalment, which is a finding about the data, not the
  // customer.
  const creditor = {
    IDBI: { lender: 'IDBI Bank', creditor: 'IDBI BANK RETAIL ASSETS', bank4: 'IBKL' },
    BAJAJ: { lender: 'Bajaj Finserv', creditor: 'BAJAJ FINANCE LTD', bank4: 'UTIB' },
    HDB: { lender: 'HDB Financial Services', creditor: 'HDB FINANCIAL SERVICES', bank4: 'HDFC' },
    TATA: { lender: 'Tata Capital', creditor: 'TATA CAPITAL LTD', bank4: 'ICIC' },
    CHOLA: { lender: 'Cholamandalam Finance', creditor: 'CHOLAMANDALAM FINANCE', bank4: 'UTIB' },
  }[lender]
  return {
    lender: creditor.lender,
    creditor: creditor.creditor,
    mandateBank4: creditor.bank4,
    loanType,
    amount,
    day,
    rate,
    remainingMonths: remaining,
    elapsedMonths: elapsed,
    ...(missed === undefined ? {} : { returnedMonthsAgo: missed.monthsAgo, dpd: missed.dpd }),
  }
}

/** A revolving balance on the IDBI card, paid down by a different amount every month. */
export function idbiCard(
  payment: number,
  day: number,
  remaining: number,
  elapsed: number,
  cardLast4: string,
): EmiSpec {
  return {
    lender: 'IDBI Credit Card',
    creditor: 'IDBI CREDIT CARD',
    mandateBank4: 'IBKL',
    loanType: 'Credit Card Revolving Balance',
    amount: payment,
    day,
    rate: CARD_FINANCE_RATE_PA,
    remainingMonths: remaining,
    elapsedMonths: elapsed,
    isRevolving: true,
    cardLast4,
  }
}

/**
 * A monthly SIP. `via` is who collects the mandate, which is all the debit line names.
 *
 * A customer's SIPs each name a different collector, because they were bought on different
 * platforms — and because the engine groups mandates by the name on the line. Two SIPs collected
 * by the same clearing corporation read as one series debiting three times a month, which it
 * then declares inactive, and the money in them vanishes from every commitment figure.
 */
export function sip(
  scheme: string,
  amount: number,
  day: number,
  startsMonthsAgo: number,
  options: {
    via?: 'ICCL' | 'NACH' | 'NSE' | 'BSE'
    assetClass?: Holding['assetClass']
    outside?: boolean
  } = {},
): SipSpec {
  const clearer = {
    ICCL: 'INDIAN CLEARING CORP',
    NACH: 'NPCI NACH',
    NSE: 'NSE CLEARING LTD',
    BSE: 'BSE STAR MF',
  }[options.via ?? 'ICCL']
  return {
    scheme,
    clearer,
    amount,
    day,
    startsMonthsAgo,
    assetClass: options.assetClass ?? 'Equity',
    // Bought through somebody else unless the mandate is IDBI's own NACH registration.
    ...(options.outside === false || options.via === 'NACH' ? {} : { heldOutsideIdbi: true }),
  }
}

/** A transfer that leaves every month and is nobody's business to cut. */
export const sends = (
  name: string,
  ifsc: string,
  remark: string,
  amount: number,
  day: number,
  category: SpendCategory = 'Transfers',
): PersonaSpec['obligations'][number] => ({ payee: { name, ifsc, remark }, category, amount, day })

/** Rent by IMPS to a landlord, the way every persona pays it. */
export const rentTo = (
  name: string,
  ifsc: string,
  amount: number,
  day: number,
): PersonaSpec['rent'] => ({ amount, day, payee: { name, ifsc, remark: 'RENT' } })

/**
 * Subscriptions at published Indian prices.
 *
 * Every amount is a tier the service sells, for the reason `NETFLIX_TIERS` gives: a price rise
 * between two invented numbers is a finding nobody can check.
 */
export const subs = {
  netflix: (
    tier: keyof typeof NETFLIX_TIERS,
    day: number,
    since: number,
    rose?: { from: keyof typeof NETFLIX_TIERS; monthsAgo: number },
  ): SubscriptionSpec => ({
    merchant: 'Netflix',
    amount: NETFLIX_TIERS[tier],
    day,
    category: 'Entertainment',
    startsMonthsAgo: since,
    ...(rose === undefined
      ? {}
      : {
          priceHistory: [
            { fromMonthsAgo: since, amount: NETFLIX_TIERS[rose.from] },
            { fromMonthsAgo: rose.monthsAgo, amount: NETFLIX_TIERS[tier] },
          ],
        }),
  }),
  spotify: (day: number, since: number): SubscriptionSpec => ({
    merchant: 'Spotify',
    amount: 119,
    day,
    category: 'Entertainment',
    startsMonthsAgo: since,
  }),
  /** The individual monthly price since August 2024, which is before any of these ledgers open. */
  youtube: (day: number, since: number): SubscriptionSpec => ({
    merchant: 'YouTube Premium',
    amount: 149,
    day,
    category: 'Entertainment',
    startsMonthsAgo: since,
  }),
  prime: (day: number, since: number): SubscriptionSpec => ({
    merchant: 'Amazon Prime',
    amount: 299,
    day,
    category: 'Shopping',
    startsMonthsAgo: since,
  }),
  hotstar: (day: number, since: number, forgotten = false): SubscriptionSpec => ({
    merchant: 'JioHotstar',
    amount: 299,
    day,
    category: 'Entertainment',
    startsMonthsAgo: since,
    ...(forgotten ? { forgotten } : {}),
  }),
  googleOne: (day: number, since: number): SubscriptionSpec => ({
    merchant: 'Google One',
    amount: 130,
    day,
    category: 'Shopping',
    startsMonthsAgo: since,
  }),
  audible: (day: number, since: number, forgotten = false): SubscriptionSpec => ({
    merchant: 'Audible',
    amount: 199,
    day,
    category: 'Entertainment',
    startsMonthsAgo: since,
    ...(forgotten ? { forgotten } : {}),
  }),
  cultfit: (
    amount: 1_499 | 2_499,
    day: number,
    since: number,
    forgotten = false,
  ): SubscriptionSpec => ({
    merchant: 'Cultfit',
    amount,
    day,
    category: 'Health',
    startsMonthsAgo: since,
    ...(forgotten ? { forgotten } : {}),
  }),
  sonyliv: (day: number, since: number, forgotten = false): SubscriptionSpec => ({
    merchant: 'SonyLIV',
    amount: 299,
    day,
    category: 'Entertainment',
    startsMonthsAgo: since,
    ...(forgotten ? { forgotten } : {}),
  }),
  microsoft: (day: number, since: number): SubscriptionSpec => ({
    merchant: 'Microsoft 365',
    amount: 489,
    day,
    category: 'Shopping',
    startsMonthsAgo: since,
  }),
}

/* ------------------------------------------------------------------ *
 * What they own
 * ------------------------------------------------------------------ */

/** A term deposit at the customer's own IDBI branch. An account, never also a holding. */
export function fd(
  last4: string,
  amount: number,
  opened: string,
  matures: string,
  rate: number,
  city: string,
): Account {
  return {
    accountNumberMasked: masked(last4),
    accountType: 'FD',
    currentBalance: amount,
    accountOpeningDate: opened,
    maturityDate: matures,
    interestRate: rate,
    branchIfsc: cityProfile(city).branchIfsc,
  }
}

/** A recurring deposit, which `derive` counts with the deposits rather than with holdings. */
export function rd(
  last4: string,
  balance: number,
  opened: string,
  matures: string,
  rate: number,
  city: string,
): Account {
  return { ...fd(last4, balance, opened, matures, rate, city), accountType: 'RD' }
}

/** A declared holding: something the statement cannot see, typed once by the customer. */
export function holding(
  holdingType: Holding['holdingType'],
  name: string,
  assetClass: Holding['assetClass'],
  investedAmount: number,
  currentValue: number,
  extra: Partial<Holding> = {},
): Holding {
  return { holdingType, name, assetClass, investedAmount, currentValue, sipActive: false, ...extra }
}

/**
 * Life cover in force. `derive` reads a policy as life cover by its name, so the name says
 * "Term" — which is also what the policy schedule a customer uploads would call it.
 */
export const termPolicy = (insurer: string, cover: number, annualPremium: number): Holding =>
  holding('INSURANCE', `${insurer} Term Plan`, 'Protection', cover, 0, {
    sumAssured: cover,
    annualPremium,
    custodian: insurer,
    heldOutsideIdbi: true,
  })

export const healthPolicy = (insurer: string, cover: number, annualPremium: number): Holding =>
  holding('INSURANCE', `${insurer} Health Insurance`, 'Protection', cover, 0, {
    sumAssured: cover,
    annualPremium,
    custodian: insurer,
    heldOutsideIdbi: true,
  })

/** The register entry each government micro-cover premium implies. Never one without the other. */
function govtPolicies(cover: readonly ('pmjjby' | 'pmsby')[]): Holding[] {
  return cover.map((c) =>
    c === 'pmjjby'
      ? holding(
          'INSURANCE',
          'PMJJBY, Pradhan Mantri Jeevan Jyoti Bima Yojana',
          'Protection',
          GOVT_COVER.coverAmount,
          0,
        )
      : holding(
          'INSURANCE',
          'PMSBY, Pradhan Mantri Suraksha Bima Yojana (accident)',
          'Protection',
          GOVT_COVER.coverAmount,
          0,
        ),
  )
}

/**
 * An annual premium paid from this account, as the two NEFT lines two years of statement hold.
 *
 * The policy is on the register; without the premium leaving somewhere the register asserts a
 * cover nothing pays for, which is the same incoherence `govtCover` exists to prevent.
 */
export function annualPremium(
  insurer: string,
  ifsc: string,
  amount: number,
  monthsAgo: number,
  day: number,
): LumpSpec[] {
  return [monthsAgo, monthsAgo + 12].map((m) => ({
    rail: 'neft' as const,
    payee: { name: insurer, ifsc, remark: 'PREMIUM' },
    category: 'Insurance' as const,
    amount,
    monthsAgo: m,
    day,
  }))
}

/* ------------------------------------------------------------------ *
 * Accounts elsewhere
 * ------------------------------------------------------------------ */

const BANKS = { HDFC, ICICI, KOTAK } as const

/** The date a `monthsAgo` and a day of the month land on, clamped as the generator clamps it. */
function onDay(monthsAgo: number, day: number): string {
  const { year, month } = ymd(addMonths(ANCHOR, -monthsAgo))
  return fromYmd(year, month, Math.min(day, daysInMonth(year, month)))
}

/**
 * The one-off lines on an account elsewhere, written by the same narration builders the
 * generator uses, so a satellite's statement passes the same grammar checks as the primary's.
 * The reference numbers are drawn from a stream named for the line, so they are stable.
 */
export const onceElsewhere = {
  /** A last salary, or a bonus, paid into an account that has since gone quiet. */
  salary: (
    monthsAgo: number,
    day: number,
    amount: number,
    employer: string,
    ifsc: string,
  ): SatelliteLump => ({
    monthsAgo,
    day,
    amount,
    type: 'CREDIT',
    narration: neftSalary(rng(amount).fork(`salary:${employer}:${monthsAgo}`), {
      date: onDay(monthsAgo, day),
      employer,
      ifsc,
    }),
    category: 'Income',
    mode: 'NEFT',
  }),
  /** Money from another person: a car sold, a plot sold, a parent's gift. */
  received: (
    monthsAgo: number,
    day: number,
    amount: number,
    from: string,
    ifsc: string,
    remark: string,
  ): SatelliteLump => ({
    monthsAgo,
    day,
    amount,
    type: 'CREDIT',
    narration: impsDebit(rng(amount).fork(`received:${from}:${monthsAgo}`), {
      date: onDay(monthsAgo, day),
      beneficiary: from,
      ifsc,
      remark,
    }),
    category: 'Transfers',
    mode: 'IMPS',
  }),
  /** Moved to the customer's own IDBI account. Leaves, but is not spent. */
  toSelf: (monthsAgo: number, day: number, amount: number, idbiBranch: string): SatelliteLump => ({
    monthsAgo,
    day,
    amount,
    type: 'DEBIT',
    narration: impsDebit(rng(amount).fork(`self:${idbiBranch}:${monthsAgo}`), {
      date: onDay(monthsAgo, day),
      beneficiary: 'SELF',
      ifsc: idbiBranch,
      remark: 'TRANSFER',
    }),
    category: 'Transfers',
    mode: 'IMPS',
    isSelfTransfer: true,
  }),
}

/**
 * An account at another bank. With `carries` it holds real flows; without, it is the old salary
 * account that only the bank's own interest credits ever touch.
 */
export function elsewhere(
  bank: keyof typeof BANKS,
  last4: string,
  options: {
    branch: string
    opened: string
    balance: number
    carries?: SpendCategory[]
    funding?: { amount: number; day: number }
    quietAfter?: number
    lumps?: SatelliteSpec['lumps']
    rate?: number
    type?: 'Savings' | 'Current'
  },
): SatelliteSpec {
  return {
    accountNumberMasked: masked(last4),
    institution: BANKS[bank],
    accountType: options.type ?? 'Savings',
    accountOpeningDate: options.opened,
    branchIfsc: options.branch,
    carries: options.carries ?? [],
    balanceAtAnchor: options.balance,
    interestRate: options.rate ?? (bank === 'KOTAK' ? 3.5 : 3.0),
    ...(options.funding === undefined ? {} : { monthlyFunding: options.funding }),
    ...(options.quietAfter === undefined ? {} : { quietAfterMonthsAgo: options.quietAfter }),
    ...(options.lumps === undefined ? {} : { lumps: options.lumps }),
  }
}

/* ------------------------------------------------------------------ *
 * The customer
 * ------------------------------------------------------------------ */

export interface BookCustomer {
  slug: string
  cif: string
  name: string
  dob: string
  gender: Customer['gender']
  marital: Customer['maritalStatus']
  dependents: number
  work: Customer['employmentType']
  city: string
  risk: Customer['riskProfile']
  since: string
  regime?: Customer['taxRegime']
  language?: string
  /** What the customer told the bank they earn a year. Defaults to twelve credits' worth. */
  declared?: number
  /** Last four digits of the IDBI savings account and of its debit card. */
  account: string
  card: string
  coverReference: string
  govtCover?: PersonaSpec['govtCover']
  employer: PersonaSpec['employer']
  /** A salary as a plain number: one NEFT credit on the 1st, the same every month. */
  income: number | PersonaSpec['income']
  rent?: PersonaSpec['rent']
  utilities?: boolean
  obligations?: PersonaSpec['obligations']
  subscriptions?: SubscriptionSpec[]
  emis?: EmiSpec[]
  sips?: SipSpec[]
  spend: {
    budget: number
    mix: Mix
    cardShare: number
    paydayBias?: number
  }
  drift?: PersonaSpec['drift']
  lumps?: LumpSpec[]
  opening: number
  deposits?: Account[]
  elsewhere?: SatelliteSpec[]
  holdings?: Holding[]
  policies?: Holding[]
  pitch: string
  demonstrates: string
}

/** A trader's or a professional's money: several credits a month from the people who pay them. */
export function collections(
  amount: number,
  variancePct: number,
  splits: number,
  payers: readonly PayeeSpec[],
  settlementAgent?: PayeeSpec,
): PersonaSpec['income'] {
  return {
    amount,
    day: 1,
    variancePct,
    splits,
    payers,
    ...(settlementAgent === undefined ? {} : { settlementAgent }),
  }
}

export function bookPersona(c: BookCustomer): PersonaSpec {
  const income: PersonaSpec['income'] =
    typeof c.income === 'number'
      ? { amount: c.income, day: 1, variancePct: 0, splits: 1 }
      : c.income
  const govtCover = c.govtCover ?? []
  const stateCode = STATE_CODE[c.city]
  if (stateCode === undefined) throw new Error(`no state code for ${c.city}`)

  return {
    slug: c.slug,
    // The date of birth as a number, as Karan's and Sunil's seeds are. Two customers born on one
    // day would still get different ledgers, because every stream is labelled with the slug, but
    // `book.test.ts` keeps the seeds unique so nothing has to lean on that.
    seed: Number(c.dob.replaceAll('-', '')),
    customer: {
      cif: c.cif,
      custId: `demo-${c.slug}`,
      custName: c.name,
      dateOfBirth: c.dob,
      gender: c.gender,
      maritalStatus: c.marital,
      dependents: c.dependents,
      employmentType: c.work,
      declaredAnnualIncome: c.declared ?? Math.round((income.amount * 12) / 10_000) * 10_000,
      city: c.city,
      stateCode,
      preferredLanguage: c.language ?? 'en-IN',
      riskProfile: c.risk,
      kycStatus: 'Verified',
      customerSince: c.since,
      taxRegime: c.regime ?? 'new',
    },
    employer: c.employer,
    accountNumberMasked: masked(c.account),
    cardLast4: c.card,
    coverReference: c.coverReference,
    govtCover,
    income,
    ...(c.rent === undefined ? {} : { rent: c.rent }),
    utilities: c.utilities ?? true,
    obligations: c.obligations ?? [],
    subscriptions: c.subscriptions ?? [],
    emis: c.emis ?? [],
    sips: c.sips ?? [],
    discretionary: {
      monthlyBudget: c.spend.budget,
      mix: c.spend.mix,
      paydayBias: c.spend.paydayBias ?? 0.55,
      cardShare: c.spend.cardShare,
    },
    ...(c.drift === undefined ? {} : { drift: c.drift }),
    lumps: c.lumps ?? [],
    openingBalance: c.opening,
    extraAccounts: c.deposits ?? [],
    ...(c.elsewhere === undefined ? {} : { satellites: c.elsewhere }),
    holdings: c.holdings ?? [],
    policies: [...(c.policies ?? []), ...govtPolicies(govtCover)],
    pitch: c.pitch,
    demonstrates: c.demonstrates,
  }
}
