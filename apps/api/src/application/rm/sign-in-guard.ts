/**
 * Failed RM sign-ins, counted per employee number: the guessing limit that does not depend on
 * knowing who is asking.
 *
 * The route's own limit is per address, and an address is only as good as the proxy chain that
 * reports it: trust every hop and the client writes it. A count per number holds however the
 * address is read, so ten wrong passwords for one number in fifteen minutes refuse the next try,
 * the right password included, until the window ends.
 *
 * Only failures count, so an RM signing in and out to show book scoping never runs into it. Each
 * try is counted before its password is checked and a success takes back its own count, because
 * the check is asynchronous: counted only after it, a burst of guesses sent together would all
 * pass the test before the first one failed. Taking back one count rather than clearing them
 * all means a real sign-in in between does not reset a guesser's. A number nobody holds is
 * counted exactly like one somebody does, so the refusal says nothing about which numbers are on
 * the desk.
 */

export const SIGN_IN_FAILURES = { max: 10, windowMs: 15 * 60_000 } as const

/** Enough for any honest desk; a flood of invented numbers evicts the oldest first. */
const MAX_TRACKED = 10_000

interface Failures {
  count: number
  /** When the window opened, epoch ms. */
  since: number
}

export class SignInGuard {
  private readonly now: () => number
  private readonly failures = new Map<string, Failures>()

  constructor(now: () => number) {
    this.now = now
  }

  /** Milliseconds until this number may try again; 0 when it may try now. */
  retryAfterMs(employeeNo: string): number {
    const entry = this.live(employeeNo)
    if (entry === undefined || entry.count < SIGN_IN_FAILURES.max) return 0
    return Math.max(1, entry.since + SIGN_IN_FAILURES.windowMs - this.now())
  }

  /** Count a try, before its password is checked. */
  attempt(employeeNo: string): void {
    const entry = this.live(employeeNo)
    if (entry !== undefined) {
      entry.count += 1
      return
    }
    if (this.failures.size >= MAX_TRACKED) this.prune()
    this.failures.set(employeeNo, { count: 1, since: this.now() })
  }

  /** The try succeeded: take back its count, and only its count. */
  succeeded(employeeNo: string): void {
    const entry = this.live(employeeNo)
    if (entry === undefined) return
    entry.count -= 1
    if (entry.count <= 0) this.failures.delete(employeeNo)
  }

  /** The entry while its window is open; an expired one is dropped on the way. */
  private live(employeeNo: string): Failures | undefined {
    const entry = this.failures.get(employeeNo)
    if (entry !== undefined && this.now() - entry.since >= SIGN_IN_FAILURES.windowMs) {
      this.failures.delete(employeeNo)
      return undefined
    }
    return entry
  }

  private prune(): void {
    const now = this.now()
    for (const [key, entry] of this.failures) {
      if (now - entry.since >= SIGN_IN_FAILURES.windowMs) this.failures.delete(key)
    }
    // Still full: a Map iterates in insertion order, so the first key is the oldest window.
    while (this.failures.size >= MAX_TRACKED) {
      const oldest = this.failures.keys().next()
      if (oldest.done === true) break
      this.failures.delete(oldest.value)
    }
  }
}
