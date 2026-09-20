/**
 * The realtime avatar provider: reserve a call, wait until it is worth issuing, issue it, cancel
 * it, and read the transcript after.
 *
 * The step count is the adapter's business, not the caller's. Runway reserves a worker and polls
 * it to READY; Anam mints a token in one call and has nothing to wait for. Whatever an adapter
 * learns while waiting that it needs at issue time it keeps to itself — the caller holds only
 * `runwaySessionId`.
 *
 * Implemented by `adapters/runway/provider.ts` and `adapters/anam/provider.ts` (each over its
 * own transport, with AbortSignal timeouts and a circuit breaker),
 * `adapters/null/avatar-provider.null.ts` (every call fails with `not_configured`;
 * `AVATAR_PROVIDER=none` or `AVATAR_ENABLED=false`) and the test double `FakeAvatarProvider` (scripted READY / queued-for-the-window / FAILED; counts
 * `issueGrant()` calls so the open-before-issue ordering can be asserted).
 */
import type {
  AvatarTransport,
  BreakerState,
  ConversationTurn,
  ToolDefinition,
} from '@dhan/contracts'

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
  /**
   * What the model must ask us before it can answer, in nobody's wire shape. Each adapter
   * renders these into its own body — Runway's `backend_rpc` rows, Anam's webhooks.
   */
  tools: ToolDefinition[]
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
  /**
   * Which client SDK this provider's grants are for. The one provider fact that reaches the
   * browser, because the two speak different wire protocols; everything else about a call is
   * identical, and a screen never learns which provider it is talking to.
   */
  readonly transport: AvatarTransport
  /** Unbilled. The honest answer to "does this credential work?" and the breaker's half-open probe. */
  probe(cred: AvatarCredential): Promise<{ ok: boolean; character: string | null }>
  createSession(
    cred: AvatarCredential,
    opts: AvatarSessionOptions,
  ): Promise<{ runwaySessionId: string }>
  /**
   * Block until the call is worth issuing, or fail. How many round trips that takes is the
   * adapter's business: Runway polls a worker to READY, Anam has nothing to wait for and
   * returns at once.
   *
   * `queued: true` is not a failure. Only FAILED, CANCELLED and the timeout end the wait.
   */
  awaitIssuable(
    cred: AvatarCredential,
    runwaySessionId: string,
    opts: { timeoutMs: number },
  ): Promise<void>
  /**
   * Hand the browser what it needs to connect. Legal only once the tool gate is open; the
   * lifecycle state machine enforces it. May be one-shot. `url` is empty where the provider
   * has no room to join and the client reads the grant's `transport` instead.
   */
  issueGrant(
    cred: AvatarCredential,
    runwaySessionId: string,
  ): Promise<{ url: string; token: string }>
  /** Stop the worker and the billing. Safe on an already-dead session. */
  cancel(cred: AvatarCredential, runwaySessionId: string): Promise<void>
  /** Null when the provider has no turns yet; the caller retries with backoff. */
  getConversation(
    cred: AvatarCredential,
    runwaySessionId: string,
  ): Promise<ConversationTurn[] | null>
  breakerState(): BreakerState
}
