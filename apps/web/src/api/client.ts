/**
 * The typed fetch client, generated from the contracts registry.
 *
 * Nothing about a route is repeated here. Method, path, whether it needs the bearer, whether it
 * wants an Idempotency-Key and whether it sets an ETag all come from `ROUTES`, and the request
 * and response types are inferred from the same rows — so when the API adds a field the screen
 * that reads it typechecks against it, and a route the registry does not declare cannot be
 * called at all.
 *
 * Three behaviours on top of `fetch`, each because a reviewer on a phone will hit it:
 *
 *   timeout   12 s on every call. A hung request is indistinguishable from a dead API, and the
 *             offline tier needs a signal, not a spinner. It was 6 s, which was chosen before
 *             anything was talking to a real bank: Neha's view is fifteen sequential pages of
 *             IDBI's 595 and measures 3.7-5.7 s warm, so a 6 s budget was cutting off correct
 *             answers and calling them outages. An API that is actually down refuses the
 *             connection in milliseconds and still falls back instantly; this budget only
 *             governs the rarer case of a socket that hangs.
 *   retry     once, GET only, on a network failure or a 5xx. Mutations are never retried here;
 *             their Idempotency-Key makes a deliberate retry safe, an automatic one a surprise.
 *   ApiError  every failure, including "no network", is one small class with the server's own
 *             `code` and `message`, so a screen can switch on the code and show the sentence.
 */
import { ROUTES } from '@dhan/contracts'
import type {
  BodyInputOf,
  ErrorBody,
  ErrorCode,
  ParamsOf,
  QueryInputOf,
  RouteEntry,
  RouteId,
  SuccessOf,
} from '@dhan/contracts'
import { getToken } from './session.ts'

const TIMEOUT_MS = 12_000
const RETRY_DELAY_MS = 250
const BASE = import.meta.env.VITE_API_BASE ?? ''

/* ---------------------------------------------------------------- Errors */

/** The server's codes, plus the three ways a request can fail before there is a server. */
export type ApiErrorCode = ErrorCode | 'NETWORK' | 'TIMEOUT' | 'ABORTED'

export class ApiError extends Error {
  /** 0 when no response arrived. */
  readonly status: number
  readonly code: ApiErrorCode
  /** The parsed error body, when the server sent one. Extended bodies keep their extra fields. */
  readonly body: (ErrorBody & Record<string, unknown>) | null

  constructor(status: number, code: ApiErrorCode, message: string, body: ApiError['body'] = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.body = body
  }

  /** No answer, or the API itself is down. The trigger for the offline tier. */
  get unreachable(): boolean {
    return this.status === 0 ? this.code !== 'ABORTED' : this.status >= 500
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError

function isErrorBody(v: unknown): v is ErrorBody & Record<string, unknown> {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { code?: unknown }).code === 'string' &&
    typeof (v as { message?: unknown }).message === 'string'
  )
}

/** When the server answered with something that is not an error body — a proxy page, say. */
function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 401:
      return 'UNAUTHORIZED'
    case 403:
      return 'FORBIDDEN'
    case 404:
      return 'NOT_FOUND'
    case 409:
      return 'CONFLICT'
    case 429:
      return 'RATE_LIMITED'
    case 503:
      return 'UNAVAILABLE'
    default:
      return status >= 500 ? 'INTERNAL' : 'VALIDATION'
  }
}

/* ---------------------------------------------------------------- Input types */

type Empty = Record<string, never>

type ParamsArg<Id extends RouteId> = [ParamsOf<Id>] extends [Empty]
  ? { params?: never }
  : { params: ParamsOf<Id> }
type QueryArg<Id extends RouteId> = [QueryInputOf<Id>] extends [Empty]
  ? { query?: never }
  : { query?: QueryInputOf<Id> }
type BodyArg<Id extends RouteId> = [BodyInputOf<Id>] extends [undefined]
  ? { body?: never }
  : { body: BodyInputOf<Id> }

export interface CallOptions {
  /** For idempotent routes. Generated when absent; pass one to make a deliberate retry a replay. */
  idempotencyKey?: string
  /** Extra headers, lowercase names. */
  headers?: Record<string, string>
  /** Sent as If-None-Match on routes that set an ETag. A match comes back as `notModified`. */
  etag?: string
  signal?: AbortSignal
  /** Let the request outlive the page — the avatar release on unload. */
  keepalive?: boolean
}

export type Input<Id extends RouteId> = ParamsArg<Id> & QueryArg<Id> & BodyArg<Id> & CallOptions

