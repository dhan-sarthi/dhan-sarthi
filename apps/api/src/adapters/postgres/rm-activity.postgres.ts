/**
 * RmActivityPort over app.rm_notes, app.rm_handoff_status and app.rm_access_log (migration 0015).
 *
 * Append-only three times over: this class has no statement that edits or removes a row, the
 * runtime role holds no UPDATE or DELETE on these tables, and 0015's triggers refuse both from
 * anyone. Rows come back in the order they were written (`ordinal`), which is the order the port
 * promises; the timestamps are what the RM sees, and two of them can be equal.
 */
import type { AccessAction, IsoDate } from '@dhan/contracts'
import type { Db } from '../../db/pool.ts'
import type {
  AccessRecord,
  Clock,
  HandoffStatusChange,
  HandoffStatusMove,
  NewAccessRecord,
  NewHandoffStatusChange,
  NewRmNote,
  RmActivityPort,
  RmNote,
  RmNoteKind,
} from '../../ports/index.ts'
import { systemClock } from './clock.ts'

interface NoteRow {
  id: string
  rm_id: string
  cif: string
  kind: RmNoteKind
  body: string
  at_sim: IsoDate
  created_at: Date
}

interface HandoffRow {
  id: string
  handoff_id: string
  cif: string
  rm_id: string
  status: HandoffStatusMove
  note: string | null
  at_sim: IsoDate
  created_at: Date
}

interface AccessRow {
  id: string
  rm_id: string
  cif: string
  action: AccessAction
  purpose: string
  detail: string | null
  at: Date
}

const NOTE_COLUMNS = 'id, rm_id, cif, kind, body, at_sim, created_at'
const HANDOFF_COLUMNS = 'id, handoff_id, cif, rm_id, status, note, at_sim, created_at'
const ACCESS_COLUMNS = 'id, rm_id, cif, action, purpose, detail, at'

const toNote = (row: NoteRow): RmNote => ({
  id: row.id,
  rmId: row.rm_id,
  cif: row.cif,
  kind: row.kind,
  text: row.body,
  atSim: row.at_sim,
  createdAt: row.created_at.toISOString(),
})

const toChange = (row: HandoffRow): HandoffStatusChange => ({
  id: row.id,
  handoffId: row.handoff_id,
  cif: row.cif,
  rmId: row.rm_id,
  status: row.status,
  note: row.note,
  atSim: row.at_sim,
  createdAt: row.created_at.toISOString(),
})

const toAccess = (row: AccessRow): AccessRecord => ({
  id: row.id,
  rmId: row.rm_id,
  cif: row.cif,
  action: row.action,
  purpose: row.purpose,
  detail: row.detail,
  at: row.at.toISOString(),
})

export class PostgresRmActivity implements RmActivityPort {
  private readonly db: Db
  private readonly clock: Clock

  constructor(db: Db, clock: Clock = systemClock) {
    this.db = db
    this.clock = clock
  }

  async appendNote(input: NewRmNote): Promise<RmNote> {
    const { rows } = await this.db.query<NoteRow>(
      `INSERT INTO app.rm_notes (rm_id, cif, kind, body, at_sim, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${NOTE_COLUMNS}`,
      [input.rmId, input.cif, input.kind, input.text, input.atSim, this.clock.now()],
    )
    return toNote(rows[0] as NoteRow)
  }

  async listNotes(cifs: readonly string[]): Promise<RmNote[]> {
    if (cifs.length === 0) return []
    const { rows } = await this.db.query<NoteRow>(
      `SELECT ${NOTE_COLUMNS} FROM app.rm_notes WHERE cif = ANY($1::text[]) ORDER BY ordinal`,
      [cifs],
    )
    return rows.map(toNote)
  }

  async appendHandoffStatus(input: NewHandoffStatusChange): Promise<HandoffStatusChange> {
    const { rows } = await this.db.query<HandoffRow>(
      `INSERT INTO app.rm_handoff_status (handoff_id, cif, rm_id, status, note, at_sim, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${HANDOFF_COLUMNS}`,
      [
        input.handoffId,
        input.cif,
        input.rmId,
        input.status,
        input.note,
        input.atSim,
        this.clock.now(),
      ],
    )
    return toChange(rows[0] as HandoffRow)
  }

  async listHandoffStatuses(cifs: readonly string[]): Promise<HandoffStatusChange[]> {
    if (cifs.length === 0) return []
    const { rows } = await this.db.query<HandoffRow>(
      `SELECT ${HANDOFF_COLUMNS} FROM app.rm_handoff_status
       WHERE cif = ANY($1::text[]) ORDER BY ordinal`,
      [cifs],
    )
    return rows.map(toChange)
  }

  async appendAccess(input: NewAccessRecord): Promise<AccessRecord> {
    const { rows } = await this.db.query<AccessRow>(
      `INSERT INTO app.rm_access_log (rm_id, cif, action, purpose, detail, at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${ACCESS_COLUMNS}`,
      [input.rmId, input.cif, input.action, input.purpose, input.detail, this.clock.now()],
    )
    return toAccess(rows[0] as AccessRow)
  }

  async listAccess(rmId: string, limit: number): Promise<AccessRecord[]> {
    // Counted the way the memory store's loop counts (`out.length < limit`), so zero or less
    // asks for nothing, where LIMIT would refuse a negative outright, a fraction rounds up, and
    // Infinity is every entry (LIMIT NULL).
    if (!(limit > 0)) return []
    const { rows } = await this.db.query<AccessRow>(
      `SELECT ${ACCESS_COLUMNS} FROM app.rm_access_log
       WHERE rm_id = $1 ORDER BY ordinal DESC LIMIT $2`,
      [rmId, Number.isFinite(limit) ? Math.ceil(limit) : null],
    )
    return rows.map(toAccess)
  }
}
