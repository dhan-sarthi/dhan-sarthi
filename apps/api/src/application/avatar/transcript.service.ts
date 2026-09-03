/**
 * The provider's conversation record, after the call.
 *
 * Our own ledger — `advice_records` and `avatar_tool_calls` — is written inside the tool handler
 * before the model speaks, so nothing here decides whether the gate fired. The transcript only
 * corroborates it: each tool result in the record is matched to a row of ours, and every shelf
 * product the avatar named is checked for a preceding `check_suitability`. The result is the
 * reconciliation and gate coverage the Record tab shows beside the call.
 *
 * Fetching runs with backoff because the record is not guaranteed to have turns the moment the
 * session ends, and "unavailable" is a recorded outcome rather than a retry forever. What the
 * live calls established (`docs/engineering/avatar-live-call.md`): a session we cancel with
 * DELETE while it is running comes back as a `failed` conversation with no turns and stays that
 * way, so for a call the customer hangs up the ledger is the record and the transcript is the
 * exception, not the rule.
 */
import type { ConversationTurn } from '@dhan/contracts'
import type { Logger } from '../../infra/logger.ts'
import type {
  AuditStore,
  AvatarCredential,
  AvatarProvider,
  ProductShelfPort,
} from '../../ports/index.ts'
import { reconcile } from './reconciler.ts'

/** Cumulative: about 13 minutes before a transcript is given up on. */
export const TRANSCRIPT_DELAYS_MS: readonly number[] = [5_000, 15_000, 45_000, 120_000, 600_000]

export type TranscriptOutcome = 'fetched' | 'empty' | 'failed'

export interface TranscriptServiceDeps {
  provider: AvatarProvider
  audit: AuditStore
  shelf: ProductShelfPort
  log: Logger
  /** Backoff between attempts. Tests pass `[]` (record unavailable at once) or `[0]`. */
  delaysMs?: readonly number[]
}

export class TranscriptService {
  private readonly deps: TranscriptServiceDeps
  private readonly timers = new Map<NodeJS.Timeout, string>()
  private draining = false

  constructor(deps: TranscriptServiceDeps) {
    this.deps = deps
  }

  /** Sessions with a fetch still scheduled. */
  get pending(): number {
    return this.timers.size
  }

  /** One fetch. Attaches the transcript and its reconciliation when the provider has turns. */
  async fetchOnce(runwaySessionId: string, cred: AvatarCredential): Promise<TranscriptOutcome> {
    let turns: ConversationTurn[] | null
    try {
      turns = await this.deps.provider.getConversation(cred, runwaySessionId)
    } catch (err) {
      this.deps.log.warn(
        { runwaySessionId, err: (err as Error).message },
        'transcript fetch failed',
      )
      return 'failed'
    }
    if (!turns) return 'empty'
    await this.attach(runwaySessionId, turns)
    return 'fetched'
  }

  /** Reconcile the provider's turns against our ledger and record both. */
  async attach(runwaySessionId: string, turns: ConversationTurn[]): Promise<void> {
    const [calls, shelf] = await Promise.all([
      this.deps.audit.listToolCalls(runwaySessionId),
      this.deps.shelf.list(),
    ])
    const reconciliation = reconcile(turns, calls, shelf)
    await this.deps.audit.attachTranscript(runwaySessionId, turns, reconciliation)
    this.deps.log.info(
      {
        runwaySessionId,
        turns: turns.length,
        verified: reconciliation.verified.length,
        unverified: reconciliation.unverified.length,
        gateCoverage: reconciliation.gateCoverage,
      },
      'transcript reconciled',
    )
  }

  /**
   * Fetch with backoff. An empty or failed read schedules the next attempt; the last miss records
   * the transcript as unavailable so the Record tab says so rather than "pending" forever.
   */
  schedule(runwaySessionId: string, cred: AvatarCredential, attempt = 0): void {
    const delays = this.deps.delaysMs ?? TRANSCRIPT_DELAYS_MS
    const delay = delays[attempt]
    if (delay === undefined || this.draining) {
      this.deps.audit.attachTranscript(runwaySessionId, null, null).catch((err: Error) => {
        this.deps.log.warn(
          { runwaySessionId, err: err.message },
          'could not mark transcript unavailable',
        )
      })
      return
    }

    const timer = setTimeout(async () => {
      this.timers.delete(timer)
      const outcome = await this.fetchOnce(runwaySessionId, cred)
      if (outcome === 'fetched') return
      this.deps.log.info({ runwaySessionId, attempt, outcome }, 'transcript not ready')
      this.schedule(runwaySessionId, cred, attempt + 1)
    }, delay)
    timer.unref()
    this.timers.set(timer, runwaySessionId)
  }

  /** Drop every pending fetch. Their sessions stay `pending`; a later task may fetch them. */
  shutdown(): void {
    this.draining = true
    for (const timer of this.timers.keys()) clearTimeout(timer)
    this.timers.clear()
  }
}
