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
 * own transport, with AbortSignal timeouts and a circuit breaker), `application/avatar/
 * provider-router.ts` (both at once: sends each call to the adapter its credential belongs to),
 * `adapters/null/avatar-provider.null.ts` (every call fails with `not_configured`;
 * `AVATAR_PROVIDER=none` or `AVATAR_ENABLED=false`) and the test double `FakeAvatarProvider` (scripted READY / queued-for-the-window / FAILED; counts
 * `issueGrant()` calls so the open-before-issue ordering can be asserted).
 */
import type {
  AvatarProviderName,
  AvatarTransport,
  BreakerState,
  ConversationTurn,
  ToolDefinition,
} from '@dhan/contracts'

/** A provider a credential can belong to. `none` has no credentials. */
export type AvatarVendor = Exclude<AvatarProviderName, 'none'>

export interface AvatarCredential {
  /**
   * Whose key this is. The pool holds Runway and Anam credentials side by side, in the order
   * they are tried, and every call made on a credential goes to this provider's adapter.
   */
  provider: AvatarVendor
  key: string
  characterId: string
  /** For logs and cost attribution. Never the key itself. */
  label: string
  /**
   * Anam only, and only where this account's differ from the account-wide `ANAM_VOICE_ID` /
   * `ANAM_LLM_ID`: a cloned voice belongs to the account that cloned it, so a second Anam
   * account carries its own.
   */
  voiceId?: string
  llmId?: string
}

/** What the browser is handed. `transport` says which client SDK opens it. */
export interface IssuedGrant {
  transport: AvatarTransport
  /** Empty where the provider has no room to join. */
  url: string
  token: string
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
  /**
   * The per-call cap: min(RUNWAY_MAX_SESSION_SECONDS, budget left, what the account can pay for).
   * Runway bills from the hand-over, not from creation: a created, READY, gated session that is
   * never consumed cost 0 credits when measured on 22 September 2026.
   */
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
  /**
   * Unbilled. What the account behind this credential has left to spend, in the provider's own
   * units (Runway: credits), or null where the provider does not say. The pool reads it to skip
   * an account that is out before trying it, rather than learning from a refused create.
   */
  credits(cred: AvatarCredential): Promise<number | null>
  /**
   * Unbilled. How many more sessions the account may create today, or null where the provider
   * has no daily cap to report. Runway counts every create, used or not, against 50 a day.
   */
  sessionsLeftToday(cred: AvatarCredential): Promise<number | null>
  createSession(
    cred: AvatarCredential,
    opts: AvatarSessionOptions,
  ): Promise<{ runwaySessionId: string }>
  /**
   * Block until the call is worth issuing, or fail. How many round trips that takes is the
   * adapter's business: Runway polls a worker to READY, Anam has nothing to wait for and
   * returns at once.
   *
   * `queued: true` is not a failure on sight. FAILED, CANCELLED, the timeout, and a queue that
   * has not moved for `queuedGiveUpMs` end the wait — the last only when the caller has another
   * account to try, which is why it is the caller's to set.
   */
  awaitIssuable(
    cred: AvatarCredential,
    runwaySessionId: string,
    opts: { timeoutMs: number; queuedGiveUpMs?: number },
  ): Promise<void>
  /**
   * Hand the browser what it needs to connect. Legal only once the tool gate is open; the
   * lifecycle state machine enforces it. May be one-shot. `transport` is the one provider fact
   * that reaches the browser, because the two speak different wire protocols; `url` is empty
   * where the provider has no room to join.
   */
  issueGrant(cred: AvatarCredential, runwaySessionId: string): Promise<IssuedGrant>
  /**
   * Stop the worker and the billing. Safe on an already-dead session.
   *
   * `graceMs` is for a customer who has already hung up — told the worker goodbye and left: wait
   * up to that long for the session to end on its own, and cancel only if it has not. On Runway
   * a session that ends itself keeps its transcript and recording; a cancelled one keeps neither.
   */
  cancel(
    cred: AvatarCredential,
    runwaySessionId: string,
    opts?: { graceMs?: number },
  ): Promise<void>
  /** Null when the provider has no turns yet; the caller retries with backoff. */
  getConversation(
    cred: AvatarCredential,
    runwaySessionId: string,
  ): Promise<ConversationTurn[] | null>
  /**
   * The line to the provider `cred` belongs to, or — with no credential — the best line of all
   * of them: a pool that can still reach one provider is not down.
   */
  breakerState(cred?: AvatarCredential): BreakerState
}
