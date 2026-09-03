/**
 * AuditStore over app.audit_records, app.decisions, app.avatar_sessions and app.avatar_tool_calls.
 *
 * INSERT only. There is no UPDATE or DELETE on the record tables anywhere in this file, the
 * runtime role has no privilege to issue one, and migration 0006 raises on any that gets through.
 *
 * The chain is per subject: `record_hash = sha256(prev_hash ‖ canonical(row minus hashes))`,
 * with the canonical form from `application/hash.ts` so the memory store and this one agree.
 * The writer reads the subject's tail, computes the hash and inserts; the database trigger
 * checks the link and the sequence under a per-subject lock, so a race between two writers is
 * rejected rather than forked, and the loser simply reads the tail again.
 */
import type {
  AdviceRecord,
  AvatarEndReason,
  AvatarSessionRecord,
  AvatarToolCall,
  ChainVerification,
  ConversationTurn,
  DecisionRecord,
  IsoDate,
  Reconciliation,
  Timestamp,
} from '@dhan/contracts'
import { Conflict } from '../../application/errors.ts'
import { GENESIS_HASH, adviceRecordHashInput, recordHash } from '../../application/hash.ts'
import type { AdviceRecordHashInput } from '../../application/hash.ts'
import { PG, parallel, pgCode } from '../../db/pool.ts'
import type { Db } from '../../db/pool.ts'
import type {
  AdviceRecordInput,
  AuditStore,
  AuditTrail,
  AvatarSessionInput,
  AvatarToolCallInput,
  Clock,
  DecisionInput,
} from '../../ports/index.ts'
import { systemClock } from './clock.ts'

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

interface AdviceRow {
  id: string
  seq: number
  session_id: string
  subject_id: string
  snapshot_id: string
  consent_id: string
  source: AdviceRecord['source']
  action_id: string | null
  action_kind: AdviceRecord['actionKind']
  product_id: string | null
  amount: number | null
  verdict: AdviceRecord['verdict']
  rule_id: string | null
  rules_passed: string[]
  spoken: string | null
  recorded: string
  alternative: AdviceRecord['alternative']
  evidence: string[]
  engine_version: string
  runway_session_id: string | null
  verified_in_transcript: boolean | null
  at_sim: IsoDate
  prev_hash: string
  record_hash: string
  created_at: Date
}

interface DecisionRow {
  id: string
  session_id: string
  advice_record_id: string | null
  action_id: string
  action_kind: DecisionRecord['actionKind']
  kind: DecisionRecord['kind']
  amount: number
  product_id: string | null
  shown: string
  evidence: string[]
  note: string | null
  at_sim: IsoDate
  created_at: Date
}

interface AvatarSessionRow {
  runway_session_id: string
  session_id: string
  credential_label: string
  task_id: string
  opened_at: Date
  ready_at: Date | null
  rpc_connected_at: Date | null
  granted_at: Date | null
  ended_at: Date | null
  end_reason: AvatarEndReason | null
  minutes_charged: number | null
  transcript_status: AvatarSessionRecord['transcriptStatus']
  transcript: ConversationTurn[] | null
  reconciliation: Reconciliation | null
}

interface ToolCallRow {
  id: string
  runway_session_id: string
  tool: AvatarToolCall['tool']
  args: Record<string, unknown>
  result: Record<string, unknown>
  advice_record_id: string | null
  latency_ms: number
  verified_in_transcript: boolean | null
  created_at: Date
}

const ADVICE_COLUMNS = `
  id, seq, session_id, subject_id, snapshot_id, consent_id, source, action_id, action_kind, product_id,
  amount, verdict, rule_id, rules_passed, spoken, recorded, alternative, evidence, engine_version,
  runway_session_id, verified_in_transcript, at_sim, prev_hash, record_hash, created_at`

const DECISION_COLUMNS = `
  id, session_id, advice_record_id, action_id, action_kind, kind, amount, product_id, shown, evidence,
  note, at_sim, created_at`

