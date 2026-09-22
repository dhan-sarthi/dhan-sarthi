/**
 * Which accounts in the pool are worth trying right now, and why not the others.
 *
 * The pool is an ordered chain — Runway's accounts, then Anam's — and the order is the policy:
 * a customer gets the first account that can actually take the call. "Can" has three parts the
 * lease store cannot see:
 *
 *   credit   Runway bills from the account's own balance (2 credits up front, 2 per six
 *            seconds). An empty account refuses the create; it should not be asked
 *   busy     each account runs one call at a time, and something outside this process — a
 *            dashboard test, a second server — can be holding it
 *   broken   a wrong key, a deleted character, a provider having a bad minute
 *
 * An account that fails one of those is benched for a while, and the next grant goes past it
 * without paying a round trip to be refused again. Benching is memory, not truth: it expires on
 * its own, and the credit watch below clears it early the moment the balance says otherwise.
 */
import type { Logger } from '../../infra/logger.ts'
import type { AvatarCredential, AvatarProvider, AvatarVendor } from '../../ports/index.ts'
import type { CredentialPool } from './credential-pool.ts'
import { isAvatarProviderFailure } from './provider-error.ts'

export type BenchReason =
  /** The account's balance cannot carry a call. */
  | 'out_of_credits'
  /** The account's one concurrent slot is taken by something we do not hold a lease for. */
  | 'busy'
  /** The provider refused this key or this character outright: a configuration fault. */
  | 'refused'
  /** Timeouts, 5xx, a gate that would not join. Usually the provider, briefly. */
  | 'failing'

export interface BenchEntry {
  label: string
  reason: BenchReason
  /** Epoch ms. Past this the account is tried again. */
  until: number
  detail: string
}

/**
 * What a failed grant says about the account it ran on.
 *
 * `scope: 'provider'` means the fault is not this account's — Runway itself timing out, its line
 * tripped, LiveKit unreachable — so the other accounts *of the same provider* are skipped for
 * the rest of this grant rather than each spending eight seconds proving the same thing. Such a
 * fault benches nothing (`benchMs: 0`): one bad minute is the circuit breaker's to judge across
 * requests, and benching the only account on a blip would hide the call button for no reason.
 */
export interface FailureVerdict {
  reason: BenchReason
  benchMs: number
  scope: 'account' | 'provider'
}

const MINUTE = 60_000
const BENCH_MS: Record<BenchReason, number> = {
  out_of_credits: 30 * MINUTE,
  busy: MINUTE,
  refused: 10 * MINUTE,
  // A session that FAILED on one account: brief, because a worker can die for reasons that are
  // gone by the next call.
  failing: 15_000,
}

/** Words a provider uses when the balance, not the request, is the problem. */
const CREDIT_WORDS = /credit|balance|insufficient|quota|payment|billing|funds|top.?up/i

/**
 * Classify a grant failure, or return null when it is not the provider's at all — a bug, a
 * domain refusal — and must not be retried on another account.
 *
 * `gate` is the session service's own marker for an RPC host that would not open.
 */
export function classifyFailure(err: unknown, gate: boolean): FailureVerdict | null {
  const verdict = (reason: BenchReason, scope: FailureVerdict['scope']): FailureVerdict => ({
    reason,
    benchMs: scope === 'provider' ? 0 : BENCH_MS[reason],
    scope,
  })
  if (gate) return verdict('failing', 'provider')
  if (!isAvatarProviderFailure(err)) return null

  switch (err.kind) {
    case 'queued':
      return verdict('busy', 'account')
    case 'failed':
      return verdict('failing', 'account')
    case 'not_configured':
      return verdict('refused', 'account')
    case 'timeout':
    case 'breaker_open':
      return verdict('failing', 'provider')
    case 'http': {
      const status = err.status ?? 500
      if (status >= 500) return verdict('failing', 'provider')
      if (status === 402 || CREDIT_WORDS.test(err.message)) {
        return verdict('out_of_credits', 'account')
      }
      if (status === 429 || status === 409) return verdict('busy', 'account')
      return verdict('refused', 'account')
    }
  }
}

export class CredentialHealth {
  private readonly now: () => number
  private readonly benched = new Map<string, BenchEntry>()
  /** Last balance read per label, in the provider's units. Absent where it has none. */
  private readonly balances = new Map<string, { credits: number; at: number }>()
  /** Last read of how many sessions each account may still create today. */
  private readonly daily = new Map<string, number>()

  constructor(now: () => number) {
    this.now = now
  }

  isBenched(label: string): boolean {
    const entry = this.benched.get(label)
    if (!entry) return false
    if (this.now() >= entry.until) {
      this.benched.delete(label)
      return false
    }
    return true
  }

