/**
 * Product gaps: what an RM would naturally raise with a customer, named by the shelf product
 * that would close it.
 *
 * Four needs, each read off the snapshot the customer's own app derives, never off who the
 * customer is:
 *
 * - **Life cover** — someone depends on the income and the cover in force is short of ten
 *   times it (the engine's own `protection.gap`).
 * - **Health cover** — no health cover in force at all.
 * - **Monthly investing** — money left over every month and no SIP running.
 * - **Sweep-in** — the engine found idle cash, and nothing on file sweeps it.
 *
 * A gap is listed only when the suitability rules pass the product for this customer today,
 * through the same `evaluate()` the app runs, with the same amount and cadence its own daily
 * plan would propose. A console that suggested what the rules would refuse would be the mis-sale
 * the product exists to stop, made one screen earlier. A need whose product the rules refuse is
 * not a gap the RM can close; the customer page's signals still carry the need itself.
 *
 * Pure and here rather than in `@dhan/core`: it is not a definition from the spec's table but a
 * reading of the shelf, and the shelf is the API's to supply.
 */
import { evaluate, rupees } from '@dhan/core'
import type { Holding, Product, Snapshot } from '@dhan/core'

export type GapNeed = 'life_cover' | 'health_cover' | 'monthly_investing' | 'sweep_in'

export interface ProductGap {
  need: GapNeed
  productId: string
  productName: string
  /** One sentence, third person, with its figure, for the "Why?" beside the product. */
  why: string
}

export interface GapFacts {
  snapshot: Snapshot
  /** The engine's insights for the same snapshot. */
  insights: readonly { kind: string }[]
  holdings: readonly Pick<Holding, 'name'>[]
  policies: readonly Pick<Holding, 'name'>[]
  shelf: readonly Product[]
  /** Years to the plan's horizon, as the daily plan reads it: `max(5, 60 - age)`. */
  horizonYears: number
}

/** The order the needs are listed in: protection before growth, as the engine's ladder runs. */
const NEEDS: readonly GapNeed[] = ['life_cover', 'health_cover', 'monthly_investing', 'sweep_in']

/** Matches the daily plan's sweep sizing: 80% of the twelve-month floor, never all of it. */
const SWEEP_SHARE = 0.8

interface Candidate {
  product: Product
  amount: number
  cadence: 'monthly' | 'lump_sum'
  horizonYears: number
}

function passes(c: Candidate, facts: GapFacts): boolean {
  return (
    evaluate({
      product: c.product,
      snapshot: facts.snapshot,
      amount: c.amount,
      cadence: c.cadence,
      goal: c.horizonYears > 0 ? { kind: 'suggested', horizonYears: c.horizonYears } : null,
      alternatives: facts.shelf,
    }).verdict === 'PASS'
  )
}

/** The first candidate the rules pass, in the order given. */
function firstPassing(candidates: readonly Candidate[], facts: GapFacts): Candidate | null {
  return candidates.find((c) => passes(c, facts)) ?? null
}

function lifeCover(facts: GapFacts): ProductGap | null {
  const { protection, surplus } = facts.snapshot
  if (protection.dependents <= 0 || protection.gap <= 0) return null
  // The daily plan's choice: the most cover affordable first, a bundled policy never. The
  // affordability line is the plan's too, so the console and the app name the same policy.
  const life = facts.shelf.filter(
    (p) => p.coverType === 'life' && !p.bundlesProtectionAndInvestment,
  )
  const room = Math.max(surplus.deployable, 100)
  const ordered = [
    ...life
      .filter((p) => p.minInvestment <= room)
      .sort((a, b) => (b.coverAmount ?? 0) - (a.coverAmount ?? 0)),
    ...life.filter((p) => p.minInvestment > room).sort((a, b) => a.minInvestment - b.minInvestment),
  ]
  const pick = firstPassing(
    ordered.map((product): Candidate => ({
      product,
      amount: product.minInvestment,
      cadence: 'monthly',
      horizonYears: 30,
    })),
    facts,
  )
  if (!pick) return null
  const people = protection.dependents === 1 ? '1 dependent' : `${protection.dependents} dependents`
  return {
    need: 'life_cover',
    productId: pick.product.productId,
    productName: pick.product.name,
    why: `${rupees(protection.gap)} short on life cover, with ${people}.`,
  }
}

function healthCover(facts: GapFacts): ProductGap | null {
  if (facts.snapshot.protection.healthCoverInForce > 0) return null
  const health = facts.shelf
    .filter((p) => p.coverType === 'health')
    .sort((a, b) => a.minInvestment - b.minInvestment)
  const pick = firstPassing(
    health.map((product): Candidate => ({
      product,
      amount: product.minInvestment,
      cadence: 'monthly',
      horizonYears: 30,
    })),
    facts,
  )
  if (!pick) return null
  return {
    need: 'health_cover',
    productId: pick.product.productId,
    productName: pick.product.name,
    why: 'No health cover on file.',
  }
}

function monthlyInvesting(facts: GapFacts): ProductGap | null {
  const { surplus, holdings } = facts.snapshot
  if (holdings.sipMonthly > 0 || surplus.deployable <= 0) return null
  // The daily plan's own choice of vehicle: an index fund where the horizon allows market risk,
  // IDBI's recurring deposit where it does not, or where the rules refuse the fund.
  const byCategory = (category: Product['category']): Product[] =>
    facts.shelf
      .filter((p) => p.category === category)
      .sort((a, b) => a.minInvestment - b.minInvestment)
  const products = [
    ...(facts.horizonYears >= 3 ? byCategory('Index Fund') : []),
    ...byCategory('Recurring Deposit'),
  ]
  const pick = firstPassing(
    products
      .filter((p) => p.minInvestment <= surplus.deployable)
      .map((product): Candidate => ({
        product,
        amount: product.minInvestment,
        cadence: 'monthly',
        horizonYears: facts.horizonYears,
      })),
    facts,
  )
  if (!pick) return null
  return {
    need: 'monthly_investing',
    productId: pick.product.productId,
    productName: pick.product.name,
    why: `${rupees(surplus.deployable)} a month left over and no SIP running.`,
  }
}

function sweepIn(facts: GapFacts): ProductGap | null {
  if (!facts.insights.some((i) => i.kind === 'idle_cash')) return null
  const held = [...facts.holdings, ...facts.policies].some((h) => /sweep/i.test(h.name))
  if (held) return null
  const amount = Math.max(0, Math.round(facts.snapshot.balances.idleFloor * SWEEP_SHARE))
  const sweeps = facts.shelf
    .filter((p) => p.category === 'Sweep-in FD' && p.minInvestment <= amount)
    .sort((a, b) => a.minInvestment - b.minInvestment)
  const pick = firstPassing(
    sweeps.map((product): Candidate => ({ product, amount, cadence: 'lump_sum', horizonYears: 0 })),
    facts,
  )
  if (!pick) return null
  return {
    need: 'sweep_in',
    productId: pick.product.productId,
    productName: pick.product.name,
    why: `${rupees(facts.snapshot.balances.idleFloor)} idle in savings with no sweep-in.`,
  }
}

const RULES: Readonly<Record<GapNeed, (facts: GapFacts) => ProductGap | null>> = {
  life_cover: lifeCover,
  health_cover: healthCover,
  monthly_investing: monthlyInvesting,
  sweep_in: sweepIn,
}

/** Every gap the rules would let an RM close today, protection first. */
export function productGaps(facts: GapFacts): ProductGap[] {
  const out: ProductGap[] = []
  for (const need of NEEDS) {
    const gap = RULES[need](facts)
    if (gap !== null) out.push(gap)
  }
  return out
}
