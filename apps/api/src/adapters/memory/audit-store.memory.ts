/**
 * AuditStore in process: push-only arrays, hash-chained per session with the same
 * `recordHash` the Postgres store uses, so `GET /record/verify` walks the same arithmetic.
 *
 * Nothing here can be updated or deleted through the interface. The one exception the port
 * allows — attaching a transcript to an avatar session after the call — touches fields that
 * are not in any hash.
 */
import { randomUUID } from 'node:crypto'
import type {
  AdviceRecord,
  AvatarEndReason,
  AvatarSessionRecord,
  AvatarToolCall,
  ChainVerification,
  ConversationTurn,
  DecisionRecord,
  Reconciliation,
  Timestamp,
} from '@dhan/contracts'
import { GENESIS_HASH, adviceRecordHashInput, recordHash } from '../../application/hash.ts'
import type {
  AdviceRecordInput,
  AuditStore,
  AuditTrail,
  AvatarSessionInput,
  AvatarToolCallInput,
  Clock,
  DecisionInput,
} from '../../ports/index.ts'

interface AvatarRow extends AvatarSessionRecord {
  transcript: ConversationTurn[] | null
  reconciliation: Reconciliation | null
}

export class InMemoryAuditStore implements AuditStore {
  private readonly adviceBySession = new Map<string, AdviceRecord[]>()
  private readonly decisionsBySession = new Map<string, DecisionRecord[]>()
  private readonly toolCalls = new Map<string, AvatarToolCall[]>()
  private readonly avatarSessions = new Map<string, AvatarRow>()
  private seq = 0
  private readonly clock: Clock

  constructor(clock: Clock) {
    this.clock = clock
  }

  private now(): Timestamp {
    return this.clock.now().toISOString()
  }

  async appendAdvice(input: AdviceRecordInput): Promise<AdviceRecord> {
    const list = this.adviceBySession.get(input.sessionId) ?? []
    const prevHash = list[list.length - 1]?.recordHash ?? GENESIS_HASH
    this.seq += 1

    const body = {
      id: randomUUID(),
      seq: this.seq,
      sessionId: input.sessionId,
      snapshotId: input.snapshotId,
      consentId: input.consentId,
      source: input.source,
      actionId: input.actionId,
      actionKind: input.actionKind,
      productId: input.productId,
      amount: input.amount,
      verdict: input.verdict,
      ruleId: input.ruleId,
      rulesPassed: [...input.rulesPassed],
      spoken: input.spoken,
      recorded: input.recorded,
      alternative: input.alternative,
      evidence: [...input.evidence],
      engineVersion: input.engineVersion,
      runwaySessionId: input.runwaySessionId,
      verifiedInTranscript: null,
      atSim: input.atSim,
      createdAt: this.now(),
    }
    const record: AdviceRecord = { ...body, prevHash, recordHash: recordHash(prevHash, body) }
    list.push(record)
    this.adviceBySession.set(input.sessionId, list)
    return record
  }

  async appendDecision(input: DecisionInput): Promise<DecisionRecord> {
    const list = this.decisionsBySession.get(input.sessionId) ?? []
    // UNIQUE(session_id, action_id): a second tap on the same action is the first row again.
    const existing = list.find((d) => d.actionId === input.actionId)
    if (existing) return existing

    const record: DecisionRecord = {
      id: randomUUID(),
      sessionId: input.sessionId,
      adviceRecordId: input.adviceRecordId,
      actionId: input.actionId,
      actionKind: input.actionKind,
      kind: input.kind,
      amount: input.amount,
      productId: input.productId,
      shown: input.shown,
      evidence: [...input.evidence],
      note: input.note,
      atSim: input.atSim,
      createdAt: this.now(),
    }
    list.push(record)
    this.decisionsBySession.set(input.sessionId, list)
    return record
  }

