/**
 * A scripted AvatarProvider: READY, queued for the whole window, or FAILED, with every call
 * recorded in order so a test can assert that the gate opened before the grant was issued.
 *
 * The event strings are the assertion surface — `['create', 'ready', 'open', 'consume']` is
 * deep-equalled in rpc-before-consume.test.ts — so they stay as they are even though the port's
 * methods have been renamed around them. No session key: the fake has no reason to hold one.
 */
import type { BreakerState, ConversationTurn, AvatarTransport } from '@dhan/contracts'
import { AvatarProviderError } from '../../src/application/avatar/provider-error.ts'
import type {
  AvatarCredential,
  AvatarProvider,
  AvatarSessionOptions,
  IssuedGrant,
} from '../../src/ports/index.ts'

export interface FakeScript {
  ready?: 'ready' | 'queued' | 'failed'
  failCreate?: boolean
  /** Refuse the create the way an account with no balance does: a 4xx naming credits. */
  outOfCredits?: boolean
}

export class FakeAvatarProvider implements AvatarProvider {
  /** Overridable, so a test can assert the grant a given provider would produce. */
  transport: AvatarTransport = 'livekit'

  readonly events: string[]
  readonly created: { id: string; opts: AvatarSessionOptions }[] = []
  readonly consumed: string[] = []
  readonly cancelled: string[] = []
  script: FakeScript
  breaker: BreakerState = 'closed'
  transcript: ConversationTurn[] | null = null
  /** What `credits()` answers. Null, the default, is a provider that publishes no balance. */
  balance: number | null = null
  /** Per-account overrides of `script` and `balance`, keyed by credential label. */
  scriptByLabel: Record<string, FakeScript> = {}
  balanceByLabel: Record<string, number | null> = {}
  /** Which credential each create ran on, in order — the failover's assertion surface. */
  readonly createdOn: string[] = []
  private counter = 0

  constructor(events: string[] = [], script: FakeScript = {}) {
    this.events = events
    this.script = script
  }

  /** What the unbilled probe answers; false is a line still down after its breaker half-opens. */
  probeOk = true

  async probe(_cred: AvatarCredential): Promise<{ ok: boolean; character: string | null }> {
    this.events.push('probe')
    return { ok: this.probeOk, character: 'Uday' }
  }

  async credits(cred: AvatarCredential): Promise<number | null> {
    return cred.label in this.balanceByLabel
      ? (this.balanceByLabel[cred.label] ?? null)
      : this.balance
  }

  /** What `sessionsLeftToday()` answers, per label; absent is a provider with no daily cap. */
  sessionsLeftByLabel: Record<string, number> = {}

  async sessionsLeftToday(cred: AvatarCredential): Promise<number | null> {
    return this.sessionsLeftByLabel[cred.label] ?? null
  }

  private scriptOf(cred: AvatarCredential): FakeScript {
    return this.scriptByLabel[cred.label] ?? this.script
  }

  async createSession(
    cred: AvatarCredential,
    opts: AvatarSessionOptions,
  ): Promise<{ runwaySessionId: string }> {
    this.events.push('create')
    this.createdOn.push(cred.label)
    const script = this.scriptOf(cred)
    if (script.failCreate) throw new AvatarProviderError('http', 'create refused', 500)
    if (script.outOfCredits) {
      throw new AvatarProviderError('http', 'You do not have enough credits to run this task.', 400)
    }
    this.counter += 1
    const id = `fake-session-${this.counter}`
    this.created.push({ id, opts })
    return { runwaySessionId: id }
  }

  /** The wait each READY was given, in order: how long a queue was tolerated, and on what. */
  readonly readyOpts: { label: string; timeoutMs: number; queuedGiveUpMs?: number }[] = []

  async awaitIssuable(
    cred: AvatarCredential,
    _runwaySessionId: string,
    opts: { timeoutMs: number; queuedGiveUpMs?: number },
  ): Promise<void> {
    this.events.push('ready')
    this.readyOpts.push({ label: cred.label, ...opts })
    const script = this.scriptOf(cred)
    if (script.ready === 'queued') {
      throw new AvatarProviderError('queued', 'The avatar service is at capacity.', 409)
    }
    if (script.ready === 'failed') {
      throw new AvatarProviderError('failed', 'Session failed.', 502)
    }
  }

  async issueGrant(_cred: AvatarCredential, runwaySessionId: string): Promise<IssuedGrant> {
    this.events.push('consume')
    this.consumed.push(runwaySessionId)
    return {
      transport: this.transport,
      url: 'wss://fake.livekit.test',
      token: `token-${runwaySessionId}`,
    }
  }

  /** Every cancel's grace, in order: a hang-up waits, every other ending does not. */
  readonly cancelGraces: (number | undefined)[] = []

  async cancel(
    _cred: AvatarCredential,
    runwaySessionId: string,
    opts: { graceMs?: number } = {},
  ): Promise<void> {
    this.cancelGraces.push(opts.graceMs)
    this.events.push('cancel')
    this.cancelled.push(runwaySessionId)
  }

  async getConversation(
    _cred: AvatarCredential,
    _runwaySessionId: string,
  ): Promise<ConversationTurn[] | null> {
    return this.transcript
  }

  breakerState(_cred?: AvatarCredential): BreakerState {
    return this.breaker
  }
}
