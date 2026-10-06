/**
 * Relationship-manager analytics: the definitions behind every number on the RM console.
 *
 * The build spec's Definitions table (`docs/product/rm-console.md`) is implemented here and
 * nowhere else, as pure functions over data the caller supplies, like the rest of this package.
 * The API maps these shapes onto the wire schemas in `@dhan/contracts`; the console imports the
 * formatters directly so a figure prints the same on both sides of the wire.
 *
 * `util.ts` is deliberately absent: it is how these modules read the engine's sentences, not a
 * definition anyone else should build on. The one exception is `revoice`, the engine's second
 * person turned into the RM's third: the API shows the RM sentences the engine wrote to the
 * customer (a plan stage's reason, an action's line) and has to turn them the same way the
 * signals here do, not with a second pronoun table that could disagree.
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
export { revoice } from './util.ts'