  async appendToolCall(input: AvatarToolCallInput): Promise<{ id: string }> {
    const list = this.toolCalls.get(input.runwaySessionId) ?? []
    const row: AvatarToolCall = {
      id: randomUUID(),
      runwaySessionId: input.runwaySessionId,
      tool: input.tool,
      args: input.args,
      result: input.result,
      adviceRecordId: input.adviceRecordId,
      latencyMs: Math.round(input.latencyMs),
      verifiedInTranscript: null,
      createdAt: this.now(),
    }
    list.push(row)
    this.toolCalls.set(input.runwaySessionId, list)
    return { id: row.id }
  }

  async appendAvatarSession(input: AvatarSessionInput): Promise<void> {
    if (this.avatarSessions.has(input.runwaySessionId)) return
    this.avatarSessions.set(input.runwaySessionId, {
      ...input,
      endedAt: null,
      endReason: null,
      minutesCharged: null,
      transcriptStatus: 'pending',
      gateCoverage: null,
      transcript: null,
      reconciliation: null,
    })
  }

  async markAvatarEnded(
    runwaySessionId: string,
    reason: AvatarEndReason,
    minutesCharged: number,
    endedAt: Timestamp,
  ): Promise<void> {
    const row = this.avatarSessions.get(runwaySessionId)
    if (!row || row.endedAt !== null) return
    row.endedAt = endedAt
    row.endReason = reason
    row.minutesCharged = minutesCharged
  }

  async attachTranscript(
    runwaySessionId: string,
    transcript: ConversationTurn[] | null,
    reconciliation: Reconciliation | null,
  ): Promise<void> {
    const row = this.avatarSessions.get(runwaySessionId)
    if (!row) return
    row.transcript = transcript
    row.transcriptStatus = transcript ? 'fetched' : 'unavailable'
    row.reconciliation = reconciliation
    row.gateCoverage = reconciliation?.gateCoverage ?? null
    if (reconciliation) {
      const verified = new Set(reconciliation.verified)
      for (const call of this.toolCalls.get(runwaySessionId) ?? []) {
        call.verifiedInTranscript = verified.has(call.id)
      }
    }
  }

  async getAvatarSession(runwaySessionId: string): Promise<AvatarSessionRecord | null> {
    const row = this.avatarSessions.get(runwaySessionId)
    if (!row) return null
    const { transcript: _t, reconciliation: _r, ...record } = row
    return record
  }

  async getTranscript(runwaySessionId: string): Promise<ConversationTurn[] | null> {
    return this.avatarSessions.get(runwaySessionId)?.transcript ?? null
  }

  /** The reconciliation attached with the transcript, for the call record. */
  async getReconciliation(runwaySessionId: string): Promise<Reconciliation | null> {
    return this.avatarSessions.get(runwaySessionId)?.reconciliation ?? null
  }

  async listToolCalls(runwaySessionId: string): Promise<AvatarToolCall[]> {
    return [...(this.toolCalls.get(runwaySessionId) ?? [])]
  }

  async listAdviceForAvatarSession(runwaySessionId: string): Promise<AdviceRecord[]> {
    const out: AdviceRecord[] = []
    for (const list of this.adviceBySession.values()) {
      for (const r of list) if (r.runwaySessionId === runwaySessionId) out.push(r)
    }
    return out.sort((a, b) => a.seq - b.seq)
  }

  async listForSession(sessionId: string): Promise<AuditTrail> {
    const avatarSessions: AvatarSessionRecord[] = []
    for (const row of this.avatarSessions.values()) {
      if (row.sessionId !== sessionId) continue
      const { transcript: _t, reconciliation: _r, ...record } = row
      avatarSessions.push(record)
    }
    return {
      adviceRecords: [...(this.adviceBySession.get(sessionId) ?? [])],
      decisions: [...(this.decisionsBySession.get(sessionId) ?? [])],
      avatarSessions,
    }
  }

  async verifyChain(sessionId: string): Promise<ChainVerification> {
    const list = this.adviceBySession.get(sessionId) ?? []
    let expectedPrev = GENESIS_HASH
    for (const record of list) {
      const own = recordHash(record.prevHash, adviceRecordHashInput(record))
      if (record.prevHash !== expectedPrev || own !== record.recordHash) {
        return { ok: false, length: list.length, brokenAt: record.id }
      }
      expectedPrev = record.recordHash
    }
    return { ok: true, length: list.length }
  }
}
