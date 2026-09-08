/**
 * One call to IDBI: POST a JSON body, unwrap the family's envelope, log the trace.
 *
 * There is no credential and none is sent. The sandbox allow-lists IP addresses and that is
 * the entire gate, which has two consequences worth stating where the code is. A 403 whose
 * body is HTML from `awselb` means this machine is on the wrong network, not that a key is
 * missing, so it is reported that way rather than as an auth failure nobody can fix by adding
 * a header. And the gateway answers `access-control-allow-origin: *`, so a browser on any
 * origin could read customer data straight from IDBI with no credential at all — which is why
 * this transport lives on the server and `apps/web` never learns the base URL.
 *
 * `x-atlas-request-id` and `x-atlas-trace-id` came back on all thirty-nine captured responses
 * and are the two things IDBI support asks for, so every call logs them, failures included.
 */
import { createHash, randomUUID } from 'node:crypto'
import type { Logger } from '../../../infra/logger.ts'
import { CircuitBreaker } from '../../../infra/circuit.ts'
import { withTimeout } from '../../../infra/timeout.ts'
import { silentLogger } from '../../../infra/logger.ts'
import { EnvelopeShapeError, readAtlasTrace, readValidationRefusal, unwrap } from './envelope.ts'
import type { AtlasTrace, UnwrapResult } from './envelope.ts'
import { requestPath } from './operations.ts'
import type { IdbiOperation } from './operations.ts'

export type FetchLike = typeof fetch

const CALL_TIMEOUT_MS = 15_000

/**
 * Long enough to collapse the duplicate reads within one request, short enough that a screen
 * refreshed by hand shows the bank's current answer rather than the last one.
 */
const DEFAULT_READ_CACHE_MS = 3_000

/** Every raw body, with the hash and the trace, for the staging table and for a fixture. */
export interface IdbiCapture {
  operation: string
  code: string
  path: string
  status: number
  sha256: string
  request: unknown
  body: unknown
  trace: AtlasTrace
  at: string
  durationMs: number
}

export interface IdbiTransportOptions {
  baseUrl: string
  /**
   * How long an identical read is answered from the last response instead of the bank.
   *
   * Zero disables it. This is not a performance nicety, it is what makes the app usable: one
   * `/view` fans out to a customer read, an account read, a statement and a liabilities read,
   * and each of those needs 365 and 433 for the same customer — so the same body went to the
   * bank five and six times, and a single decision took ten seconds over twenty round trips.
   * Only reads are cached, and only successful ones; a write is never served from memory.
   */
  readCacheMs?: number | undefined
  fetch?: FetchLike | undefined
  timeoutMs?: number | undefined
  breaker?: CircuitBreaker | undefined
  logger?: Logger | undefined
  onCapture?: ((capture: IdbiCapture) => void) | undefined
  /** Sent as `ApplicationId`, which IDBI logs against the call. */
  applicationId?: string | undefined
}

/** IDBI answered, and the answer was a refusal. Carried as a value, never counted against the breaker. */
export class IdbiCallError extends Error {
  readonly operation: string
  readonly httpStatus: number
  readonly rawStatus: string | null
  readonly errorCode: string | null
  readonly failedFields: readonly string[]
  /** `acctId#660100100007` where the sandbox said which key it could not place. */
  readonly sentKey: string | null
  readonly trace: AtlasTrace
  readonly body: unknown

  constructor(
    message: string,
    opts: {
      operation: string
      httpStatus: number
      rawStatus?: string | null
      errorCode?: string | null
      failedFields?: readonly string[]
      sentKey?: string | null
      trace: AtlasTrace
      body?: unknown
    },
  ) {
    super(message)
    this.name = 'IdbiCallError'
    this.operation = opts.operation
    this.httpStatus = opts.httpStatus
    this.rawStatus = opts.rawStatus ?? null
    this.errorCode = opts.errorCode ?? null
    this.failedFields = opts.failedFields ?? []
    this.sentKey = opts.sentKey ?? null
    this.trace = opts.trace
    this.body = opts.body
  }
}

/** The 403-from-awselb case, named so nobody goes looking for an API key. */
export class IdbiNotAllowlistedError extends Error {
  readonly operation: string

  constructor(operation: string) {
    super(
      `IDBI refused ${operation} at the edge (403). The sandbox allow-lists IP addresses and ` +
        'takes no credential, so this is the wrong network rather than a missing key.',
    )
    this.name = 'IdbiNotAllowlistedError'
    this.operation = operation
  }
}

export interface IdbiResponse {
  operation: IdbiOperation
  /** The path actually called, which may be a `…test01` variant. */
  path: string
  httpStatus: number
  envelope: UnwrapResult
  trace: AtlasTrace
  raw: unknown
}

export class IdbiTransport {
  readonly breaker: CircuitBreaker
  private readonly baseUrl: string
  private readonly fetchImpl: FetchLike
  private readonly timeoutMs: number
  private readonly logger: Logger
  private readonly onCapture: ((capture: IdbiCapture) => void) | undefined
  private readonly applicationId: string
  private readonly readCacheMs: number
  /**
   * In-flight and recently-settled reads, keyed on operation and body.
   *
   * The promise is stored rather than the result, so two callers asking at the same moment —
   * which is exactly what `Promise.all` over four legs of one view does — share one round trip
   * instead of racing to make two.
   */
  private readonly reads = new Map<string, { at: number; result: Promise<IdbiResponse> }>()

