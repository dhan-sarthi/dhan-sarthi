/**
 * The generated source, as one thing.
 *
 * `@dhan/fixtures` is ~5,600 lines of generator that invents four customers and two years of
 * their ledger. It sits behind `BankDataPort`, `ProductShelfPort` and `DeclaredProfileStore`,
 * which already have three real implementations between them — and then the composition root
 * reached straight past all three and called the generator itself, four times, in three switch
 * cases that each had to agree about four separate things:
 *
 *   the `{anchor, historyMonths, forwardMonths}` triple, which must be the same object the
 *     drift check regenerates from or the check compares two different ledgers and passes;
 *   the `seedBundles(options)` / `regenerate: () => seedBundles(options)` pairing, same reason;
 *   the `@dhan/fixtures@<version>` stamp format, which is written to /health and to
 *     `staging.seed_runs`;
 *   and `declaredSeedsFrom(seedBundles(...))`, the declared mirror.
 *
 * All four live here now, and this is the only file in `apps/api` outside the seed path that
 * names `@dhan/fixtures` — `fixtures-stays-behind-the-generated-source` in
 * .dependency-cruiser.cjs is what keeps it that way.
 *
 * What this does *not* do is shrink the dependency: `BANK_SOURCE` defaults to `memory`, so the
 * API still loads the generator at boot. It confines where fixtures is named, not whether it
 * ships.
 */
import { seedBundles, shelfRows } from '@dhan/fixtures'
import { InMemoryBankData } from './bank-data.memory.ts'
import { InMemoryDeclaredProfiles, declaredSeedsFrom } from './declared-profile.memory.ts'
import { InMemoryProductShelf } from './product-shelf.memory.ts'
import type { Clock } from '../../ports/index.ts'

/** The span the generator is asked for. The one triple, so three callers cannot disagree. */
export interface LedgerOptions {
  anchor: string
  historyMonths: number
  forwardMonths: number
}

/** Rows generated inside this process. No build identity: the process holding them is the generator. */
export function generatorVersion(fixturesVersion: string): string {
  return `@dhan/fixtures@${fixturesVersion}`
}

/**
 * The stamp recorded against rows at rest, which must name the build that wrote them.
 *
 * `gitSha` is positional and explicitly `| undefined` rather than optional, because
 * `exactOptionalPropertyTypes` is on and `config.GIT_SHA` is `string | undefined`.
 */
export function recordedGeneratorVersion(
  fixturesVersion: string,
  gitSha: string | undefined,
): string {
  return `${generatorVersion(fixturesVersion)}+${gitSha?.slice(0, 12) ?? 'dev'}`
}

export interface GeneratedSource {
  /** The ledger held in process. Also the SeedInfo: with no database, provenance lives here. */
  bank: InMemoryBankData
  /** Every generated customer's declared fields, mirrored into a store. */
  profiles: InMemoryDeclaredProfiles
  shelf: InMemoryProductShelf
}

export function generatedSource(
  options: LedgerOptions & { fixturesVersion: string },
  clock: Clock,
): GeneratedSource {
  const seedOptions: LedgerOptions = {
    anchor: options.anchor,
    historyMonths: options.historyMonths,
    forwardMonths: options.forwardMonths,
  }
  const bundles = seedBundles(seedOptions)
  return {
    bank: new InMemoryBankData(bundles, {
      generatorVersion: generatorVersion(options.fixturesVersion),
      ranAt: clock.now().toISOString(),
      // The same options object as the bundles above: a regenerate that disagrees makes the
      // drift check lie rather than fail. That pairing is why this lives in one place.
      regenerate: () => seedBundles(seedOptions),
    }),
    profiles: new InMemoryDeclaredProfiles(declaredSeedsFrom(bundles), clock),
    shelf: new InMemoryProductShelf(shelfRows()),
  }
}

/**
 * The declared half alone: what a Postgres source mirrors, without re-holding the ledger.
 *
 * Separate from `generatedSource` so the Postgres case does not pay for an `InMemoryBankData`
 * it discards, whose constructor hashes forty-odd months of four personas at boot.
 */
export function generatedDeclaredProfiles(
  options: LedgerOptions,
  clock: Clock,
): InMemoryDeclaredProfiles {
  return new InMemoryDeclaredProfiles(declaredSeedsFrom(seedBundles(options)), clock)
}
