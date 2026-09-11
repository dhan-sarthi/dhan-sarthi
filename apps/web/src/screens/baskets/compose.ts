/**
 * What a basket is here, and why it is not three names off a marketing sheet.
 *
 * The reference's `select-basket` returns `Basket 1 / Basket 2 / Basket 3` — three tabs with no
 * name, no rule and no stated difference — and its own spec records what is *not* on that screen:
 * no per-basket expected return, no per-basket risk level, no per-fund allocation percentage.
 * Everything that would have told a customer why one basket differs from another is absent, so
 * what the frames actually give is a shape, not a product.
 *
 * IDBI has no curated-basket feed either, and inventing one would be the exact failure this app
 * exists to avoid. So a basket here is **the shelf, filtered by a rule the customer can read and
 * check against the schemes in front of them**. Three rules, each true of every constituent, each
 * decidable from a field the shelf already carries:
 *
 * - `open`   — `lockInYears === 0`. Nothing in it is locked.
 * - `noeq`   — the category holds no equity. Nothing in it rises or falls with a share index.
 * - `locked` — `lockInYears > 0`. Everything in it is tied up for three years or more.
 *
 * That is a weaker claim than "our experts curated this", and it is the true one. A customer can
 * verify every word of it from the cards below the tab.
 *
 * ## What is deliberately not computed here
 *
 * **No basket-level risk grade.** SEBI's riskometer is a per-scheme disclosure and it is shown
 * per scheme; rolling five of them into one word for a basket would be a rating this app is not
 * entitled to publish and the reference never showed one either.
 *
 * **No expected return.** `indicativeReturn` exists on deposits, where it is a contracted rate,
 * and does not exist on any fund. A basket return would therefore be a number for the deposits
 * and a guess for the rest, and a blended figure would launder the guess into the fact.
 *
 * **No look-through allocation.** The reference's `portfolio-analytics` splits a holding into
 * Equity 99% / Debt 0.01% / Cash 0.99%. That needs a scheme's own portfolio disclosure, which
 * this app cannot see — `screens/plan/drift.ts` makes the same point about rebalancing. What the
 * allocation card on the basket screen draws is *our own split of the customer's own money*,
 * which is arithmetic on figures printed on the same screen.
 *
 * ## The split
 *
 * Equal, rounded down to ₹100, remainder onto the first line, and no scheme goes in below its own
 * `minInvestment`. Where the amount will not stretch, the basket loses constituents from the
 * expensive end rather than quietly dropping someone under a floor — and it says how many it
 * dropped.
 */
import type { Account, Product, Roadmap, ShelfProduct, Stage } from '@dhan/contracts'
import { SIP_DAYS, nextOnDay } from '../../lib/order.ts'
import type { InvestMode, OrderLine } from '../../lib/order.ts'

/* ---------------------------------------------------------------- Shapes */

/**
 * The three shapes the shelf sells, as far as a customer choosing a basket needs to care.
 *
 * `equity` is a superset of the engine's `VOLATILE` set — it adds `NPS`, whose Tier-I allocation
 * holds listed equity. `VOLATILE` is scoped to one rule about goal horizons and is right for
 * that; a customer reading "nothing in here holds equity" is asking a different question, and
 * answering it with the engine's set would make that sentence false about NPS.
 */
export type Shape = 'deposit' | 'bonds' | 'equity'

const SHAPE: Partial<Record<Product['category'], Shape>> = {
  'Sweep-in FD': 'deposit',
  'Fixed Deposit': 'deposit',
  'Recurring Deposit': 'deposit',
  PPF: 'deposit',
  Liquid: 'bonds',
  Debt: 'bonds',
  'Index Fund': 'equity',
  Equity: 'equity',
  ELSS: 'equity',
  NPS: 'equity',
}

export const shapeOf = (p: Product): Shape | null => SHAPE[p.category] ?? null

export const SHAPE_LABEL: Record<Shape, string> = {
  deposit: 'Deposit',
  bonds: 'Bond fund',
  equity: 'Holds equity',
}

/**
 * What may go in a basket at all.
 *
 * Cover is not an investment and is never split three ways — `07-DECISIONS.md` §3 keeps the
 * protection carve-out, and `suitability.ts` exempts pure cover from the investment rules for a
 * reason. Bundled products (ULIP, endowment) carry `insuranceProduct` too and are excluded by the
 * same test, which is right for a different reason: the gate refuses them, and a basket whose
 * whole purpose is "I do not want to choose" must not hand someone a refusal to sort out.
 */
export const eligible = (p: ShelfProduct): boolean =>
  p.transactable && p.insuranceProduct !== true && shapeOf(p) !== null

