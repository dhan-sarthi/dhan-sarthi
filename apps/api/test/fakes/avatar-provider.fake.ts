/**
 * A scripted AvatarProvider: READY, queued for the whole window, or FAILED, with every call
 * recorded in order so a test can assert that the gate opened before the session was consumed.
 */
import type { BreakerState, ConversationTurn } from '@dhan/contracts'
import { AvatarProviderError } from '../../src/application/avatar/provider-error.ts'
import type {
  AvatarCredential,
  AvatarProvider,
  AvatarSessionOptions,
} from '../../src/ports/index.ts'

export interface FakeScript {
  ready?: 'ready' | 'queued' | 'failed'
  failCreate?: boolean
}

export class FakeAvatarProvider implements AvatarProvider {
  readonly events: string[]
  readonly created: { id: string; opts: AvatarSessionOptions }[] = []
  readonly consumed: string[] = []
  readonly cancelled: string[] = []
  script: FakeScript
  breaker: BreakerState = 'closed'
  transcript: ConversationTurn[] | null = null
  private counter = 0

  constructor(events: string[] = [], script: FakeScript = {}) {
    this.events = events
    this.script = script
  }

  async probe(_cred: AvatarCredential): Promise<{ ok: boolean; character: string | null }> {
    this.events.push('probe')
    return { ok: true, character: 'Uday' }
  }

  async createSession(
    _cred: AvatarCredential,
    opts: AvatarSessionOptions,
  ): Promise<{ runwaySessionId: string }> {
    this.events.push('create')
    if (this.script.failCreate) throw new AvatarProviderError('http', 'create refused', 500)
    this.counter += 1
    const id = `fake-session-${this.counter}`
    this.created.push({ id, opts })
    return { runwaySessionId: id }
  }

  async waitUntilReady(
    _cred: AvatarCredential,
    runwaySessionId: string,
    _opts: { timeoutMs: number },
  ): Promise<{ sessionKey: string }> {
    this.events.push('ready')
    if (this.script.ready === 'queued') {
      throw new AvatarProviderError('queued', 'The avatar service is at capacity.', 409)
    }
    if (this.script.ready === 'failed') {
      throw new AvatarProviderError('failed', 'Session failed.', 502)
    }
    return { sessionKey: `key-${runwaySessionId}` }
  }

  async consume(
    runwaySessionId: string,
    _sessionKey: string,
  ): Promise<{ url: string; token: string }> {
    this.events.push('consume')
    this.consumed.push(runwaySessionId)
    return { url: 'wss://fake.livekit.test', token: `token-${runwaySessionId}` }
  }

  async cancel(_cred: AvatarCredential, runwaySessionId: string): Promise<void> {
    this.events.push('cancel')
    this.cancelled.push(runwaySessionId)
  }

  async getConversation(
    _cred: AvatarCredential,
    _runwaySessionId: string,
  ): Promise<ConversationTurn[] | null> {
    return this.transcript
  }

  breakerState(): BreakerState {
    return this.breaker
  }
}
