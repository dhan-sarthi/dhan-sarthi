/**
 * The HTTP client for IDBI's sandbox: one call per data block, every call carrying the five
 * block-00 parameters, every call under a deadline and the circuit breaker.
 *
 * What it promises the adapter above it: a parsed block (`BlockResult`) or a typed failure. A
 * 4xx or an application-level `response_status` other than SUCCESS is IDBI refusing a request,
 * not the line being down, so it is carried out of the breaker as a value; a 5xx, a timeout or
 * a network error counts against it. Paging is handled here (393 pages its statement), so the
 * adapter sees the whole window in one array.
 *
 * `fetch` is injected. Production uses the global; the offline sandbox passes its own, which is
 * the seam a mock transport would occupy. `onCapture` receives every raw body with its hash —
 * the week-one step (schema README §E.2, "capture first") wants each response in
 * `staging.raw_payloads` before anyone maps a field.
 */
import { createHash, randomUUID } from 'node:crypto'
import type { IsoDate } from '@dhan/contracts'
import { CircuitBreaker } from '../../infra/circuit.ts'
import { withTimeout } from '../../infra/timeout.ts'
import { endpointFor, renderPath, serviceEndpoint } from './endpoints.ts'
import type { DataBlock, EndpointSpec, ServiceCode } from './endpoints.ts'
import { dateToDdmmyy } from './transforms.ts'
import { StatusEnvelopeSchema, blockEnvelope } from './wire.ts'
import type { BlockData, WireMeta } from './wire.ts'

export type FetchLike = typeof fetch

const CALL_TIMEOUT_MS = 8_000
const DEFAULT_PAGE_SIZE = 250
/** A runaway pager is a bug, not a big statement: 24 months at 250 rows a page is under 20. */
const MAX_PAGES = 200

export interface CaptureRecord {
  endpoint: string
  /** The request URL with the query string; there is no secret in it (the key travels in a header). */
  url: string
  status: number
  sha256: string
  body: unknown
  at: string
}

export interface IdbiClientOptions {
  baseUrl: string
  apiKey?: string | undefined
  fetch?: FetchLike | undefined
  timeoutMs?: number
  pageSize?: number
  breaker?: CircuitBreaker
  onCapture?: (record: CaptureRecord) => void
}

export interface BlockRequest {
  customerId: string
  consentId: string
  /** The observation window; both ends travel as DD-MM-YY. */
  period: { from: IsoDate; to: IsoDate }
}

export interface BlockResult<B extends DataBlock> {
  block: B
  data: BlockData<B>
  /** Block 08 from the last page. */
  meta: WireMeta
  pages: number
}

/** IDBI answered, and the answer was a refusal or a failure. */
export class IdbiApiError extends Error {
  readonly status: number
  readonly responseStatus: string | null
  readonly errorCode: string | null
  readonly endpoint: string
  readonly body: unknown

  constructor(
    message: string,
    opts: {
      status: number
      responseStatus?: string | null
      errorCode?: string | null
      endpoint: string
      body?: unknown
    },
  ) {
    super(message)
    this.name = 'IdbiApiError'
    this.status = opts.status
    this.responseStatus = opts.responseStatus ?? null
    this.errorCode = opts.errorCode ?? null
    this.endpoint = opts.endpoint
    this.body = opts.body
  }
}

/** IDBI answered SUCCESS with a body the wire schema does not recognise: read it on day one. */
export class WireShapeError extends Error {
  readonly endpoint: string
  readonly issues: readonly string[]
  readonly body: unknown

  constructor(endpoint: string, issues: readonly string[], body: unknown) {
    super(`${endpoint}: response did not match the wire schema: ${issues.slice(0, 5).join('; ')}`)
    this.name = 'WireShapeError'
    this.endpoint = endpoint
    this.issues = issues
    this.body = body
  }
}

interface RawResponse {
  status: number
  body: unknown
}

export class IdbiClient {
  readonly breaker: CircuitBreaker
  private readonly baseUrl: string
  private readonly apiKey: string | undefined
  private readonly fetchImpl: FetchLike
  private readonly timeoutMs: number
  private readonly pageSize: number
  private readonly onCapture: ((record: CaptureRecord) => void) | undefined

  constructor(options: IdbiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.apiKey = options.apiKey
    this.fetchImpl = options.fetch ?? fetch
    this.timeoutMs = options.timeoutMs ?? CALL_TIMEOUT_MS
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
    this.breaker = options.breaker ?? new CircuitBreaker()
    this.onCapture = options.onCapture
  }

