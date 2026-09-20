/**
 * AvatarProvider over the Anam transport.
 *
 * Anam mints once. `createSession` is the whole of Runway's create-wait-consume in one call —
 * it mints the token, and mints the call id and the gate secret with it, because the tool URLs
 * that carry both are frozen into the persona config here. So:
 *
 *   awaitIssuable   genuinely empty. The token exists the moment it is minted, so there is no
 *                   READY to wait for, no `queued` flag to misread, and none of the failure
 *                   modes that cost twelve dead Runway sessions. It only checks that a token
 *                   was in fact minted for this call
 *   issueGrant      hands the minted token to the browser and forgets it. Not one-shot on
 *                   Anam's side, but the lifecycle still refuses to run it before the gate is
 *                   open, which is the point
 *   cancel          stops the Anam session if a client ever connected and made one exist
 *
 * The call id is ours. Anam's session id does not exist until a browser connects, so nothing
 * here could use it as the identifier the lease, the audit row and `/end` are all keyed by.
 * We set it as Anam's `clientLabel` instead, and the transport resolves the real id from it
 * when there is finally something to stop, a transcript to read, or a liveness to report.
 */
import { randomUUID } from 'node:crypto'
import type { BreakerState, ConversationTurn } from '@dhan/contracts'
import { AvatarProviderError } from '../../application/avatar/provider-error.ts'
import { BreakerOpenError } from '../../infra/circuit.ts'
import { isTimeout } from '../../infra/timeout.ts'
import type { AvatarCredential, AvatarProvider, AvatarSessionOptions } from '../../ports/index.ts'
import type { AnamCallRegistry } from './call-registry.ts'
import { AnamError, type AnamTransport, toAnamTools } from './transport.ts'

function toProviderError(err: unknown): AvatarProviderError {
  if (err instanceof AvatarProviderError) return err
  if (err instanceof BreakerOpenError) return new AvatarProviderError('breaker_open', err.message)
  if (isTimeout(err)) return new AvatarProviderError('timeout', err.message)
  if (err instanceof AnamError) {
    // Anam answers 429 when the org is at its concurrent-session ceiling. That is the same
    // condition Runway signalled by staying queued: our pool had a slot, theirs did not.
    if (err.status === 429) return new AvatarProviderError('queued', err.message, err.status)
    return new AvatarProviderError('http', err.message, err.status)
  }
  return new AvatarProviderError('http', err instanceof Error ? err.message : String(err))
}

/** Anam's roles, in the vocabulary the reconciler and the record already read. */
function toTurn(raw: { role: string; message: string }): ConversationTurn {
  return {
    ...raw,
    role: raw.role === 'persona' ? 'assistant' : raw.role,
    text: raw.message,
  }
}

export interface AnamAvatarProviderOptions {
  transport: AnamTransport
  registry: AnamCallRegistry
  /** Where Anam's servers reach this API. Not a localhost URL: the webhook is server-to-server. */
  publicBaseUrl: string
}

export class AnamAvatarProvider implements AvatarProvider {
  /** Anam's own WebRTC signalling, which the client opens with `@anam-ai/js-sdk`. */
  readonly transport = 'anam' as const
  private readonly http: AnamTransport
  private readonly registry: AnamCallRegistry
  private readonly publicBaseUrl: string
  /** Call id → the minted token, so `issueGrant` can hand back what `createSession` was given. */
  private readonly tokens = new Map<string, string>()

  constructor(options: AnamAvatarProviderOptions) {
    this.http = options.transport
    this.registry = options.registry
    this.publicBaseUrl = options.publicBaseUrl
  }

  async probe(cred: AvatarCredential): Promise<{ ok: boolean; character: string | null }> {
    try {
      const avatar = await this.http.describeAvatar(cred)
      const name = avatar?.['displayName']
      return { ok: true, character: typeof name === 'string' ? name : null }
    } catch {
      return { ok: false, character: null }
    }
  }

  async createSession(
    cred: AvatarCredential,
    opts: AvatarSessionOptions,
  ): Promise<{ runwaySessionId: string }> {
    // Ours, and prefixed, so a glance at a log line or an audit row says which provider ran it.
    const runwaySessionId = `anam_${randomUUID()}`
    const secret = this.registry.mint(runwaySessionId)

    try {
      const token = await this.http.createSessionToken(cred, {
        systemPrompt: opts.personality,
        initialMessage: opts.startScript,
        maxSeconds: opts.maxSeconds,
        clientLabel: runwaySessionId,
        tools: toAnamTools(opts.tools, {
          publicBaseUrl: this.publicBaseUrl,
          runwaySessionId,
          secret,
        }),
      })
      this.tokens.set(runwaySessionId, token)
      return { runwaySessionId }
    } catch (err) {
      this.registry.release(runwaySessionId)
      throw toProviderError(err)
    }
  }

  /**
   * Nothing to wait for. Anam provisions when the client connects, so the only way to learn that
   * the config was wrong is to watch the browser fail — which is the client's job, not a poll's.
   */
  async awaitIssuable(_cred: AvatarCredential, runwaySessionId: string): Promise<void> {
    if (!this.tokens.has(runwaySessionId)) {
      throw new AvatarProviderError('failed', `no minted Anam token for ${runwaySessionId}`)
    }
  }

  async issueGrant(
    _cred: AvatarCredential,
    runwaySessionId: string,
  ): Promise<{ url: string; token: string }> {
    const token = this.tokens.get(runwaySessionId)
    if (!token) {
      throw new AvatarProviderError('failed', `no minted Anam token for ${runwaySessionId}`)
    }
    this.tokens.delete(runwaySessionId)
    // No room to join, so no URL. The client reads the grant's `transport` and knows this.
    return { url: '', token }
  }

  async cancel(cred: AvatarCredential, runwaySessionId: string): Promise<void> {
    this.tokens.delete(runwaySessionId)
    this.registry.release(runwaySessionId)
    try {
      await this.http.stopSession(cred, runwaySessionId)
    } catch (err) {
      throw toProviderError(err)
    }
  }

  async getConversation(
    cred: AvatarCredential,
    runwaySessionId: string,
  ): Promise<ConversationTurn[] | null> {
    try {
      const turns = await this.http.getTranscript(cred, runwaySessionId)
      if (!turns || turns.length === 0) return null
      return turns.map(toTurn)
    } catch (err) {
      throw toProviderError(err)
    }
  }

  breakerState(): BreakerState {
    return this.http.breaker.state()
  }
}
