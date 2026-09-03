/**
 * The realtime avatar provider: create, wait, consume, cancel, and read the transcript after.
 *
 * Implemented by `adapters/runway/provider.ts` (over `adapters/runway/transport.ts`, with
 * AbortSignal timeouts and a circuit breaker), `adapters/null/avatar-provider.null.ts` (every
 * call fails with `not_configured`; `AVATAR_PROVIDER=none` or `AVATAR_ENABLED=false`) and the
 * test double `FakeAvatarProvider` (scripted READY / queued-for-the-window / FAILED; counts
 * `consume()` calls so the open-before-consume ordering can be asserted).
 */
import type { BreakerState, ConversationTurn, RunwayToolDefinition } from '@dhan/contracts'

export interface AvatarCredential {
  key: string
  characterId: string
  /** For logs and cost attribution. Never the key itself. */
  label: string
}

export interface AvatarSessionOptions {
  /** The server-built brief. At most 10,000 characters. */
  personality: string
  /** At most 2,000 characters. */
  startScript: string
  tools: RunwayToolDefinition[]
  /** The per-call cap: min(RUNWAY_MAX_SESSION_SECONDS, budget left). Billing runs from creation. */
  maxSeconds: number
}

export type AvatarFailureKind =
  /** Queued for the whole wait window: the provider's own concurrency limit, not our pool. */
  'queued' | 'failed' | 'timeout' | 'breaker_open' | 'not_configured' | 'http'

/** What an adapter throws. A caller maps `kind` to the error body; nothing else is inspected. */
export interface AvatarProviderFailure extends Error {
  readonly name: 'AvatarProviderError'
  readonly kind: AvatarFailureKind
  readonly status?: number
}

export interface AvatarProvider {
  /** Unbilled. The honest answer to "does this credential work?" and the breaker's half-open probe. */
  probe(cred: AvatarCredential): Promise<{ ok: boolean; character: string | null }>
  createSession(
    cred: AvatarCredential,
    opts: AvatarSessionOptions,
  ): Promise<{ runwaySessionId: string }>
  /** `queued: true` is not a failure. Only FAILED, CANCELLED and the timeout end the wait. */
  waitUntilReady(
    cred: AvatarCredential,
    runwaySessionId: string,
    opts: { timeoutMs: number },
  ): Promise<{ sessionKey: string }>
  /** One shot. Legal only after the RPC host is open; the lifecycle state machine enforces it. */
  consume(runwaySessionId: string, sessionKey: string): Promise<{ url: string; token: string }>
  /** Stop the worker and the billing. Safe on an already-dead session. */
  cancel(cred: AvatarCredential, runwaySessionId: string): Promise<void>
  /** Null when the provider has no turns yet; the caller retries with backoff. */
  getConversation(
    cred: AvatarCredential,
    runwaySessionId: string,
  ): Promise<ConversationTurn[] | null>
  breakerState(): BreakerState
}