/** Routes that need neither params nor body may be called with no input at all. */
type Args<Id extends RouteId> = [ParamsOf<Id>] extends [Empty]
  ? [BodyInputOf<Id>] extends [undefined]
    ? [input?: Input<Id>]
    : [input: Input<Id>]
  : [input: Input<Id>]

export interface Reply<Id extends RouteId> {
  status: number
  body: SuccessOf<Id>
  etag: string | null
  notModified: false
}

export interface NotModified {
  status: 304
  body: undefined
  etag: string | null
  notModified: true
}

/* ---------------------------------------------------------------- Helpers */

const byId = new Map<string, RouteEntry>(ROUTES.map((r) => [r.id, r]))

function routeFor(id: RouteId): RouteEntry {
  const found = byId.get(id)
  if (!found) throw new Error(`no route "${id}" in the registry`)
  return found
}

function buildUrl(
  route: RouteEntry,
  params: Record<string, string> | undefined,
  query: Record<string, unknown> | undefined,
): string {
  const path = route.path.replace(/:([A-Za-z]+)/g, (_, name: string) => {
    const value = params?.[name]
    if (value === undefined) throw new Error(`route "${route.id}" needs :${name}`)
    return encodeURIComponent(value)
  })
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null) qs.set(k, String(v))
  }
  const s = qs.toString()
  return `${BASE}${path}${s ? `?${s}` : ''}`
}

/**
 * `crypto.randomUUID` exists only in secure contexts, and a phone on the same wifi opens this
 * app over plain http. `getRandomValues` is available everywhere and is the same entropy.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  outer: AbortSignal | undefined,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new DOMException('The request timed out.', 'TimeoutError')),
    TIMEOUT_MS,
  )
  const relay = (): void => controller.abort(outer?.reason)
  if (outer?.aborted) relay()
  else outer?.addEventListener('abort', relay, { once: true })

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new ApiError(0, 'TIMEOUT', 'The advisor service did not answer in time.')
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(0, 'ABORTED', 'The request was cancelled.')
    }
    throw new ApiError(0, 'NETWORK', 'Could not reach the advisor service.')
  } finally {
    clearTimeout(timer)
    outer?.removeEventListener('abort', relay)
  }
}

/* ---------------------------------------------------------------- The call */

/**
 * One request, with the raw reply. Most callers want `api()` below; this exists for the one
 * route that answers 304, where "nothing changed" is a result and not an error.
 */
export async function request<Id extends RouteId>(
  id: Id,
  ...args: Args<Id>
): Promise<Reply<Id> | NotModified> {
  const input = (args[0] ?? {}) as Input<Id>
  const route = routeFor(id)

  const headers: Record<string, string> = { accept: 'application/json', ...input.headers }
  if (route.auth === 'session') {
    const token = getToken()
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Your session has ended.')
    headers['authorization'] = `Bearer ${token}`
  }
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  if (route.idempotent) headers['idempotency-key'] = input.idempotencyKey ?? newIdempotencyKey()
  if (input.etag && route.cache?.etag) headers['if-none-match'] = input.etag

  const url = buildUrl(
    route,
    input.params as Record<string, string> | undefined,
    input.query as Record<string, unknown> | undefined,
  )
  const init: RequestInit = {
    method: route.method,
    headers,
    ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
    ...(input.keepalive ? { keepalive: true } : {}),
  }

  const attempts = route.method === 'GET' ? 2 : 1
  for (let attempt = 1; ; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, init, input.signal)
      const text = await res.text()
      let json: unknown = null
      if (text) {
        try {
          json = JSON.parse(text)
        } catch {
          json = null
        }
      }
      const etag = res.headers.get('etag')

      if (res.status === 304) return { status: 304, body: undefined, etag, notModified: true }
      if (res.ok) {
        return { status: res.status, body: json as SuccessOf<Id>, etag, notModified: false }
      }

      const body = isErrorBody(json) ? json : null
      throw new ApiError(
        res.status,
        body?.code ?? codeForStatus(res.status),
        body?.message ?? `The advisor service replied ${res.status}.`,
        body,
      )
    } catch (err) {
      const retryable =
        isApiError(err) && err.code !== 'ABORTED' && (err.status === 0 || err.status >= 500)
      if (attempt < attempts && retryable) {
        await sleep(RETRY_DELAY_MS)
        continue
      }
      throw err
    }
  }
}

/** The success body, or an ApiError. */
export async function api<Id extends RouteId>(id: Id, ...args: Args<Id>): Promise<SuccessOf<Id>> {
  const reply = await request(id, ...args)
  if (reply.notModified) {
    // Only reachable by passing an etag to a route that honours it; those callers use request().
    throw new ApiError(304, 'CONFLICT', 'Nothing has changed.')
  }
  return reply.body
}
