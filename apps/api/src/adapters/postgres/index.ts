/**
 * The Postgres adapters: one class per port, all over the same `pg` pool.
 *
 * `createPool({ role: 'dhan_app' })` for the server; the seed and the migrator use the owner.
 */
export { PostgresBankData } from './bank-data.postgres.ts'
export { PostgresProductShelf } from './product-shelf.postgres.ts'
export { PostgresSessionStore } from './session-store.postgres.ts'
export { PostgresSnapshotStore } from './snapshot-store.postgres.ts'
export { PostgresAuditStore, verifyAdviceChain } from './audit-store.postgres.ts'
export { PostgresLeaseStore } from './lease-store.postgres.ts'
export { PostgresSeedInfo, latestSeedRun } from './seed-provenance.postgres.ts'
export { PostgresUnitOfWork, scope, withTransaction } from './unit-of-work.ts'
export type { PostgresStores, Scope, TransactionalStores } from './unit-of-work.ts'
export { systemClock, BUDGET_TIME_ZONE } from './clock.ts'
