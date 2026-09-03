import { z } from 'zod'
import { ShelfProductSchema } from '../domain.ts'
import { PUBLIC_ERRORS, defineRoute } from '../route.ts'

export const ShelfResponseSchema = z.array(ShelfProductSchema)
export type ShelfResponse = z.infer<typeof ShelfResponseSchema>

export const getShelfRoute = defineRoute({
  id: 'getShelf',
  method: 'GET',
  path: '/api/v1/shelf',
  summary:
    'What IDBI can put a customer into, including the products the gate will refuse, with source and verified flags.',
  auth: 'none',
  response: { 200: ShelfResponseSchema, ...PUBLIC_ERRORS },
  cache: { control: 'public, max-age=300' },
})
