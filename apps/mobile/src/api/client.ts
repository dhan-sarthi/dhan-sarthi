// The API client.
//
// The mobile app talks to the Fastify service in `apps/api`. That service had two clients
// and one rule — add routes, never change or remove one, because `apps/web` had no
// end-to-end tests and would break silently. `apps/web` is gone, so this is the only client
// left and the silent breakage the rule guarded against has nowhere to happen. The rule is
// still written down in CONTRIBUTING.md; lifting it is the owner's call, not something a caller
// may quietly assume. Everything the onboarding flow needs already exists on that service,
// so this slice adds nothing.
import Constants from 'expo-constants'
import { getItem, setItem as putItem, removeItem } from '~/api/storage'
import type {
  Answer,
  AskSuggestions,
  AskTurn,
  AvatarAvailability,
  AvatarGrant,
  AvatarPrepared,
  ChallengeDraft,
  ChallengeQuote,
  ChallengeView,
  CustomerSummary,
  DecisionKind,
  DecisionResponse,
  EvaluateResponse,
  GoalPatch,
  HoldingsResponse,
  ProfilePatch,
  RecordView,
  Rule,
  SaveHackPatch,
  SaveView,
  SessionState,
  ShelfProduct,
  SpendTarget,
  TransactionsPage,
  View,
} from '@dhan/contracts'

// The two request bodies a screen has to build itself, re-exported from here so that a
// screen can take the body type from the client it is about to call rather than having to
// know which route file the contract filed the request shape in.
export type { ChallengeDraft, SaveHackPatch } from '@dhan/contracts'

const TOKEN_KEY = 'dhan.session.token'

function baseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  // A device on the LAN cannot reach the packager's "localhost", so fall back to the
  // host Metro is being served from — the same address Expo already handed the app.
  const host = Constants.expoConfig?.hostUri?.split(':')[0]
  return host ? `http://${host}:3001` : 'http://localhost:3001'
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

let memoryToken: string | null = null

const tokenWatchers = new Set<() => void>()

/**
 * Called whenever the bearer appears or is dropped. Returns its own unsubscribe.
 *
 * The snapshot module gates its read on there being a bearer, so it needs telling when one
 * arrives — otherwise a customer who finishes signup sits behind a gate that was decided
 * before they had a token, and the tabs open empty and stay empty. `createSession` routes
 * through `setToken`, so completing signup is what fires this.
 */
export function onTokenChange(fn: () => void): () => void {
  tokenWatchers.add(fn)
  return () => {
    tokenWatchers.delete(fn)
  }
}

export async function getToken(): Promise<string | null> {
  if (memoryToken) return memoryToken
  memoryToken = await getItem(TOKEN_KEY)
  return memoryToken
}

export async function setToken(token: string | null): Promise<void> {
  memoryToken = token
  if (token) await putItem(TOKEN_KEY, token)
  else await removeItem(TOKEN_KEY)
  for (const fn of tokenWatchers) fn()
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; auth?: boolean; headers?: Record<string, string> } = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  Object.assign(headers, init.headers ?? {})
  if (init.auth !== false) {
    const token = await getToken()
    if (token) headers.authorization = `Bearer ${token}`
  }

  const res = await fetch(`${baseUrl()}${path}`, {
    method: init.method ?? 'GET',
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })

  if (res.status === 204) return undefined as T
  const text = await res.text()
  // Not every body is JSON: a proxy answers a 502 with an HTML page, and parsing that threw a
  // SyntaxError past every `instanceof ApiError` branch a screen has, so the customer saw a
  // parser's complaint where "couldn't reach the bank" belonged. An unparseable body is no
  // body; the status still decides, and the first line of the text stands in for a message.
  let json: unknown
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = undefined
  }

  if (!res.ok) {
    const body = json as { code?: string; message?: string } | undefined
    throw new ApiError(
      res.status,
      body?.code ?? 'UNKNOWN',
      body?.message ?? (text.slice(0, 120) || `HTTP ${res.status}`),
    )
  }
  return json as T
}

