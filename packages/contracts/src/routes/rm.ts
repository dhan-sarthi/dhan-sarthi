/**
 * The relationship manager's console: sign-in, the book, a customer, the record.
 *
 * Every route here is under `/api/v1/rm/` and answers to an RM bearer, except sign-in, which is
 * how one is had. The book is the boundary: a route that names a cif answers 403 for a customer
 * assigned to a different RM and 404 for one that does not exist, so an RM can tell "not yours"
 * from "not there" and nothing else.
 *
 * The copilot's two routes are in `rm-copilot.ts`; the shapes are in `rm-domain.ts`.
 */
import { z } from 'zod'
import {
  AdviceRecordIdSchema,
  CifSchema,
  ErrorBodySchema,
  IsoDateSchema,
  MoneySchema,
  NoContentSchema,
  TimestampSchema,
} from '../common.ts'
import {
  AccessEntrySchema,
  AdviceItemSchema,
  BookRowSchema,
  BookTabSchema,
  Customer360Schema,
  HandoffSchema,
  JourneyEventSchema,
  KpiSchema,
  QueueItemSchema,
  RmProfileSchema,
  RuleCountSchema,
  SegmentSchema,
  SignalKindSchema,
  SignalSeveritySchema,
  UpcomingItemSchema,
  YearMonthSchema,
} from '../rm-domain.ts'
import type { GoalHealth } from '../rm-domain.ts'
import { PUBLIC_ERRORS, RM_ERRORS, defineRoute } from '../route.ts'

/** The path parameter every book-scoped route carries. */
export const RmCustomerParamsSchema = z.object({ cif: CifSchema })

/* ------------------------------------------------------------------ *
 * Sign-in
 * ------------------------------------------------------------------ */

export const RmSignInRequestSchema = z
  .object({
    employeeNo: z.string().trim().min(1).max(32),
    password: z.string().min(1).max(200),
  })
  .strict()
export type RmSignInRequest = z.infer<typeof RmSignInRequestSchema>

/** The token is returned exactly once. Only its hash is stored, as for a reviewer session. */
export const RmSignInResponseSchema = z.object({
  token: z.string(),
  expiresAt: TimestampSchema,
  rm: RmProfileSchema,
})
export type RmSignInResponse = z.infer<typeof RmSignInResponseSchema>

export const rmSignInRoute = defineRoute({
  id: 'rmSignIn',
  method: 'POST',
  path: '/api/v1/rm/sessions',
  summary:
    'Sign an RM in with employee number and password. Returns an opaque `rm_` bearer once, with a sliding expiry. A wrong employee number and a wrong password answer the same 401.',
  auth: 'none',
  // By address, because a guesser has no session to key on. Not the guessing limit itself: the
  // API also refuses an employee number after ten failures in fifteen minutes, which holds where
  // the address can be forged. So this can be loose enough for one machine showing book scoping,
  // signing in as one RM and then the other, several times over, without locking itself out.
  rateLimit: { max: 30, window: '15 minutes', keyBy: 'ip' },
  request: { body: RmSignInRequestSchema },
  response: {
    200: RmSignInResponseSchema,
    400: ErrorBodySchema,
    401: ErrorBodySchema,
    ...PUBLIC_ERRORS,
  },
})

export const rmSignOutRoute = defineRoute({
  id: 'rmSignOut',
  method: 'DELETE',
  path: '/api/v1/rm/sessions/current',
  summary: 'Revoke the calling RM’s bearer. The next request with it is a 401.',
  auth: 'rm',
  response: { 204: NoContentSchema, ...RM_ERRORS },
})

export const RmMeSchema = z.object({
  rm: RmProfileSchema,
  /** The RM clock: the data anchor, shown in the top bar. */
  asOf: IsoDateSchema,
  bookSize: z.number().int().nonnegative(),
  /** Every customer on the console is synthetic, and the console says so. */
  demo: z.literal(true),
})
export type RmMe = z.infer<typeof RmMeSchema>

export const rmMeRoute = defineRoute({
  id: 'rmMe',
  method: 'GET',
  path: '/api/v1/rm/me',
  summary: 'The signed-in RM, the as-of date the console runs at, and the size of their book.',
  auth: 'rm',
  response: { 200: RmMeSchema, ...RM_ERRORS },
})

/* ------------------------------------------------------------------ *
 * The book and today
 * ------------------------------------------------------------------ */

