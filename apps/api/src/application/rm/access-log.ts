/**
 * The access log's one writer: every open, reveal, check, brief, question, note and contact an
 * RM makes goes through here, so the entry is written the same way whoever's route made it.
 *
 * The log is about the RM, not the customer. It never reaches the customer's advice chain, and
 * an RM's suitability check is a `checked` entry here rather than a record there: the chain is
 * what the customer was told, and the desk asking a question told the customer nothing.
 */
import type { AccessAction } from '@dhan/contracts'
import type { AccessRecord, RmActivityPort } from '../../ports/index.ts'
import type { RmCaller } from './caller.ts'

export interface RmAccessLogDeps {
  activity: RmActivityPort
}

export class RmAccessLog {
  private readonly deps: RmAccessLogDeps

  constructor(deps: RmAccessLogDeps) {
    this.deps = deps
  }

  record(
    rm: RmCaller,
    cif: string,
    action: AccessAction,
    purpose: string,
    detail: string | null = null,
  ): Promise<AccessRecord> {
    return this.deps.activity.appendAccess({ rmId: rm.rmId, cif, action, purpose, detail })
  }

  /** The caller's own entries, newest first. */
  list(rm: RmCaller, limit: number): Promise<AccessRecord[]> {
    return this.deps.activity.listAccess(rm.rmId, limit)
  }
}
