/**
 * RmActivityPort in process: push-only arrays, like the memory audit store.
 *
 * There is no method that edits or removes a row, so the only way this store's history changes
 * is by growing, which is the same promise the Postgres tables make with their grants.
 */
import { randomUUID } from 'node:crypto'
import type {
  AccessRecord,
  Clock,
  HandoffStatusChange,
  NewAccessRecord,
  NewHandoffStatusChange,
  NewRmNote,
  RmActivityPort,
  RmNote,
} from '../../ports/index.ts'

export class InMemoryRmActivity implements RmActivityPort {
  private readonly notes: RmNote[] = []
  private readonly statuses: HandoffStatusChange[] = []
  private readonly access: AccessRecord[] = []
  private readonly clock: Clock

  constructor(clock: Clock) {
    this.clock = clock
  }

  async appendNote(input: NewRmNote): Promise<RmNote> {
    const note: RmNote = { id: randomUUID(), ...input, createdAt: this.clock.now().toISOString() }
    this.notes.push(note)
    return { ...note }
  }

  async listNotes(cifs: readonly string[]): Promise<RmNote[]> {
    const wanted = new Set(cifs)
    return this.notes.filter((n) => wanted.has(n.cif)).map((n) => ({ ...n }))
  }

  async appendHandoffStatus(input: NewHandoffStatusChange): Promise<HandoffStatusChange> {
    const change: HandoffStatusChange = {
      id: randomUUID(),
      ...input,
      createdAt: this.clock.now().toISOString(),
    }
    this.statuses.push(change)
    return { ...change }
  }

  async listHandoffStatuses(cifs: readonly string[]): Promise<HandoffStatusChange[]> {
    const wanted = new Set(cifs)
    return this.statuses.filter((s) => wanted.has(s.cif)).map((s) => ({ ...s }))
  }

  async appendAccess(input: NewAccessRecord): Promise<AccessRecord> {
    const entry: AccessRecord = { id: randomUUID(), ...input, at: this.clock.now().toISOString() }
    this.access.push(entry)
    return { ...entry }
  }

  async listAccess(rmId: string, limit: number): Promise<AccessRecord[]> {
    // Newest first. The array is in append order, which a pinned test clock cannot break ties
    // in, so position decides rather than the timestamp.
    const out: AccessRecord[] = []
    for (let i = this.access.length - 1; i >= 0 && out.length < limit; i -= 1) {
      const entry = this.access[i]
      if (entry !== undefined && entry.rmId === rmId) out.push({ ...entry })
    }
    return out
  }
}
