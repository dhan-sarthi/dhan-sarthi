/**
 * Derived truth, stored: the Snapshot per (customer, date, inputs, engine), and every roadmap
 * version cut from one.
 *
 * Content-addressed and never updated. The first reviewer to open a customer at a clock
 * position pays the derivation; everyone after reads JSON. The same row is the compliance
 * artefact an advice record cites.
 *
 * Implemented by `adapters/postgres/snapshot-store.postgres.ts` (`snapshots`,
 * `roadmap_versions`; UNIQUE on the key) and `adapters/memory/snapshot-store.memory.ts` (an LRU).
 */
import type { Goal, Roadmap, Snapshot } from '@dhan/core'
import type { ConsentScope, IsoDate, Timestamp } from '@dhan/contracts'

export interface StoredSnapshot {
  id: string
  cif: string
  subjectId: string
  sessionId: string
  asOf: IsoDate
  /** Core version plus git sha. A rule change is a new engine version and a new row. */
  engineVersion: string
  /** sha256 of the canonical scoped customer file plus the shelf. */
  inputHash: string
  /** sha256 of the canonical snapshot. What the advice record cites. */
  snapshotHash: string
  snapshot: Snapshot
  createdAt: Timestamp
}

/** What `put` answers: the row, and whether this call was the one that wrote it. */
export interface PutSnapshotResult extends StoredSnapshot {
  inserted: boolean
}

export interface NewSnapshot {
  cif: string
  subjectId: string
  sessionId: string
  asOf: IsoDate
  engineVersion: string
  inputHash: string
  snapshot: Snapshot
}

export interface RoadmapVersion {
  id: string
  sessionId: string
  version: number
  snapshotId: string
  /** The hash of the snapshot it was cut from, so "nothing changed" is a hash comparison. */
  snapshotHash: string
  goal: Goal
  roadmap: Roadmap
  reasonForChange: string
  /** The simulated as-of date the version was cut at. What the Record tab shows. */
  atSim: IsoDate
  /** Consent scopes the session had withdrawn at the time, so the next re-cut can name what changed. */
  scopeOverrides: ConsentScope[]
  createdAt: Timestamp
}

export interface NewRoadmapVersion {
  sessionId: string
  version: number
  snapshotId: string
  snapshotHash: string
  goal: Goal
  roadmap: Roadmap
  reasonForChange: string
  atSim: IsoDate
  scopeOverrides: ConsentScope[]
}

export interface SnapshotStore {
  find(
    cif: string,
    asOf: IsoDate,
    inputHash: string,
    engineVersion: string,
  ): Promise<StoredSnapshot | null>
  /** Insert, or return the existing row when the key already exists. */
  put(input: NewSnapshot): Promise<PutSnapshotResult>
  getById(id: string): Promise<StoredSnapshot | null>
  putRoadmap(input: NewRoadmapVersion): Promise<RoadmapVersion>
  latestRoadmap(sessionId: string): Promise<RoadmapVersion | null>
  /** Every version, oldest first. The "it learns" list on Plan and the audit trail at once. */
  listRoadmaps(sessionId: string): Promise<RoadmapVersion[]>
}
