/**
 * Unwrapping an IDBI response, which is three rules and not one.
 *
 * The captures put paid to the idea of a shared envelope step. 365 answers bare at the top
 * level; 362, 391, 393 and 428 wrap themselves in `result`; the FinPro family (590 through
 * 739) wraps itself in `data` and puts a verdict in `status`. So the family is a property of
 * the operation, declared in the registry, and unwrapping is a lookup rather than a guess.
 *
 * Two details that only a real response teaches. `status` is spelled three different ways
 * across the FinPro family — `SUCCESS` in 591, `Success` in 592 and 595, `success` in 593,
 * 739 and 590 — so it is compared case-insensitively, and a case-sensitive equality check
 * here would have failed on two thirds of the family. And nothing anywhere carries
 * `response_status`: of every key in all forty-two captured bodies exactly two are snake_case,
 * `consent_handle` and `serial_num`, so the status envelope the old client looked for
 * described a shape that has never existed.
 *
 * A refusal has its own shape again — `{failedFields, message}` on a 400 — which is how the
 * sandbox says the request body did not match the fixture it holds.
 */

/** Which of the three wrappings an operation answers with. */
export type EnvelopeFamily = 'bare' | 'result' | 'finpro'

/** The verdict an envelope carried, where it carried one. `null` means the family has none. */
export type EnvelopeVerdict = 'success' | 'failure' | null

export interface UnwrapResult {
  /** The operation's own payload, with the wrapper removed. */
  payload: unknown
  verdict: EnvelopeVerdict
  /** `status` exactly as sent, for the log and the error message. */
  rawStatus: string | null
  /** `errorCode`/`errorMsg`/`message`, whichever the family uses. */
  errorCode: string | null
  message: string | null
  /** `errors: []` is the common case; a populated one is the bank explaining itself. */
  errors: readonly unknown[]
  /** 595's `pageDetails`, the only place in the catalogue that pages this way. */
  pageDetails: { currentPage: number; totalPages: number; totalRecords: number } | null
}

/** A body that did not parse as the family's shape at all. */
export class EnvelopeShapeError extends Error {
  readonly operation: string
  readonly body: unknown

