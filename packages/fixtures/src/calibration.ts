/**
 * The public numbers the generator is calibrated against, with the source for each.
 *
 * Everything here is a **citation, not a preference**. A banker reading a generated statement
 * is going to test two things: whether the lines look like his own bank's, and whether the
 * figures are ones he recognises. The first is narration grammar; the second is this file. If a
 * number in the ledger cannot be traced to a row below, it is a number we invented, and the
 * moment somebody notices that, every other figure becomes suspect too.
 *
 * `[verify]` marks a value we could not confirm against a primary source and that a banker
 * should be asked about before this goes in front of one. `[inference]` marks a value derived
 * from a documented rule rather than published directly.
 *
 * The prose companion to this file is `docs/engineering/data-calibration.md`, which records
 * the periods and the URLs. Keep the two in step: this is what the code reads, that is what a
 * reviewer reads.
 */

/* ------------------------------------------------------------------ *
 * The bank's own arithmetic
 * ------------------------------------------------------------------ */

/**
 * IDBI savings interest, as marginal slabs on the daily closing balance.
 *
 * RBI's Master Direction on Interest Rate on Deposits requires interest on a savings account to
 * be computed on the daily product of the closing balance and credited at quarterly or shorter
 * intervals, rounded to the nearest rupee. That last clause is why interest is the one line in
 * this ledger that carries no paise.
 */
export const SAVINGS_INTEREST_SLABS: readonly { upTo: number; ratePct: number }[] = [
  { upTo: 100_000, ratePct: 2.5 },
  { upTo: 500_000, ratePct: 2.55 },
  { upTo: Number.POSITIVE_INFINITY, ratePct: 2.6 },
]

/** Days in the interest year. RBI leaves the convention to the bank; 365 is the common one. */
export const INTEREST_DAY_COUNT = 365

/**
 * Charges from IDBI's published schedule of fees for the Advantage Savings account.
 *
 * The minimum-average-balance tier for Indore, Kochi and Nagpur is **[inference]**: the schedule
 * names metro / semi-urban / rural bands without listing branches, and all three cities sit in
 * the upper band on every classification we could find.
 */
export const BANK_CHARGES = {
  /** Per SMS alert, billed at the end of each quarter. */
  smsAlertPerMessage: 0.25,
  /** On every fee a bank levies. Presented as its own line, never folded into the charge. */
  gstPct: 18,
  /** Minimum average balance the account has to hold before a shortfall is charged. */
  minAverageBalance: 10_000,
  /** Per month, on the shortfall — not on the balance. */
  mabShortfallPct: 6,
  /** The cap that makes the charge survivable, and the reason it is never a large number. */
  mabShortfallCap: 300,
  /** One month's grace before a shortfall is charged at all. */
  mabGraceMonths: 1,
  /** Levied when a NACH mandate is returned unpaid. */
  nachReturn: 300,
} as const

/* ------------------------------------------------------------------ *
 * Products a persona actually holds
 * ------------------------------------------------------------------ */

/**
 * IDBI's credit-card finance charge: 2.90% per month, which is 34.8% a year simple.
 *
 * The persona used to carry 42%, which is at the very top of what any Indian issuer charges and
 * is not IDBI's number. 34.8% is still far above anything on the shelf, so the refusal the
 * customer hears is unchanged — it is only now a rate a banker can look up.
 */
export const CARD_FINANCE_RATE_PA = 34.8

/**
 * PMJJBY and PMSBY: the two government covers, and the date they are auto-debited.
 *
 * The mandate runs before 1 June for the year beginning that month, so the debit lands in the
 * last days of May. Two lines, not one — they are separate schemes with separate insurers.
 */
export const GOVT_COVER = {
  pmjjbyAnnual: 436,
  pmsbyAnnual: 20,
  /** Day of May the auto-debit is presented. */
  debitDay: 28,
  coverAmount: 200_000,
} as const

/**
 * Netflix India's published tiers. The persona's old ₹799 was not one of them.
 *
 * Carried here rather than in the persona so that "the price went up" stays a step between two
 * real prices, which is the only version of that insight a customer can check.
 */
