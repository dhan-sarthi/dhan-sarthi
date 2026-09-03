/**
 * Indian merchants, by city, with the fields the real rails carry.
 *
 * The narration strings matter more than they look. Transaction enrichment — deciding that a
 * line is Swiggy and Swiggy is food delivery — is the first step in our pipeline, so if the
 * generator emits clean labels we would be testing enrichment against data that needs no
 * enriching, and the demo falls over the moment it meets a real IDBI statement.
 *
 * Three things changed here in the realism pass, and each is something a banker checks.
 *
 * **Merchants are city-correct.** A Kochi statement bills KSEB, not MPPKVVCL, and shops at Lulu,
 * not Treasure Island. The old table put Indore's utilities on all three personas, which is the
 * single fastest way to be caught.
 *
 * **Tickets are Gamma-distributed around a mean, not uniform inside a band.** NPCI's average
 * person-to-merchant payment is ₹606 and RBI's own report says 86% of them are under ₹500. Those
 * two are only true together if the distribution has a long right tail — thirty chai payments
 * and one month of groceries — and a uniform draw cannot produce that shape at all.
 *
 * **Every merchant carries an MCC and, on UPI, a VPA.** These are columns on the real feed
 * (`bank.transactions.mcc`, `counterparty_vpa`), and a generator that leaves them null is
 * exercising an ingestion path that does not exist.
 *
 * The narration *forms* live in `narration.ts`; this file supplies the parts they are built
 * from. Keeping them apart is what lets one rail's grammar change without touching two hundred
 * merchant rows.
 */
import type { SpendCategory, TxnMode } from '@dhan/core'
import { MCC, cityProfile } from './calibration.ts'

export interface Merchant {
  /** The merchant a human would name. What enrichment is supposed to recover. */
  name: string
  category: SpendCategory
  /** UPI or card. Nothing else reaches a shop. */
  mode: Extract<TxnMode, 'UPI' | 'CARD'>
  /** The plausible range of a single ticket, inclusive. The draw is clamped into it. */
  amount: readonly [number, number]
  /** Where the Gamma sits. Well below the midpoint for anything people buy often. */
  ticketMean: number
  /** Gamma shape. 1.4 is heavily skewed; 2.4 is nearly symmetric. */
  shape: number
  /** Relative frequency inside its category. */
  weight: number
  mcc: string
  /** The handle the payee is registered under. UPI lines only. */
  vpa?: string
  /** The payee's bank, four letters, as the NPCI line prints it. */
  bank4?: string
  /** The remark the payer's app attached. Kept clear of any token the dictionary matches on. */
  remark?: string
  /** Only available in this city. Absent means national. */
  city?: string
  /** True where the card is present at a terminal rather than used online. */
  cardPresent?: boolean
}

const m = (
  name: string,
  category: SpendCategory,
  amount: readonly [number, number],
  ticketMean: number,
  weight: number,
  extra: Partial<Merchant> & { mcc: string },
): Merchant => ({
  name,
  category,
  mode: 'UPI',
  amount,
  ticketMean,
  shape: 1.4,
  weight,
  ...extra,
})

/* ------------------------------------------------------------------ *
 * Discretionary pools
 * ------------------------------------------------------------------ */

/**
 * Discretionary spending, by category.
 *
 * Ticket sizes are the point of this table. The insight that matters is not "you spent a lot on
 * shopping" — it is that thirty ₹35 chai payments add up to more than the one ₹7,400 order
 * anybody actually remembers, and that only shows up if the small tickets genuinely dominate
 * the count rather than merely appearing in it.
 */
