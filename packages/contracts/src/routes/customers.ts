import { z } from 'zod'
import { ErrorBodySchema } from '../common.ts'
import { CustomerSummarySchema } from '../domain.ts'
import { PUBLIC_ERRORS, defineRoute } from '../route.ts'

export const CustomersResponseSchema = z.array(CustomerSummarySchema)
export type CustomersResponse = z.infer<typeof CustomersResponseSchema>

export const listCustomersRoute = defineRoute({
  id: 'listCustomers',
  method: 'GET',
  path: '/api/v1/customers',
  summary:
    'The picker. Every synthetic customer with the story they demonstrate. 503 when the source has no pickable customers, which is the shape a host app that names the customer itself would leave.',
  auth: 'none',
  rateLimit: { max: 60, window: '1 minute', keyBy: 'ip' },
  response: {
    200: CustomersResponseSchema,
    503: ErrorBodySchema,
    ...PUBLIC_ERRORS,
  },
})