/* ---------------------------------------------------------------- The rules */

export type BasketId = 'open' | 'noeq' | 'locked'

export interface BasketSpec {
  id: BasketId
  /** The tab label. Short, because three of them share 430px. */
  tab: string
  /** The rule, in the words a customer can check against the cards under it. */
  rule: string
  /** True of every constituent this basket may hold. */
  holds: (p: ShelfProduct) => boolean
}

export const BASKETS: readonly BasketSpec[] = [
  {
    id: 'open',
    tab: 'No lock-in',
    rule: 'Every scheme here can be taken back out on any working day. One of them holds shares.',
    holds: (p) => p.lockInYears === 0,
  },
  {
    id: 'noeq',
    tab: 'No equity',
    rule: 'Nothing here holds shares, so nothing moves with a share index. None of it is locked.',
    holds: (p) => shapeOf(p) !== 'equity',
  },
  {
    id: 'locked',
    tab: 'Locked away',
    rule: 'Everything here is locked for three years or more. Long-dated money only.',
    holds: (p) => p.lockInYears > 0,
  },
]

/** How many schemes a basket carries at most. Three fits a nine-product shelf and one screen. */
export const MAX_CONSTITUENTS = 3

/** The split rounds to this. A SIP mandate in odd rupees is nobody's idea of a tidy basket. */
const STEP = 100

/* ---------------------------------------------------------------- Selection */

/**
 * Which schemes a basket holds: least encumbered first, then cheapest to start.
 *
 * **One per category, always.** A basket that is two flavours of the same thing has not spread
 * anything, and a customer who did not want to choose is owed a spread rather than a duplicate.
 *
 * **Lock-in leads the sort, not price.** Sorting on `minInvestment` alone made three of the four
 * shelf minimums a five-hundred-rupee tie, and the tiebreak then handed `A bit of each` a
 * fifteen-year PPF where a recurring deposit was sitting beside it at the same price. Whatever a
 * basket's own rule says, within it the scheme that ties your money up least is the one to reach
 * for first. `productId` breaks the last tie so the same shelf always produces the same basket —
 * a curated set that reshuffles between renders is not curated.
 */
export function constituentsOf(spec: BasketSpec, shelf: readonly ShelfProduct[]): ShelfProduct[] {
  const ranked = shelf
    .filter((p) => eligible(p) && spec.holds(p))
    .sort(
      (a, b) =>
        a.lockInYears - b.lockInYears ||
        a.minInvestment - b.minInvestment ||
        (a.productId < b.productId ? -1 : 1),
    )

  const taken = new Set<string>()
  const out: ShelfProduct[] = []
  for (const p of ranked) {
    if (out.length >= MAX_CONSTITUENTS) break
    if (taken.has(p.category)) continue
    taken.add(p.category)
    out.push(p)
  }
  return out
}

/**
 * Equal shares of `total`, rounded down to ₹100, the remainder on the first.
 *
 * Returns `null` where the amount will not carry `n` schemes above their own minimums. The caller
 * drops the most expensive and asks again rather than rounding someone under a floor.
 */
export function shareOut(total: number, mins: readonly number[]): number[] | null {
  const n = mins.length
  if (n === 0 || total <= 0) return null
  const base = Math.floor(total / n / STEP) * STEP
  const ceiling = Math.max(...mins)
  if (base < ceiling) return null
  const rest = total - base * n
  return mins.map((_, i) => (i === 0 ? base + rest : base))
}

/* ---------------------------------------------------------------- Lines */

/** The debit day the AMC offers that comes round soonest. `AddSchemeInvest` picks the same one. */
export function firstSipDay(asOf: string): number {
  const [soonest] = SIP_DAYS.map((day) => ({ day, on: nextOnDay(day, asOf) })).sort((a, b) =>
    a.on < b.on ? -1 : 1,
  )
  return soonest?.day ?? 1
}

export interface Group {
  mode: InvestMode
  /** What was asked for. `total` of the lines can be less where schemes had to be dropped. */
  asked: number
  lines: OrderLine[]
  /** How many schemes the amount would not carry. Stated on screen, never silently swallowed. */
  dropped: number
}

export interface Basket {
  spec: BasketSpec
  groups: Group[]
}

