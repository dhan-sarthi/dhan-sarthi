/**
 * What counts as protection, and which shelf group a product belongs to.
 *
 * One module, because two clients and one gate were each answering this on their own and had
 * already stopped agreeing. The Protect tab matched a regex over a product's marketing name
 * (`/insurance|term|health|accident|jeevan|suraksha/i`), which put "LIC Jeevan Anand
 * Endowment" under "Proper cover" on the word *Jeevan* — forty lines above the card saying
 * that anything bundling cover with investment is not on that tab. The Grow tab tested
 * `category.includes('Insurance')` and filed the same product as market-linked. The gate used
 * a third rule, its own, and was the only one of the three that was right.
 *
 * The rule is a property of the product, not of its name. Putting it beside the gate that
 * enforces it is what makes the two screens structurally unable to disagree again.
 */
import type { ProductCategory } from './types.ts'

/**
 * Pure protection: cover with no investment component.
 *
 * These are exempt from the rules that gate *investment*, and getting that carve-out wrong is
 * a genuine advisory error rather than a technicality. Refusing someone term cover because
 * they have credit card debt is backwards — if they die, their family inherits the debt and
 * loses the income. Debt and a thin buffer are arguments for cover, not against it.
 *
 * A ULIP is deliberately not here: it bundles investment, so every investment rule applies to
 * it. Authored against `ProductCategory` so a renamed category is a compile error, but stored
 * as `ReadonlySet<string>` so a caller whose product type says `category: string` — the wire
 * shape both clients read — can be judged without a cast.
 */
export const PROTECTION_ONLY_CATEGORIES: ReadonlySet<string> = new Set<string>([
  'Term Insurance',
  'Health Insurance',
  'Government Insurance',
] satisfies ProductCategory[])

/** Premium at or below this is "the bank earns nothing on it". Inclusive. */
export const NOMINAL_PREMIUM_MAX = 500

/** IDBI distributes; it does not manufacture. This is the one name that means "our own". */
export const IDBI_MANUFACTURER = 'IDBI Bank'

/** Everything a caller must supply to be judged. Both Product shapes satisfy it. */
export interface ProtectionShaped {
  category: string
  bundlesProtectionAndInvestment?: boolean
}

export function isProtectionProduct(p: ProtectionShaped): boolean {
  return PROTECTION_ONLY_CATEGORIES.has(p.category) && p.bundlesProtectionAndInvestment !== true
}

/**
 * The Protect tab's shelf, split at the premium that means "this costs almost nothing".
 *
 * Nothing that bundles investment reaches either half, which is the point: the tab promises
 * it is not showing you those.
 */
export function protectionShelf<T extends ProtectionShaped & { minInvestment: number }>(
  shelf: readonly T[],
): { nominal: T[]; full: T[] } {
  const cover = shelf.filter(isProtectionProduct)
  return {
    nominal: cover.filter((p) => p.minInvestment <= NOMINAL_PREMIUM_MAX),
    full: cover.filter((p) => p.minInvestment > NOMINAL_PREMIUM_MAX),
  }
}

export type ShelfGroup = 'idbi_own' | 'protection' | 'market_linked'

/**
 * Which of the three groups the Invest list puts a product in. Manufacturer wins: a term plan
 * IDBI itself made is filed under "IDBI's own", the same precedence the screen already had.
 *
 * Returns a key, never a label. The copy stays in the client; the partition is the domain.
 */
export function shelfGroup(p: ProtectionShaped & { manufacturer: string }): ShelfGroup {
  if (p.manufacturer === IDBI_MANUFACTURER) return 'idbi_own'
  if (isProtectionProduct(p)) return 'protection'
  return 'market_linked'
}
