/**
 * What IDBI can put a customer into.
 *
 * Separate from bank data because IDBI's catalogue has no shelf endpoint (ADR-0007): the shelf
 * is fixture-sourced until the bank confirms one. Implemented by
 * `adapters/postgres/product-shelf.postgres.ts` (the `products` table, seeded from
 * `PRODUCT_SHELF` with aliases) and `adapters/memory/product-shelf.memory.ts` (`PRODUCT_SHELF`
 * directly).
 */
import type { Product } from '@dhan/core'
import type { ShelfProduct as WireShelfProduct } from '@dhan/contracts'

/**
 * A core `Product` plus how it got onto the shelf. Typed on core's `Product` rather than the
 * wire mirror so a shelf product goes straight into `evaluate()`; it is still a valid wire
 * `ShelfProduct` for the response.
 */
export type ShelfProduct = Product & Pick<WireShelfProduct, 'aliases' | 'source' | 'verified'>

export interface ProductShelfPort {
  /** Every product, including the ones the gate will refuse. */
  list(): Promise<ShelfProduct[]>
  byId(productId: string): Promise<ShelfProduct | null>
  /**
   * The product a customer or the model named: exact id or name, then an alias, then a
   * normalised substring, else null. Null means UNKNOWN_PRODUCT — never a guess.
   */
  resolve(spokenName: string): Promise<ShelfProduct | null>
}
