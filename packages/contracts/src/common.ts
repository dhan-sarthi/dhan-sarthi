/**
 * The primitives every contract is built from.
 *
 * Money is a plain number of rupees. Dates are 'YYYY-MM-DD' strings, never Date objects — a
 * bank statement has no time of day worth trusting, and a Date crossing a timezone is how the
 * 1st becomes the 31st. Timestamps (when a row was written) are ISO 8601 strings with a zone.
 */
import { z } from 'zod'

export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .describe('Calendar date, YYYY-MM-DD')
export type IsoDate = z.infer<typeof IsoDateSchema>

export const TimestampSchema = z.string().datetime({ offset: true }).describe('ISO 8601 instant')
export type Timestamp = z.infer<typeof TimestampSchema>

export const MoneySchema = z.number().finite().describe('Rupees')
export type Money = z.infer<typeof MoneySchema>

/** Opaque identifiers. Named so a signature says which one it means. */
export const IdSchema = z.string().min(1)
export const CifSchema = IdSchema.describe('Customer information file number')
export const SessionIdSchema = IdSchema
export const SnapshotIdSchema = IdSchema
export const AdviceRecordIdSchema = IdSchema
export const ActionIdSchema = IdSchema
export const ProductIdSchema = IdSchema
export const RunwaySessionIdSchema = IdSchema
export const TicketSchema = IdSchema.describe('Waitlist ticket')

export const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/)

/**
 * Every error the API returns has this shape and one of these codes, so a client can switch on
 * `code` and show `message` verbatim. `details` carries structured context (the field that
 * failed validation, the horizon the clock ran into) and is never required reading.
 */
export const ErrorCodeSchema = z.enum([
  'VALIDATION',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  /** A write to a block this data source owns rather than the app. See ReadOnlyBlock. */
  'READ_ONLY_BLOCK',
  'STALE_CLOCK',
  'CLOCK_BEYOND_SEEDED_HORIZON',
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_MISMATCH',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'CONSENT_INACTIVE',
  'AVATAR_DISABLED',
  'AVATAR_NOT_CONFIGURED',
  'AVATAR_BUSY',
  'AVATAR_BUDGET_EXHAUSTED',
  'AVATAR_GATE_UNAVAILABLE',
  'AVATAR_PROVIDER_ERROR',
  'AVATAR_LINE_DOWN',
  'NOT_AVAILABLE_FROM_BANK',
  'UNAVAILABLE',
  'INTERNAL',
])
export type ErrorCode = z.infer<typeof ErrorCodeSchema>

export const ErrorBodySchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
})
export type ErrorBody = z.infer<typeof ErrorBodySchema>

/** A response with no body: 204 routes and the like. */
export const NoContentSchema = z.undefined()
export type NoContent = z.infer<typeof NoContentSchema>
