/**
 * The wall clock. `today()` rolls over at midnight in Kolkata, because the daily minute budget
 * belongs to the day the bank and the reviewers are in, not to UTC.
 */
import type { IsoDate } from '@dhan/contracts'
import type { Clock } from '../../ports/index.ts'

const KOLKATA_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export class SystemClock implements Clock {
  now(): Date {
    return new Date()
  }

  today(): IsoDate {
    return KOLKATA_DAY.format(this.now())
  }
}