export const RmBookSchema = z.object({
  asOf: IsoDateSchema,
  rows: z.array(BookRowSchema),
  totals: z.object({
    customers: z.number().int().nonnegative(),
    relationshipValue: MoneySchema,
    withIdbi: MoneySchema,
    sipMonthly: MoneySchema,
    openHandoffs: z.number().int().nonnegative(),
  }),
  /** The tabs over the table, with how many rows each would show. */
  segments: z.array(
    z.object({ id: BookTabSchema, label: z.string(), count: z.number().int().nonnegative() }),
  ),
})
export type RmBook = z.infer<typeof RmBookSchema>

export const rmBookRoute = defineRoute({
  id: 'rmBook',
  method: 'GET',
  path: '/api/v1/rm/book',
  summary:
    'Every customer in the calling RM’s book, one row each, with the totals for the footer and the counts for each tab.',
  auth: 'rm',
  response: { 200: RmBookSchema, ...RM_ERRORS },
})

export const RmTodaySchema = z.object({
  asOf: IsoDateSchema,
  kpis: z.array(KpiSchema),
  queue: z.array(QueueItemSchema),
  handoffs: z.array(HandoffSchema),
  /** The latest five refusals across the book, newest first. */
  refusals: z.array(AdviceItemSchema),
  /** The next thirty days. */
  upcoming: z.array(UpcomingItemSchema),
})
export type RmToday = z.infer<typeof RmTodaySchema>

export const rmTodayRoute = defineRoute({
  id: 'rmToday',
  method: 'GET',
  path: '/api/v1/rm/today',
  summary:
    'Who to call today and why: the KPI strip, the ranked call queue (open handoffs first), the handoffs with waiting time, the latest refusals and the next thirty days.',
  auth: 'rm',
  response: { 200: RmTodaySchema, ...RM_ERRORS },
})

/* ------------------------------------------------------------------ *
 * One customer
 * ------------------------------------------------------------------ */

/**
 * Why the RM opened the file. Defaulted rather than required so a plain link still opens it, and
 * logged either way: an open with no stated purpose is still an open.
 */
export const RmCustomerQuerySchema = z
  .object({ purpose: z.string().trim().min(1).max(200).default('Relationship review') })
  .strict()
export type RmCustomerQuery = z.infer<typeof RmCustomerQuerySchema>

export const rmCustomerRoute = defineRoute({
  id: 'rmCustomer',
  method: 'GET',
  path: '/api/v1/rm/customers/:cif',
  summary:
    'The whole customer: profile (date of birth masked), money across every bank, plan, projection bands, signals, next actions with their evidence, consent per scope. Writes a "viewed" entry to the access log with the purpose given.',
  auth: 'rm',
  request: { params: RmCustomerParamsSchema, query: RmCustomerQuerySchema },
  response: {
    200: Customer360Schema,
    400: ErrorBodySchema,
    404: ErrorBodySchema,
    ...RM_ERRORS,
  },
})

export const RmJourneySchema = z.object({
  /** Newest first. */
  events: z.array(JourneyEventSchema),
})
export type RmJourney = z.infer<typeof RmJourneySchema>

export const rmJourneyRoute = defineRoute({
  id: 'rmJourney',
  method: 'GET',
  path: '/api/v1/rm/customers/:cif/journey',
  summary:
    'The customer’s timeline, newest first: plan versions with what changed, decisions, refusals, handoffs, calls, RM notes and ledger events.',
  auth: 'rm',
  request: { params: RmCustomerParamsSchema },
  response: { 200: RmJourneySchema, 404: ErrorBodySchema, ...RM_ERRORS },
})

export const RmCustomerRecordSchema = z.object({
  records: z.array(AdviceItemSchema),
  /** How many hash chains the records span: one per session the customer has had. */
  chains: z.number().int().nonnegative(),
})
export type RmCustomerRecord = z.infer<typeof RmCustomerRecordSchema>

export const rmCustomerRecordRoute = defineRoute({
  id: 'rmCustomerRecord',
  method: 'GET',
  path: '/api/v1/rm/customers/:cif/record',
  summary:
    'Every advice record for the customer, PASS and BLOCKED, with the rule, the sentence they heard, the recorded wording and the hash.',
  auth: 'rm',
  request: { params: RmCustomerParamsSchema },
  response: { 200: RmCustomerRecordSchema, 404: ErrorBodySchema, ...RM_ERRORS },
})

