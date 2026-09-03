/**
 * The merchant recognition dictionary.
 *
 * Cleo call this transaction enrichment, and they are candid that theirs is a database
 * accumulated over years. Ours is a table, and it is the first step of everything downstream:
 * `UPI/SWIGGY/412683940281` has to become Swiggy, and Swiggy has to become food delivery,
 * before any question about food spending can be answered.
 *
 * **This is deliberately not the same table `@dhan/fixtures` generates from.** That one carries
 * ticket sizes and frequencies for invention; this one carries patterns for recognition, and it
 * lists merchants the generator never emits. Sharing one table would make every categorisation
 * test circular — the generator would be marking its own homework — and would hide the case
 * that actually matters in production, which is the merchant nobody has seen before.
 */
import type { SpendCategory } from './types.ts'

export interface MerchantRule {
  /** Uppercase tokens. A narration matches if it contains any of them. */
  match: readonly string[]
  merchant: string
  category: SpendCategory
}

/**
 * Ordered, and the order matters: the first match wins, so anything ambiguous has to come
 * before the general case. "SWIGGY INSTAMART" is groceries and "SWIGGY" is food delivery, so
 * Instamart is listed first or every grocery order lands in the wrong category.
 */
export const MERCHANTS: readonly MerchantRule[] = [
  // Quick-commerce groceries. Ahead of their parent brands on purpose.
  { match: ['SWIGGY INSTAMART', 'INSTAMART'], merchant: 'Swiggy Instamart', category: 'Groceries' },
  { match: ['ZOMATO HYPERPURE'], merchant: 'Hyperpure', category: 'Groceries' },
  { match: ['BLINKIT', 'GROFERS'], merchant: 'Blinkit', category: 'Groceries' },
  { match: ['ZEPTO'], merchant: 'Zepto', category: 'Groceries' },
  { match: ['BIGBASKET', 'BB DAILY'], merchant: 'BigBasket', category: 'Groceries' },
  { match: ['DMART', 'AVENUE SUPERMART'], merchant: 'DMart', category: 'Groceries' },
  {
    match: ['RELIANCE FRESH', 'RELIANCE SMART', 'JIOMART'],
    merchant: 'Reliance Retail',
    category: 'Groceries',
  },
  {
    // Lulu is the weekly shop in Kochi the way DMart is in Indore. Listed before the mall rule
    // below, because "Lulu Mall" is an afternoon out and "Lulu Hypermarket" is the groceries.
    match: ['LULU HYPERMARKET', 'MORE RETAIL', 'SPENCER', 'STAR BAZAAR', 'NILGIRIS'],
    merchant: 'Supermarket',
    category: 'Groceries',
  },
  {
    match: ['KIRANA', 'GENERAL STORE', 'PROVISION'],
    merchant: 'Local kirana',
    category: 'Groceries',
  },
  {
    match: ['LICIOUS', 'FRESHTOHOME', 'ZAPPFRESH'],
    merchant: 'Meat delivery',
    category: 'Groceries',
  },

  // Food and dining.
  { match: ['SWIGGY'], merchant: 'Swiggy', category: 'Food & dining' },
  { match: ['ZOMATO', 'EATSURE'], merchant: 'Zomato', category: 'Food & dining' },
  {
    match: ['DOMINOS', 'PIZZA HUT', 'MCDONALD', 'BURGER KING', 'KFC', 'SUBWAY'],
    merchant: 'Fast food',
    category: 'Food & dining',
  },
  {
    match: [
      'STARBUCKS',
      'THIRD WAVE',
      'BLUE TOKAI',
      'CAFE COFFEE DAY',
      'CCD',
      'CHAAYOS',
      'CHAI POINT',
      'INDIAN COFFEE HOUSE',
    ],
    merchant: 'Coffee shop',
    category: 'Food & dining',
  },
  { match: ['TAPRI', 'CHAI', 'TEA STALL'], merchant: 'Tapri', category: 'Food & dining' },
  {
    match: ['RESTAURANT', 'DHABA', 'BHOJANALAY', 'BAZAAR', 'FOODS', 'KITCHEN', 'BIRYANI'],
    merchant: 'Restaurant',
    category: 'Food & dining',
  },

  // Transport.
  { match: ['RAPIDO'], merchant: 'Rapido', category: 'Transport' },
  { match: ['UBER'], merchant: 'Uber', category: 'Transport' },
  { match: ['OLA', 'ANI TECHNOLOGIES'], merchant: 'Ola', category: 'Transport' },
  { match: ['NAMMA YATRI'], merchant: 'Namma Yatri', category: 'Transport' },
  {
    match: [
      'INDIAN OIL',
      'IOCL',
      'HPCL',
      'BHARAT PETRO',
      'BHARAT PETROLEUM',
      'BPCL',
      'SHELL',
      'NAYARA',
    ],
    merchant: 'Fuel',
    category: 'Transport',
  },
  {
    match: ['IRCTC', 'REDBUS', 'ABHIBUS', 'RAILWAY'],
    merchant: 'Rail & bus',
    category: 'Transport',
  },
  {
    match: ['METRO', 'CITY BUS', 'MSRTC', 'BEST UNDERTAKING', 'FASTAG'],
    merchant: 'Public transport',
    category: 'Transport',
  },

  // Shopping.
  { match: ['AMAZON', 'AMZN'], merchant: 'Amazon', category: 'Shopping' },
  { match: ['FLIPKART', 'FKRT'], merchant: 'Flipkart', category: 'Shopping' },
  { match: ['MYNTRA'], merchant: 'Myntra', category: 'Shopping' },
  { match: ['AJIO'], merchant: 'Ajio', category: 'Shopping' },
  { match: ['MEESHO', 'SNAPDEAL'], merchant: 'Meesho', category: 'Shopping' },
  { match: ['NYKAA', 'PURPLLE'], merchant: 'Nykaa', category: 'Shopping' },
  { match: ['DECATHLON'], merchant: 'Decathlon', category: 'Shopping' },
  {
    match: ['CROMA', 'RELIANCE DIGITAL', 'VIJAY SALES', 'APPLE INDIA'],
    merchant: 'Electronics',
    category: 'Shopping',
  },
  {
    match: [
      'LENSKART',
      'TITAN',
      'TANISHQ',
      'WESTSIDE',
      'PANTALOONS',
      'LIFESTYLE',
      'MAX FASHION',
      'ZUDIO',
    ],
    merchant: 'Retail',
    category: 'Shopping',
  },
  {
    match: ['MALL', 'TREASURE ISLAND', 'PHOENIX', 'EMPRESS CITY'],
    merchant: 'Shopping mall',
    category: 'Shopping',
  },
  {
    match: ['ADOBE', 'MICROSOFT 365', 'GOOGLE ONE', 'CANVA', 'FIGMA'],
    merchant: 'Software',
    category: 'Shopping',
  },
  {
    match: [
      'MAKEMYTRIP',
      'GOIBIBO',
      'IXIGO',
      'CLEARTRIP',
      'OYO',
      'AIRBNB',
      'INDIGO',
      'AIR INDIA',
      'VISTARA',
    ],
    merchant: 'Travel',
    category: 'Shopping',
  },

  // Entertainment.
  { match: ['NETFLIX'], merchant: 'Netflix', category: 'Entertainment' },
  { match: ['SPOTIFY', 'GAANA', 'WYNK'], merchant: 'Spotify', category: 'Entertainment' },
  {
    match: ['HOTSTAR', 'JIOCINEMA', 'JIOHOTSTAR', 'SONYLIV', 'ZEE5', 'PRIME VIDEO'],
    merchant: 'Streaming',
    category: 'Entertainment',
  },
  {
    match: ['AUDIBLE', 'KINDLE', 'CROSSWORD', 'BOOK'],
    merchant: 'Books',
    category: 'Entertainment',
  },
  {
    match: ['BOOKMYSHOW', 'PVR', 'INOX', 'CINEPOLIS'],
    merchant: 'Cinema',
    category: 'Entertainment',
  },
  {
    match: ['STEAM', 'PLAYSTATION', 'XBOX', 'NINTENDO', 'SMAAASH'],
    merchant: 'Games',
    category: 'Entertainment',
  },

  // Health. Gym memberships sit here because that is where a customer looks for them.
  {
    match: ['CULTFIT', 'CULT.FIT', 'CUREFIT', 'GOLDS GYM', 'ANYTIME FITNESS'],
    merchant: 'Cult.fit',
    category: 'Health',
  },
  {
    match: ['APOLLO', 'PHARMEASY', '1MG', 'TATA 1MG', 'NETMEDS', 'MEDPLUS', 'WELLNESS FOREVER'],
    merchant: 'Pharmacy',
    category: 'Health',
  },
  {
    match: ['PRACTO', 'HOSPITAL', 'CLINIC', 'DIAGNOSTIC', 'PATHLABS', 'LAL PATH', 'THYROCARE'],
    merchant: 'Healthcare',
    category: 'Health',
  },

  // Bills and utilities.
  {
    match: ['JIO', 'AIRTEL', 'VODAFONE', 'VI', 'BSNL'],
    merchant: 'Mobile',
    category: 'Rent & bills',
  },
  {
    match: ['ACT FIBERNET', 'HATHWAY', 'EXCITEL', 'ASIANET', 'BROADBAND', 'FIBER'],
    merchant: 'Broadband',
    category: 'Rent & bills',
  },
  {
    match: [
      'MPPKVVCL',
      'MSEDCL',
      'KSEB',
      'KERALA STATE ELECTRICITY',
      'BESCOM',
      'TATA POWER',
      'ADANI ELECTRICITY',
      'TORRENT POWER',
      'ELECTRICITY',
      'DISCOM',
    ],
    merchant: 'Electricity',
    category: 'Rent & bills',
  },
  {
    match: ['GAS', 'INDANE', 'HP GAS', 'MAHANAGAR', 'IOAGPL', 'AVANTIKA GAS', 'GAIL GAS'],
    merchant: 'Gas',
    category: 'Rent & bills',
  },
  { match: ['MUNICIPAL', 'WATER', 'PROPERTY TAX'], merchant: 'Civic', category: 'Rent & bills' },

  // Education.
  {
    match: [
      'VIDYALAYA',
      'SCHOOL',
      'COLLEGE',
      'UNIVERSITY',
      'TUITION',
      'FEES',
      'BYJU',
      'UNACADEMY',
      'COURSERA',
      'UDEMY',
    ],
    merchant: 'Education',
    category: 'Education',
  },

  // Lenders, as a NACH mandate names them.
  //
  // A real `ACH-DR-` line identifies the creditor and nothing else — no "EMI", no loan account,
  // no purpose. So recognising a loan instalment means recognising the lender, which is the
  // actual job an enrichment dictionary does in production and the reason these are rows here
  // rather than a keyword. Ahead of the investment mandates because a finance company's name
  // and an AMC's are the same kind of string.
  {
    match: [
      'IDBI BANK RETAIL ASSETS',
      'BAJAJ FINANCE',
      'BAJAJ FINSERV',
      'HDB FINANCIAL',
      'TATA CAPITAL',
      'CHOLAMANDALAM',
      'MUTHOOT FINANCE',
      'CAPITAL TRUST',
    ],
    merchant: 'Lender',
    category: 'Loan EMI',
  },

  // The clearing corporations that actually collect a mutual-fund SIP. The scheme name appears
  // nowhere on the line: the mandate is held by the exchange, not by the AMC, which is why a
  // dictionary that only knows fund houses finds no SIPs at all.
  {
    match: ['INDIAN CLEARING CORP', 'NSECLEARINGLIMITED', 'NSE CLEARING', 'ICCL', 'BSE STAR MF'],
    merchant: 'Mutual fund',
    category: 'Investment',
  },

  // Investment and insurance mandates.
  {
    match: [
      'MUTUAL FUND',
      'MF',
      'AMC',
      'FOLIO',
      'NIPPON',
      'HDFC MF',
      'ICICI PRU',
      'AXIS FLEXI',
      'UTI NIFTY',
      'LIC MF',
    ],
    merchant: 'Mutual fund',
    category: 'Investment',
  },
  { match: ['NPS', 'PROTEAN', 'PFRDA'], merchant: 'NPS', category: 'Investment' },
  { match: ['PPF', 'SUKANYA'], merchant: 'Small savings', category: 'Investment' },
  {
    match: [
      'LIC OF INDIA',
      'PREMIUM',
      'NIVA BUPA',
      'STAR HEALTH',
      'HDFC LIFE',
      'ICICI LOMBARD',
      'TATA AIG',
      'NEW INDIA ASSURANCE',
      'INSURANCE',
    ],
    merchant: 'Insurance',
    category: 'Insurance',
  },
]

