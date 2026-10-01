/**
 * The relationship manager's book, and the whole population the bank sources load.
 *
 * `PERSONAS` is still the four heroes and still what the mobile picker shows; `RM_BOOK` is the
 * forty-six behind them. `ALL_PERSONAS` is what seeding, the in-memory source and the RM console
 * read, heroes first so their positions never move.
 */
import { PERSONAS } from '../personas.ts'
import type { PersonaSpec } from '../personas.ts'
import { RM_BOOK } from './customers.ts'

export { RM_BOOK } from './customers.ts'

export const ALL_PERSONAS: readonly PersonaSpec[] = [...PERSONAS, ...RM_BOOK]
