/**
 * What a tool handler needs and nothing more. The View is the one computed at grant, so the
 * hot path does no I/O beyond the audit write it must await before answering.
 */
import type { Logger } from '../../../infra/logger.ts'
import type { AuditStore, Clock, ProductShelfPort, Session } from '../../../ports/index.ts'
import type { ServerView } from '../../advisory.service.ts'

export interface ToolContext {
  view: ServerView
  shelf: ProductShelfPort
  audit: AuditStore
  session: Session
  runwaySessionId: string
  engineVersion: string
  clock: Clock
  log: Logger
}