  constructor(operation: string, reason: string, body: unknown) {
    super(`${operation}: ${reason}`)
    this.name = 'EnvelopeShapeError'
    this.operation = operation
    this.body = body
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const SUCCESS_WORDS = new Set(['success', 's', 'ok', 'true'])

/**
 * A FinPro `status` to a verdict, case-insensitively.
 *
 * 593 nests a second `status` of `"S"` inside `data`, which is a payload fact and not an
 * envelope one, so only the outer field reaches here.
 */
export function readVerdict(raw: unknown): { verdict: EnvelopeVerdict; rawStatus: string | null } {
  if (typeof raw !== 'string' || raw.trim() === '') return { verdict: null, rawStatus: null }
  const s = raw.trim()
  return { verdict: SUCCESS_WORDS.has(s.toLowerCase()) ? 'success' : 'failure', rawStatus: s }
}

function textOf(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function readPageDetails(v: unknown): UnwrapResult['pageDetails'] {
  if (!isRecord(v)) return null
  const n = (k: string): number | null => {
    const raw = v[k]
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
    if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) return Number(raw.trim())
    return null
  }
  const current = n('currentPageNumber')
  const total = n('totalPages')
  const records = n('totalRecords')
  if (current === null || total === null) return null
  return { currentPage: current, totalPages: total, totalRecords: records ?? 0 }
}

const EMPTY: readonly unknown[] = Object.freeze([])

/**
 * The wrapper off, whichever one it is.
 *
 * `bare` keeps the body as the payload but still reads the loose `message` that 497 and 498
 * answer with, so a caller can tell "Success" from a validation complaint without knowing
 * which family it asked.
 */
export function unwrap(operation: string, family: EnvelopeFamily, body: unknown): UnwrapResult {
  const base = {
    verdict: null as EnvelopeVerdict,
    rawStatus: null as string | null,
    errorCode: null as string | null,
    message: null as string | null,
    errors: EMPTY,
    pageDetails: null as UnwrapResult['pageDetails'],
  }

  if (!isRecord(body)) {
    // 473 and friends always answer an object; an array or a bare string is a shape to read.
    if (family === 'bare') return { ...base, payload: body }
    throw new EnvelopeShapeError(operation, `expected an object, got ${typeof body}`, body)
  }

  const errors = Array.isArray(body['errors']) ? (body['errors'] as readonly unknown[]) : EMPTY
  const message = textOf(body['message'])

  switch (family) {
    case 'bare':
      return { ...base, payload: body, errors, message }

    case 'result': {
      if (!('result' in body)) {
        throw new EnvelopeShapeError(operation, 'expected a `result` wrapper', body)
      }
      const result = body['result']
      // 428 puts its own errors and message *inside* result; 362 and 391 put errors outside.
      const inner = isRecord(result) ? result : {}
      return {
        ...base,
        payload: result,
        errors: Array.isArray(inner['errors']) ? (inner['errors'] as readonly unknown[]) : errors,
        message: textOf(inner['message']) ?? message,
      }
    }

    case 'finpro': {
      const { verdict, rawStatus } = readVerdict(body['status'])
      return {
        payload: 'data' in body ? body['data'] : null,
        verdict,
        rawStatus,
        errorCode: textOf(body['errorCode']),
        message: message ?? textOf(body['errorMsg']) ?? textOf(body['response']),
        errors,
        pageDetails: readPageDetails(body['pageDetails']),
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Refusals
 * ------------------------------------------------------------------ */

export interface ValidationRefusal {
  message: string
  failedFields: readonly string[]
  /**
   * `sentKey` on a "Data not found": the sandbox names the field and value it could not place,
   * as `acctId#660100100007`. It is the most useful thing any refusal in this catalogue says,
   * because it distinguishes "we asked wrongly" from "this fixture does not exist".
   */
  sentKey: string | null
}

/**
 * A 400 from the sandbox, which comes in three shapes and all of them matter.
 *
 * `{failedFields, message}` is "your body does not match my fixture", field by field, and
 * three of IDBI's own exported samples trip it. `{message, sentKey}` is "I hold no fixture for
 * this key", naming the key — `acctId#660100100007` — which is how the per-customer coverage
 * map in `customers.ts` was established. And `{message}` alone is a validation complaint, as
 * 428 answers for a malformed PAN.
 *
 * Telling them apart is what lets the gateway treat a missing fixture as an account to fall
 * back on rather than an outage, while a mismatched body stays something we should fix.
 */
export function readValidationRefusal(body: unknown): ValidationRefusal | null {
  if (!isRecord(body)) return null
  const message = textOf(body['message'])
  const raw = body['failedFields']
  const failedFields = Array.isArray(raw)
    ? raw.filter((f): f is string => typeof f === 'string')
    : []
  const sentKey = textOf(body['sentKey'])
  if (message === null && failedFields.length === 0 && sentKey === null) return null
  return { message: message ?? 'the sandbox refused the request body', failedFields, sentKey }
}

/** A refusal that means "no such fixture" rather than "your request was wrong". */
export function isDataNotFound(refusal: ValidationRefusal | null): boolean {
  return refusal !== null && refusal.sentKey !== null
}

/* ------------------------------------------------------------------ *
 * Correlation
 * ------------------------------------------------------------------ */

/** What IDBI support asks for. Present on every one of the forty-two captured responses. */
export interface AtlasTrace {
  requestId: string | null
  traceId: string | null
  utcOffset: string | null
}

export function readAtlasTrace(headers: Headers): AtlasTrace {
  return {
    requestId: headers.get('x-atlas-request-id'),
    traceId: headers.get('x-atlas-trace-id'),
    utcOffset: headers.get('x-atlas-utc-offset'),
  }
}
