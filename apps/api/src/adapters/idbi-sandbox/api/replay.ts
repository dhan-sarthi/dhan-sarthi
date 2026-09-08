/**
 * A `fetch` that answers from the captured responses, so the adapter runs with no network.
 *
 * This replaces an offline sandbox that *generated* wire from the fixtures package. That was
 * the wrong thing to test against: it produced the snake_case block shape we had asked IDBI
 * for, so every test that passed against it was a test of our own imagination. What runs here
 * instead is IDBI's own bytes — the forty-two bodies in `captured/`, paired with the request
 * that produced each one — which means a mapping bug shows up offline rather than on the one
 * machine that happens to be allow-listed.
 *
 * Matching is by operation and then by the fields that actually pick a fixture out: an account
 * number, a CIF, a customer id, a consent id. That is not a general request matcher and it
 * does not try to be. It is the same trick the sandbox itself plays, and where two captures of
 * one operation cannot be told apart by those fields the first is served and the ambiguity is
 * reported rather than silently resolved.
 */
import { operationByPath } from './operations.ts'
import type { FetchLike } from './transport.ts'

/** A capture, as the loader hands it over: what was sent, and what came back. */
export interface CapturedCall {
  /** The `/Development/<op>` path segment, variants included. */
  op: string
  request: unknown
  response: unknown
  /** The HTTP status the sandbox answered with; the three refusals are 400. */
  status: number
}

/** The reserved TLD the replay transport is addressed at: it cannot resolve, by design. */
export const REPLAY_BASE_URL = 'https://idbi-replay.invalid'

/** The fields that distinguish one fixture of an operation from another. */
const DISCRIMINATORS = [
  'acctId',
  'acid',
  'foracid',
  'cifId',
  'custCifId',
  'customerId',
  'custId',
  'consentId',
  'consentHandle',
  'accountID',
  'partyIdentifierValue',
  'ein',
  'leadId',
  'intTblCode',
  'fromDate',
  'toDate',
] as const

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Every discriminating value anywhere in a request body, as a sorted `key=value` list. */
function fingerprint(body: unknown): string {
  const found = new Map<string, string>()
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const x of v) walk(x)
      return
    }
    if (!isRecord(v)) return
    for (const [k, x] of Object.entries(v)) {
      if ((DISCRIMINATORS as readonly string[]).includes(k)) {
        if (typeof x === 'string' || typeof x === 'number') found.set(k, String(x))
        else if (isRecord(x) && typeof x['tblCode'] === 'string') found.set(k, x['tblCode'])
      }
      walk(x)
    }
  }
  walk(body)
  return [...found.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
}

export interface ReplayOptions {
  captures: readonly CapturedCall[]
  /** Called when a request matched an operation but no fixture, or matched ambiguously. */
  onMiss?: ((detail: { op: string; fingerprint: string; reason: string }) => void) | undefined
}

export interface ReplayTransport {
  fetch: FetchLike
  /** Every call the adapter made, for a test to assert on. */
  readonly calls: { op: string; body: unknown; matched: boolean }[]
}

/**
 * The replay `fetch`.
 *
 * A request for an operation with no capture at all answers 501 rather than a plausible empty
 * body, because a silent `[]` is how a mapping bug hides. A request that names a captured
 * operation but no captured fixture falls back to the operation's first capture — the sandbox
 * behaves the same way for its own default fixture — and reports the miss.
 */
export function createReplayTransport(options: ReplayOptions): ReplayTransport {
  const byOp = new Map<string, CapturedCall[]>()
  for (const c of options.captures) {
    const list = byOp.get(c.op)
    if (list === undefined) byOp.set(c.op, [c])
    else list.push(c)
  }

  const byFingerprint = new Map<string, CapturedCall>()
  const ambiguous = new Set<string>()
  for (const [op, list] of byOp) {
    for (const c of list) {
      const key = `${op}|${fingerprint(c.request)}`
      if (byFingerprint.has(key)) ambiguous.add(key)
      else byFingerprint.set(key, c)
    }
  }

  const calls: ReplayTransport['calls'] = []

  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    const op = url.pathname.replace(/^\/Development\//, '')
    const raw = typeof init?.body === 'string' ? init.body : '{}'
    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      body = {}
    }

    if (operationByPath(op) === null) {
      calls.push({ op, body, matched: false })
      return json({ message: `replay: ${op} is not a registered operation` }, 404)
    }

    const print = fingerprint(body)
    const key = `${op}|${print}`
    const exact = byFingerprint.get(key)
    if (exact !== undefined && !ambiguous.has(key)) {
      calls.push({ op, body, matched: true })
      return json(exact.response, exact.status)
    }

    const list = byOp.get(op)
    if (list === undefined || list.length === 0) {
      calls.push({ op, body, matched: false })
      options.onMiss?.({ op, fingerprint: print, reason: 'no capture for this operation' })
      return json(
        { message: `replay: no captured response for ${op}; capture it before mapping it` },
        501,
      )
    }

    const fallback = exact ?? list[0]
    calls.push({ op, body, matched: false })
    options.onMiss?.({
      op,
      fingerprint: print,
      reason: ambiguous.has(key)
        ? 'more than one capture shares these fields'
        : 'no capture matches these fields; served the first',
    })
    return json(fallback?.response ?? null, fallback?.status ?? 501)
  }

  return { fetch: fetchImpl, calls }
}

/** The gateway's headers, including the two trace ids every real response carries. */
function json(body: unknown, status: number): Response {
  return new Response(body === null ? '' : JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Replayed, but present: the transport logs these on every call and a missing header
      // would make the replay path differ from the live one in the logs.
      'x-atlas-request-id': '00000000-0000-4000-8000-000000000000',
      'x-atlas-trace-id': '00000000-0000-4000-8000-000000000001',
      'x-atlas-utc-offset': '+00:00',
      'access-control-allow-origin': '*',
    },
  })
}
