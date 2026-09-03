/**
 * The View every screen reads, built server-side exactly as apps/web's `buildView` built it in
 * the browser: scope → derive → suggestGoal → buildRoadmap → buildDailyPlan → findInsights.
 *
 * Two things are new here and both are about truth rather than speed. The scoped customer
 * file and the shelf are hashed and the snapshot is stored content-addressed, so the first
 * reviewer at a clock position pays the derivation and everyone after reads the same object —
 * and the row they read is the artefact an advice record cites. And every roadmap the customer
 * sees is a stored version with a reason, so "it re-cut the plan after your decision" is a row
 * on the Record tab rather than a sentence.
 */
import {
  buildDailyPlan,
  buildRoadmap,
  derive,
  findInsights,
  ruleBook,
  suggestGoal,
} from '@dhan/core'
import type { CustomerFile, Goal, Roadmap, Snapshot } from '@dhan/core'
import type { Consent, ProvenanceMap, View } from '@dhan/contracts'
import { grantedScopes, scopeFile } from './consent-scope.ts'
import { ConsentInactive } from './errors.ts'
import { canonical, hashOf } from './hash.ts'
import type {
  BankDataPort,
  ProductShelfPort,
  Session,
  ShelfProduct,
  SnapshotStore,
  StoredSnapshot,
} from '../ports/index.ts'

/** Months of statements the engine reasons over. The generator's default, kept for parity. */
export const HISTORY_WINDOW_MONTHS = 24

export const FIRST_PLAN_REASON = 'First plan, from twenty-four months of your statements.'

/** The wire View plus what the services behind it need and the client never sees. */
export interface ServerView extends View {
  file: CustomerFile
  consent: Consent
  stored: StoredSnapshot
  shelfProducts: ShelfProduct[]
  horizonYears: number
}

interface Derived {
  file: CustomerFile
  consent: Consent
  provenance: ProvenanceMap
  stored: StoredSnapshot
  snapshot: Snapshot
  goal: Goal
  shelfProducts: ShelfProduct[]
}

export interface AdvisoryDeps {
  bank: BankDataPort
  shelf: ProductShelfPort
  snapshots: SnapshotStore
  engineVersion: string
}

const stripVersion = (r: Roadmap): Omit<Roadmap, 'version' | 'reasonForChange'> => {
  const { version: _v, reasonForChange: _r, ...rest } = r
  return rest
}

export class AdvisoryService {
  private readonly deps: AdvisoryDeps

  constructor(deps: AdvisoryDeps) {
    this.deps = deps
  }

  get engineVersion(): string {
    return this.deps.engineVersion
  }

  private async derived(session: Session): Promise<Derived> {
    const { bank, shelf, snapshots, engineVersion } = this.deps

    const [loaded, consent, shelfProducts] = await Promise.all([
      bank.loadCustomerFile(session.cif, session.asOf, HISTORY_WINDOW_MONTHS),
      bank.getConsent(session.cif),
      shelf.list(),
    ])
    if (consent.status !== 'ACTIVE') throw new ConsentInactive(consent.status)

    const file = scopeFile(loaded.file, grantedScopes(consent, session.scopeOverrides))
    const inputHash = hashOf({ file, shelf: shelfProducts, window: HISTORY_WINDOW_MONTHS })

    const stored =
      (await snapshots.find(session.cif, session.asOf, inputHash, engineVersion)) ??
      (await snapshots.put({
        cif: session.cif,
        subjectId: session.subjectId,
        sessionId: session.id,
        asOf: session.asOf,
        engineVersion,
        inputHash,
        snapshot: derive(file, session.asOf),
      }))

    return {
      file,
      consent,
      provenance: loaded.provenance,
      stored,
      snapshot: stored.snapshot,
      goal: suggestGoal(stored.snapshot, session.asOf, session.goalTarget),
      shelfProducts,
    }
  }

  /**
   * The roadmap for this snapshot and goal: the latest stored version when nothing material
   * changed, else a new version with the reason it differs.
   */
  private async resolveRoadmap(session: Session, d: Derived): Promise<Roadmap> {
    const latest = await this.deps.snapshots.latestRoadmap(session.id)
    const built = buildRoadmap(d.snapshot, d.goal, d.shelfProducts, session.asOf, {
      version: (latest?.version ?? 0) + 1,
      reasonForChange: !latest
        ? FIRST_PLAN_REASON
        : latest.snapshotId !== d.stored.id
          ? `Re-cut on ${session.asOf} with the latest statements.`
          : 'Target changed by the customer.',
    })

    if (
      latest &&
      latest.snapshotId === d.stored.id &&
      canonical(stripVersion(latest.roadmap)) === canonical(stripVersion(built))
    ) {
      return latest.roadmap
    }

    await this.deps.snapshots.putRoadmap({
      sessionId: session.id,
      version: built.version,
      snapshotId: d.stored.id,
      goal: d.goal,
      roadmap: built,
      reasonForChange: built.reasonForChange,
    })
    return built
  }

  async view(session: Session): Promise<ServerView> {
    const d = await this.derived(session)
    const roadmap = await this.resolveRoadmap(session, d)
    const horizonYears = Math.max(5, 60 - d.snapshot.customer.age)
    const description = this.deps.bank.describe()
    const ledgerHorizon = await this.deps.bank.ledgerHorizon(session.cif)

    const plan = buildDailyPlan(
      d.snapshot,
      roadmap,
      d.file.transactions,
      d.shelfProducts,
      session.asOf,
      { lastSeen: session.lastSeen, caps: session.caps, horizonYears },
    )

    return {
      snapshot: d.snapshot,
      goal: d.goal,
      roadmap,
      plan,
      insights: findInsights(d.snapshot),
      shelf: d.shelfProducts,
      rules: [...ruleBook],
      meta: {
        asOf: session.asOf,
        ledgerHorizon,
        // Under the simulated clock the ledger is complete to the simulated today; under a
        // real feed it is complete to the last sync.
        dataFreshnessDate: description.simulatedClock
          ? session.asOf
          : description.dataFreshnessDate,
        source: description.source,
        simulatedClock: description.simulatedClock,
        snapshotId: d.stored.id,
        snapshotHash: d.stored.snapshotHash,
        roadmapVersion: roadmap.version,
        provenance: d.provenance,
        tier: 'server',
      },
      file: d.file,
      consent: d.consent,
      stored: d.stored,
      shelfProducts: d.shelfProducts,
      horizonYears,
    }
  }

  /** Cut a new roadmap version from the current snapshot, for the reason given. */
  async recut(session: Session, reasonForChange: string): Promise<number> {
    const d = await this.derived(session)
    const latest = await this.deps.snapshots.latestRoadmap(session.id)
    const version = (latest?.version ?? 0) + 1
    const roadmap = buildRoadmap(d.snapshot, d.goal, d.shelfProducts, session.asOf, {
      version,
      reasonForChange,
    })
    await this.deps.snapshots.putRoadmap({
      sessionId: session.id,
      version,
      snapshotId: d.stored.id,
      goal: d.goal,
      roadmap,
      reasonForChange,
    })
    return version
  }
}
