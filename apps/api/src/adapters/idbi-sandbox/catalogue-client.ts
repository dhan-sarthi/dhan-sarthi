/**
 * Transport for the documented 393 shape. Operational endpoint details come from the caller;
 * this module is deliberately not composed into a live bank profile without that evidence.
 */
import {
  CatalogueFormatError,
  decodeIsoDate,
  parseInrAmount,
  parseIdbiStatement,
  parseIdbiStatementPages,
} from './catalogue.ts'
import type { IdbiStatementCursor, IdbiStatementOptions, IdbiStatementPage } from './catalogue.ts'

export interface IdbiStatementRequest {
  input: {
    acid: string
    branchId: string
    fromDate: string
    toDate: string
    sortIn: string
    paginationDetails?: IdbiStatementCursor
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface IdbiStatementCapture {
  endpointCode: '393'
  page: number
  requestBody: IdbiStatementRequest
  responseStatus: number
  /** Raw bytes decoded as text, before JSON/domain parsing; never send this to a browser. */
  rawResponse: string
}

export interface IdbiCatalogueTransport {
  endpoints: {
    '393': {
      url: string
      /** Explicit caller configuration; the catalogue does not confirm an HTTP method. */
      method: 'POST' | 'PUT' | 'PATCH'
    }
  }
  headers?: Readonly<Record<string, string>>
  timeoutMs: number
  maxPages: number
  /** Persistence must succeed before this response may affect advice. Headers are not captured. */
  capture: (capture: IdbiStatementCapture) => Promise<void>
  fetch?: typeof globalThis.fetch
}

export interface IdbiStatementFetchOptions extends IdbiStatementOptions {
  expectedAccountId: string
  expectedBranchId: string
  /** API 393 carries currency on balances; the current application only supports INR. */
  currency: 'INR'
}

export class CatalogueTransportError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'CatalogueTransportError'
  }
}

function requireText(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CatalogueFormatError(field, 'expected nonblank text')
  }
}

