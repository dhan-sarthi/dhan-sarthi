/**
 * Domain logic. No I/O of any kind — no database, no network, no environment.
 *
 * Everything here is a pure function over data the caller supplies. That is deliberate: the
 * suitability rules are the compliance story, and a rule you can only exercise by standing up
 * a server is a rule nobody can audit. It also means this package is reusable from the API,
 * from a batch job, or from a test with no fixtures beyond a literal.
 *
 * The pipeline, in dependency order:
 *
 *   categorize  raw narration            -> merchant + category
 *   recurring   enriched transactions    -> repeating series, true annual costs
 *   derive      ledger + series          -> the Snapshot, the single source of truth
 *
 * Nothing above `derive` may read a transaction directly. One snapshot, one set of numbers, and
 * the conversation reads the same object the screens render — so the avatar physically cannot
 * quote a figure the UI does not show.
 */
export type * from './types.ts'
export * from './dates.ts'
export * from './asof.ts'
export * from './liquidity.ts'
export * from './merchants.ts'
export * from './categorize.ts'
export * from './recurring.ts'
export * from './derive.ts'
export * from './suitability.ts'
export * from './projection.ts'
export * from './roadmap.ts'
export * from './goal.ts'
export * from './actions.ts'
export * from './insights.ts'
export * from './dailyplan.ts'
export * from './query.ts'
