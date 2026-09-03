/**
 * ProductShelfPort over the fixture shelf, aliases included.
 *
 * `resolve` is the only clever part, and it is deliberately not very clever: exact id or name,
 * then an alias, then a substring in either direction on the longest matching token. Anything
 * short of that is null, which the tool reports as UNKNOWN_PRODUCT. A guess here would be the
 * model deciding suitability by proxy.
 */
import type { SeedProductRow } from '@dhan/fixtures'
import type { ProductShelfPort, ShelfProduct } from '../../ports/index.ts'

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

export class InMemoryProductShelf implements ProductShelfPort {
  private readonly products: ShelfProduct[]

  constructor(rows: readonly SeedProductRow[]) {
    this.products = rows.map((r) => ({ ...r, aliases: [...r.aliases] }))
  }

  async list(): Promise<ShelfProduct[]> {
    return this.products
  }

  async byId(productId: string): Promise<ShelfProduct | null> {
    return this.products.find((p) => p.productId === productId) ?? null
  }

  async resolve(spokenName: string): Promise<ShelfProduct | null> {
    const q = norm(spokenName)
    if (q.length === 0) return null

    const exact = this.products.find((p) => norm(p.productId) === q || norm(p.name) === q)
    if (exact) return exact

    const byAlias = this.products.find((p) => p.aliases.some((a) => norm(a) === q))
    if (byAlias) return byAlias

    // Substring, scored by the length of the token that matched so "index fund" beats "fund".
    // Two-letter queries are too short to mean anything by containment.
    let best: { product: ShelfProduct; score: number } | null = null
    for (const p of this.products) {
      for (const token of [p.name, ...p.aliases]) {
        const n = norm(token)
        if (n.length < 3) continue
        const hit = q.includes(n) || (q.length >= 3 && n.includes(q))
        if (!hit) continue
        const score = q.includes(n) ? n.length : q.length
        if (!best || score > best.score) best = { product: p, score }
      }
    }
    return best?.product ?? null
  }
}