export const ChainCheckSchema = z.object({
  chainId: z.string(),
  records: z.number().int().nonnegative(),
  valid: z.boolean(),
  /** The first record whose hash did not verify. */
  brokenAt: AdviceRecordIdSchema.nullable(),
})
export type ChainCheck = z.infer<typeof ChainCheckSchema>

export const RmCustomerVerificationSchema = z.object({
  /** Records walked, across every chain. */
  checked: z.number().int().nonnegative(),
  chains: z.array(ChainCheckSchema),
  valid: z.boolean(),
  checkedAt: TimestampSchema,
})
export type RmCustomerVerification = z.infer<typeof RmCustomerVerificationSchema>

export const rmVerifyCustomerRecordRoute = defineRoute({
  id: 'rmVerifyCustomerRecord',
  method: 'POST',
  path: '/api/v1/rm/customers/:cif/record/verify',
  summary:
    'Walk every hash chain the customer’s advice records sit in, with the real verification, and say where one breaks.',
  auth: 'rm',
  // A POST because it is an act the RM performs and the result is stamped with when; limited
  // because it walks every chain the customer has.
  rateLimit: { max: 20, window: '1 minute', keyBy: 'session' },
  request: { params: RmCustomerParamsSchema },
  response: { 200: RmCustomerVerificationSchema, 404: ErrorBodySchema, ...RM_ERRORS },
})

export const RmNoteRequestSchema = z
  .object({
    kind: z.enum(['note', 'call']),
    text: z.string().trim().min(1).max(2000),
  })
  .strict()
export type RmNoteRequest = z.infer<typeof RmNoteRequestSchema>

export const RmNoteResponseSchema = z.object({ event: JourneyEventSchema })
export type RmNoteResponse = z.infer<typeof RmNoteResponseSchema>

export const rmAddNoteRoute = defineRoute({
  id: 'rmAddNote',
  method: 'POST',
  path: '/api/v1/rm/customers/:cif/notes',
  summary:
    'Log a call or add a note to the customer’s journey. Answers with the journey event it made.',
  auth: 'rm',
  rateLimit: { max: 60, window: '1 hour', keyBy: 'session' },
  request: { params: RmCustomerParamsSchema, body: RmNoteRequestSchema },
  response: {
    200: RmNoteResponseSchema,
    400: ErrorBodySchema,
    404: ErrorBodySchema,
    ...RM_ERRORS,
  },
})

export const RmHandoffParamsSchema = z.object({ handoffId: z.string().min(1) })

