/**
 * What `pnpm seed` writes, computed without a database.
 *
 * The rows come from `@dhan/fixtures`' `seedBundles()`: the same bundles the in-memory adapter
 * holds, so the two profiles are the same facts shaped by the same functions. One bundle per
 * persona is the raw payload that lands in staging.raw_payloads; the projector in cli/seed.ts
 * reads only the payload, never the persona spec, so the seed exercises the path a bank
 * response will take.
 *
 * Everything here is deterministic, which is what makes `--check` meaningful: regenerate,
 * hash, compare with the hash the last run recorded.
 */
import { seedBundles, shelfRows } from '@dhan/fixtures'
import type { SeedBundle, SeedProductRow } from '@dhan/fixtures'
import { hashOf } from '../application/hash.ts'

export interface SeedOptions {
  anchor: string
  historyMonths: number
  forwardMonths: number
  /** Stamped on the run: the fixtures package version plus the build sha. */
  generatorVersion: string
}

export interface SeedPersona {
  bundle: SeedBundle
  /** sha256 of the canonical bundle: the raw payload's content address. */
  payloadHash: string
}

export interface SeedPlan {
  anchor: string
  historyFrom: string
  horizonTo: string
  historyMonths: number
  forwardMonths: number
  generatorVersion: string
  personas: SeedPersona[]
  shelf: SeedProductRow[]
  /** What --check compares, and what /health reports as seedHash under either profile. */
  contentSha256: string
}

/**
 * The seed hash covers the rows, not the picker copy or the wall clock. Field for field the
 * same as the in-memory adapter's `seedContentHash`, and the integration suite asserts the two
 * agree, so `/health` shows one seed hash whichever profile is running.
 */
export function seedContentHash(bundles: readonly SeedBundle[]): string {
  return hashOf(
    bundles.map((b) => ({
      slug: b.slug,
      customer: b.customer,
      consent: b.consent,
      accounts: b.accounts,
      transactions: b.transactions,
      liabilityContracts: b.liabilityContracts,
      sipContracts: b.sipContracts,
      holdings: b.holdings,
      policies: b.policies,
      horizon: b.horizon,
    })),
  )
}

export function buildSeedPlan(opts: SeedOptions): SeedPlan {
  const bundles = seedBundles({
    anchor: opts.anchor,
    historyMonths: opts.historyMonths,
    forwardMonths: opts.forwardMonths,
  })
  const first = bundles[0]
  if (!first) throw new Error('no personas to seed')
  return {
    anchor: first.horizon.anchor,
    historyFrom: first.horizon.from,
    horizonTo: first.horizon.to,
    historyMonths: opts.historyMonths,
    forwardMonths: opts.forwardMonths,
    generatorVersion: opts.generatorVersion,
    personas: bundles.map((bundle) => ({ bundle, payloadHash: hashOf(bundle) })),
    shelf: shelfRows(),
    contentSha256: seedContentHash(bundles),
  }
}