export const DISCRETIONARY: Record<string, readonly Merchant[]> = {
  'Food & dining': [
    m('Swiggy', 'Food & dining', [140, 650], 300, 20, {
      mcc: MCC.foodDelivery,
      vpa: 'swiggy.rzp@icici',
      bank4: 'ICIC',
      remark: 'ORDER',
    }),
    m('Zomato', 'Food & dining', [150, 640], 290, 16, {
      mcc: MCC.foodDelivery,
      vpa: 'zomato@hdfcbank',
      bank4: 'HDFC',
      remark: 'ORDER',
    }),
    m('Dominos', 'Food & dining', [280, 700], 400, 8, {
      shape: 1.6,
      mcc: MCC.restaurant,
      vpa: 'dominos@ybl',
      bank4: 'YESB',
      remark: 'ORDER',
    }),
    m('Chaayos', 'Food & dining', [80, 320], 140, 9, {
      mcc: MCC.cafe,
      vpa: 'chaayos@paytm',
      bank4: 'PYTM',
      remark: 'QR PAY',
    }),
    m('Third Wave Coffee', 'Food & dining', [160, 520], 250, 6, {
      shape: 1.6,
      mcc: MCC.cafe,
      vpa: 'thirdwave@icici',
      bank4: 'ICIC',
      remark: 'QR PAY',
    }),
    // The right-hand tail. Without a handful of ₹2,000 tickets on the UPI side, the average
    // payment collapses to the price of a chai and the published mean becomes unreachable.
    m('Swiggy Dineout', 'Food & dining', [900, 4_500], 2_200, 9, {
      shape: 2.2,
      mcc: MCC.restaurant,
      vpa: 'dineout.rzp@icici',
      bank4: 'ICIC',
      remark: 'ORDER',
    }),
    m('Pizza Hut', 'Food & dining', [500, 1_800], 950, 9, {
      mode: 'CARD',
      cardPresent: true,
      shape: 2,
      mcc: MCC.restaurant,
    }),
    m('Starbucks', 'Food & dining', [300, 1_200], 620, 8, {
      mode: 'CARD',
      cardPresent: true,
      shape: 1.8,
      mcc: MCC.cafe,
    }),

    // Indore's overnight food street. Cash-sized tickets, paid by QR like everything else now.
    m('Sarafa Bazaar', 'Food & dining', [60, 520], 165, 8, {
      mcc: MCC.restaurant,
      vpa: 'sarafafoods@ybl',
      bank4: 'YESB',
      remark: 'QR PAY',
      city: 'Indore',
    }),
    m('Tapri Chai', 'Food & dining', [20, 80], 35, 22, {
      shape: 1.6,
      mcc: MCC.cafe,
      vpa: 'tapri@ybl',
      bank4: 'YESB',
      remark: 'QR PAY',
      city: 'Indore',
    }),
    m('Sayaji Kitchen', 'Food & dining', [800, 4_000], 1_900, 6, {
      mode: 'CARD',
      cardPresent: true,
      shape: 2.2,
      mcc: MCC.restaurant,
      city: 'Indore',
    }),

    m('Indian Coffee House', 'Food & dining', [40, 260], 90, 20, {
      shape: 1.5,
      mcc: MCC.cafe,
      vpa: 'ich.ekm@fedbnk',
      bank4: 'FDRL',
      remark: 'QR PAY',
      city: 'Kochi',
    }),
    m('Kayees Biryani', 'Food & dining', [120, 560], 230, 10, {
      mcc: MCC.restaurant,
      vpa: 'kayees@fedbnk',
      bank4: 'FDRL',
      remark: 'QR PAY',
      city: 'Kochi',
    }),
    m('Fort Kochi Restaurant', 'Food & dining', [800, 4_200], 2_000, 6, {
      mode: 'CARD',
      cardPresent: true,
      shape: 2.2,
      mcc: MCC.restaurant,
      city: 'Kochi',
    }),

    m('Sitabuldi Chai Tapri', 'Food & dining', [15, 70], 30, 22, {
      shape: 1.6,
      mcc: MCC.cafe,
      vpa: 'sitabuldichai@ybl',
      bank4: 'YESB',
      remark: 'QR PAY',
      city: 'Nagpur',
    }),
    m('Amrit Bhojanalay', 'Food & dining', [70, 480], 150, 9, {
      mcc: MCC.restaurant,
      vpa: 'amritbhojan@paytm',
      bank4: 'PYTM',
      remark: 'QR PAY',
      city: 'Nagpur',
    }),
    m('Haldirams Restaurant', 'Food & dining', [600, 3_200], 1_600, 6, {
      mode: 'CARD',
      cardPresent: true,
      shape: 2.2,
      mcc: MCC.restaurant,
      city: 'Nagpur',
    }),
  ],

  Groceries: [
    m('Blinkit', 'Groceries', [90, 750], 280, 18, {
      mcc: MCC.grocery,
      vpa: 'blinkit.rzp@axisbank',
      bank4: 'UTIB',
      remark: 'ORDER',
    }),
    m('Zepto', 'Groceries', [80, 750], 250, 12, {
      mcc: MCC.grocery,
      vpa: 'zepto@hdfcbank',
      bank4: 'HDFC',
      remark: 'ORDER',
    }),
    m('Swiggy Instamart', 'Groceries', [110, 700], 270, 8, {
      mcc: MCC.grocery,
      vpa: 'instamart.rzp@icici',
      bank4: 'ICIC',
      remark: 'ORDER',
    }),
    m('Reliance Fresh', 'Groceries', [180, 950], 430, 10, {
      shape: 1.6,
      mcc: MCC.grocery,
      vpa: 'reliancefresh@ybl',
      bank4: 'YESB',
      remark: 'QR PAY',
    }),
    // The monthly stock-up. Twenty times the ticket of a quick-commerce order, and it is what
    // keeps the average payment off the floor.
    m('BigBasket', 'Groceries', [900, 4_800], 2_400, 20, {
      shape: 2.4,
      mcc: MCC.grocery,
      vpa: 'bigbasket@hdfcbank',
      bank4: 'HDFC',
      remark: 'ORDER',
    }),
    m('DMart', 'Groceries', [600, 4_500], 2_000, 14, {
      mode: 'CARD',
      cardPresent: true,
      shape: 2.2,
      mcc: MCC.grocery,
    }),
    m('Reliance Smart', 'Groceries', [500, 3_500], 1_600, 10, {
      mode: 'CARD',
      cardPresent: true,
      shape: 2.2,
      mcc: MCC.grocery,
    }),
    m('Spencer Retail', 'Groceries', [400, 2_500], 1_100, 8, {
      mode: 'CARD',
      cardPresent: true,
      shape: 2,
      mcc: MCC.grocery,
    }),

    m('Sharma Kirana Store', 'Groceries', [40, 700], 170, 22, {
      mcc: MCC.kirana,
      vpa: 'sharmakirana@paytm',
      bank4: 'PYTM',
      remark: 'QR PAY',
      city: 'Indore',
    }),
    m('Lulu Hypermarket', 'Groceries', [900, 5_200], 2_400, 12, {
      mode: 'CARD',
      cardPresent: true,
      shape: 2.4,
      mcc: MCC.grocery,
      city: 'Kochi',
    }),
    m('Marians Kirana', 'Groceries', [50, 750], 190, 22, {
      mcc: MCC.kirana,
      vpa: 'marianstores@fedbnk',
      bank4: 'FDRL',
      remark: 'QR PAY',
      city: 'Kochi',
    }),
    m('Bhagwati Kirana', 'Groceries', [40, 800], 180, 23, {
      mcc: MCC.kirana,
      vpa: 'bhagwatikirana@ybl',
      bank4: 'YESB',
      remark: 'QR PAY',
      city: 'Nagpur',
    }),
  ],

  Transport: [
    m('Rapido', 'Transport', [25, 180], 55, 24, {
      shape: 1.6,
      mcc: MCC.rideHailing,
      vpa: 'rapido@ybl',
      bank4: 'YESB',
      remark: 'RIDE',
    }),
    m('Uber', 'Transport', [90, 520], 175, 18, {
      shape: 1.5,
      mcc: MCC.rideHailing,
      vpa: 'uber.rzp@icici',
      bank4: 'ICIC',
      remark: 'RIDE',
    }),
    m('Ola', 'Transport', [80, 520], 170, 10, {
      shape: 1.5,
      mcc: MCC.rideHailing,
      vpa: 'olacabs@ybl',
      bank4: 'YESB',
      remark: 'RIDE',
    }),
    m('IRCTC', 'Transport', [500, 3_200], 1_400, 9, {
      shape: 2,
      mcc: MCC.rail,
      vpa: 'irctc@sbi',
      bank4: 'SBIN',
      remark: 'TICKET',
    }),
    m('Indian Oil', 'Transport', [400, 2_500], 1_100, 14, {
      mode: 'CARD',
      cardPresent: true,
      shape: 2.2,
      mcc: MCC.fuel,
    }),
    m('HPCL', 'Transport', [400, 2_400], 1_050, 8, {
      mode: 'CARD',
      cardPresent: true,
      shape: 2.2,
      mcc: MCC.fuel,
    }),
    m('Bharat Petroleum', 'Transport', [400, 2_400], 1_050, 6, {
      mode: 'CARD',
      cardPresent: true,
      shape: 2.2,
      mcc: MCC.fuel,
    }),

    m('Indore City Bus', 'Transport', [10, 40], 20, 12, {
      shape: 1.6,
      mcc: MCC.transit,
      vpa: 'aicticket@ybl',
      bank4: 'YESB',
      remark: 'TICKET',
      city: 'Indore',
    }),
    m('Kochi Metro', 'Transport', [20, 60], 32, 13, {
      shape: 1.6,
      mcc: MCC.transit,
      vpa: 'kmrl@fedbnk',
      bank4: 'FDRL',
      remark: 'TICKET',
      city: 'Kochi',
    }),
    m('MSRTC', 'Transport', [25, 220], 60, 13, {
      shape: 1.6,
      mcc: MCC.transit,
      vpa: 'msrtc@sbi',
      bank4: 'SBIN',
      remark: 'TICKET',
      city: 'Nagpur',
    }),
  ],

  Shopping: [
    m('Amazon', 'Shopping', [200, 6_500], 1_700, 22, {
      mode: 'CARD',
      shape: 1.7,
      mcc: MCC.marketplace,
    }),
    m('Myntra', 'Shopping', [500, 5_200], 1_900, 12, {
      mode: 'CARD',
      shape: 2,
      mcc: MCC.apparel,
    }),
    m('Flipkart', 'Shopping', [220, 4_200], 1_400, 12, {
      mode: 'CARD',
      shape: 1.7,
      mcc: MCC.marketplace,
    }),
    m('Ajio', 'Shopping', [450, 2_800], 1_050, 6, {
      mode: 'CARD',
      shape: 2,
      mcc: MCC.apparel,
    }),
    m('Decathlon', 'Shopping', [600, 4_400], 1_500, 5, {
      mode: 'CARD',
      cardPresent: true,
      shape: 2.2,
      mcc: MCC.apparel,
    }),
    m('Croma', 'Shopping', [1_200, 7_000], 3_200, 3, {
      mode: 'CARD',
      cardPresent: true,
      shape: 2.4,
      mcc: MCC.electronics,
    }),
    m('Meesho', 'Shopping', [150, 750], 320, 10, {
      shape: 1.5,
      mcc: MCC.marketplace,
      vpa: 'meesho.rzp@axisbank',
      bank4: 'UTIB',
      remark: 'ORDER',
    }),
    m('Nykaa', 'Shopping', [250, 1_500], 500, 8, {
      shape: 1.8,
      mcc: MCC.cosmetics,
      vpa: 'nykaa.rzp@axisbank',
      bank4: 'UTIB',
      remark: 'ORDER',
    }),
    m('Zudio', 'Shopping', [400, 2_000], 800, 8, {
      shape: 2,
      mcc: MCC.apparel,
      vpa: 'zudio@hdfcbank',
      bank4: 'HDFC',
      remark: 'QR PAY',
    }),
    m('Lenskart', 'Shopping', [900, 3_800], 1_900, 9, {
      shape: 2,
      mcc: MCC.ecommerce,
      vpa: 'lenskart.rzp@icici',
      bank4: 'ICIC',
      remark: 'ORDER',
    }),
    m('Titan', 'Shopping', [1_500, 9_000], 3_400, 7, {
      shape: 2.2,
      mcc: MCC.ecommerce,
      vpa: 'titan@hdfcbank',
      bank4: 'HDFC',
      remark: 'QR PAY',
    }),

    m('Treasure Island Mall', 'Shopping', [300, 3_000], 900, 10, {
      mode: 'CARD',
      cardPresent: true,
      mcc: MCC.apparel,
      city: 'Indore',
    }),
    m('Lulu Mall', 'Shopping', [350, 3_400], 1_000, 10, {
      mode: 'CARD',
      cardPresent: true,
      mcc: MCC.apparel,
      city: 'Kochi',
    }),
    m('Empress City Mall', 'Shopping', [280, 2_800], 850, 10, {
      mode: 'CARD',
      cardPresent: true,
      mcc: MCC.apparel,
      city: 'Nagpur',
    }),
  ],

  Entertainment: [
    m('BookMyShow', 'Entertainment', [150, 700], 310, 24, {
      shape: 1.6,
      mcc: MCC.cinema,
      vpa: 'bookmyshow@hdfcbank',
      bank4: 'HDFC',
      remark: 'TICKET',
    }),
    m('INOX', 'Entertainment', [200, 750], 370, 8, {
      shape: 1.8,
      mcc: MCC.cinema,
      vpa: 'inoxleisure@icici',
      bank4: 'ICIC',
      remark: 'TICKET',
    }),
    m('PVR Cinemas', 'Entertainment', [250, 1_600], 700, 12, {
      mode: 'CARD',
      cardPresent: true,
      shape: 1.8,
      mcc: MCC.cinema,
    }),
    m('Steam', 'Entertainment', [300, 2_800], 850, 6, {
      mode: 'CARD',
      shape: 2,
      mcc: MCC.streaming,
    }),
    m('Smaaash', 'Entertainment', [400, 2_400], 900, 8, {
      mode: 'CARD',
      cardPresent: true,
      shape: 2,
      mcc: MCC.cinema,
    }),
    m('Crossword', 'Entertainment', [200, 1_200], 450, 10, {
      mode: 'CARD',
      cardPresent: true,
      shape: 1.8,
      mcc: MCC.bookstore,
    }),
  ],

  Health: [
    m('Apollo Pharmacy', 'Health', [90, 800], 280, 24, {
      shape: 1.5,
      mcc: MCC.pharmacy,
      vpa: 'apollopharmacy@hdfcbank',
      bank4: 'HDFC',
      remark: 'MEDICINE',
    }),
    m('MedPlus', 'Health', [80, 900], 230, 14, {
      mcc: MCC.pharmacy,
      vpa: 'medplus@ybl',
      bank4: 'YESB',
      remark: 'MEDICINE',
    }),
    m('PharmEasy', 'Health', [150, 900], 360, 9, {
      shape: 1.6,
      mcc: MCC.pharmacy,
      vpa: 'pharmeasy.rzp@icici',
      bank4: 'ICIC',
      remark: 'ORDER',
    }),
    m('Tata 1mg', 'Health', [130, 800], 320, 10, {
      shape: 1.6,
      mcc: MCC.pharmacy,
      vpa: 'tata1mg@hdfcbank',
      bank4: 'HDFC',
      remark: 'ORDER',
    }),
    m('Practo', 'Health', [300, 900], 480, 7, {
      shape: 1.8,
      mcc: MCC.hospital,
      vpa: 'practo.rzp@axisbank',
      bank4: 'UTIB',
      remark: 'CONSULT',
    }),
    m('Dr Lal PathLabs', 'Health', [400, 2_800], 1_100, 10, {
      mode: 'CARD',
      cardPresent: true,
      shape: 2,
      mcc: MCC.labs,
    }),
    m('Thyrocare', 'Health', [500, 2_500], 1_000, 6, {
      mode: 'CARD',
      cardPresent: true,
      shape: 2,
      mcc: MCC.labs,
    }),
  ],
}

