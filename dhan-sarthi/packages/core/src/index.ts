/**
 * Domain logic. No I/O of any kind — no database, no network, no environment.
 *
 * Everything here is a pure function over data the caller supplies. That is deliberate: the
 * suitability rules are the compliance story, and a rule you can only exercise by standing up
 * a server is a rule nobody can audit. It also means this package is reusable from the API,
 * from a batch job, or from a test with no fixtures beyond a literal.
 *
 * Ports from archive/prototype/server/src:
 *   suitability.js -> ./suitability.ts   (7 rules as data; order matters, earliest failure wins)
 *   derive.js      -> ./derive.ts        (one snapshot, one source of truth)
 */
export {}
