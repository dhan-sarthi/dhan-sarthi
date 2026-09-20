/**
 * The API contract, defined once.
 *
 * The API validates requests and responses against these schemas; `apps/mobile` imports the
 * inferred types. Two clients shared this package until `apps/web` was deleted on 20 September
 * 2026 (`docs/architecture/adr/ADR-0001.md`), and the one that remains needs it exactly as much:
 * without it, a client is a guess at what the server returns, checked by nothing.
 *
 * Rule: a route may not return a shape that is not declared here.
 *
 *   common      ids, money, dates, the error body
 *   domain      zod mirrors of the core types that cross the wire, plus the wire-only shapes
 *   routes/*    request and response schemas, one file per route group
 *   registry    ROUTES — the one table — and the types inferred from it by route id
 *   tools/*     the tools and their JSON Schema
 */
export * from './common.ts'
export * from './domain.ts'
export * from './route.ts'
export * from './routes/index.ts'
export * from './registry.ts'
export * from './tools/index.ts'
