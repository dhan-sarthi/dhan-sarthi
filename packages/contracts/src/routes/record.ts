import { ChainVerificationSchema, RecordViewSchema } from '../domain.ts'
import { SESSION_ERRORS, defineRoute } from '../route.ts'

export const getRecordRoute = defineRoute({
  id: 'getRecord',
  method: 'GET',
  path: '/api/v1/record',
  summary:
    'Everything the Record tab shows: advice records with decisions and snapshot ids, roadmap versions, consent state, seed provenance, avatar sessions with gate coverage.',
  auth: 'session',
  response: { 200: RecordViewSchema, ...SESSION_ERRORS },
})

export const verifyRecordRoute = defineRoute({
  id: 'verifyRecord',
  method: 'GET',
  path: '/api/v1/record/verify',
  summary: 'Walk this session’s hash chain. The compliance-reviewer demo moment.',
  auth: 'session',
  response: { 200: ChainVerificationSchema, ...SESSION_ERRORS },
})