export const NETFLIX_TIERS = { mobile: 149, basic: 199, standard: 499, premium: 649 } as const

/**
 * LIC's Digi Term at ₹1 crore for a 29-year-old non-smoker: about ₹11,800 a year before GST,
 * which is ₹985 a month. The shelf quoted ₹880, which is a real premium for nobody.
 */
export const TERM_PREMIUM_MONTHLY_AGE_29 = 985

/* ------------------------------------------------------------------ *
 * How Indians actually pay
 * ------------------------------------------------------------------ */

/**
 * The bands the emergent statistics of a generated ledger have to land inside.
 *
 * These are the calibration test's assertions, and they are deliberately wider than the
 * published point estimates: the generator is producing three specific people, not the national
 * average, and a band is the honest way to say "this looks like the population it came from".
 */
export const UPI_CALIBRATION = {
  /** NPCI, July 2026: the national mean person-to-merchant ticket. */
  p2mTicketMean: 606,
  /**
   * The band a *household* with these envelopes can actually produce.
   *
   * Deliberately below the national mean, and the reason is arithmetic rather than tuning:
   * `mean × count = the money that left the account`. Rohan spends about ₹14,000 a month
   * through UPI at merchants. Forty payments out of that is a mean of ₹350; a mean of ₹606
   * is twenty-three payments. Both figures are published, and at this envelope they are
   * mutually exclusive — so the generator holds the two a banker actually eyeballs (how many
   * lines a month, and how many of them are small) and lets the mean fall where the arithmetic
   * puts it. The national ₹606 is an average over a population that includes merchants paying
   * merchants, which none of these three does.
   */
  p2mTicketMeanBand: [300, 520] as const,
  /** RBI Payment System Report: 86% of P2M payments are below ₹500. */
  p2mShareBelow500: 0.86,
  p2mShareBelow500Band: [0.74, 0.9] as const,
  /** NPCI FY26: 36–44 UPI transactions a month per onboarded user. */
  debitsPerMonthBand: [34, 50] as const,
} as const

/**
 * Household spending shares from the HCES 2023-24 urban factsheet, for reference when a
 * persona's discretionary mix is edited. Not enforced: a persona is a person, not a mean.
 */
export const HCES_URBAN_SHARES = {
  food: 0.397,
  conveyance: 0.085,
  rent: 0.066,
  education: 0.06,
  medical: 0.059,
  fuelAndLight: 0.056,
} as const

/* ------------------------------------------------------------------ *
 * MCC
 * ------------------------------------------------------------------ */

/**
 * ISO 18245 merchant category codes, by the kind of merchant.
 *
 * Every card line and every UPI payment to a merchant carries one on the real rails, and it is
 * the one field on a statement that is machine-readable without any enrichment at all. UPI
 * person-to-person carries none, which is why `null` has to be a legal value everywhere this is
 * used rather than a default of 0000.
 */
export const MCC = {
  foodDelivery: '5812',
  cafe: '5814',
  restaurant: '5812',
  grocery: '5411',
  kirana: '5499',
  rideHailing: '4121',
  fuel: '5541',
  rail: '4112',
  transit: '4111',
  marketplace: '5399',
  ecommerce: '5999',
  apparel: '5651',
  cosmetics: '5977',
  bookstore: '5942',
  electronics: '5732',
  cinema: '7832',
  streaming: '5815',
  pharmacy: '5912',
  hospital: '8062',
  labs: '8071',
  gym: '7997',
  utilities: '4900',
  telecom: '4814',
  broadband: '4816',
  insurance: '6300',
  investments: '6211',
  loanRepayment: '6012',
  school: '8211',
  travelAgency: '4722',
  hotel: '7011',
  airline: '4511',
} as const

export type MccCode = (typeof MCC)[keyof typeof MCC]

/* ------------------------------------------------------------------ *
 * Cities
 * ------------------------------------------------------------------ */

