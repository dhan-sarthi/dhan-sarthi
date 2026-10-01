/**
 * Relationship-manager analytics: the definitions behind every number on the RM console.
 *
 * The build spec's Definitions table (`docs/product/rm-console.md`) is implemented here and
 * nowhere else, as pure functions over data the caller supplies, like the rest of this package.
 * The API maps these shapes onto the wire schemas in `@dhan/contracts`; the console imports the
 * formatters directly so a figure prints the same on both sides of the wire.
 *
 * `util.ts` is deliberately absent: it is how these modules read the engine's sentences, not a
 * definition anyone else should build on.
 */
export * from './format.ts'
export * from './segment.ts'
export * from './health.ts'
export * from './signals.ts'
export * from './strength.ts'
export * from './series.ts'
export * from './queue.ts'
export * from './upcoming.ts'
export * from './ledger-events.ts'
export * from './book.ts'
