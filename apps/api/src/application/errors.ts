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

/**
 * A profile the app cannot advise on, naming the fields it is short of.
 *
 * Same 403 and same sentence as a plain `Forbidden` — the difference is that `missing` survives
 * the throw. `application/profile.service.ts` used to recover it by grepping the message for
 * 'dateOfBirth', which a reworded throw would have silently broken.
 */
export class IncompleteProfile extends Forbidden {
  readonly missing: readonly string[]

  constructor(missing: readonly string[], message: string) {
    super(message)
    this.missing = [...missing]
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

/**
 * A write to a block this data source does not own.
 *
 * Holdings are the app's only under the IDBI source, because that is the only source with no
 * holdings feed of its own. Under the fixtures generator or the seeded database the portfolio
 * comes with the customer, so an edit here would be accepted and then ignored by every screen
 * — which is worse than refusing it.
 */
export class ReadOnlyBlock extends DomainError {
  constructor(block: string, source: string) {
    super(
      409,
      'READ_ONLY_BLOCK',
      `The ${source} source serves its own ${block}, so they cannot be edited here. ` +
        `Run with BANK_SOURCE=idbi-sandbox, where the app owns ${block} because no bank feed ` +
        'for them exists.',
    )
  }
}

/* ------------------------------------------------------------------ *
 * Save and challenges. Four refusals the customer reads as sentences.
 * ------------------------------------------------------------------ */

/**
 * One challenge at a time.
 *
 * A 409 rather than a silent replacement: the running challenge is a commitment with days
 * already banked against it, and the wizard's last step is one tap away from a screen that
 * does not know it exists. Ending the old one is a separate, deliberate act.
 */
export class ChallengeAlreadyRunning extends DomainError {
  constructor(name: string) {
    super(
      409,
      'CHALLENGE_ALREADY_RUNNING',
      `Your ${name} Challenge is still running. End that one before you start another.`,
      { details: { running: name } },
    )
  }
}

/** The id the client held is not the one running, which is what a stale screen sends. */
export class ChallengeNotFound extends DomainError {
  constructor(challengeId: string) {
    super(404, 'CHALLENGE_NOT_FOUND', 'That challenge is not running any more.', {
      details: { challengeId },
    })
  }
}

/**
 * A well-formed target with nothing behind it.
 *
 * 422 and not 400: the body is valid and the customer picked something real, they have simply
 * not spent there in four weeks — so there is no baseline to set a limit against and nothing a
 * limit could save. The wizard can only have offered it from a stale list.
 */
export class NothingToChallenge extends DomainError {
  constructor(name: string) {
    super(
      422,
      'NOTHING_TO_CHALLENGE',
      `You have not spent anything on ${name} in the last four weeks, so there is nothing to challenge yet.`,
      { details: { target: name } },
    )
  }
}

/**
 * A hack switched on with nothing to run on.
 *
 * Refused rather than accepted and left idle, because a hack that reads "on" and puts nothing
 * aside for a month teaches the customer that the figures on this screen are decorative. The
 * message says which hack and why, since it is printed verbatim.
 */
export class SaveHackUnavailable extends DomainError {
  constructor(message: string) {
    super(422, 'SAVE_HACK_UNAVAILABLE', message)
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
