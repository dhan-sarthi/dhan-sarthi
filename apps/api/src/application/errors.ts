/**
 * The errors the application throws, and nothing else does.
 *
 * Every one maps to a status and one of the codes in `@dhan/contracts`, so `http/server.ts`
 * turns any of them into the declared `ErrorBody` without knowing which service threw it. A
 * service never sees a reply object; it throws one of these and the transport does the rest.
 * The avatar errors carry the extra fields their route contracts declare (`cause`, `ticket`,
 * `retryAfterSeconds`), because the client shows those words verbatim.
 */
import type { ErrorCode } from '@dhan/contracts'

export class DomainError extends Error {
  readonly status: number
  readonly code: ErrorCode
  readonly details: unknown
  /** Extra top-level fields the route's error schema declares beyond {code, message, details}. */
  readonly extra: Record<string, unknown>

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    opts: { details?: unknown; extra?: Record<string, unknown> } = {},
  ) {
    super(message)
    this.name = 'DomainError'
    this.status = status
    this.code = code
    this.details = opts.details
    this.extra = opts.extra ?? {}
  }
}

export class ValidationFailed extends DomainError {
  constructor(message: string, details?: unknown) {
    super(400, 'VALIDATION', message, { details })
  }
}

export class Unauthorized extends DomainError {
  constructor(message = 'A valid session bearer is required.') {
    super(401, 'UNAUTHORIZED', message)
  }
}

export class Forbidden extends DomainError {
  constructor(message = 'That does not belong to this session.') {
    super(403, 'FORBIDDEN', message)
  }
}

export class NotFound extends DomainError {
  constructor(message: string) {
    super(404, 'NOT_FOUND', message)
  }
}

export class Conflict extends DomainError {
  constructor(message: string, details?: unknown) {
    super(409, 'CONFLICT', message, { details })
  }
}

export class StaleClock extends DomainError {
  constructor(currentVersion: number) {
    super(409, 'STALE_CLOCK', 'The session changed under you. Refetch and try again.', {
      details: { currentVersion },
    })
  }
}

export class BeyondHorizon extends DomainError {
  constructor(requested: string, horizon: string) {
    super(
      422,
      'CLOCK_BEYOND_SEEDED_HORIZON',
      `The simulated ledger ends on ${horizon}. There is no data for ${requested}.`,
      { details: { requested, horizon } },
    )
  }
}

export class IdempotencyKeyRequired extends DomainError {
  constructor() {
    super(400, 'IDEMPOTENCY_KEY_REQUIRED', 'This request needs an Idempotency-Key header.')
  }
}

export class IdempotencyMismatch extends DomainError {
  constructor() {
    super(
      409,
      'IDEMPOTENCY_MISMATCH',
      'This Idempotency-Key was already used for a different request.',
    )
  }
}

export class ConsentInactive extends DomainError {
  constructor(status: string) {
    super(
      403,
      'CONSENT_INACTIVE',
      `Consent is ${status.toLowerCase()}, so no advice can be generated from this data.`,
      { details: { consentStatus: status } },
    )
  }
}

export class Unavailable extends DomainError {
  constructor(message: string, details?: unknown) {
    super(503, 'UNAVAILABLE', message, { details })
  }
}

export class NotAvailableFromBank extends DomainError {
  constructor(what: string) {
    super(503, 'NOT_AVAILABLE_FROM_BANK', `The bank's feed does not provide ${what}.`)
  }
}

/* ------------------------------------------------------------------ *
 * The avatar path. These bodies are what the client renders as a tier.
 * ------------------------------------------------------------------ */

export type AvatarUnavailableCause =
  | 'budget_exhausted'
  | 'gate_unavailable'
  | 'provider_error'
  | 'breaker_open'
  | 'not_configured'
  | 'disabled'

const UNAVAILABLE_STATUS: Record<AvatarUnavailableCause, { status: number; code: ErrorCode }> = {
  budget_exhausted: { status: 429, code: 'AVATAR_BUDGET_EXHAUSTED' },
  gate_unavailable: { status: 502, code: 'AVATAR_GATE_UNAVAILABLE' },
  provider_error: { status: 502, code: 'AVATAR_PROVIDER_ERROR' },
  breaker_open: { status: 503, code: 'AVATAR_LINE_DOWN' },
  not_configured: { status: 503, code: 'AVATAR_NOT_CONFIGURED' },
  disabled: { status: 503, code: 'AVATAR_DISABLED' },
}

export class AvatarUnavailable extends DomainError {
  readonly reason: AvatarUnavailableCause

  constructor(reason: AvatarUnavailableCause, message: string, retryAfterSeconds?: number) {
    const { status, code } = UNAVAILABLE_STATUS[reason]
    super(status, code, message, {
      extra: {
        cause: reason,
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      },
    })
    this.reason = reason
  }
}

export interface BusyPosition {
  ticket: string | null
  position: number | null
  estimatedWaitSeconds: number | null
}

export class AvatarBusy extends DomainError {
  constructor(cause: 'pool_busy' | 'provider_concurrency', message: string, at: BusyPosition) {
    super(409, 'AVATAR_BUSY', message, { extra: { cause, ...at } })
  }
}

export const isDomainError = (err: unknown): err is DomainError => err instanceof DomainError