export const RmHandoffPatchSchema = z
  .object({
    status: z.enum(['contacted', 'resolved']),
    note: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
export type RmHandoffPatch = z.infer<typeof RmHandoffPatchSchema>

export const RmHandoffResponseSchema = z.object({ handoff: HandoffSchema })
export type RmHandoffResponse = z.infer<typeof RmHandoffResponseSchema>

export const rmUpdateHandoffRoute = defineRoute({
  id: 'rmUpdateHandoff',
  method: 'PATCH',
  path: '/api/v1/rm/handoffs/:handoffId',
  summary:
    'Mark a customer’s request to talk to their RM as contacted or resolved, with an optional note. A handoff for a customer outside the book is 403.',
  auth: 'rm',
  request: { params: RmHandoffParamsSchema, body: RmHandoffPatchSchema },
  response: {
    200: RmHandoffResponseSchema,
    400: ErrorBodySchema,
    404: ErrorBodySchema,
    ...RM_ERRORS,
  },
})

/** The fields a reveal can unmask. One today; an enum so a second is a contract change. */
export const RevealFieldSchema = z.enum(['dateOfBirth'])
export type RevealField = z.infer<typeof RevealFieldSchema>

export const RmRevealRequestSchema = z
  .object({
    field: RevealFieldSchema,
    /** Required, and long enough to be a reason: it is written to the access log verbatim. */
    reason: z.string().trim().min(5).max(200),
  })
  .strict()
export type RmRevealRequest = z.infer<typeof RmRevealRequestSchema>

export const RmRevealResponseSchema = z.object({ field: RevealFieldSchema, value: z.string() })
export type RmRevealResponse = z.infer<typeof RmRevealResponseSchema>

export const rmRevealRoute = defineRoute({
  id: 'rmReveal',
  method: 'POST',
  path: '/api/v1/rm/customers/:cif/reveal',
  summary:
    'Unmask one field of the customer’s profile. Needs a reason, and writes a "revealed" entry to the access log with it.',
  auth: 'rm',
  rateLimit: { max: 30, window: '1 hour', keyBy: 'session' },
  request: { params: RmCustomerParamsSchema, body: RmRevealRequestSchema },
  response: {
    200: RmRevealResponseSchema,
    400: ErrorBodySchema,
    404: ErrorBodySchema,
    ...RM_ERRORS,
  },
})

/* ------------------------------------------------------------------ *
 * Across the book: insights, refusals, the access log
 * ------------------------------------------------------------------ */

const LabelledValueSchema = z.object({ id: z.string(), label: z.string(), value: MoneySchema })

export const RmInsightsSchema = z.object({
  asOf: IsoDateSchema,
  /** The x axis every series is aligned to, oldest first. */
  months: z.array(YearMonthSchema),
  series: z.object({
    bookBalance: z.array(z.number()),
    withIdbi: z.array(z.number()),
    inflow: z.array(z.number()),
    outflow: z.array(z.number()),
    sipBook: z.array(z.number()),
    activity: z.array(z.number()),
    refusals: z.array(z.number()),
  }),
  allocation: z.object({
    byAssetClass: z.array(LabelledValueSchema),
    bySegment: z.array(
      z.object({
        id: SegmentSchema,
        label: z.string(),
        value: MoneySchema,
        customers: z.number().int().nonnegative(),
      }),
    ),
  }),
  goalHealth: z.object({
    on_track: z.number().int().nonnegative(),
    at_risk: z.number().int().nonnegative(),
    off_track: z.number().int().nonnegative(),
  }) satisfies z.ZodType<Record<GoalHealth, number>>,
  signals: z.array(
    z.object({
      kind: SignalKindSchema,
      label: z.string(),
      severity: SignalSeveritySchema,
      count: z.number().int().nonnegative(),
    }),
  ),
  refusalsByRule: z.array(RuleCountSchema),
  topMovers: z.array(
    z.object({
      cif: CifSchema,
      name: z.string(),
      changePct: z.number(),
      series: z.array(z.number()),
    }),
  ),
})
export type RmInsights = z.infer<typeof RmInsightsSchema>

export const rmInsightsRoute = defineRoute({
  id: 'rmInsights',
  method: 'GET',
  path: '/api/v1/rm/insights',
  summary:
    'Book analytics as small multiples over twelve months of balances, with allocation, goal health, signals by kind, refusals by rule and the customers whose balances moved most.',
  auth: 'rm',
  response: { 200: RmInsightsSchema, ...RM_ERRORS },
})

export const RmRefusalsSchema = z.object({
  /** BLOCKED only, newest first. */
  items: z.array(AdviceItemSchema),
  byRule: z.array(RuleCountSchema),
  total: z.number().int().nonnegative(),
})
export type RmRefusals = z.infer<typeof RmRefusalsSchema>

export const rmRefusalsRoute = defineRoute({
  id: 'rmRefusals',
  method: 'GET',
  path: '/api/v1/rm/refusals',
  summary:
    'Mis-sales prevented: every advice record with verdict BLOCKED across the book, and the count by rule.',
  auth: 'rm',
  response: { 200: RmRefusalsSchema, ...RM_ERRORS },
})

export const RmBookVerificationSchema = z.object({
  checked: z.number().int().nonnegative(),
  valid: z.boolean(),
  broken: z.array(
    z.object({ cif: CifSchema, chainId: z.string(), brokenAt: AdviceRecordIdSchema }),
  ),
  checkedAt: TimestampSchema,
})
export type RmBookVerification = z.infer<typeof RmBookVerificationSchema>

export const rmVerifyBookRoute = defineRoute({
  id: 'rmVerifyBook',
  method: 'POST',
  path: '/api/v1/rm/refusals/verify',
  summary:
    'Walk every hash chain in the book and list each one that breaks, with the customer and the first record that did not verify.',
  auth: 'rm',
  rateLimit: { max: 10, window: '1 minute', keyBy: 'session' },
  response: { 200: RmBookVerificationSchema, ...RM_ERRORS },
})

export const RmAccessLogSchema = z.object({
  /** Newest first. */
  entries: z.array(AccessEntrySchema),
})
export type RmAccessLog = z.infer<typeof RmAccessLogSchema>

export const rmAccessLogRoute = defineRoute({
  id: 'rmAccessLog',
  method: 'GET',
  path: '/api/v1/rm/access-log',
  summary:
    'Every customer open, reveal, suitability check, brief, question, note and contact the calling RM made, with the purpose they gave.',
  auth: 'rm',
  response: { 200: RmAccessLogSchema, ...RM_ERRORS },
})
