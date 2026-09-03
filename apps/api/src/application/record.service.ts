/**
 * The Record tab: everything this session's advice trail holds, and the chain walk that proves
 * none of it was edited.
 */
import type { ChainVerification, RecordView } from '@dhan/contracts'
import type { SeedInfo } from './seed-info.ts'
import type { AuditStore, BankDataPort, Session, SnapshotStore } from '../ports/index.ts'

export interface RecordDeps {
  audit: AuditStore
  snapshots: SnapshotStore
  bank: BankDataPort
  seed: SeedInfo
}

export class RecordService {
  private readonly deps: RecordDeps

  constructor(deps: RecordDeps) {
    this.deps = deps
  }

  async record(session: Session): Promise<RecordView> {
    const { audit, snapshots, bank, seed } = this.deps
    const [trail, versions, consent, provenance, chain] = await Promise.all([
      audit.listForSession(session.id),
      snapshots.listRoadmaps(session.id),
      bank.getConsent(session.cif).catch(() => null),
      seed.provenance(),
      audit.verifyChain(session.id),
    ])

    return {
      adviceRecords: trail.adviceRecords,
      decisions: trail.decisions,
      roadmapVersions: versions.map((v) => ({
        version: v.version,
        snapshotId: v.snapshotId,
        goal: v.goal,
        reasonForChange: v.reasonForChange,
        createdAt: v.createdAt,
      })),
      consent,
      scopeOverrides: session.scopeOverrides,
      provenance,
      avatarSessions: trail.avatarSessions,
      chainVerified: chain.ok,
    }
  }

  verify(session: Session): Promise<ChainVerification> {
    return this.deps.audit.verifyChain(session.id)
  }
}