const AVATAR_COLUMNS = `
  runway_session_id, session_id, credential_label, task_id, opened_at, ready_at, rpc_connected_at,
  granted_at, ended_at, end_reason, minutes_charged, transcript_status, transcript, reconciliation`

const TOOL_CALL_COLUMNS = `
  id, runway_session_id, tool, args, result, advice_record_id, latency_ms, verified_in_transcript, created_at`

const iso = (d: Date): Timestamp => d.toISOString()
const isoOrNull = (d: Date | null): Timestamp | null => (d === null ? null : iso(d))

/** Rupees to the paisa, which is what the column holds; hash what will be read back. */
const money = (n: number | null): number | null => (n === null ? null : Math.round(n * 100) / 100)

function toAdvice(row: AdviceRow): AdviceRecord {
  return {
    id: row.id,
    seq: row.seq,
    sessionId: row.session_id,
    snapshotId: row.snapshot_id,
    consentId: row.consent_id,
    source: row.source,
    actionId: row.action_id,
    actionKind: row.action_kind,
    productId: row.product_id,
    amount: row.amount,
    verdict: row.verdict,
    ruleId: row.rule_id,
    rulesPassed: row.rules_passed,
    spoken: row.spoken,
    recorded: row.recorded,
    alternative: row.alternative,
    evidence: row.evidence,
    engineVersion: row.engine_version,
    runwaySessionId: row.runway_session_id,
    verifiedInTranscript: row.verified_in_transcript,
    atSim: row.at_sim,
    prevHash: row.prev_hash,
    recordHash: row.record_hash,
    createdAt: iso(row.created_at),
  }
}

function toDecision(row: DecisionRow): DecisionRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    adviceRecordId: row.advice_record_id,
    actionId: row.action_id,
    actionKind: row.action_kind,
    kind: row.kind,
    amount: row.amount,
    productId: row.product_id,
    shown: row.shown,
    evidence: row.evidence,
    note: row.note,
    atSim: row.at_sim,
    createdAt: iso(row.created_at),
  }
}

function toAvatarSession(row: AvatarSessionRow): AvatarSessionRecord {
  return {
    runwaySessionId: row.runway_session_id,
    sessionId: row.session_id,
    credentialLabel: row.credential_label,
    taskId: row.task_id,
    openedAt: iso(row.opened_at),
    readyAt: isoOrNull(row.ready_at),
    rpcConnectedAt: isoOrNull(row.rpc_connected_at),
    grantedAt: isoOrNull(row.granted_at),
    endedAt: isoOrNull(row.ended_at),
    endReason: row.end_reason,
    minutesCharged: row.minutes_charged,
    transcriptStatus: row.transcript_status,
    gateCoverage: row.reconciliation?.gateCoverage ?? null,
  }
}

function toToolCall(row: ToolCallRow): AvatarToolCall {
  return {
    id: row.id,
    runwaySessionId: row.runway_session_id,
    tool: row.tool,
    args: row.args,
    result: row.result,
    adviceRecordId: row.advice_record_id,
    latencyMs: row.latency_ms,
    verifiedInTranscript: row.verified_in_transcript,
    createdAt: iso(row.created_at),
  }
}

/* ------------------------------------------------------------------ *
 * Verification, pure: shared with `pnpm audit:verify`
 * ------------------------------------------------------------------ */

/** Walks one subject's records in `seq` order. `brokenAt` is the first record that does not verify. */
export function verifyAdviceChain(records: readonly AdviceRecord[]): ChainVerification {
  let expected = GENESIS_HASH
  let seq = 0
  for (const record of records) {
    seq += 1
    const linked = record.prevHash === expected && record.seq === seq
    const own = recordHash(record.prevHash, adviceRecordHashInput(record))
    if (!linked || own !== record.recordHash) {
      return { ok: false, length: records.length, brokenAt: record.id }
    }
    expected = record.recordHash
  }
  return { ok: true, length: records.length }
}