export interface CityProfile {
  /** The branch the account is held at. Real IDBI branch codes for the city. */
  branchIfsc: string
  /** Where an ATM withdrawal happens, as it is printed on the line. */
  localities: readonly string[]
  /** The electricity distribution company that actually bills this city. */
  electricity: { biller: string; band: readonly [number, number] }
  /** Piped gas where the city has it, a cylinder refill where it does not. */
  gas: { biller: string; band: readonly [number, number]; piped: boolean }
  /** The broadband provider that actually sells here. ACT is in none of these three cities. */
  broadband: { biller: string; monthly: number }
  /** Prepaid mobile. Every persona is on a monthly-equivalent pack. */
  mobile: { biller: string; monthly: number }
  /** The festival window that moves money in this city and not in the others. */
  regionalFestival: 'onam' | 'ganesh-chaturthi' | null
}

/**
 * The three cities, each billed by the utilities that genuinely operate there.
 *
 * This is the detail that gives the whole ledger away if it is wrong. An Indore statement
 * carrying a KSEB electricity bill is not a statement anybody in the room believes, and a
 * reviewer from the bank will spot it before they read a single figure.
 */
export const CITIES: Readonly<Record<string, CityProfile>> = {
  Indore: {
    branchIfsc: 'IBKL0000155',
    localities: ['VIJAY NAGAR', 'PALASIA', 'RAJWADA', 'BHAWARKUA'],
    electricity: { biller: 'MPPKVVCL', band: [1_400, 3_200] },
    gas: { biller: 'AVANTIKA GAS', band: [780, 1_180], piped: true },
    broadband: { biller: 'JIO FIBER', monthly: 699 },
    mobile: { biller: 'JIO PREPAID', monthly: 349 },
    regionalFestival: null,
  },
  Kochi: {
    branchIfsc: 'IBKL0000137',
    localities: ['ERNAKULAM', 'KALOOR', 'PANAMPILLY NAGAR', 'EDAPPALLY'],
    electricity: { biller: 'KSEB', band: [1_100, 2_600] },
    gas: { biller: 'IOAGPL', band: [640, 1_050], piped: true },
    broadband: { biller: 'ASIANET BROADBAND', monthly: 849 },
    mobile: { biller: 'AIRTEL PREPAID', monthly: 399 },
    regionalFestival: 'onam',
  },
  Nagpur: {
    branchIfsc: 'IBKL0000510',
    localities: ['SITABULDI', 'DHARAMPETH', 'SADAR', 'WARDHAMAN NAGAR'],
    electricity: { biller: 'MSEDCL', band: [1_300, 3_400] },
    // No piped gas on this side of the city, so it is a cylinder when the old one runs out —
    // which is why it is not a monthly line and why it is not the same amount twice.
    gas: { biller: 'INDANE GAS', band: [853, 903], piped: false },
    broadband: { biller: 'JIO FIBER', monthly: 599 },
    mobile: { biller: 'AIRTEL PREPAID', monthly: 349 },
    regionalFestival: 'ganesh-chaturthi',
  },
}

export function cityProfile(city: string): CityProfile {
  const found = CITIES[city]
  if (!found)
    throw new Error(`no city profile for "${city}" — have ${Object.keys(CITIES).join(', ')}`)
  return found
}

/* ------------------------------------------------------------------ *
 * Bank codes
 * ------------------------------------------------------------------ */

/** IDBI's own IFSC prefix. `IDIB` is Indian Bank's, and the generator used to emit it. */
export const IDBI_IFSC_PREFIX = 'IBKL'

/** The four-letter code an NPCI narration carries in place of the full IFSC. */
export const IDBI_BANK4 = 'IBKL'

/** IDBI's UPI handle, for the personas' own VPAs. */
export const IDBI_UPI_HANDLE = 'idbi'

/**
 * Four-letter bank codes that appear in the payee position of a UPI narration.
 *
 * Real prefixes, so a reviewer who looks one up finds the bank we implied. Federal is in the
 * list because it is everywhere in Kochi and nowhere in the other two cities.
 */
export const BANK4_CODES = [
  'HDFC',
  'ICIC',
  'UTIB',
  'SBIN',
  'KKBK',
  'YESB',
  'PYTM',
  'BARB',
  'FDRL',
  'PUNB',
] as const

/* ------------------------------------------------------------------ *
 * Festivals
 * ------------------------------------------------------------------ */

