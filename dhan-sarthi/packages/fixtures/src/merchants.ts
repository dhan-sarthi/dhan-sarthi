/**
 * Indian merchants, and the narration formats an Indian bank statement actually carries.
 *
 * The narration strings matter more than they look. Transaction enrichment — deciding that
 * `UPI/SWIGGY/412683940281` is Swiggy and Swiggy is food delivery — is the first step in
 * Cleo's pipeline and the first step in ours. If the generator emits clean labels, we would
 * be testing enrichment against data that needs no enriching, and the demo would fall over
 * the moment it met a real IDBI statement.
 *
 * So: real merchant names, real prefixes, reference numbers, uppercase, and truncation.
 */
import type { SpendCategory, TxnMode } from '@dhan/core'
import type { Rng } from './random.ts'

export interface Merchant {
  /** The merchant a human would name. What enrichment is supposed to recover. */
  name: string
  category: SpendCategory
  mode: TxnMode
  /** Typical ticket, inclusive. */
  amount: readonly [number, number]
  /** Relative frequency inside its category. */
  weight: number
  /** Builds the raw statement line. */
  narration: (r: Rng, name: string) => string
}

const ref = (r: Rng, digits: number): string => {
  let out = ''
  for (let i = 0; i < digits; i += 1) out += String(r.int(0, 9))
  return out
}

/** `UPI/SWIGGY/412683940281` — by far the most common line on an Indian statement now. */
const upi = (r: Rng, name: string): string => `UPI/${name.toUpperCase()}/${ref(r, 12)}`

/** `POS/MYNTRA DESIGNS/4412` — card at a point of sale, last four of the card. */
const pos = (r: Rng, name: string): string => `POS/${name.toUpperCase()}/${ref(r, 4)}`

/** `ACH-D/AXIS MUTUAL FUND/SIP` — a mandate. Implies a standing instruction, not a choice. */
const ach = (_r: Rng, name: string): string => `ACH-D/${name.toUpperCase()}/SIP`

/** `SI/NETFLIX/AUTOPAY` — the shape a forgotten subscription hides in. */
const si = (_r: Rng, name: string): string => `SI/${name.toUpperCase()}/AUTOPAY`

const m = (
  name: string,
  category: SpendCategory,
  amount: readonly [number, number],
  weight: number,
  mode: TxnMode = 'UPI',
  narration = upi,
): Merchant => ({ name, category, mode, amount, weight, narration })

/**
 * Discretionary pools, by category.
 *
 * Ticket sizes are the point of this table. The insight that matters is not "you spent a lot
 * on shopping" — it is that thirty ₹40 chai payments add up to more than the one ₹7,400 order
 * anybody actually remembers. Cleo's research says the same: the damage is the small repeat
 * purchase, not the impulse buy.
 */
export const DISCRETIONARY: Record<string, readonly Merchant[]> = {
  'Food & dining': [
    m('Swiggy', 'Food & dining', [180, 720], 26),
    m('Zomato', 'Food & dining', [190, 680], 22),
    m('Tapri Chai', 'Food & dining', [30, 60], 30),
    m('Dominos', 'Food & dining', [320, 780], 8),
    m('Third Wave Coffee', 'Food & dining', [180, 420], 7),
    m('Sarafa Bazaar', 'Food & dining', [120, 480], 7),
  ],
  Groceries: [
    m('Blinkit', 'Groceries', [140, 900], 30),
    m('Zepto', 'Groceries', [120, 760], 18),
    m('BigBasket', 'Groceries', [900, 3400], 16),
    m('DMart', 'Groceries', [1200, 4200], 14, 'CARD', pos),
    m('Reliance Fresh', 'Groceries', [300, 1400], 12),
    m('Sharma Kirana Store', 'Groceries', [80, 620], 10),
  ],
  Transport: [
    m('Rapido', 'Transport', [45, 160], 28),
    m('Uber', 'Transport', [120, 520], 24),
    m('Ola', 'Transport', [110, 480], 14),
    m('Indian Oil', 'Transport', [500, 2200], 20, 'CARD', pos),
    m('IRCTC', 'Transport', [420, 2600], 6),
    m('Indore City Bus', 'Transport', [20, 40], 8),
  ],
  Shopping: [
    m('Amazon', 'Shopping', [340, 4200], 28, 'CARD', pos),
    m('Myntra', 'Shopping', [700, 5200], 20, 'CARD', pos),
    m('Flipkart', 'Shopping', [280, 3800], 18, 'CARD', pos),
    m('Ajio', 'Shopping', [600, 2800], 10, 'CARD', pos),
    m('Decathlon', 'Shopping', [900, 4400], 8, 'CARD', pos),
    m('Croma', 'Shopping', [1400, 6500], 4, 'CARD', pos),
    m('Treasure Island Mall', 'Shopping', [400, 2600], 12, 'CARD', pos),
  ],
  Entertainment: [
    m('BookMyShow', 'Entertainment', [280, 1400], 30),
    m('PVR Cinemas', 'Entertainment', [340, 1600], 20, 'CARD', pos),
    m('Steam', 'Entertainment', [400, 2800], 10, 'CARD', pos),
    m('Hotstar', 'Entertainment', [299, 299], 8),
    m('Smaaash', 'Entertainment', [600, 2400], 12, 'CARD', pos),
    m('Crossword', 'Entertainment', [300, 1200], 20, 'CARD', pos),
  ],
  Health: [
    m('Apollo Pharmacy', 'Health', [180, 1600], 34),
    m('PharmEasy', 'Health', [220, 1900], 22),
    m('Tata 1mg', 'Health', [200, 1700], 18),
    m('Practo', 'Health', [400, 1200], 14),
    m('Dr Lal PathLabs', 'Health', [600, 2800], 12),
  ],
}

/** Utilities. Recurring, but variable — which is exactly what distinguishes them from a sub. */
export const UTILITIES: readonly Merchant[] = [
  m('MPPKVVCL Electricity', 'Rent & bills', [1400, 3200], 1),
  m('Jio', 'Rent & bills', [599, 599], 1),
  m('ACT Fibernet', 'Rent & bills', [799, 799], 1),
  m('Avantika Gas', 'Rent & bills', [780, 1180], 1),
]

/** The narration builders, exported so personas can name a specific line. */
export const narrate = { upi, pos, ach, si }

/**
 * Salary. `NEFT-CR-...-SALARY` is the line every Indian bank statement carries and the one
 * signal that anchors the whole month: everything else is positioned relative to it.
 */
export const salaryNarration = (r: Rng, employer: string): string =>
  `NEFT-CR-IDIB000M${ref(r, 3)}-${employer.toUpperCase()}-SALARY`

export const emiNarration = (_r: Rng, lender: string): string =>
  `ACH-D/${lender.toUpperCase()}/EMI`

export const rentNarration = (r: Rng): string => `IMPS/P2A/RENT/${ref(r, 9)}`

export const atmNarration = (r: Rng, city: string): string =>
  `ATW/${ref(r, 4)}/${city.toUpperCase()}`
