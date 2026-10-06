/**
 * Ledgers, files and snapshots, generated once per test process.
 *
 * Each is a pure function of the spec and the window, so caching it changes nothing a test can
 * observe except how long the suite takes. That stopped being a detail when the loops moved from
 * four personas to fifty: a file that regenerated every ledger in every test spent most of its
 * time producing the same transactions again. Nothing here may be mutated by a caller, and no
 * test does; the determinism tests call the generator directly, because comparing a cached
 * ledger with itself would prove nothing. `generate.test.ts` holds the one property this leans
 * on: a file's transactions are the ledger for the same window.
 *
 * A `*.testkit.ts` file is a helper, not a suite: `node --test` only runs `*.test.ts`.
 */
import { derive } from '@dhan/core'
import type { CustomerFile, Snapshot, Transaction } from '@dhan/core'
import { generateCustomerFile } from './generate.ts'
import type { GenerateOptions } from './generate.ts'
import type { PersonaSpec } from './personas.ts'

const ANCHOR = '2026-09-01'

/** The window every engine test reads: twenty-four months to the anchor. */
export const AT_ANCHOR: GenerateOptions = { anchor: ANCHOR, asOf: ANCHOR, months: 24 }

const keyOf = (spec: PersonaSpec, o: GenerateOptions): string =>
  `${spec.slug}|${o.anchor}|${o.asOf}|${o.months}`

const files = new Map<string, CustomerFile>()
const snapshots = new Map<string, Snapshot>()

/**
 * The ledger for the window. It is the file's own `transactions`: `generateCustomerFile` builds
 * the file around exactly the ledger `generateLedger` returns for the same options, so asking
 * for both never has to generate twice.
 */
export function ledgerOf(spec: PersonaSpec, options: GenerateOptions = AT_ANCHOR): Transaction[] {
  return fileOf(spec, options).transactions
}

export function fileOf(spec: PersonaSpec, options: GenerateOptions = AT_ANCHOR): CustomerFile {
  const key = keyOf(spec, options)
  const hit = files.get(key)
  if (hit) return hit
  const made = generateCustomerFile(spec, options)
  files.set(key, made)
  return made
}

/** The snapshot the engine derives at `asOf`, over the file generated for that date. */
export function snapshotOf(spec: PersonaSpec, asOf: string = ANCHOR): Snapshot {
  const options = { ...AT_ANCHOR, asOf }
  const key = keyOf(spec, options)
  const hit = snapshots.get(key)
  if (hit) return hit
  const made = derive(fileOf(spec, options), asOf)
  snapshots.set(key, made)
  return made
}
