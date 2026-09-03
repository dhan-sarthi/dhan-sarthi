/**
 * The append-only record: one row per proposal, one per decision, one per avatar tool call.
 *
 * There is no update and no delete on this interface, which is the same thing migration 0007
 * enforces in the database. `appendAdvice` computes the hash chain
 * (`record_hash = sha256(prev_hash ‖ canonical(row))`) per session inside the insert.
 *
 * Implemented by `adapters/postgres/audit-store.postgres.ts` (INSERT only as `dhan_app`;
 * UPDATE/DELETE raise) and `adapters/memory/audit-store.memory.ts` (push-only arrays). With the
 * database down the memory store is NOT substituted: the failure is shown on the Record tab.
 */
import type {
  ActionKind,
  AdviceRecord,
  AdviceSource,
  Alternative,
  AvatarEndReason,
  AvatarSessionRecord,
  AvatarToolCall,
  ChainVerification,
  ConversationTurn,
  DecisionKind,
  DecisionRecord,
  IsoDate,
  Reconciliation,
  RecordView,
  Timestamp,
  ToolName,
  VerdictOutcome,
} from '@dhan/contracts'

export interface AdviceRecordInput {
  sessionId: string
  subjectId: string
  snapshotId: string
  consentId: string
  source: AdviceSource
  actionId: string | null
  actionKind: ActionKind | null
  productId: string | null
  amount: number | null
  verdict: VerdictOutcome
  ruleId: string | null
  rulesPassed: string[]
  /** The exact sentence the customer saw or heard. */
  spoken: string | null
  recorded: string
  alternative: Alternative | null
  evidence: string[]
  engineVersion: string
  runwaySessionId: string | null
  atSim: IsoDate
}

export interface DecisionInput {
  sessionId: string
  adviceRecordId: string | null
  actionId: string
  actionKind: ActionKind
  kind: DecisionKind
  amount: number
  productId: string | null
  /** The button label the customer tapped, verbatim. */
  shown: string
  evidence: string[]
  note: string | null
  atSim: IsoDate
}

export interface AvatarToolCallInput {
  runwaySessionId: string
  tool: ToolName
  args: Record<string, unknown>
  result: Record<string, unknown>
  adviceRecordId: string | null
  latencyMs: number
}

export interface AvatarSessionInput {
  runwaySessionId: string
  sessionId: string
  credentialLabel: string
  taskId: string
  openedAt: Timestamp
  readyAt: Timestamp | null
  rpcConnectedAt: Timestamp | null
  grantedAt: Timestamp | null
}

/** The part of the Record tab this store owns. The application adds consent, provenance and versions. */
export type AuditTrail = Pick<RecordView, 'adviceRecords' | 'decisions' | 'avatarSessions'>

export interface AuditStore {
  /** Awaited BEFORE a verdict is returned to the model, so the record exists before the sentence is spoken. */
  appendAdvice(input: AdviceRecordInput): Promise<AdviceRecord>
  /** UNIQUE(session_id, action_id): a double tap produces one row even without the header. */
  appendDecision(input: DecisionInput): Promise<DecisionRecord>
  appendToolCall(input: AvatarToolCallInput): Promise<{ id: string }>
  appendAvatarSession(input: AvatarSessionInput): Promise<void>
  markAvatarEnded(
    runwaySessionId: string,
    reason: AvatarEndReason,
    minutesCharged: number,
    endedAt: Timestamp,
  ): Promise<void>
  /** `transcript` null means the provider had nothing; status becomes `unavailable`. */
  attachTranscript(
    runwaySessionId: string,
    transcript: ConversationTurn[] | null,
    reconciliation: Reconciliation | null,
  ): Promise<void>
  getAvatarSession(runwaySessionId: string): Promise<AvatarSessionRecord | null>
  getTranscript(runwaySessionId: string): Promise<ConversationTurn[] | null>
  listToolCalls(runwaySessionId: string): Promise<AvatarToolCall[]>
  listAdviceForAvatarSession(runwaySessionId: string): Promise<AdviceRecord[]>
  listForSession(sessionId: string): Promise<AuditTrail>
  verifyChain(sessionId: string): Promise<ChainVerification>
}
