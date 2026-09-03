/**
 * A circuit breaker for the provider line.
 *
 * Three consecutive failures open it for thirty seconds; while open, every call is refused at
 * once so nobody waits on a slot that cannot be granted. After the window it half-opens and
 * admits exactly one probe — the transport marks the unbilled character lookup as that probe —
 * and a success closes it. Time is injected so a test can move it.
 */
import type { BreakerState } from '@dhan/contracts'

export class BreakerOpenError extends Error {
  readonly retryAfterMs: number

  constructor(retryAfterMs: number) {
    super('The provider line is down right now.')
    this.name = 'BreakerOpenError'
    this.retryAfterMs = retryAfterMs
  }
}

export interface CircuitOptions {
  failureThreshold: number
  openMs: number
  now: () => number
}

const DEFAULTS: CircuitOptions = { failureThreshold: 3, openMs: 30_000, now: () => Date.now() }

export class CircuitBreaker {
  private readonly opts: CircuitOptions
  private failures = 0
  private openedAt: number | null = null
  private probing = false

  constructor(options: Partial<CircuitOptions> = {}) {
    this.opts = { ...DEFAULTS, ...options }
  }

  state(): BreakerState {
    if (this.openedAt === null) return 'closed'
    return this.opts.now() - this.openedAt >= this.opts.openMs ? 'half-open' : 'open'
  }

  private retryAfterMs(): number {
    if (this.openedAt === null) return 0
    return Math.max(0, this.opts.openMs - (this.opts.now() - this.openedAt))
  }

  /**
   * Run a call under the breaker. Only a call flagged `probe` passes while half-open, and only
   * one at a time, so a burst of grants cannot all hit a line that has just come back.
   */
  async exec<T>(fn: () => Promise<T>, opts: { probe?: boolean } = {}): Promise<T> {
    const state = this.state()
    if (state === 'open') throw new BreakerOpenError(this.retryAfterMs())
    if (state === 'half-open' && (!opts.probe || this.probing)) {
      throw new BreakerOpenError(0)
    }
    if (state === 'half-open') this.probing = true

    try {
      const result = await fn()
      this.recordSuccess()
      return result
    } catch (err) {
      this.recordFailure()
      throw err
    } finally {
      this.probing = false
    }
  }

  recordSuccess(): void {
    this.failures = 0
    this.openedAt = null
  }

  recordFailure(): void {
    this.failures += 1
    if (this.failures >= this.opts.failureThreshold) this.openedAt = this.opts.now()
  }
}
