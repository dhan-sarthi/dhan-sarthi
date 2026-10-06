/**
 * What the RM did: notes and calls on a customer's journey, the status of each request to talk
 * to them, and the access log of every open, reveal and check.
 *
 * Append-only, like the advice record. A note is never edited, a handoff's status is the latest
 * of its changes rather than a column overwritten, and an access entry is a fact about what an
 * RM looked at that nobody may take back: a log an RM could edit would prove nothing about them.
 *
 * Nothing here touches a customer's session, snapshots or chain. The RM's suitability checks are
 * access entries (`checked`), not advice records, so a desk asking "would a ULIP pass?" never
 * appears in the record of what the customer was told.
 *
 * Implemented by `adapters/memory/rm-activity.memory.ts` (under every source for now) and, from
 * migration 0015, `adapters/postgres/rm-activity.postgres.ts` (`app.rm_notes`,
 * `app.rm_handoff_status`, `app.rm_access_log`).
 */
import type { AccessAction, IsoDate, Timestamp } from '@dhan/contracts'

export type RmNoteKind = 'note' | 'call'

export interface RmNote {
  id: string
  rmId: string
  cif: string
  kind: RmNoteKind
  text: string
  /** The RM clock's date, so the note sits on the journey beside the simulated events. */
  atSim: IsoDate
  /** When it was written, for the record. */
  createdAt: Timestamp
}

export interface NewRmNote {
  rmId: string
  cif: string
  kind: RmNoteKind
  text: string
  atSim: IsoDate
}

/** A status a handoff can be moved to. `open` is the absence of any change, never a row. */
export type HandoffStatusMove = 'contacted' | 'resolved'

export interface HandoffStatusChange {
  id: string
  /** The decision id the handoff is keyed by: the request is a row in the customer's record. */
  handoffId: string
  cif: string
  rmId: string
  status: HandoffStatusMove
  note: string | null
  atSim: IsoDate
  createdAt: Timestamp
}

export interface NewHandoffStatusChange {
  handoffId: string
  cif: string
  rmId: string
  status: HandoffStatusMove
  note: string | null
  atSim: IsoDate
}

export interface AccessRecord {
  id: string
  rmId: string
  cif: string
  action: AccessAction
  /** What the RM said they were doing, verbatim. */
  purpose: string
  detail: string | null
  /** A real instant: the log records when the RM looked, not the simulated date. */
  at: Timestamp
}

export interface NewAccessRecord {
  rmId: string
  cif: string
  action: AccessAction
  purpose: string
  detail: string | null
}

export interface RmActivityPort {
  appendNote(input: NewRmNote): Promise<RmNote>
  /** Every note and call on these customers, oldest first. */
  listNotes(cifs: readonly string[]): Promise<RmNote[]>

  appendHandoffStatus(input: NewHandoffStatusChange): Promise<HandoffStatusChange>
  /** Every change on these customers' handoffs, oldest first; a handoff's status is its last. */
  listHandoffStatuses(cifs: readonly string[]): Promise<HandoffStatusChange[]>

  appendAccess(input: NewAccessRecord): Promise<AccessRecord>
  /** One RM's entries, newest first, at most `limit`. */
  listAccess(rmId: string, limit: number): Promise<AccessRecord[]>
}
