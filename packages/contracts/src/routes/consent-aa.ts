import { z } from 'zod'
import { ErrorBodySchema, IsoDateSchema } from '../common.ts'
import { PUBLIC_ERRORS, SESSION_ERRORS, defineRoute } from '../route.ts'

/**
 * The Account Aggregator consent flow.
 *
 * Six chained bank calls, of which the app initiates three and receives two. The customer's
 * path is: we ask IDBI for a handle (590), turn it into a OneMoney URL (592), send them there,
 * and then either the bank posts us a notification (497) or their browser returns with an
 * encrypted token for us to decrypt (593). Either way we ask 591 what the consent actually
 * says before believing anything, because that is the only answer that comes from the bank
 * over a channel we trust.
 *
 * This is the only route to holdings at other banks and to a statement for a customer whose
 * own-bank statement IDBI does not hold — which is one of the two the sandbox offers.
 */

export const ConsentEventSchema = z.object({
  eventType: z.string(),
  eventStatus: z.string(),
  eventMessage: z.string().nullable(),
  consentId: z.string().nullable(),
  sessionId: z.string().nullable(),
  linkRefNumbers: z.array(z.string()),
  receivedAt: z.string(),
})

export const ConsentRequestStatusSchema = z.enum([
  'REQUESTED',
  'AWAITING_APPROVAL',
  'REPORTED',
  'ACTIVE',
  'CLOSED',
])

export const ConsentRequestSchema = z.object({
  consentHandle: z.string(),
  status: ConsentRequestStatusSchema,
  /** Where to send the customer. Null where 592 has not answered for this handle. */
  redirectionUrl: z.string().nullable(),
  consentId: z.string().nullable(),
  validFrom: IsoDateSchema.nullable(),
  validTo: IsoDateSchema.nullable(),
  /** Every notification received against this handle, newest last. Data, not verdicts. */
  events: z.array(ConsentEventSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ConsentRequestResponse = z.infer<typeof ConsentRequestSchema>

export const listConsentRequestsRoute = defineRoute({
  id: 'listConsentRequests',
  method: 'GET',
  path: '/api/v1/consent/aa',
  summary:
    'Every Account Aggregator consent request raised for the session customer, with the notifications received against each.',
  auth: 'session',
  response: { 200: z.array(ConsentRequestSchema), ...SESSION_ERRORS },
})

export const startConsentRequestRoute = defineRoute({
  id: 'startConsentRequest',
  method: 'POST',
  path: '/api/v1/consent/aa',
  summary:
    'Raise a consent request (IDBI 590) and return the URL to send the customer to (592). May notify the customer, so it is never called speculatively.',
  auth: 'session',
  response: { 200: ConsentRequestSchema, 400: ErrorBodySchema, ...SESSION_ERRORS },
  rateLimit: { max: 5, window: '1 hour', keyBy: 'session' },
})

export const ConsentHandleParamsSchema = z.object({ consentHandle: z.string().min(1) })

export const verifyConsentRequestRoute = defineRoute({
  id: 'verifyConsentRequest',
  method: 'POST',
  path: '/api/v1/consent/aa/:consentHandle/verify',
  summary:
    'Ask IDBI (591) what the consent actually says and move the record to match. The only path to ACTIVE — a notification never grants anything by itself.',
  auth: 'session',
  request: { params: ConsentHandleParamsSchema },
  response: { 200: ConsentRequestSchema, 400: ErrorBodySchema, ...SESSION_ERRORS },
})

/** What 593 needs, as the aggregator's redirect delivers it. */
export const ConsentReturnSchema = z
  .object({
    ecres: z.string().min(1),
    resdate: z.string().min(1),
    fi: z.string().min(1),
  })
  .strict()

export const returnFromConsentRoute = defineRoute({
  id: 'returnFromConsent',
  method: 'POST',
  path: '/api/v1/consent/aa/return',
  summary:
    'The aggregator’s redirect coming back through the customer’s browser. Decrypted by 593, recorded, and then verified against 591 before anything is believed.',
  auth: 'session',
  request: { body: ConsentReturnSchema },
  response: { 200: ConsentRequestSchema, 400: ErrorBodySchema, ...SESSION_ERRORS },
})

/* ------------------------------------------------------------------ *
 * The webhooks IDBI calls on us
 * ------------------------------------------------------------------ */

/**
 * IDBI's own 497 body, which is the shape it will POST at us.
 *
 * `auth: 'none'` because the bank has no session and cannot be given one. That makes this the
 * app's only unauthenticated write, so it is worth being explicit about what it can do: it
 * appends an event to a consent record and returns. It performs no bank call, grants no scope,
 * and cannot move a consent to ACTIVE — only 591 does that, through
 * `/consent/aa/:consentHandle/verify`. Anyone on the internet may post here; the worst they can
 * achieve is a spurious line in an audit trail that says where it came from.
 */
export const ConsentNotificationSchema = z
  .object({
    consentHandle: z.string().min(1),
    eventType: z.string().min(1),
    eventStatus: z.string().min(1),
    eventMessage: z.string().optional(),
    consentId: z.string().optional(),
    transactionID: z.string().optional(),
    timestamp: z.string().optional(),
    vua: z.string().optional(),
    productID: z.string().optional(),
    accountID: z.string().optional(),
    fetchType: z.string().optional(),
    consentExpiry: z.string().optional(),
  })
  .passthrough()

export const NotificationAckSchema = z.object({ message: z.string() })

export const consentNotificationRoute = defineRoute({
  id: 'consentNotification',
  method: 'POST',
  path: '/api/v1/webhooks/idbi/consent',
  summary:
    'IDBI’s consent notification (their 497, inbound). Records the event and nothing else — it cannot grant access, and the consent is only ever confirmed by asking 591.',
  auth: 'none',
  request: { body: ConsentNotificationSchema },
  response: { 200: NotificationAckSchema, 400: ErrorBodySchema, ...PUBLIC_ERRORS },
  rateLimit: { max: 120, window: '1 minute', keyBy: 'ip' },
})

/** IDBI's 498 body: a data-ready event, which names the accounts a pull may now read. */
export const DataNotificationSchema = z
  .object({
    consentHandle: z.string().min(1),
    eventType: z.string().min(1),
    eventStatus: z.string().min(1),
    eventMessage: z.string().optional(),
    consentId: z.string().optional(),
    sessionId: z.string().optional(),
    linkRefNumbers: z.array(z.object({ linkRefNumber: z.string() }).passthrough()).optional(),
    transactionID: z.string().optional(),
    timestamp: z.string().optional(),
    dataExpiry: z.string().optional(),
    firstTimeFetch: z.string().optional(),
  })
  .passthrough()

export const dataNotificationRoute = defineRoute({
  id: 'dataNotification',
  method: 'POST',
  path: '/api/v1/webhooks/idbi/data',
  summary:
    'IDBI’s data-ready notification (their 498, inbound). Records the event and the link references it names; the pull itself still happens under a verified consent.',
  auth: 'none',
  request: { body: DataNotificationSchema },
  response: { 200: NotificationAckSchema, 400: ErrorBodySchema, ...PUBLIC_ERRORS },
  rateLimit: { max: 120, window: '1 minute', keyBy: 'ip' },
})