  constructor(options: IdbiTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.fetchImpl = options.fetch ?? fetch
    this.timeoutMs = options.timeoutMs ?? CALL_TIMEOUT_MS
    this.breaker = options.breaker ?? new CircuitBreaker()
    this.logger = options.logger ?? silentLogger
    this.onCapture = options.onCapture
    this.applicationId = options.applicationId ?? 'dhan-sarthi'
    this.readCacheMs = options.readCacheMs ?? DEFAULT_READ_CACHE_MS
  }

  breakerState(): ReturnType<CircuitBreaker['state']> {
    return this.breaker.state()
  }

  /**
   * Call one operation, or one of its `…test01` fixtures.
   *
   * A 5xx, a timeout or a dropped connection is the line being down and counts against the
   * breaker. Anything IDBI said deliberately — a 4xx, or a FinPro `status` that is not a
   * success word — comes back as an `IdbiCallError` the caller can act on, because a bank
   * refusing one request is not a reason to stop asking it anything.
   */
  async call(
    operation: IdbiOperation,
    body: unknown,
    opts: { variant?: string | undefined } = {},
  ): Promise<IdbiResponse> {
    const op = opts.variant ?? operation.op
    if (opts.variant !== undefined && !operation.variants.includes(opts.variant)) {
      throw new Error(`${opts.variant} is not a registered variant of ${operation.op}`)
    }

    // Writes and bureau pulls are never served from memory: a lead created twice is two leads,
    // and a cached credit pull is a credit pull somebody paid for and did not get.
    if (operation.tier !== 'read' || this.readCacheMs <= 0) {
      return this.execute(operation, op, body)
    }

    const key = `${op}|${JSON.stringify(body)}`
    const cached = this.reads.get(key)
    if (cached !== undefined && Date.now() - cached.at < this.readCacheMs) return cached.result

    const result = this.execute(operation, op, body)
    this.reads.set(key, { at: Date.now(), result })
    // A refusal is not worth remembering: the caller is about to try a different candidate, and
    // holding the rejection would make the retry look like it had already been made.
    result.catch(() => this.reads.delete(key))
    return result
  }

  private async execute(
    operation: IdbiOperation,
    op: string,
    body: unknown,
  ): Promise<IdbiResponse> {
    const path = requestPath(op)
    const url = `${this.baseUrl}${path}`
    const transactionId = randomUUID()
    const startedAt = Date.now()

    const attempt = await this.breaker.exec(() =>
      withTimeout(
        async (signal) => {
          const res = await this.fetchImpl(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              TransactionId: transactionId,
              ApplicationId: this.applicationId,
            },
            body: JSON.stringify(body),
            signal,
          })
          const text = await res.text()
          let parsed: unknown
          try {
            parsed = text === '' ? null : JSON.parse(text)
          } catch {
            // Not JSON. The 403 page from the load balancer arrives this way.
            parsed = text
          }
          const trace = readAtlasTrace(res.headers)
          this.onCapture?.({
            operation: op,
            code: operation.code,
            path,
            status: res.status,
            sha256: createHash('sha256').update(text).digest('hex'),
            request: body,
            body: parsed,
            trace,
            at: new Date().toISOString(),
            durationMs: Date.now() - startedAt,
          })
          if (res.status >= 500) {
            // The line is down: let it reach the breaker.
            throw new IdbiCallError(`IDBI ${operation.code} answered ${res.status}`, {
              operation: op,
              httpStatus: res.status,
              trace,
              body: parsed,
            })
          }
          return { status: res.status, body: parsed, trace }
        },
        this.timeoutMs,
        `IDBI ${operation.code} ${op}`,
      ),
    )

    const { status, body: raw, trace } = attempt
    const log = {
      idbi: operation.code,
      op,
      httpStatus: status,
      atlasRequestId: trace.requestId,
      atlasTraceId: trace.traceId,
      durationMs: Date.now() - startedAt,
    }

    if (status === 403) {
      this.logger.error(log, 'IDBI refused at the edge; check the IP allow-list')
      throw new IdbiNotAllowlistedError(op)
    }

    if (status >= 400) {
      const refusal = readValidationRefusal(raw)
      this.logger.warn(
        { ...log, failedFields: refusal?.failedFields ?? [], sentKey: refusal?.sentKey ?? null },
        'IDBI refused a request',
      )
      throw new IdbiCallError(
        `IDBI ${operation.code} refused the request (${status}${refusal ? `: ${refusal.message}` : ''})`,
        {
          operation: op,
          httpStatus: status,
          failedFields: refusal?.failedFields ?? [],
          sentKey: refusal?.sentKey ?? null,
          trace,
          body: raw,
        },
      )
    }

    let envelope: UnwrapResult
    try {
      envelope = unwrap(op, operation.family, raw)
    } catch (err) {
      this.logger.error(log, 'IDBI answered a body the envelope does not recognise')
      if (err instanceof EnvelopeShapeError) throw err
      throw err
    }

    if (envelope.verdict === 'failure') {
      this.logger.warn({ ...log, status: envelope.rawStatus }, 'IDBI answered a failure status')
      throw new IdbiCallError(
        `IDBI ${operation.code} answered ${envelope.rawStatus ?? 'a failure'}` +
          (envelope.message === null ? '' : `: ${envelope.message}`),
        {
          operation: op,
          httpStatus: status,
          rawStatus: envelope.rawStatus,
          errorCode: envelope.errorCode,
          trace,
          body: raw,
        },
      )
    }

    this.logger.info(log, 'IDBI answered')
    return { operation, path, httpStatus: status, envelope, trace, raw }
  }
}