export interface FestivalDate {
  name: string
  /** The day itself. The window is built around it. */
  on: string
  /** Days before the day that spending starts to lift. */
  leadDays: number
  /** Days after it that spending stays lifted. */
  trailDays: number
  intensity: number
  /** Where it moves money. `null` means everywhere. */
  city: string | null
}

/**
 * Festival days by actual date, not by "late October".
 *
 * The lunar calendar moves these by up to three weeks a year, and a Diwali spike that lands in
 * the wrong week is the kind of thing that reads as synthetic to anybody who lives here. Dates
 * for 2024–2026 are the published ones; 2027 and 2028 are `[verify]` — they are inside the
 * seeded forward horizon but nobody demoing will reach them.
 */
export const FESTIVAL_DAYS: readonly FestivalDate[] = [
  // Diwali. The window opens at Dhanteras and closes after Bhai Dooj.
  { name: 'Diwali', on: '2024-11-01', leadDays: 12, trailDays: 3, intensity: 2.4, city: null },
  { name: 'Diwali', on: '2025-10-20', leadDays: 12, trailDays: 3, intensity: 2.4, city: null },
  { name: 'Diwali', on: '2026-11-08', leadDays: 12, trailDays: 3, intensity: 2.4, city: null },
  { name: 'Diwali', on: '2027-10-29', leadDays: 12, trailDays: 3, intensity: 2.4, city: null },
  { name: 'Diwali', on: '2028-10-17', leadDays: 12, trailDays: 3, intensity: 2.4, city: null },

  { name: 'Holi', on: '2025-03-14', leadDays: 5, trailDays: 1, intensity: 1.4, city: null },
  { name: 'Holi', on: '2026-03-04', leadDays: 5, trailDays: 1, intensity: 1.4, city: null },
  { name: 'Holi', on: '2027-03-22', leadDays: 5, trailDays: 1, intensity: 1.4, city: null },
  { name: 'Holi', on: '2028-03-11', leadDays: 5, trailDays: 1, intensity: 1.4, city: null },

  // Onam is Kerala's, and it moves more money in Kochi than Diwali does.
  { name: 'Onam', on: '2024-09-15', leadDays: 10, trailDays: 2, intensity: 2.2, city: 'Kochi' },
  { name: 'Onam', on: '2025-09-05', leadDays: 10, trailDays: 2, intensity: 2.2, city: 'Kochi' },
  { name: 'Onam', on: '2026-08-26', leadDays: 10, trailDays: 2, intensity: 2.2, city: 'Kochi' },
  { name: 'Onam', on: '2027-09-14', leadDays: 10, trailDays: 2, intensity: 2.2, city: 'Kochi' },
  { name: 'Onam', on: '2028-09-01', leadDays: 10, trailDays: 2, intensity: 2.2, city: 'Kochi' },

  // Ganesh Chaturthi runs for ten days in Maharashtra and the spending runs with it.
  {
    name: 'Ganesh Chaturthi',
    on: '2024-09-07',
    leadDays: 4,
    trailDays: 10,
    intensity: 1.8,
    city: 'Nagpur',
  },
  {
    name: 'Ganesh Chaturthi',
    on: '2025-08-27',
    leadDays: 4,
    trailDays: 10,
    intensity: 1.8,
    city: 'Nagpur',
  },
  {
    name: 'Ganesh Chaturthi',
    on: '2026-09-14',
    leadDays: 4,
    trailDays: 10,
    intensity: 1.8,
    city: 'Nagpur',
  },
  {
    name: 'Ganesh Chaturthi',
    on: '2027-09-04',
    leadDays: 4,
    trailDays: 10,
    intensity: 1.8,
    city: 'Nagpur',
  },
  {
    name: 'Ganesh Chaturthi',
    on: '2028-08-23',
    leadDays: 4,
    trailDays: 10,
    intensity: 1.8,
    city: 'Nagpur',
  },
]

/** Wedding season. Not a date, a stretch of the calendar, and it repeats every year. */
export const WEDDING_SEASON = {
  fromMonthDay: '11-20',
  toMonthDay: '12-15',
  intensity: 1.6,
} as const
