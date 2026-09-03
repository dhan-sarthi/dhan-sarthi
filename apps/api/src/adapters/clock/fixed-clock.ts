/**
 * A clock a test can hold still or move by hand. `today()` is the UTC date of the pinned
 * instant, so a test that wants a day to roll over sets one.
 */
import type { IsoDate } from '@dhan/contracts'
import type { Clock } from '../../ports/index.ts'

export class FixedClock implements Clock {
  private at: Date

  constructor(at: Date | string = '2026-09-03T09:00:00.000Z') {
    this.at = new Date(at)
  }

  now(): Date {
    return new Date(this.at.getTime())
  }

  today(): IsoDate {
    return this.at.toISOString().slice(0, 10)
  }

  advance(ms: number): void {
    this.at = new Date(this.at.getTime() + ms)
  }

  set(at: Date | string): void {
    this.at = new Date(at)
  }
}
