/**
 * The offline sandbox: a fake IDBI that serves the seed bundles in the wire shape, through an
 * injected `fetch`, so the whole adapter runs with no network and no bank.
 *
 * It routes by the same endpoint registry the client calls, checks the same things a bank
 * would (a consent id, a known customer, a parseable window), pages the statement, and stamps
 * block 08 on every answer. Its "today" is `freshness`: reads past it are clamped, because a
 * bank has no future to serve, and the port contract suite for the stub is adapted exactly
 * there. A test can turn the dial the other way — freshness at the seeded horizon — to prove
 * the wire round-trips every clock position the memory adapter can reach.
 *
 * `undici`'s MockAgent would occupy the same seam; it is not importable from Node's bundled
 * copy without adding the package, and the rule here is no new dependencies, so the seam is
 * the `fetch` function itself. `requests` is the log a test reads to prove that consent_id and
 * data_period travelled on every call.
 */
import type { IsoDate } from '@dhan/contracts'
import type { SeedBundle, SeedProductRow } from '@dhan/fixtures'
import type { FetchLike } from './client.ts'
import { matchPath } from './endpoints.ts'
import type { DataBlock } from './endpoints.ts'
import {
  accountsToWire,
  holdingsToWire,
  liabilitiesToWire,
  metaToWire,
  profileToWire,
  shelfToWire,
  signalsToWire,
  transactionsToWire,
  windowLedger,
} from './to-wire.ts'
import { WireFormatError, ddmmyyToDate } from './transforms.ts'

export interface OfflineSandboxOptions {
  bundles: readonly SeedBundle[]
  shelf?: readonly SeedProductRow[]
  /**
   * The fake bank's today: `data_freshness_date` on every response, and the date every read
   * is clamped to. Default: each bundle's ledger horizon, a sandbox that has seen the whole
   * seeded span.
   */
  freshness?: IsoDate | undefined
  pageSize?: number
  /** Simulated round trip, honouring the caller's AbortSignal. For the timeout tests. */
  latencyMs?: number
}

export interface SandboxRequest {
  url: string
  endpoint: string | null
  params: Record<string, string>
  status: number
}

/** A reserved TLD, so a misconfiguration that skips the injected fetch can never reach a real host. */
export const OFFLINE_BASE_URL = 'https://sandbox.idbi.invalid'

const DEFAULT_PAGE_SIZE = 250
const MAX_PAGE_SIZE = 500

interface Failure {
  status: number
  code: string
}