/** One group's worth of lines: the same constituents, split for one mode. */
function groupFor(
  mode: InvestMode,
  asked: number,
  picks: readonly ShelfProduct[],
  spec: BasketSpec,
  asOf: string,
): Group {
  let held = [...picks]
  let shares = shareOut(
    asked,
    held.map((p) => p.minInvestment),
  )
  while (shares === null && held.length > 1) {
    held = held.slice(0, -1)
    shares = shareOut(
      asked,
      held.map((p) => p.minInvestment),
    )
  }
  if (shares === null) return { mode, asked, lines: [], dropped: picks.length }

  const day = firstSipDay(asOf)
  const startDate = mode === 'sip' ? nextOnDay(day, asOf) : null
  const amounts = shares
  return {
    mode,
    asked,
    dropped: picks.length - held.length,
    lines: held.map((p, i) => ({
      id: `B-${spec.id}-${mode}-${p.productId}`,
      productId: p.productId,
      name: p.name,
      manufacturer: p.manufacturer,
      category: p.category,
      mode,
      amount: amounts[i] ?? p.minInvestment,
      startDate,
      installments: null,
      folio: 'new' as const,
      included: true,
    })),
  }
}

/** One basket, for whichever of the two amounts the customer ticked. */
export function composeBasket(
  spec: BasketSpec,
  shelf: readonly ShelfProduct[],
  amounts: { sip: number; lumpsum: number },
  asOf: string,
): Basket {
  const picks = constituentsOf(spec, shelf)
  const groups: Group[] = []
  if (amounts.sip > 0) groups.push(groupFor('sip', amounts.sip, picks, spec, asOf))
  if (amounts.lumpsum > 0) groups.push(groupFor('lumpsum', amounts.lumpsum, picks, spec, asOf))
  return { spec, groups }
}

export function composeAll(
  shelf: readonly ShelfProduct[],
  amounts: { sip: number; lumpsum: number },
  asOf: string,
): Basket[] {
  return BASKETS.map((spec) => composeBasket(spec, shelf, amounts, asOf))
}

/**
 * The smallest amount that fills the cheapest basket on this shelf.
 *
 * Real, and therefore worth printing where the reference printed `Min 5K`: it is the point below
 * which no basket can hold more than one scheme, computed from the schemes themselves.
 */
export function basketFloor(shelf: readonly ShelfProduct[]): number {
  const totals = BASKETS.map((spec) => {
    const picks = constituentsOf(spec, shelf)
    if (picks.length === 0) return Infinity
    const ceiling = Math.max(...picks.map((p) => p.minInvestment))
    return Math.ceil((ceiling * picks.length) / STEP) * STEP
  })
  const best = Math.min(...totals)
  return Number.isFinite(best) ? best : 0
}

/** What a one-off could actually be paid from. `CartReview` checks the same figure again later. */
export function reachableToday(accounts: readonly Account[]): number {
  return accounts
    .filter((a) => a.accountType === 'Savings')
    .reduce((sum, a) => sum + (a.effectiveAvailableBalance ?? a.currentBalance), 0)
}

/* ---------------------------------------------------------------- Plan precedence */

/**
 * Where the roadmap says this customer is, so the basket surface can defer to it out loud.
 *
 * This is the whole of how the two screens are kept from competing. `Plan` is the sequenced
 * roadmap the engine computes from twelve months of statements: it decides **what comes first**.
 * A basket decides **how one amount is split**, and nothing else. So the basket surface reads the
 * same roadmap and says, in the customer's own figures, which of the two questions it is
 * answering — and when the roadmap has not reached investing at all, it says that first and
 * loudest, because the gate is going to say it again in a moment anyway.
 */
export type Stance =
  /** The roadmap has no growth stage. Nothing should be invested yet, and the gate will agree. */
  | { kind: 'not_yet'; first: Stage }
  /** There is a growth stage, but the roadmap puts something before it. */
  | { kind: 'after'; grow: Stage; before: Stage }
  /** Growing is the first thing on the roadmap. */
  | { kind: 'now'; grow: Stage }

export function planStance(roadmap: Roadmap): Stance | null {
  const stages = roadmap.stages
  const grow = stages.find((s) => s.kind === 'grow')
  const first = stages[0]
  if (!grow) return first ? { kind: 'not_yet', first } : null
  const before = stages.find((s) => s.index < grow.index)
  return before ? { kind: 'after', grow, before } : { kind: 'now', grow }
}

/** What a stage is, in two or three words. `stage.label` is a whole sentence and does not fit. */
export const STAGE_NOUN: Record<Stage['kind'], string> = {
  free_up: 'freeing up money',
  get_cover: 'getting cover in place',
  clear_debt: 'clearing the expensive debt',
  build_buffer: 'building the emergency buffer',
  grow: 'growing the money',
}

/** No lock-in reads better as a phrase than as `0 years`. */
export const lockLabel = (years: number): string =>
  years <= 0 ? 'No lock-in' : years === 1 ? '1 year locked' : `${years} years locked`
