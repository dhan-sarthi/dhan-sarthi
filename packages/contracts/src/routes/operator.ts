import { z } from 'zod'
import {
  BankSourceSchema,
  OperatorAvatarStatusSchema,
  ReleaseAllResponseSchema,
  SeedStatusSchema,
} from '../domain.ts'
import { OPERATOR_ERRORS, defineRoute } from '../route.ts'

/** Compared in constant time against OPERATOR_KEY. Absent key at boot disables these routes. */
export const OperatorHeadersSchema = z.object({ 'x-operator-key': z.string().min(1) }).passthrough()

/**
 * What the last read off the bank could not map cleanly.
 *
 * The mapping report exists so that a payload which drifts shows up as an entry rather than as
 * a wrong number on a screen — and until this route it had nowhere to be read. Operator-only
 * because it names account numbers and the bank's own error text.
 *
 * Three kinds of entry, and each means something different. A code fallback is a value outside
 * our tables landing on a default, with the raw string kept. An unmapped path is a key IDBI
 * sent that nothing reads, or a field no operation supplies. A note is everything else: a
 * request shape that had to be retried, a balance identity that stopped holding, a figure two
 * operations disagree about.
 */
export const MappingReportSchema = z.object({
  source: BankSourceSchema,
  /** Null where nothing has been read yet, or where this source has no mapping layer. */
  report: z
    .object({
      codeFallbacks: z.array(
        z.object({ map: z.string(), raw: z.string(), landedOn: z.string(), where: z.string() }),
      ),
      unmappedPaths: z.array(z.string()),
      notes: z.array(z.object({ where: z.string(), detail: z.string() })),
    })
    .nullable(),
})
export type MappingReportResponse = z.infer<typeof MappingReportSchema>

export const operatorMappingReportRoute = defineRoute({
  id: 'operatorMappingReport',
  method: 'GET',
  path: '/api/v1/operator/mapping-report',
  summary:
    'What the last read off the bank could not map cleanly: code fallbacks, keys nothing reads, and every request shape or figure that had to be worked around.',
  auth: 'operator',
  request: { headers: OperatorHeadersSchema },
  response: { 200: MappingReportSchema, ...OPERATOR_ERRORS },
})

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
