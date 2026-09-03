import { z } from 'zod'
import { RuleSchema } from '../domain.ts'
import { PUBLIC_ERRORS, defineRoute } from '../route.ts'

export const RulesResponseSchema = z.array(RuleSchema)
export type RulesResponse = z.infer<typeof RulesResponseSchema>

export const getRulesRoute = defineRoute({
  id: 'getRules',
  method: 'GET',
  path: '/api/v1/rules',
  summary: 'The suitability rule book in plain English, in the order the gate applies it.',
  auth: 'none',
  response: { 200: RulesResponseSchema, ...PUBLIC_ERRORS },
  cache: { control: 'public, max-age=300' },
})