  /** One data block for one customer, all pages, parsed. */
  async block<B extends DataBlock>(block: B, req: BlockRequest): Promise<BlockResult<B>> {
    const spec = endpointFor(block)

    if (!spec.paged) {
      const raw = await this.get(spec, req, { data_blocks: block })
      const parsed = this.parse(spec, block, raw)
      return { block, data: parsed.data, meta: parsed.meta, pages: 1 }
    }

    const rows: unknown[] = []
    // Assigned on the first pass of the do-while, which always runs, so no initialiser is read.
    let meta: WireMeta | null
    let totalPages: number
    let page = 1
    do {
      const raw = await this.get(spec, req, {
        data_blocks: block,
        page: String(page),
        page_size: String(this.pageSize),
      })
      const parsed = this.parse(spec, block, raw)
      rows.push(...(parsed.data as unknown[]))
      meta = parsed.meta
      totalPages = Math.max(1, parsed.totalPages ?? 1)
      page += 1
    } while (page <= totalPages && page <= MAX_PAGES)

    if (meta === null) throw new WireShapeError(spec.code, ['no page returned'], null)
    return { block, data: rows as BlockData<B>, meta, pages: page - 1 }
  }

  /**
   * A numbered service, raw. For the week-one capture: pull each endpoint once, store the body,
   * read the shape from the data, then write the mapping.
   */
  async service(
    code: ServiceCode,
    req: BlockRequest,
    query: Record<string, string> = {},
  ): Promise<unknown> {
    const spec = serviceEndpoint(code)
    return (await this.get(spec, req, query)).body
  }

  breakerState(): 'closed' | 'open' | 'half-open' {
    return this.breaker.state()
  }

  /* ---------------------------------------------------------------- */

  buildUrl(spec: EndpointSpec, req: BlockRequest, query: Record<string, string>): URL {
    const url = new URL(`${this.baseUrl}${renderPath(spec, { customer_id: req.customerId })}`)
    url.searchParams.set('customer_id', req.customerId)
    url.searchParams.set('consent_id', req.consentId)
    url.searchParams.set('data_period_from', dateToDdmmyy(req.period.from))
    url.searchParams.set('data_period_to', dateToDdmmyy(req.period.to))
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
    return url
  }

  private async get(
    spec: EndpointSpec,
    req: BlockRequest,
    query: Record<string, string>,
  ): Promise<RawResponse> {
    const url = this.buildUrl(spec, req, query)
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Request-Id': randomUUID(),
    }
    if (this.apiKey !== undefined) headers['X-API-Key'] = this.apiKey

    const outcome = await this.breaker.exec(() =>
      withTimeout(
        async (signal) => {
          const res = await this.fetchImpl(url, { method: 'GET', headers, signal })
          const text = await res.text()
          let body: unknown
          try {
            body = text === '' ? null : JSON.parse(text)
          } catch {
            // Not JSON: keep the raw text so a capture still records what the sandbox sent.
            body = text
          }
          this.onCapture?.({
            endpoint: spec.code,
            url: url.toString(),
            status: res.status,
            sha256: createHash('sha256').update(text).digest('hex'),
            body,
            at: new Date().toISOString(),
          })
          // The line is down: count it. A refusal is returned as a value and judged below.
          if (res.status >= 500) {
            throw new IdbiApiError(`IDBI ${spec.code} answered ${res.status}`, {
              status: res.status,
              endpoint: spec.code,
              body,
              ...statusOf(body),
            })
          }
          return { status: res.status, body }
        },
        this.timeoutMs,
        `IDBI ${spec.code}`,
      ),
    )

    const status = statusOf(outcome.body)
    if (outcome.status >= 400) {
      throw new IdbiApiError(
        `IDBI ${spec.code} refused the request (${outcome.status}${status.errorCode ? ` ${status.errorCode}` : ''})`,
        { status: outcome.status, endpoint: spec.code, body: outcome.body, ...status },
      )
    }
    if (status.responseStatus !== null && status.responseStatus !== 'SUCCESS') {
      throw new IdbiApiError(
        `IDBI ${spec.code} answered ${status.responseStatus}${status.errorCode ? ` ${status.errorCode}` : ''}`,
        { status: outcome.status, endpoint: spec.code, body: outcome.body, ...status },
      )
    }
    return outcome
  }

  private parse<B extends DataBlock>(
    spec: EndpointSpec,
    block: B,
    raw: RawResponse,
  ): { data: BlockData<B>; meta: WireMeta; totalPages: number | undefined } {
    const result = blockEnvelope(block).safeParse(raw.body)
    if (!result.success) {
      throw new WireShapeError(
        spec.code,
        result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
        raw.body,
      )
    }
    // The envelope's `data` is typed per block by the schema table; the generic index loses that.
    const parsed = result.data as { data: BlockData<B>; meta: WireMeta; total_pages?: number }
    return { data: parsed.data, meta: parsed.meta, totalPages: parsed.total_pages }
  }
}

/** Block 08's status pair, read leniently: a failure body may carry nothing else. */
function statusOf(body: unknown): { responseStatus: string | null; errorCode: string | null } {
  const parsed = StatusEnvelopeSchema.safeParse(body)
  if (!parsed.success) return { responseStatus: null, errorCode: null }
  return {
    responseStatus: parsed.data.meta.response_status,
    errorCode: parsed.data.meta.error_code ?? null,
  }
}
