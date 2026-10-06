/**
 * What each book customer did, for the RM activity simulator: the fixtures' `BOOK_ACTIVITY`.
 *
 * Here because this directory is where `@dhan/fixtures` may be named
 * (`fixtures-stays-behind-the-generated-source` in .dependency-cruiser.cjs), and composition
 * hands it on from here. It is the same under every source: the activity is part of the
 * synthetic persona, like the ledger the seed writes to Postgres, and it describes only what was
 * asked and when. No verdict and no figure: the rules decide those on the day.
 */
import { BOOK_ACTIVITY } from '@dhan/fixtures'
import type { BookActivity } from '../../application/rm/simulator.ts'

export function generatedBookActivity(): ReadonlyMap<string, BookActivity> {
  return new Map(Object.entries(BOOK_ACTIVITY))
}
