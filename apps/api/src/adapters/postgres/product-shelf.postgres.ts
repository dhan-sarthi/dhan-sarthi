/**
 * ProductShelfPort over ref.products.
 *
 * The shelf is small and changes only when the seed runs, so it is read once and held for a
 * minute. `resolve()` is deliberately conservative: a spoken name matches the id, the name, an
 * alias, or a normalised substring in that order, and a tie between two products is a null —
 * UNKNOWN_PRODUCT is an honest answer, a guess is not.
 */
import type { Product } from '@dhan/core'
import type { Db } from '../../db/pool.ts'
import type { ProductShelfPort, ShelfProduct } from '../../ports/index.ts'
import { shelfSource } from './codes.ts'

interface ProductRow {
  product_id: string
  name: string
  category: Product['category']
  riskometer: Product['riskometer']
  min_investment: number
  lock_in_years: number
  is_transactable: boolean
  manufacturer: string
  expense_ratio: number | null
  insurance_product: boolean
  bundles_protection_and_investment: boolean
  cover_amount: number | null
  cover_type: 'life' | 'health' | 'accident' | null
  indicative_return: number | null
  note: string | null
  aliases: string[]
  source: string
  verified: boolean
}

const LIST_SQL = `
  SELECT product_id, name, category, riskometer, min_investment, lock_in_years, is_transactable,
         manufacturer, expense_ratio, insurance_product, bundles_protection_and_investment,
         cover_amount, cover_type, indicative_return, note, aliases, source, verified
  FROM ref.products
  WHERE valid_to IS NULL OR valid_to > current_date
  ORDER BY created_at, product_id`

function toProduct(row: ProductRow): ShelfProduct {
  return {
    productId: row.product_id,
    name: row.name,
    category: row.category,
    riskometer: row.riskometer,
    minInvestment: row.min_investment,
    lockInYears: row.lock_in_years,
    transactable: row.is_transactable,
    manufacturer: row.manufacturer,
    ...(row.expense_ratio === null ? {} : { expenseRatio: row.expense_ratio }),
    ...(row.insurance_product ? { insuranceProduct: true } : {}),
    ...(row.bundles_protection_and_investment ? { bundlesProtectionAndInvestment: true } : {}),
    ...(row.cover_amount === null ? {} : { coverAmount: row.cover_amount }),
    ...(row.cover_type === null ? {} : { coverType: row.cover_type }),
    ...(row.indicative_return === null ? {} : { indicativeReturn: row.indicative_return }),
    ...(row.note === null ? {} : { note: row.note }),
    aliases: row.aliases,
    source: shelfSource(row.source),
    verified: row.verified,
  }
}

/** Lower-case alphanumerics only, so "Sweep-in FD", "sweep in fd" and "SWEEPIN FD" agree. */
export const normalise = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

export interface ProductShelfOptions {
  ttlMs?: number
  now?: () => number
}

export class PostgresProductShelf implements ProductShelfPort {
  private readonly db: Db
  private readonly opts: ProductShelfOptions
  private cache: { at: number; products: ShelfProduct[] } | null = null

  constructor(db: Db, opts: ProductShelfOptions = {}) {
    this.db = db
    this.opts = opts
  }

  async list(): Promise<ShelfProduct[]> {
    const now = (this.opts.now ?? Date.now)()
    if (this.cache && now - this.cache.at < (this.opts.ttlMs ?? 60_000)) return this.cache.products
    const { rows } = await this.db.query<ProductRow>(LIST_SQL)
    const products = rows.map(toProduct)
    this.cache = { at: now, products }
    return products
  }

  async byId(productId: string): Promise<ShelfProduct | null> {
    return (await this.list()).find((p) => p.productId === productId) ?? null
  }

  async resolve(spokenName: string): Promise<ShelfProduct | null> {
    const query = normalise(spokenName)
    if (query.length < 2) return null
    const shelf = await this.list()

    const exact = shelf.find(
      (p) =>
        normalise(p.productId) === query ||
        normalise(p.name) === query ||
        p.aliases.some((a) => normalise(a) === query),
    )
    if (exact) return exact

    // Substring both ways: "the LIC ULIP my cousin mentioned" contains an alias, and "ulip"
    // is contained in a name. The longest overlap wins; a tie is ambiguity, not a match.
    let best: { product: ShelfProduct; length: number } | null = null
    let tied = false
    for (const p of shelf) {
      for (const candidate of [p.name, ...p.aliases].map(normalise)) {
        if (candidate.length < 3) continue
        const hit = query.includes(candidate) || candidate.includes(query)
        if (!hit) continue
        const length = Math.min(candidate.length, query.length)
        if (!best || length > best.length) {
          best = { product: p, length }
          tied = false
        } else if (length === best.length && best.product !== p) {
          tied = true
        }
      }
    }
    return best && !tied ? best.product : null
  }
}