/* ------------------------------------------------------------------ *
 * The adapter
 * ------------------------------------------------------------------ */

export class PostgresAuditStore implements AuditStore {
  private readonly db: Db
  private readonly clock: Clock
  private readonly ids: () => string

  constructor(db: Db, clock: Clock = systemClock, ids: () => string = () => crypto.randomUUID()) {
    this.db = db
    this.clock = clock
    this.ids = ids
  }

  bind(db: Db): PostgresAuditStore {
    return new PostgresAuditStore(db, this.clock, this.ids)
  }

  async appendAdvice(input: AdviceRecordInput): Promise<AdviceRecord> {
    // Three attempts covers a genuine race on one subject; anything more is a bug elsewhere.
    // The retry only helps in auto-commit mode: inside a caller's transaction the rejected
    // INSERT has already aborted it, and the error reaches the caller, who retries the request.
    for (let attempt = 1; ; attempt += 1) {
      const tail = await this.db.query<{ record_hash: string; seq: number }>(
        `SELECT record_hash, seq FROM app.audit_records WHERE subject_id = $1 ORDER BY seq DESC LIMIT 1`,
        [input.subjectId],
      )
      const prevHash = tail.rows[0]?.record_hash ?? GENESIS_HASH
      const seq = (tail.rows[0]?.seq ?? 0) + 1
      const createdAt = this.clock.now()

      const row: AdviceRecordHashInput = {
        id: this.ids(),
        seq,
        sessionId: input.sessionId,
        snapshotId: input.snapshotId,
        consentId: input.consentId,
        source: input.source,
        actionId: input.actionId,
        actionKind: input.actionKind,
        productId: input.productId,
        amount: money(input.amount),
        verdict: input.verdict,
        ruleId: input.ruleId,
        rulesPassed: input.rulesPassed,
        spoken: input.spoken,
        recorded: input.recorded,
        alternative: input.alternative,
        evidence: input.evidence,
        engineVersion: input.engineVersion,
        runwaySessionId: input.runwaySessionId,
        verifiedInTranscript: null,
        atSim: input.atSim,
        createdAt: iso(createdAt),
      }
      const hash = recordHash(prevHash, row)

      try {
        const { rows } = await this.db.query<AdviceRow>(
          `INSERT INTO app.audit_records
             (id, subject_id, session_id, seq, snapshot_id, snapshot_hash, consent_id, source, action_id,
              action_kind, product_id, amount, verdict, rule_id, rules_passed, spoken, recorded, alternative,
              evidence, engine_version, runway_session_id, verified_in_transcript, at_sim, prev_hash,
              record_hash, created_at)
           VALUES ($1, $2, $3, $4, $5, (SELECT snapshot_hash FROM app.snapshots WHERE id = $5),
                   $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NULL, $21, $22, $23, $24)
           RETURNING ${ADVICE_COLUMNS}`,
          [
            row.id,
            input.subjectId,
            row.sessionId,
            row.seq,
            row.snapshotId,
            row.consentId,
            row.source,
            row.actionId,
            row.actionKind,
            row.productId,
            row.amount,
            row.verdict,
            row.ruleId,
            row.rulesPassed,
            row.spoken,
            row.recorded,
            row.alternative === null ? null : JSON.stringify(row.alternative),
            row.evidence,
            row.engineVersion,
            row.runwaySessionId,
            row.atSim,
            prevHash,
            hash,
            createdAt,
          ],
        )
        return toAdvice(rows[0] as AdviceRow)
      } catch (err) {
        const code = pgCode(err)
        const raced = code === PG.integrityViolation || code === PG.uniqueViolation
        if (!raced || attempt >= 3) throw err
      }
    }
  }