function failure(status: number, code: string): Response {
  return json(status, { meta: { response_status: 'FAILURE', error_code: code } })
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function sleep(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(signal?.reason ?? new DOMException('aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export class OfflineSandbox {
  readonly requests: SandboxRequest[] = []
  readonly fetch: FetchLike
  private readonly bundles: Map<string, SeedBundle>
  private readonly shelf: readonly SeedProductRow[]
  private readonly freshness: IsoDate | undefined
  private readonly pageSize: number
  private readonly latencyMs: number
  private faults: { remaining: number; status: number } = { remaining: 0, status: 503 }

  constructor(options: OfflineSandboxOptions) {
    this.bundles = new Map(options.bundles.map((b) => [b.customer.cif, b]))
    this.shelf = options.shelf ?? []
    this.freshness = options.freshness
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
    this.latencyMs = options.latencyMs ?? 0
    this.fetch = (input, init) => this.handle(input, init)
  }

  /** The next `times` requests answer `status` with no body worth reading. For the breaker tests. */
  failNext(times: number, status = 503): void {
    this.faults = { remaining: times, status }
  }

  /** The fake bank's today for a customer. */
  freshnessFor(cif: string): IsoDate {
    const b = this.bundles.get(cif)
    if (!b) throw new Error(`no bundle for ${cif}`)
    return this.freshness ?? b.horizon.to
  }

  private async handle(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    if (this.latencyMs > 0) await sleep(this.latencyMs, init?.signal)

    const params: Record<string, string> = {}
    for (const [k, v] of url.searchParams) params[k] = v
    const match = matchPath(url.pathname)

    let response: Response
    if (this.faults.remaining > 0) {
      this.faults.remaining -= 1
      response = failure(this.faults.status, 'SANDBOX_FAULT')
    } else {
      const answer = this.answer(match, params)
      response = answer instanceof Response ? answer : failure(answer.status, answer.code)
    }
    this.requests.push({
      url: url.toString(),
      endpoint: match?.spec.code ?? null,
      params,
      status: response.status,
    })
    return response
  }

  private answer(
    match: ReturnType<typeof matchPath>,
    params: Record<string, string>,
  ): Response | Failure {
    if (!match) return { status: 404, code: 'NOT_FOUND' }
    const cif = params['customer_id'] ?? match.params.customer_id
    if (!cif) return { status: 400, code: 'CUSTOMER_ID_REQUIRED' }
    const consentId = params['consent_id']
    if (!consentId) return { status: 400, code: 'CONSENT_REQUIRED' }

    const bundle = this.bundles.get(cif)
    if (!bundle) return { status: 404, code: 'CUSTOMER_NOT_FOUND' }
    if (bundle.consent.consentId !== consentId) return { status: 403, code: 'CONSENT_NOT_FOUND' }
    if (bundle.consent.status !== 'ACTIVE')
      return { status: 403, code: `CONSENT_${bundle.consent.status}` }

    let from: IsoDate
    let to: IsoDate
    try {
      from = ddmmyyToDate(params['data_period_from'] ?? '', 'data_period_from')
      to = ddmmyyToDate(params['data_period_to'] ?? '', 'data_period_to')
    } catch (err) {
      if (err instanceof WireFormatError) return { status: 400, code: 'INVALID_PERIOD' }
      throw err
    }
    if (from > to) return { status: 400, code: 'INVALID_PERIOD' }

    // A bank has no future. The window closes at its own today, whatever was asked.
    const freshness = this.freshness ?? bundle.horizon.to
    const period = { from, to: to < freshness ? to : freshness }
    const ledger = windowLedger(bundle, period)
    const meta = metaToWire(bundle, { from, to }, freshness)
    const envelope = (
      block: DataBlock | null,
      data: unknown,
      paging: Record<string, number> = {},
    ): Response =>
      json(200, {
        customer_id: cif,
        data_block: block ?? 'LIENS',
        ...paging,
        data,
        meta,
      })

    switch (match.spec.block) {
      case 'PROFILE':
        return envelope('PROFILE', profileToWire(bundle, period.to))
      case 'ACCOUNTS':
        return envelope('ACCOUNTS', accountsToWire(bundle, ledger, period.to))
      case 'TXN': {
        const rows = transactionsToWire(ledger)
        const size = Math.min(
          MAX_PAGE_SIZE,
          Math.max(1, Number(params['page_size'] ?? this.pageSize) || this.pageSize),
        )
        const totalPages = Math.max(1, Math.ceil(rows.length / size))
        const page = Math.max(1, Number(params['page'] ?? 1) || 1)
        if (page > totalPages) return { status: 400, code: 'PAGE_OUT_OF_RANGE' }
        return envelope('TXN', rows.slice((page - 1) * size, page * size), {
          page,
          page_size: size,
          total_pages: totalPages,
          total_rows: rows.length,
        })
      }
      case 'HOLDINGS':
        return envelope('HOLDINGS', holdingsToWire(bundle, period.to))
      case 'LIABILITIES':
        return envelope('LIABILITIES', liabilitiesToWire(bundle, period.to))
      case 'SHELF':
        return envelope('SHELF', shelfToWire(this.shelf))
      case 'SIGNALS':
        return envelope('SIGNALS', signalsToWire(bundle, ledger, period.to))
      case null:
        // 362 liens: nothing in the seed carries a lien, and no field in the 93 would receive one.
        return envelope(null, [])
    }
  }
}