export const api = {
  customers: () => request<CustomerSummary[]>('/api/v1/customers', { auth: false }),

  createSession: async (cif: string) => {
    const out = await request<{ token: string; session: unknown }>('/api/v1/sessions', {
      method: 'POST',
      body: { cif },
      auth: false,
    })
    await setToken(out.token)
    return out
  },

  /**
   * Only the named fields move; an absent one means "leave it".
   *
   * Typed as the contract's own `ProfilePatch` rather than as a bag of unknowns. The route
   * validates with `.strict()`, so a field the schema does not name — or a `riskProfile`
   * outside its three values — is a 400 at the step that commits the whole signup, three
   * screens after the wrong answer was given. `ProfilePatch` makes that a compile error here
   * instead.
   */
  patchProfile: (patch: ProfilePatch) =>
    request<unknown>('/api/v1/profile', { method: 'PATCH', body: patch }),

  setConsent: (scope: string, granted: boolean) =>
    request<unknown>('/api/v1/session/consent', { method: 'POST', body: { scope, granted } }),

  /**
   * The customer's own monthly ceiling, or null to remove it.
   *
   * The engine holds it to what the month can actually afford, so a limit set above that is
   * stored as typed and applied as the lower figure. The screen reads the result back rather
   * than assuming what it sent is what now applies.
   */
  setSpendLimit: (monthlyLimit: number | null) =>
    request<SessionState>('/api/v1/session/spend-limit', {
      method: 'POST',
      body: { monthlyLimit },
    }),

  /** A monthly limit on one category, or null to clear it. `dailyplan` reads these. */
  setCategoryCap: (category: string, monthlyLimit: number | null) =>
    request<SessionState>('/api/v1/session/caps', {
      method: 'POST',
      body: { category, monthlyLimit },
    }),

  /**
   * The goal: the kind the customer chose, their own target for it, or both at once.
   *
   * Typed as the contract's `GoalPatch`, which the route holds strictly — at least one of `kind`
   * and `targetAmount`, and an `amountBasis` only beside an amount. A kind other than the one
   * stored takes the stored target with it unless this same patch sets one, so a figure typed
   * for clearing a card never becomes the figure for retirement.
   */
  setGoal: (goal: GoalPatch) =>
    request<SessionState>('/api/v1/session/goal', { method: 'PATCH', body: goal }),

  view: () => request<View>('/api/v1/view'),

  suggestions: () => request<AskSuggestions>('/api/v1/ask/suggestions'),

  /**
   * Ask in text. `history` is the exchange already on screen — the server keeps no transcript,
   * so a follow-up like "and the month before?" only works because the client sends its own.
   */
  ask: (question: string, history: AskTurn[] = []) =>
    request<Answer>('/api/v1/ask', { method: 'POST', body: { question, history } }),

  /**
   * Ask for a live call with Uday.
   *
   * The client sends its bearer and, at most, the headline of the insight it came from. The
   * personality brief is built server-side and is not editable from here, which is what stops
   * a customer talking the advisor into a different set of rules. 409 means Uday is with someone (the body carries a waitlist
   * ticket); 429, 502 and 503 mean no call is possible right now and the text tier stands in.
   */
  avatarSession: (topic?: string | null) =>
    request<AvatarGrant>('/api/v1/avatar/session', {
      method: 'POST',
      // `topic` is what the customer tapped, where they arrived from a smart insight. The
      // server folds it into the opening and builds everything else itself.
      body: topic ? { topic } : {},
      // Unlike a decision, whose key is derived so a retry of the same choice collapses, each
      // attempt to open a call is genuinely a new one — it leases a credential and starts
      // billing. A fresh key every time is what makes a second tap a second call rather than
      // a replay of the first one's grant, which would have expired.
      headers: {
        'idempotency-key': `call-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      },
    }),

  /**
   * Ready a call while the customer is still looking at Uday: the server creates it, waits for
   * it and opens the gate, and hands nothing over — free on Runway until it is. The next
   * `avatarSession` then takes seconds off the wait. `prepared: false` is not an error.
   */
  prepareAvatarSession: (topic?: string | null) =>
    request<AvatarPrepared>('/api/v1/avatar/session/prepare', {
      method: 'POST',
      body: topic ? { topic } : {},
    }),

  endAvatarSession: (id: string) =>
    request<unknown>(`/api/v1/avatar/session/${encodeURIComponent(id)}/end`, {
      method: 'POST',
      body: {},
      headers: { 'idempotency-key': `end-${id}` },
    }),

  avatarAvailability: () =>
    request<AvatarAvailability>('/api/v1/avatar/availability', { auth: true }),

  /** Cursor-paged statement lines, newest first. */
  transactions: (cursor?: string, limit = 40) =>
    request<TransactionsPage>(
      `/api/v1/transactions?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),

  session: () => request<SessionState>('/api/v1/session'),

  /**
   * Move the simulated clock.
   *
   * `expectedVersion` makes it an optimistic update: two screens pressing +30 days move the
   * clock once, and the loser gets a 409 rather than silently double-advancing a ledger that
   * every other number on screen is derived from.
   */
  advanceClock: (advanceDays: 1 | 7 | 30, expectedVersion: number) =>
    request<SessionState>('/api/v1/session/clock', {
      method: 'POST',
      body: { advanceDays, expectedVersion },
    }),

  resetClock: (expectedVersion: number) =>
    request<SessionState>('/api/v1/session/clock', {
      method: 'POST',
      body: { reset: true, expectedVersion },
    }),

  record: () => request<RecordView>('/api/v1/record'),

  shelf: () => request<ShelfProduct[]>('/api/v1/shelf'),

  rules: () => request<Rule[]>('/api/v1/rules', { auth: false }),

  holdings: () => request<HoldingsResponse>('/api/v1/holdings'),

  /**
   * Ask the gate about a product before buying it.
   *
   * Every call writes an advice record whether it passes or refuses — a verdict nobody
   * recorded is a verdict nobody can audit, and the refusals are the ones worth keeping.
   */
  evaluate: (productId: string, amount: number) =>
    request<EvaluateResponse>('/api/v1/suitability/evaluate', {
      method: 'POST',
      body: { productId, amount },
    }),

  /**
   * Record what the customer did about today's action.
   *
   * The route is idempotent and requires a key, because this is the write that appends an
   * advice record to a hash-chained, five-year-retained audit trail. A double tap on a
   * flaky connection must not put the same decision on that chain twice, so the key is
   * derived from the action and the choice rather than randomly: a genuine retry of the
   * same decision reuses it, and a different decision is a different write.
   */
  decideAction: (actionId: string, kind: DecisionKind, note?: string) =>
    request<DecisionResponse>(`/api/v1/actions/${encodeURIComponent(actionId)}/decision`, {
      method: 'POST',
      body: note === undefined ? { kind } : { kind, note },
      headers: { 'idempotency-key': `${actionId}:${kind}`.slice(0, 128) },
    }),

  save: () => request<SaveView>('/api/v1/save'),

  /**
   * Set one save hack whole.
   *
   * The answer is the entire SaveView rather than the card that changed, because turning one
   * hack on moves the pot's projected inflow, the recommended weekly figure and the
   * four-week numbers printed on every other card along with it. A screen that patched its
   * own copy of one card would be showing four stale figures to save a round trip.
   */
  setSaveHack: (patch: SaveHackPatch) =>
    request<SaveView>('/api/v1/save/hacks', { method: 'POST', body: patch }),

  /**
   * Put money aside by hand.
   *
   * The key carries a wall-clock stamp and so is unique to the press, which is the opposite
   * of `decideAction` above and is the deliberate choice here: two ₹500 deposits on the same
   * simulated day are something customers genuinely do, and a key derived from the amount
   * and the date would swallow the second one as a replay of the first. What the header
   * still buys is the case it exists for — one press whose request is retried on the wire
   * carries the key it was built with, so the retry lands as one deposit and not two.
   */
  addSaveDeposit: (amount: number) =>
    request<SaveView>('/api/v1/save/deposits', {
      method: 'POST',
      body: { amount },
      headers: { 'idempotency-key': `deposit-${amount}-${Date.now()}` },
    }),

  challenges: () => request<ChallengeView>('/api/v1/challenges'),

  /** The limits for one target over one length. A pure question, so it rides on the query. */
  quoteChallenge: (kind: SpendTarget['kind'], name: string, days: number) =>
    request<ChallengeQuote>(
      `/api/v1/challenges/quote?kind=${kind}&name=${encodeURIComponent(name)}&days=${days}`,
    ),

  /**
   * Start the challenge the wizard built.
   *
   * The key is fresh for every press, as the deposit's is. It used to be derived from the
   * draft, so that a second tap would collapse into one challenge, but the API keeps a key's
   * answer for the whole session: a challenge ended and then started again with the same
   * target, length and limit got the first start's 200 replayed, and nothing started. A second
   * press cannot start a second challenge anyway — the wizard ignores taps while one is in
   * flight, and the server answers 409 while one is running. What the key still buys is the
   * one it exists for: a press retried on the wire carries the key it was built with. The
   * time leads so the 128-character slice (a merchant name is free text) can never cut it.
   */
  startChallenge: (draft: ChallengeDraft) =>
    request<ChallengeView>('/api/v1/challenges', {
      method: 'POST',
      body: draft,
      headers: {
        'idempotency-key':
          `challenge-${Date.now()}-${draft.target.kind}-${draft.target.name}`.slice(0, 128),
      },
    }),

  /** 204, so there is nothing to read back: refetch the view after it resolves. */
  endChallenge: (id: string) =>
    request<void>(`/api/v1/challenges/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
