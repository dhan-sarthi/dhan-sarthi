/**
 * SnapshotStore in process: an LRU of derived snapshots, content-addressed like the Postgres
 * rows, and every roadmap version cut per session.
 *
 * Losing an entry costs one derivation, so the LRU is small. Roadmap versions are the audit
 * trail's "it learns" list and are never evicted.
 */
import { randomUUID } from 'node:crypto'
import type { IsoDate } from '@dhan/contracts'
import { hashOf } from '../../application/hash.ts'
import type {
  Clock,
  NewRoadmapVersion,
  NewSnapshot,
  PutSnapshotResult,
  RoadmapVersion,
  SnapshotStore,
  StoredSnapshot,
} from '../../ports/index.ts'

const LRU_SIZE = 64

export class InMemorySnapshotStore implements SnapshotStore {
  private readonly byKey = new Map<string, StoredSnapshot>()
  private readonly byId = new Map<string, StoredSnapshot>()
  private readonly roadmaps = new Map<string, RoadmapVersion[]>()
  private readonly clock: Clock

  constructor(clock: Clock) {
    this.clock = clock
  }

  private key(cif: string, asOf: IsoDate, inputHash: string, engineVersion: string): string {
    return `${cif}|${asOf}|${inputHash}|${engineVersion}`
  }

  async find(
    cif: string,
    asOf: IsoDate,
    inputHash: string,
    engineVersion: string,
  ): Promise<StoredSnapshot | null> {
    const key = this.key(cif, asOf, inputHash, engineVersion)
    const hit = this.byKey.get(key)
    if (!hit) return null
    // Re-insert to mark it most recently used.
    this.byKey.delete(key)
    this.byKey.set(key, hit)
    return hit
  }

  async put(input: NewSnapshot): Promise<PutSnapshotResult> {
    const key = this.key(input.cif, input.asOf, input.inputHash, input.engineVersion)
    const existing = this.byKey.get(key)
    if (existing) return { ...existing, inserted: false }

    const stored: StoredSnapshot = {
      id: randomUUID(),
      cif: input.cif,
      subjectId: input.subjectId,
      sessionId: input.sessionId,
      asOf: input.asOf,
      engineVersion: input.engineVersion,
      inputHash: input.inputHash,
      snapshotHash: hashOf(input.snapshot),
      snapshot: input.snapshot,
      createdAt: this.clock.now().toISOString(),
    }
    this.byKey.set(key, stored)
    this.byId.set(stored.id, stored)

    if (this.byKey.size > LRU_SIZE) {
      const oldest = this.byKey.keys().next().value
      if (oldest !== undefined) {
        const evicted = this.byKey.get(oldest)
        this.byKey.delete(oldest)
        if (evicted) this.byId.delete(evicted.id)
      }
    }
    return { ...stored, inserted: true }
  }

  async getById(id: string): Promise<StoredSnapshot | null> {
    return this.byId.get(id) ?? null
  }

  async putRoadmap(input: NewRoadmapVersion): Promise<RoadmapVersion> {
    const list = this.roadmaps.get(input.sessionId) ?? []
    if (list.some((v) => v.version === input.version)) {
      throw new Error(`Roadmap version ${input.version} already exists for this session.`)
    }
    const row: RoadmapVersion = {
      id: randomUUID(),
      sessionId: input.sessionId,
      version: input.version,
      snapshotId: input.snapshotId,
      snapshotHash: input.snapshotHash,
      goal: input.goal,
      roadmap: input.roadmap,
      reasonForChange: input.reasonForChange,
      atSim: input.atSim,
      scopeOverrides: [...input.scopeOverrides],
      createdAt: this.clock.now().toISOString(),
    }
    list.push(row)
    this.roadmaps.set(input.sessionId, list)
    return row
  }

  async latestRoadmap(sessionId: string): Promise<RoadmapVersion | null> {
    const list = this.roadmaps.get(sessionId)
    return list?.[list.length - 1] ?? null
  }

  async listRoadmaps(sessionId: string): Promise<RoadmapVersion[]> {
    return [...(this.roadmaps.get(sessionId) ?? [])]
  }
}
