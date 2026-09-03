/**
 * The daily minute budget.
 *
 * Runway bills US$0.20 a minute from session creation, so what protects the account is total
 * minutes in a day, not calls. The meter is read from the LeaseStore rather than a counter in
 * this process, so a redeploy at noon cannot hand the afternoon a fresh budget.
 */
import { AvatarUnavailable } from '../errors.ts'
import type { Clock, LeaseStore } from '../../ports/index.ts'

/** Below this, a granted call would die mid-greeting. Say so instead. */
const MIN_CALL_MINUTES = 2

export class MinuteBudget {
  private readonly leases: LeaseStore
  private readonly clock: Clock
  readonly dailyMinutes: number

  constructor(leases: LeaseStore, clock: Clock, dailyMinutes: number) {
    this.leases = leases
    this.clock = clock
    this.dailyMinutes = dailyMinutes
  }

  async used(): Promise<number> {
    return this.leases.minutesUsed(this.clock.today())
  }

  async left(): Promise<number> {
    return Math.max(0, this.dailyMinutes - (await this.used()))
  }

  async assertAvailable(): Promise<number> {
    const left = await this.left()
    if (left < MIN_CALL_MINUTES) {
      throw new AvatarUnavailable(
        'budget_exhausted',
        'Uday has reached his time limit for today. He will be back tomorrow.',
        secondsUntilTomorrow(this.clock.now()),
      )
    }
    return left
  }
}

function secondsUntilTomorrow(now: Date): number {
  const next = new Date(now)
  next.setUTCHours(24, 0, 0, 0)
  return Math.max(60, Math.round((next.getTime() - now.getTime()) / 1000))
}