  /** Benched for a guess about the next minute — busy, failing — rather than for a fact. */
  isTransient(label: string): boolean {
    const entry = this.benched.get(label)
    return entry !== undefined && (entry.reason === 'busy' || entry.reason === 'failing')
  }

  bench(label: string, reason: BenchReason, forMs: number, detail: string): void {
    this.benched.set(label, { label, reason, until: this.now() + forMs, detail })
  }

  /** Only lifts a bench of the given reason, so a balance read cannot unbench a bad key. */
  clear(label: string, reason?: BenchReason): void {
    const entry = this.benched.get(label)
    if (entry && (reason === undefined || entry.reason === reason)) this.benched.delete(label)
  }

  recordCredits(label: string, credits: number): void {
    this.balances.set(label, { credits, at: this.now() })
  }

  recordSessionsLeft(label: string, left: number): void {
    this.daily.set(label, left)
  }

  /** Sessions the account may still create today, as last read; null where unknown or uncapped. */
  sessionsLeft(label: string): number | null {
    return this.daily.get(label) ?? null
  }

  /** The last balance read, if any. Stale is still better than nothing for a per-call cap. */
  credits(label: string): number | null {
    return this.balances.get(label)?.credits ?? null
  }

  /** For the operator view and the logs. Expired entries are dropped on the way. */
  list(): BenchEntry[] {
    return [...this.benched.keys()]
      .filter((l) => this.isBenched(l))
      .map((l) => this.benched.get(l)!)
  }
}

export interface CreditWatchDeps {
  provider: AvatarProvider
  pool: CredentialPool
  health: CredentialHealth
  log: Logger
  /**
   * Below this an account is benched as out of credits. In the provider's units; Runway's
   * default of 42 is two minutes at 20 credits a minute plus the 2 up front, so the last call an
   * account takes is not cut off in its first sentence.
   */
  minCredits: number
  /** How long a balance read answers for before availability asks again. */
  refreshAfterMs?: number
  now: () => number
}

/**
 * Keeps each account's balance roughly current, off the customer's path.
 *
 * Read at start-up, after every call the account carried, and — at most once a minute — when
 * someone opens the call screen. Never on the grant itself: a cold connection to Runway is
 * three quarters of a second, and that is the P0 number. A stale balance costs at worst one
 * refused create, which the failover then absorbs.
 */
export class CreditWatch {
  private readonly deps: CreditWatchDeps
  private readonly refreshAfterMs: number
  private lastSweep = Number.NEGATIVE_INFINITY
  private inFlight: Promise<void> | null = null

  constructor(deps: CreditWatchDeps) {
    this.deps = deps
    this.refreshAfterMs = deps.refreshAfterMs ?? MINUTE
  }

  /** Every account whose provider publishes a balance. Deduplicated while one is running. */
  sweep(): Promise<void> {
    if (this.inFlight) return this.inFlight
    this.lastSweep = this.deps.now()
    this.inFlight = Promise.all(this.deps.pool.list().map((c) => this.refresh(c)))
      .then(() => undefined)
      .finally(() => {
        this.inFlight = null
      })
    return this.inFlight
  }

  /** A sweep if the last one is older than `refreshAfterMs`. Never awaited by a customer. */
  sweepIfStale(): void {
    if (this.deps.now() - this.lastSweep < this.refreshAfterMs) return
    void this.sweep()
  }

  async refresh(cred: AvatarCredential): Promise<void> {
    const { provider, health, log, minCredits } = this.deps
    const [credits, left] = await Promise.all([
      provider.credits(cred).catch(() => null),
      provider.sessionsLeftToday(cred).catch(() => null),
    ])
    if (left !== null) health.recordSessionsLeft(cred.label, left)
    if (credits === null) return
    health.recordCredits(cred.label, credits)
    if (credits < minCredits) {
      if (!health.isBenched(cred.label)) {
        log.warn(
          { label: cred.label, credits, minCredits },
          'avatar account is out of credits; benched until it is topped up',
        )
      }
      health.bench(cred.label, 'out_of_credits', BENCH_MS.out_of_credits, `${credits} credits left`)
    } else {
      health.clear(cred.label, 'out_of_credits')
    }
  }
}

/**
 * The longest call an account's balance can pay for, in seconds, or null where the balance is
 * unknown. Runway: 2 credits up front, then 2 per six seconds.
 */
export function affordableSeconds(vendor: AvatarVendor, credits: number | null): number | null {
  if (credits === null || vendor !== 'runway') return null
  return Math.max(0, Math.floor((credits - 2) / 2) * 6)
}