/** The merchants in a category a customer in this city could plausibly have paid. */
export function merchantsFor(category: string, city: string): readonly Merchant[] {
  return (DISCRETIONARY[category] ?? []).filter((x) => x.city === undefined || x.city === city)
}

/* ------------------------------------------------------------------ *
 * Utilities
 * ------------------------------------------------------------------ */

export interface BillerSpec {
  /** The biller's name as BBPS prints it. */
  biller: string
  category: SpendCategory
  mcc: string
  /** Inclusive range for a variable bill; the same number twice for a fixed pack. */
  amount: readonly [number, number]
  /** Day of the month the bill is normally paid. */
  day: number
  /** Every month, or every second month for a cylinder that has to run out first. */
  everyMonths: number
}

/**
 * The four bills a household in this city actually receives.
 *
 * Recurring but variable, which is exactly what separates them from a subscription and the whole
 * reason recurring detection carries a `utility` reason code. The consumer number on the line is
 * the part that stays fixed while the amount moves.
 */
export function billersFor(city: string): BillerSpec[] {
  const profile = cityProfile(city)
  return [
    {
      biller: profile.electricity.biller,
      category: 'Rent & bills',
      mcc: MCC.utilities,
      amount: profile.electricity.band,
      day: 14,
      everyMonths: 1,
    },
    {
      biller: profile.mobile.biller,
      category: 'Rent & bills',
      mcc: MCC.telecom,
      amount: [profile.mobile.monthly, profile.mobile.monthly],
      day: 18,
      everyMonths: 1,
    },
    {
      biller: profile.broadband.biller,
      category: 'Rent & bills',
      mcc: MCC.broadband,
      amount: [profile.broadband.monthly, profile.broadband.monthly],
      day: 22,
      everyMonths: 1,
    },
    {
      biller: profile.gas.biller,
      category: 'Rent & bills',
      mcc: MCC.utilities,
      amount: profile.gas.band,
      day: 26,
      // A cylinder is not a monthly bill. Nagpur refills roughly every second month, which is
      // what makes its gas line a different shape from Indore's piped connection — and a case
      // recurring detection has to handle without calling it irregular.
      everyMonths: profile.gas.piped ? 1 : 2,
    },
  ]
}