  async appendDecision(input: DecisionInput): Promise<DecisionRecord> {
    const { rows } = await this.db.query<DecisionRow>(
      `INSERT INTO app.decisions
         (session_id, subject_id, advice_record_id, action_id, action_kind, kind, amount, product_id,
          shown, evidence, note, at_sim, created_at)
       VALUES ($1, (SELECT subject_id FROM app.sessions WHERE id = $1), $2, $3, $4, $5, $6, $7, $8, $9,
               $10, $11, $12)
       ON CONFLICT (session_id, action_id) DO NOTHING
       RETURNING ${DECISION_COLUMNS}`,
      [
        input.sessionId,
        input.adviceRecordId,
        input.actionId,
        input.actionKind,
        input.kind,
        money(input.amount),
        input.productId,
        input.shown,
        input.evidence,
        input.note,
        input.atSim,
        this.clock.now(),
      ],
    )
    const inserted = rows[0]
    if (inserted) return toDecision(inserted)

    // The double tap: answer with the row the first tap wrote.
    const existing = await this.db.query<DecisionRow>(
      `SELECT ${DECISION_COLUMNS} FROM app.decisions WHERE session_id = $1 AND action_id = $2`,
      [input.sessionId, input.actionId],
    )
    const row = existing.rows[0]
    if (!row) throw new Conflict('The decision vanished between insert and read.')
    return toDecision(row)
  }

