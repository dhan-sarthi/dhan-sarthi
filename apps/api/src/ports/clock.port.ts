/**
 * The wall clock, for leases, TTLs, budget days and record timestamps.
 *
 * Not the simulated clock: that is session data, moved only by POST /session/clock. Nothing in
 * the application calls `Date.now()` directly, so a test can pin time with `FixedClock`.
 *
 * Implemented by `adapters/clock/system-clock.ts` and `adapters/clock/fixed-clock.ts`.
 */
import type { IsoDate } from '@dhan/contracts'

export interface Clock {
  now(): Date
  /** Today as 'YYYY-MM-DD', in the zone the budget day rolls over in. */
  today(): IsoDate
}
