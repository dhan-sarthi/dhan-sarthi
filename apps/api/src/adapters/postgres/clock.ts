/**
 * The wall clock these adapters default to when the composition root does not hand them one.
 *
 * Budget days roll over in India, because that is where the reviewers and the bill are.
 */
import type { IsoDate } from '@dhan/contracts'
import type { Clock } from '../../ports/index.ts'

export const BUDGET_TIME_ZONE = 'Asia/Kolkata'

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUDGET_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export const systemClock: Clock = {
  now: () => new Date(),
  today: (): IsoDate => fmt.format(new Date()),
}
