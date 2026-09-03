/**
 * The API contract, defined once.
 *
 * The API validates requests and responses against these schemas; web and mobile import the
 * inferred types. This is the whole reason a second client is cheap — without it, a mobile app
 * is a second guess at what the server returns.
 *
 * Rule: a route may not return a shape that is not declared here.
 *
 *   common      ids, money, dates, the error body
 *   domain      zod mirrors of the core types that cross the wire, plus the wire-only shapes
 *   routes/*    request and response schemas, one file per route group
 *   registry    ROUTES — the one table — and the types inferred from it by route id
 *   tools/*     the Runway tools and their JSON Schema
 */
export * from './common.ts'
export * from './domain.ts'
export * from './route.ts'
export * from './routes/index.ts'
export * from './registry.ts'
export * from './tools/index.ts'
