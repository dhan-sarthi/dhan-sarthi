/**
 * Where the bank rows came from.
 *
 * Not one of the sixteen ports: it is a small, optional companion a bank-data adapter may offer so
 * the Record tab can show seed provenance and the operator route can check drift. The memory
 * adapter answers from the bundles it holds; a Postgres adapter answers from `seed_runs`; a
 * real feed answers null, which the routes render honestly as "no seed".
 */
import type { SeedProvenance } from '@dhan/contracts'

export interface DriftCheck {
  checked: boolean
  ok: boolean | null
  expectedSha256: string | null
  actualSha256: string | null
}

export interface SeedInfo {
  provenance(): Promise<SeedProvenance | null>
  /** Regenerate and compare, where the source can. */
  drift(): Promise<DriftCheck>
}