/**
 * Keyword rules, applied when no merchant matched.
 *
 * These read the *structure* of the narration rather than a brand: `-SALARY` on an inbound NEFT,
 * `/EMI` on a mandate, `ATW` on a withdrawal. They catch the categories that matter most and
 * that have no merchant at all — which is why they are separate from the table above rather
 * than a row in it.
 */
export const KEYWORDS: readonly { match: readonly string[]; category: SpendCategory }[] = [
  { match: ['SALARY', 'SAL CR', 'PAYROLL', 'WAGES'], category: 'Income' },
  // The bank's own credit. Every statement carries four of these a year and none of them has a
  // merchant, so without this rule the most predictable line in the ledger is unexplained.
  {
    match: ['SB INT CR', 'CREDIT INTEREST', 'INT PD', 'SAVINGS INTEREST', 'INT CREDIT'],
    category: 'Income',
  },
  { match: ['EMI', 'LOAN REPAY', 'INSTALLMENT', 'INSTALMENT'], category: 'Loan EMI' },
  // `CreditCard Payment XX 1184 Ref#…` is one word in the bank's own spelling, which is why the
  // spaced forms below do not catch it and why both spellings have to be listed.
  {
    match: ['CREDIT CARD', 'CREDITCARD', 'CC PAYMENT', 'CARD PAYMENT'],
    category: 'Loan EMI',
  },
  { match: ['RENT'], category: 'Rent & bills' },
  { match: ['SIP', 'SYSTEMATIC'], category: 'Investment' },
  { match: ['ATW', 'ATM', 'CASH WDL', 'NWD'], category: 'Cash' },
  // `CHGS` is the abbreviation a Finacle bank actually prints; `CHARGES` almost never appears.
  {
    match: ['CHARGES', 'CHGS', 'FEE', 'GST', 'PENAL', 'BOUNCE', 'MIN BAL'],
    category: 'Fees & charges',
  },
  { match: ['P2A', 'P2P', 'TRANSFER', 'NEFT-DR', 'IMPS-DR'], category: 'Transfers' },
  // Money arriving at a business account: a QR-aggregator settlement, a customer's UPI credit,
  // the day's takings banked at a machine. No payroll flag exists on any of them, which is
  // exactly what makes deriving a stable income for a shop owner real work.
  {
    match: ['COLLECTION', 'RECEIPT', 'SETTLEMENT', 'SHOP SALE', 'CASH DEP'],
    category: 'Income',
  },
]