  async appendToolCall(input: AvatarToolCallInput): Promise<{ id: string }> {
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO app.avatar_tool_calls
         (runway_session_id, tool, args, result, advice_record_id, latency_ms, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        input.runwaySessionId,
        input.tool,
        JSON.stringify(input.args),
        JSON.stringify(input.result),
        input.adviceRecordId,
        Math.max(0, Math.round(input.latencyMs)),
        this.clock.now(),
      ],
    )
    return { id: rows[0]?.id as string }
  }

  async appendAvatarSession(input: AvatarSessionInput): Promise<void> {
    await this.db.query(
      `INSERT INTO app.avatar_sessions
         (runway_session_id, session_id, credential_label, task_id, opened_at, ready_at, rpc_connected_at, granted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (runway_session_id) DO UPDATE SET
         ready_at         = coalesce(EXCLUDED.ready_at, app.avatar_sessions.ready_at),
         rpc_connected_at = coalesce(EXCLUDED.rpc_connected_at, app.avatar_sessions.rpc_connected_at),
         granted_at       = coalesce(EXCLUDED.granted_at, app.avatar_sessions.granted_at)`,
      [
        input.runwaySessionId,
        input.sessionId,
        input.credentialLabel,
        input.taskId,
        new Date(input.openedAt),
        input.readyAt === null ? null : new Date(input.readyAt),
        input.rpcConnectedAt === null ? null : new Date(input.rpcConnectedAt),
        input.grantedAt === null ? null : new Date(input.grantedAt),
      ],
    )
  }

  async markAvatarEnded(
    runwaySessionId: string,
    reason: AvatarEndReason,
    minutesCharged: number,
    endedAt: Timestamp,
  ): Promise<void> {
    await this.db.query(
      `UPDATE app.avatar_sessions
       SET ended_at = $2, end_reason = $3, minutes_charged = $4
       WHERE runway_session_id = $1`,
      [runwaySessionId, new Date(endedAt), reason, Math.max(0, minutesCharged)],
    )
  }

  async attachTranscript(
    runwaySessionId: string,
    transcript: ConversationTurn[] | null,
    reconciliation: Reconciliation | null,
  ): Promise<void> {
    await this.db.query(
      `UPDATE app.avatar_sessions
       SET transcript_status = $2, transcript = $3, reconciliation = $4
       WHERE runway_session_id = $1`,
      [
        runwaySessionId,
        transcript === null ? 'unavailable' : 'fetched',
        transcript === null ? null : JSON.stringify(transcript),
        reconciliation === null ? null : JSON.stringify(reconciliation),
      ],
    )
  }

  async getAvatarSession(runwaySessionId: string): Promise<AvatarSessionRecord | null> {
    const { rows } = await this.db.query<AvatarSessionRow>(
      `SELECT ${AVATAR_COLUMNS} FROM app.avatar_sessions WHERE runway_session_id = $1`,
      [runwaySessionId],
    )
    const row = rows[0]
    return row ? toAvatarSession(row) : null
  }

  async getTranscript(runwaySessionId: string): Promise<ConversationTurn[] | null> {
    const { rows } = await this.db.query<{ transcript: ConversationTurn[] | null }>(
      `SELECT transcript FROM app.avatar_sessions WHERE runway_session_id = $1`,
      [runwaySessionId],
    )
    return rows[0]?.transcript ?? null
  }

  async listToolCalls(runwaySessionId: string): Promise<AvatarToolCall[]> {
    const { rows } = await this.db.query<ToolCallRow>(
      `SELECT ${TOOL_CALL_COLUMNS} FROM app.avatar_tool_calls WHERE runway_session_id = $1 ORDER BY created_at, id`,
      [runwaySessionId],
    )
    return rows.map(toToolCall)
  }

  async listAdviceForAvatarSession(runwaySessionId: string): Promise<AdviceRecord[]> {
    const { rows } = await this.db.query<AdviceRow>(
      `SELECT ${ADVICE_COLUMNS} FROM app.audit_records WHERE runway_session_id = $1 ORDER BY seq`,
      [runwaySessionId],
    )
    return rows.map(toAdvice)
  }

  async listForSession(sessionId: string): Promise<AuditTrail> {
    const [advice, decisions, avatar] = await parallel(this.db, [
      () =>
        this.db.query<AdviceRow>(
          `SELECT ${ADVICE_COLUMNS} FROM app.audit_records WHERE session_id = $1 ORDER BY seq`,
          [sessionId],
        ),
      () =>
        this.db.query<DecisionRow>(
          `SELECT ${DECISION_COLUMNS} FROM app.decisions WHERE session_id = $1 ORDER BY ordinal`,
          [sessionId],
        ),
      () =>
        this.db.query<AvatarSessionRow>(
          `SELECT ${AVATAR_COLUMNS} FROM app.avatar_sessions WHERE session_id = $1 ORDER BY opened_at`,
          [sessionId],
        ),
    ])
    return {
      adviceRecords: advice.rows.map(toAdvice),
      decisions: decisions.rows.map(toDecision),
      avatarSessions: avatar.rows.map(toAvatarSession),
    }
  }

  async verifyChain(sessionId: string): Promise<ChainVerification> {
    // The chain is the subject's; a session is one window onto it. An erased session still
    // has records, so the subject is read from the records first and the session second.
    const subject = await this.db.query<{ subject_id: string }>(
      `SELECT subject_id FROM app.audit_records WHERE session_id = $1
       UNION ALL
       SELECT subject_id FROM app.sessions WHERE id = $1
       LIMIT 1`,
      [sessionId],
    )
    const subjectId = subject.rows[0]?.subject_id
    if (!subjectId) return { ok: true, length: 0 }
    return verifyAdviceChain(await this.listForSubject(subjectId))
  }

  /** Every record of one subject, oldest first. What `pnpm audit:verify` walks. */
  async listForSubject(subjectId: string): Promise<AdviceRecord[]> {
    const { rows } = await this.db.query<AdviceRow>(
      `SELECT ${ADVICE_COLUMNS} FROM app.audit_records WHERE subject_id = $1 ORDER BY seq`,
      [subjectId],
    )
    return rows.map(toAdvice)
  }

  async listSubjects(): Promise<string[]> {
    const { rows } = await this.db.query<{ subject_id: string }>(
      `SELECT DISTINCT subject_id FROM app.audit_records ORDER BY subject_id`,
    )
    return rows.map((r) => r.subject_id)
  }
}
