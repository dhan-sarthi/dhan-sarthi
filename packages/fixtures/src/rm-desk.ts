/**
 * The relationship managers' desk: who signs in to the console, whose book each customer is in,
 * and what each book customer has done that the activity simulator replays.
 *
 * Synthetic, like the customers. The demo passwords are not secrets: the sign-in page prints
 * them under "Demo access" so a judge can open either book, and the API stores only their
 * scrypt hashes. What the second RM proves is scoping, so the split is deliberately uneven and
 * every customer sits in exactly one book.
 */
import { ALL_PERSONAS, RM_BOOK } from './book/index.ts'

export interface RmUser {
  /** Stable id, carried on assignments and in the access log. */
  rmId: string
  /** What the RM types to sign in. IDBI staff numbers are six digits. */
  employeeNo: string
  name: string
  desk: string
  city: string
  /** Shown on the sign-in page for the demo. Never a real credential. */
  demoPassword: string
}

const MEERA: RmUser = {
  rmId: 'rm-204117',
  employeeNo: '204117',
  name: 'Meera Joshi',
  desk: 'Digital Wealth Desk',
  city: 'Mumbai',
  demoPassword: 'desk-204117',
}

const ARJUN: RmUser = {
  rmId: 'rm-204388',
  employeeNo: '204388',
  name: 'Arjun Menon',
  desk: 'Digital Wealth Desk',
  city: 'Bengaluru',
  demoPassword: 'desk-204388',
}

export const RM_USERS: readonly RmUser[] = [MEERA, ARJUN]

/**
 * Arjun's book: the Bengaluru and Kochi customers. Everyone else, the four heroes included, is
 * Meera's, because the heroes are who a reviewer opens the mobile app as and the inbox moment
 * ("Karan asked to talk to you") has to land on the RM the demo signs in as first.
 */
const ARJUN_BOOK: ReadonlySet<string> = new Set([
  'karthik',
  'divya',
  'manjunath',
  'lakshmi',
  'rahul',
  'fatima',
  'suresh',
  'nandini',
  'thomas',
  'anitha',
  'shibu',
  'reshma',
])

/** Every customer's RM, by cif. One entry per customer in `ALL_PERSONAS`, and no other. */
export const RM_ASSIGNMENTS: Readonly<Record<string, string>> = Object.fromEntries(
  ALL_PERSONAS.map((p) => [p.customer.cif, ARJUN_BOOK.has(p.slug) ? ARJUN.rmId : MEERA.rmId]),
)

/* ------------------------------------------------------------------ *
 * What the book customers did
 * ------------------------------------------------------------------ */

/**
 * A product a customer asked about, which the simulator runs through the same `evaluateProduct`
 * path text chat uses. The verdict is whatever the rules say on the day; nothing here decides it.
 */
export interface ProductEnquiry {
  /** A `PRODUCT_SHELF` id. */
  productId: string
  /** Rupees a month, never below the product's minimum. */
  amount: number
  /** When it was asked, in months before the anchor. Inside the twelve the console shows. */
  monthsAgo: number
}

export interface BookActivity {
  /** Zero to three, chosen for what this customer would plausibly raise. */
  enquiries: readonly ProductEnquiry[]
  /** A recent `talk_to_rm`, so the inbox is not empty on first sign-in. */
  recentHandoff: boolean
  /** How long the handoff has been waiting at the anchor. Null where there is none. */
  handoffDaysAgo: number | null
}

const ask = (productId: string, amount: number, monthsAgo: number): ProductEnquiry => ({
  productId,
  amount,
  monthsAgo,
})

const ULIP = 'LIC_ULIP_401'
const ENDOWMENT = 'LIC_ENDOW_402'
const ELSS = 'MF_ELSS_104'
const INDEX = 'MF_INDEX_103'
const TERM = 'LIC_TERM_201'

/**
 * Who asked about what, by slug.
 *
 * The pattern is the one a branch sees. A family with a protection gap is sold a ULIP by a
 * relative and asks whether it is any good; a Conservative customer past fifty asks about the
 * LIC savings plan; a salaried customer on the new regime asks about ELSS, which no longer saves
 * them any tax; a customer carrying a card at 34.8% asks about an index fund because a friend
 * started one. Several of these are refusals, and that is the point of running them.
 */