function validate(
  config: IdbiCatalogueTransport,
  request: IdbiStatementRequest,
  options: IdbiStatementFetchOptions,
): void {
  const endpoint = config.endpoints['393']
  let url: URL
  try {
    url = new URL(endpoint.url)
  } catch {
    throw new CatalogueTransportError('393 requires an explicit absolute endpoint URL')
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new CatalogueTransportError(
      '393 endpoint must use HTTP(S) without credentials in its URL',
    )
  }
  if (!['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
    throw new CatalogueTransportError('configured method must support a JSON request body')
  }
  if (
    !Number.isSafeInteger(config.timeoutMs) ||
    config.timeoutMs < 1 ||
    config.timeoutMs > 2_147_483_647
  ) {
    throw new CatalogueTransportError('timeoutMs must be a positive supported timer duration')
  }
  if (!Number.isSafeInteger(config.maxPages) || config.maxPages < 1) {
    throw new CatalogueTransportError('maxPages must be a positive safe integer')
  }
  requireText(options.expectedAccountId, 'expectedAccountId')
  requireText(options.expectedBranchId, 'expectedBranchId')
  if (options.currency !== 'INR') throw new CatalogueFormatError('currency', 'expected INR')
  if (
    request.input.acid !== options.expectedAccountId ||
    request.input.branchId !== options.expectedBranchId
  ) {
    throw new CatalogueFormatError('input', 'request does not match expected account and branch')
  }
  // A resumed tail cannot be presented as the complete date range. First-page cursor
  // conventions are not documented; this capture requires an explicitly fresh request.
  if (Object.hasOwn(request.input, 'paginationDetails')) {
    throw new CatalogueFormatError(
      'input.paginationDetails',
      'complete capture must start without a cursor',
    )
  }
  const decoder = options.dateDecoder ?? decodeIsoDate
  requireText(request.input.fromDate, 'input.fromDate')
  requireText(request.input.toDate, 'input.toDate')
  const from = decodeIsoDate(decoder(request.input.fromDate, 'input.fromDate'), 'input.fromDate')
  const to = decodeIsoDate(decoder(request.input.toDate, 'input.toDate'), 'input.toDate')
  if (from > to) throw new CatalogueFormatError('input', 'statement date range is reversed')
  if (typeof request.input.sortIn !== 'string')
    throw new CatalogueFormatError('input.sortIn', 'expected configured sort value')
}

async function readResponse(
  config: IdbiCatalogueTransport,
  body: IdbiStatementRequest,
): Promise<{ status: number; ok: boolean; text: string }> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const endpoint = config.endpoints['393']
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new CatalogueTransportError('393 response timed out'))
    }, config.timeoutMs)
  })
  try {
    const response = (async () => {
      const received = await (config.fetch ?? globalThis.fetch)(endpoint.url, {
        method: endpoint.method,
        headers: { 'content-type': 'application/json', ...config.headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      return { status: received.status, ok: received.ok, text: await received.text() }
    })()
    return await Promise.race([response, timeout])
  } catch (error) {
    if (error instanceof CatalogueTransportError) throw error
    // Provider exceptions can include authenticated URLs and payload values.
    throw new CatalogueTransportError(
      controller.signal.aborted ? '393 response timed out' : '393 transport failed',
    )
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Fetch every page of one statement, retaining exact request-cursor linkage. Failure to capture,
 * decode or finish a page aborts the whole operation; no partial history is returned as current.
 */
export async function fetchIdbiStatement(
  config: IdbiCatalogueTransport,
  request: IdbiStatementRequest,
  options: IdbiStatementFetchOptions,
): Promise<IdbiStatementPage & { pageCount: number }> {
  validate(config, request, options)
  const original = structuredClone(request)
  let body = structuredClone(original)
  const payloads: unknown[] = []
  const seenCursors = new Set<string>()
  const seenTransactions = new Set<string>()
  for (let pageNumber = 1; pageNumber <= config.maxPages; pageNumber += 1) {
    const response = await readResponse(config, body)
    await config.capture({
      endpointCode: '393',
      page: pageNumber,
      requestBody: structuredClone(body),
      responseStatus: response.status,
      rawResponse: response.text,
    })
    if (!response.ok) throw new CatalogueTransportError(`393 returned HTTP ${response.status}`)
    let payload: unknown
    try {
      payload = JSON.parse(
        response.text,
        (key: string, value: unknown, context?: { source?: string }): unknown => {
          if (key === 'amountValue' && typeof value === 'number') {
            // JSON.parse can round a numeric token before the money parser sees it. Modern
            // Node exposes the original token to the reviver; older runtimes must require
            // string amounts rather than quietly accepting that loss of precision.
            if (context?.source === undefined) {
              throw new CatalogueFormatError(
                'response.amountValue',
                'runtime cannot verify numeric money tokens; use string amounts',
              )
            }
            const exact = parseInrAmount(context.source, 'INR', 'response.amountValue')
            if (exact !== value) {
              throw new CatalogueFormatError(
                'response.amountValue',
                'JSON number lost monetary precision',
              )
            }
          }
          return value
        },
      )
    } catch (error) {
      if (error instanceof CatalogueFormatError) throw error
      throw new CatalogueFormatError('response', '393 did not return valid JSON')
    }
    const page = parseIdbiStatement(payload, options)
    for (const row of page.transactions) {
      if (seenTransactions.has(row.transaction.txnId)) {
        throw new CatalogueFormatError('pages', '393 repeated a transaction without progress')
      }
      seenTransactions.add(row.transaction.txnId)
    }
    payloads.push(payload)
    if (!page.hasMoreData) {
      return { ...parseIdbiStatementPages(payloads, options), pageCount: pageNumber }
    }
    if (page.nextCursor === null)
      throw new CatalogueFormatError('pages', '393 continuation has no cursor')
    const cursor = JSON.stringify(page.nextCursor)
    if (seenCursors.has(cursor)) throw new CatalogueFormatError('pages', '393 repeated its cursor')
    seenCursors.add(cursor)
    // Original filters and extension keys survive every request; only the cursor advances.
    body = { ...original, input: { ...original.input, paginationDetails: page.nextCursor } }
  }
  throw new CatalogueTransportError('393 exceeded maxPages before completing its statement')
}
