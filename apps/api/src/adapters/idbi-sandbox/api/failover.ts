/**
 * A `fetch` that asks the live sandbox first and answers from our own implementation when the
 * sandbox cannot.
 *
 * The sandbox is not ours to keep up. It allow-lists IP addresses, so a deployment on a new
 * network — an AWS NAT gateway, a judge's laptop — is refused at the edge with a 403 from
 * `awselb`; and it is a POC gateway with no uptime promise. Neither is a reason for the product
 * to stop working. What answers instead is the replay transport: IDBI's own response bodies,
 * matched by the identifiers that pick a fixture, refusals included. It speaks the same wire
 * as the bank, so everything above this file — the envelope, the schemas, the mapping — runs
 * unchanged and cannot tell the difference except through `mode()`.
 *
 * Only an outage falls back. A 400 is the bank answering, and "Data not found" from the live
 * sandbox is the truth about that customer; serving a capture over it would be inventing data.
 * An outage is: the connection failing, the live call running past its budget, a 403 at the
 * edge, any 5xx, or a body that is not JSON (a load balancer's HTML page on any status).
 *
 * Once the live side fails, the next `cooldownMs` go straight to the fallback rather than
 * waiting out a timeout on every call — one `/view` makes a dozen calls, and a dozen timeouts
 * is a screen that never loads. After the cooldown one call probes live again.
 */
import type { Logger } from '../../../infra/logger.ts'
import { silentLogger } from '../../../infra/logger.ts'
import type { FetchLike } from './transport.ts'

/** Which side answered the last call. */
export type IdbiLineMode = 'live' | 'fallback'

export interface FailoverFetchOptions {
  live: FetchLike
  fallback: FetchLike
  /** Budget for one live attempt. Kept well inside the transport's own 15 s timeout. */
  liveTimeoutMs?: number | undefined
  /** How long to stay on the fallback after a live failure before probing live again. */
  cooldownMs?: number | undefined
  logger?: Logger | undefined
  now?: (() => number) | undefined
}

export interface FailoverFetch {
  fetch: FetchLike
  /** Which side answered the most recent call; `live` until something has been asked. */
  mode(): IdbiLineMode
  /** Why the live side was last abandoned, for the logs and for an operator. */
  lastFailure(): string | null
}

const DEFAULT_LIVE_TIMEOUT_MS = 6_000
const DEFAULT_COOLDOWN_MS = 60_000

export function createFailoverFetch(options: FailoverFetchOptions): FailoverFetch {
  const liveTimeoutMs = options.liveTimeoutMs ?? DEFAULT_LIVE_TIMEOUT_MS
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS
  const log = options.logger ?? silentLogger
  const now = options.now ?? Date.now

  let mode: IdbiLineMode = 'live'
  let failure: string | null = null
  let liveAgainAt = 0

  const useFallback = (reason: string, input: Parameters<FetchLike>[0], init?: RequestInit) => {
    if (mode === 'live' || failure !== reason) {
      log.warn(
        { reason, cooldownMs },
        'the IDBI sandbox is unavailable; answering from our own implementation',
      )
    }
    mode = 'fallback'
    failure = reason
    liveAgainAt = now() + cooldownMs
    return options.fallback(input, init)
  }

  const fetchImpl: FetchLike = async (input, init) => {
    if (now() < liveAgainAt) {
      mode = 'fallback'
      return options.fallback(input, init)
    }

    // The caller's signal still wins: a request the transport has given up on is not retried
    // against the fallback on its behalf.
    const timeout = AbortSignal.timeout(liveTimeoutMs)
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout

    let res: Response
    try {
      res = await options.live(input, { ...init, signal })
    } catch (err) {
      if (init?.signal?.aborted) throw err
      const reason = timeout.aborted
        ? `no answer within ${String(liveTimeoutMs)} ms`
        : `connection failed: ${err instanceof Error ? err.message : String(err)}`
      return useFallback(reason, input, init)
    }

    // The body is read here rather than streamed through, because whether it parses is part of
    // deciding whose answer this is. The transport reads it whole anyway.
    let text: string
    try {
      text = await res.text()
    } catch (err) {
      if (init?.signal?.aborted) throw err
      return useFallback('the connection dropped mid-body', input, init)
    }
    const outage = outageOf(res.status, text)
    if (outage !== null) return useFallback(outage, input, init)

    if (mode === 'fallback') log.info({}, 'the IDBI sandbox is answering again')
    mode = 'live'
    failure = null
    return new Response(text, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    })
  }

  return { fetch: fetchImpl, mode: () => mode, lastFailure: () => failure }
}

/** Why a live response is an outage rather than an answer, or null when it is an answer. */
function outageOf(status: number, text: string): string | null {
  if (status === 403) return 'refused at the edge (403): this network is not allow-listed'
  if (status >= 500) return `the sandbox answered ${String(status)}`
  // Judged on the body, not the content-type, which the OpenAPI exports never state. An empty
  // body is legitimate (a write's acknowledgement); an HTML page never is.
  if (text.trim() === '') return null
  try {
    JSON.parse(text)
    return null
  } catch {
    return `the sandbox answered ${String(status)} with a body that is not JSON`
  }
}