const ENQUIRIES: Readonly<Record<string, readonly ProductEnquiry[]>> = {
  ananya: [ask(INDEX, 5_000, 7), ask(ELSS, 3_000, 2)],
  farhan: [ask(ULIP, 5_000, 9), ask(TERM, 1_500, 4)],
  sneha: [ask(INDEX, 3_000, 5)],
  rajesh: [ask(ENDOWMENT, 10_000, 8), ask(INDEX, 20_000, 3)],
  meher: [ask(ENDOWMENT, 8_000, 6), ask(ELSS, 12_500, 10)],
  vikram: [ask(ULIP, 25_000, 11), ask(INDEX, 50_000, 4)],
  pooja: [ask(INDEX, 2_000, 3)],
  imran: [ask(ULIP, 2_500, 2)],
  kavita: [ask(ELSS, 5_000, 9), ask(ENDOWMENT, 4_200, 5)],
  aditya: [ask(ELSS, 10_000, 8), ask(INDEX, 10_000, 3), ask(ULIP, 5_000, 1)],
  nikhil: [ask(ULIP, 3_000, 10), ask(TERM, 985, 6)],
  shruti: [ask(INDEX, 1_000, 4)],
  ganesh: [ask(ELSS, 3_000, 9), ask(ENDOWMENT, 5_000, 2)],
  anjali: [ask(INDEX, 8_000, 5)],
  rohit: [ask(ELSS, 2_000, 6)],
  madhuri: [ask(ENDOWMENT, 6_000, 7)],
  harsh: [ask(ULIP, 50_000, 10), ask(INDEX, 25_000, 6)],
  nidhi: [],
  jignesh: [ask(ENDOWMENT, 10_000, 9), ask(ELSS, 5_000, 4)],
  heena: [ask(ENDOWMENT, 4_200, 3)],
  kiran: [ask(ELSS, 6_000, 10)],
  arpit: [ask(INDEX, 3_000, 4)],
  swati: [ask(ENDOWMENT, 4_200, 8), ask(TERM, 985, 2)],
  manish: [ask(ULIP, 10_000, 7), ask(TERM, 2_500, 3)],
  ritu: [],
  prakash: [ask(ENDOWMENT, 8_000, 5)],
  sakshi: [ask(ULIP, 2_500, 6), ask(TERM, 985, 1)],
  amol: [ask(ULIP, 5_000, 3)],
  aman: [ask(INDEX, 20_000, 8), ask(ULIP, 15_000, 5)],
  priyanka: [ask(ULIP, 5_000, 4)],
  sunita: [ask(ENDOWMENT, 15_000, 6)],
  deepak: [ask(ULIP, 2_500, 9), ask(TERM, 985, 3)],
  tanvi: [ask(INDEX, 5_000, 6), ask(ELSS, 2_000, 2)],
  gurpreet: [ask(ENDOWMENT, 6_000, 4)],
  karthik: [ask(INDEX, 20_000, 9), ask(ELSS, 12_500, 3)],
  divya: [ask(INDEX, 10_000, 7)],
  manjunath: [ask(ENDOWMENT, 7_500, 8), ask(ELSS, 4_000, 3)],
  lakshmi: [ask(ENDOWMENT, 10_000, 5)],
  rahul: [ask(INDEX, 5_000, 2)],
  fatima: [ask(TERM, 1_500, 8), ask(ULIP, 5_000, 4)],
  suresh: [ask(ELSS, 12_500, 10), ask(ENDOWMENT, 8_000, 3)],
  nandini: [ask(INDEX, 3_000, 5)],
  thomas: [ask(ENDOWMENT, 25_000, 7)],
  anitha: [ask(ULIP, 3_000, 9), ask(TERM, 985, 5)],
  shibu: [ask(ULIP, 2_500, 4)],
  reshma: [ask(INDEX, 4_000, 6)],
}

/**
 * Who asked to talk to their RM recently, and how many days ago.
 *
 * Six, each with something only a person should handle: two missed repayments, two cards at
 * 34.8%, and two deposits that renew within a fortnight unless somebody calls.
 */
const HANDOFFS: Readonly<Record<string, number>> = {
  imran: 1,
  sneha: 3,
  amol: 2,
  priyanka: 6,
  lakshmi: 0,
  thomas: 4,
}

/** Every book customer's simulated activity, by cif. The heroes have reviewers instead. */
export const BOOK_ACTIVITY: Readonly<Record<string, BookActivity>> = Object.fromEntries(
  RM_BOOK.map((p): [string, BookActivity] => {
    const daysAgo = HANDOFFS[p.slug]
    return [
      p.customer.cif,
      {
        enquiries: ENQUIRIES[p.slug] ?? [],
        recentHandoff: daysAgo !== undefined,
        handoffDaysAgo: daysAgo ?? null,
      },
    ]
  }),
)
