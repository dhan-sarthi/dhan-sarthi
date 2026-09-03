import { z } from 'zod'
import {
  OperatorAvatarStatusSchema,
  ReleaseAllResponseSchema,
  SeedStatusSchema,
} from '../domain.ts'
import { OPERATOR_ERRORS, defineRoute } from '../route.ts'

/** Compared in constant time against OPERATOR_KEY. Absent key at boot disables these routes. */
export const OperatorHeadersSchema = z.object({ 'x-operator-key': z.string().min(1) }).passthrough()

export const operatorAvatarStatusRoute = defineRoute({
  id: 'operatorAvatarStatus',
  method: 'GET',
  path: '/api/v1/operator/avatar/status',
  summary:
    'Credentials, held leases with task ids, the waitlist, minutes used from the store, breaker and RPC count. Lists live session ids, hence operator-only.',
  auth: 'operator',
  request: { headers: OperatorHeadersSchema },
  response: { 200: OperatorAvatarStatusSchema, ...OPERATOR_ERRORS },
})

export const operatorReleaseAllRoute = defineRoute({
  id: 'operatorReleaseAll',
  method: 'POST',
  path: '/api/v1/operator/avatar/release-all',
  summary: 'Cancel every held provider session and close every RPC handler on this task.',
  auth: 'operator',
  request: { headers: OperatorHeadersSchema },
  response: { 200: ReleaseAllResponseSchema, ...OPERATOR_ERRORS },
})

export const operatorSeedRoute = defineRoute({
  id: 'operatorSeed',
  method: 'GET',
  path: '/api/v1/operator/seed',
  summary: 'Seed run metadata, the drift check, the active bank source and the provenance map.',
  auth: 'operator',
  request: { headers: OperatorHeadersSchema },
  response: { 200: SeedStatusSchema, ...OPERATOR_ERRORS },
})
