import { z } from 'zod'
import { ErrorBodySchema, IsoDateSchema } from '../common.ts'
import { SpendCategorySchema, TransactionSchema } from '../domain.ts'
import { SESSION_ERRORS, defineRoute } from '../route.ts'

export const TransactionsQuerySchema = z
  .object({
    from: IsoDateSchema.optional(),
    to: IsoDateSchema.optional(),
    category: SpendCategorySchema.optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict()
export type TransactionsQuery = z.infer<typeof TransactionsQuerySchema>
export type TransactionsQueryInput = z.input<typeof TransactionsQuerySchema>

export const TransactionsPageSchema = z.object({
  items: z.array(TransactionSchema),
  nextCursor: z.string().nullable(),
})
export type TransactionsPage = z.infer<typeof TransactionsPageSchema>

export const listTransactionsRoute = defineRoute({
  id: 'listTransactions',
  method: 'GET',
  path: '/api/v1/transactions',
  summary:
    'Cursor-paged statement lines up to the session’s as-of date, newest first, for Money → Spending.',
  auth: 'session',
  request: { query: TransactionsQuerySchema },
  response: { 200: TransactionsPageSchema, 400: ErrorBodySchema, ...SESSION_ERRORS },
})
