/**
 * The View every screen reads, built server-side exactly as apps/web's `buildView` built it in
 * the browser: scope → derive → suggestGoal → buildRoadmap → buildDailyPlan → findInsights.
 *
 * Two things are new here and both are about truth rather than speed. The scoped customer
 * file and the shelf are hashed and the snapshot is stored content-addressed, so the first
 * view at a clock position pays the derivation and every view after reads the same object —
 * and the row they read is the artefact an advice record cites. And every roadmap the customer
 * sees is a stored version with a reason, so "it re-cut the plan after your decision" is a row
 * on the Record tab rather than a sentence.
 *
 * A version is cut only when something material changed: the snapshot's hash or the goal. When
 * it is cut, the reason names what moved — a scope withdrawn or restored, the clock, the target —
 * because "re-cut with the latest statements" on a plan whose statements did not change is a
 * sentence a reviewer stops believing the second time they read it.
 *
 * Two small memos live here because the database is far away: the stored snapshot per
 * (subject, as-of, inputs, engine), which never changes once written, and each session's latest
 * roadmap version, dropped the moment this process cuts a new one and re-read after ten seconds
 * regardless, so a second task during a deploy cannot serve a stale plan for long.
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
import type { Consent, ConsentScope, LedgerHorizon, ProvenanceMap, View } from '@dhan/contracts'
import { grantedScopes, scopeFile } from './consent-scope.ts'
import { Conflict, ConsentInactive } from './errors.ts'
import { canonical, hashOf } from './hash.ts'
import type {
  BankDataPort,
  ProductShelfPort,
  RoadmapVersion,
  Session,
  ShelfProduct,
  SnapshotStore,
  StoredSnapshot,
} from '../ports/index.ts'

/** Months of statements the engine reasons over. The generator's default, kept for parity. */
export const HISTORY_WINDOW_MONTHS = 24

/**
 * Why version 1 exists.
 *
 * It used to say "from twenty-four months of your statements", which was true of the generated
 * ledger and false the moment the app read a real feed: IDBI's sandbox holds about a month. How
 * much history there was is already stated exactly, on Today and on the plan's own evidence, so
 * this line does not need to guess at it.
 */
export const FIRST_PLAN_REASON = 'First plan, built from the statements on file.'
export const TARGET_CHANGED_REASON = 'Target changed by the customer.'

/** Where a view's snapshot came from: this process, the database, or a derivation just now. */
export type SnapshotSource = 'memo' | 'stored' | 'derived'

export interface ViewTiming {
  snapshot: SnapshotSource
  roadmap: 'kept' | 'cut'
  ms: number
}

/** The wire View plus what the services behind it need and the client never sees. */
export interface ServerView extends View {
  file: CustomerFile
  consent: Consent
  stored: StoredSnapshot
  shelfProducts: ShelfProduct[]
  horizonYears: number
  timing: ViewTiming
}

interface Derived {
  file: CustomerFile
  consent: Consent
  provenance: ProvenanceMap
  stored: StoredSnapshot
  snapshotSource: SnapshotSource
  snapshot: Snapshot
  goal: Goal
  shelfProducts: ShelfProduct[]
  latest: RoadmapVersion | null
  ledgerHorizon: LedgerHorizon
}

export interface AdvisoryDeps {
  bank: BankDataPort
  shelf: ProductShelfPort
  snapshots: SnapshotStore
  engineVersion: string
  /** Wall clock for the memos. Never domain time. */
  now?: () => number
}

const SNAPSHOT_MEMO_SIZE = 128
const LATEST_MEMO_SIZE = 256
const LATEST_TTL_MS = 10_000

const SCOPE_LABEL: Record<ConsentScope, string> = {
  PROFILE: 'Profile',
  ACCOUNTS: 'Balances',
  TXN: 'Transactions',
  LIABILITIES: 'Loans',
  HOLDINGS: 'Investments and policies',
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** "1 October 2026" — how a date is said, not how it is stored. */
function spokenDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? iso.slice(5, 7)} ${iso.slice(0, 4)}`
}

/** "Loans", "Loans and Balances", "Loans, Balances and Profile". */
function listOf(scopes: readonly ConsentScope[]): string {
  const labels = scopes.map((s) => SCOPE_LABEL[s])
  if (labels.length <= 1) return labels.join('')
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

/**
 * Why this version differs from the last, from what actually changed between them. Scopes are
 * checked first because they are the most specific thing a reviewer just did; the clock next;
 * the target last, because a target change alone leaves the snapshot untouched.
 */
export function recutReason(latest: RoadmapVersion, session: Session, goal: Goal): string {
  const before = new Set(latest.scopeOverrides)
  const after = new Set(session.scopeOverrides)
  const withdrawn = session.scopeOverrides.filter((s) => !before.has(s))
  const restored = latest.scopeOverrides.filter((s) => !after.has(s))
  if (withdrawn.length > 0 || restored.length > 0) {
    const parts: string[] = []
    if (withdrawn.length > 0) parts.push(`withdrew ${listOf(withdrawn)}`)
    if (restored.length > 0) parts.push(`restored ${listOf(restored)}`)
    return `Re-cut after you ${parts.join(' and ')}.`
  }
  if (latest.atSim !== session.asOf) {
    return `Re-cut after the clock moved to ${spokenDate(session.asOf)}.`
  }
  if (canonical(latest.goal) !== canonical(goal)) return TARGET_CHANGED_REASON
  return `Re-cut on ${spokenDate(session.asOf)} with the latest statements.`
}

export class AdvisoryService {
  private readonly deps: AdvisoryDeps
  private readonly now: () => number
  private readonly snapshotMemo = new Map<string, StoredSnapshot>()
  private readonly latestMemo = new Map<string, { at: number; version: RoadmapVersion | null }>()

  constructor(deps: AdvisoryDeps) {
    this.deps = deps
    this.now = deps.now ?? Date.now
  }

  get engineVersion(): string {
    return this.deps.engineVersion
  }

  private async derived(session: Session): Promise<Derived> {
    const { bank, shelf, snapshots, engineVersion } = this.deps

    // Everything that does not depend on the file goes out with it; the far end answers all
    // of them in one round-trip's time.
    const [loaded, consent, shelfProducts, latest, ledgerHorizon] = await Promise.all([
      bank.loadCustomerFile(session.cif, session.asOf, HISTORY_WINDOW_MONTHS),
      bank.getConsent(session.cif),
      shelf.list(),
      this.latestRoadmap(session.id),
      bank.ledgerHorizon(session.cif),
    ])
    if (consent.status !== 'ACTIVE') throw new ConsentInactive(consent.status)

    const file = scopeFile(loaded.file, grantedScopes(consent, session.scopeOverrides))
    const inputHash = hashOf({ file, shelf: shelfProducts, window: HISTORY_WINDOW_MONTHS })

    const key = `${session.subjectId}|${session.asOf}|${inputHash}|${engineVersion}`
    let stored = this.snapshotMemo.get(key)
    let snapshotSource: SnapshotSource = 'memo'
    if (!stored) {
      const put = await snapshots.put({
        cif: session.cif,
        subjectId: session.subjectId,
        sessionId: session.id,
        asOf: session.asOf,
        engineVersion,
        inputHash,
        snapshot: derive(file, session.asOf),
      })
      snapshotSource = put.inserted ? 'derived' : 'stored'
      const { inserted: _inserted, ...row } = put
      stored = row
      remember(this.snapshotMemo, key, stored, SNAPSHOT_MEMO_SIZE)
    }

    return {
      file,
      consent,
      provenance: loaded.provenance,
      stored,
      snapshotSource,
      snapshot: stored.snapshot,
      goal: suggestGoal(stored.snapshot, session.asOf, session.goalTarget),
      shelfProducts,
      latest,
      ledgerHorizon,
    }
  }

  /** The session's latest version, from this process when it cut it or saw it recently. */
  private async latestRoadmap(sessionId: string): Promise<RoadmapVersion | null> {
    const hit = this.latestMemo.get(sessionId)
    if (hit && this.now() - hit.at < LATEST_TTL_MS) return hit.version
    const version = await this.deps.snapshots.latestRoadmap(sessionId)
    remember(this.latestMemo, sessionId, { at: this.now(), version }, LATEST_MEMO_SIZE)
    return version
  }

  private async storeRoadmap(
    session: Session,
    d: Derived,
    roadmap: Roadmap,
  ): Promise<RoadmapVersion> {
    try {
      const row = await this.deps.snapshots.putRoadmap({
        sessionId: session.id,
        version: roadmap.version,
        snapshotId: d.stored.id,
        snapshotHash: d.stored.snapshotHash,
        goal: d.goal,
        roadmap,
        reasonForChange: roadmap.reasonForChange,
        atSim: session.asOf,
        scopeOverrides: [...session.scopeOverrides],
      })
      remember(this.latestMemo, session.id, { at: this.now(), version: row }, LATEST_MEMO_SIZE)
      return row
    } catch (err) {
      this.latestMemo.delete(session.id)
      throw err
    }
  }

  /**
   * The roadmap for this snapshot and goal: the latest stored version when neither changed,
   * else a new version with the reason it differs.
   */
  private async resolveRoadmap(
    session: Session,
    d: Derived,
  ): Promise<{ roadmap: Roadmap; cut: boolean }> {
    const latest = d.latest
    if (
      latest &&
      latest.snapshotHash === d.stored.snapshotHash &&
      canonical(latest.goal) === canonical(d.goal)
    ) {
      return { roadmap: latest.roadmap, cut: false }
    }

    const built = buildRoadmap(d.snapshot, d.goal, d.shelfProducts, session.asOf, {
      version: (latest?.version ?? 0) + 1,
      reasonForChange: latest ? recutReason(latest, session, d.goal) : FIRST_PLAN_REASON,
    })

    try {
      await this.storeRoadmap(session, d, built)
      return { roadmap: built, cut: true }
    } catch (err) {
      // Another task cut a version under us. Read what it wrote and decide again from there.
      if (!(err instanceof Conflict)) throw err
      const fresh = await this.deps.snapshots.latestRoadmap(session.id)
      remember(this.latestMemo, session.id, { at: this.now(), version: fresh }, LATEST_MEMO_SIZE)
      if (!fresh) throw err
      return this.resolveRoadmap(session, { ...d, latest: fresh })
    }
  }

  async view(session: Session): Promise<ServerView> {
    const started = performance.now()
    const d = await this.derived(session)
    const { roadmap, cut } = await this.resolveRoadmap(session, d)
    const horizonYears = Math.max(5, 60 - d.snapshot.customer.age)
    const description = this.deps.bank.describe()

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
      accounts: d.file.accounts,
      goal: d.goal,
      roadmap,
      plan,
      insights: findInsights(d.snapshot),
      shelf: d.shelfProducts,
      rules: [...ruleBook],
      meta: {
        asOf: session.asOf,
        ledgerHorizon: d.ledgerHorizon,
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
      timing: {
        snapshot: d.snapshotSource,
        roadmap: cut ? 'cut' : 'kept',
        ms: Math.round(performance.now() - started),
      },
    }
  }

  /**
   * Cut a new roadmap version from the current snapshot, for the reason given. Unconditional:
   * a decision re-cuts the plan even when the figures did not move, because the record of the
   * decision is the point.
   */
  async recut(session: Session, reasonForChange: string): Promise<number> {
    const d = await this.derived(session)
    const version = (d.latest?.version ?? 0) + 1
    const roadmap = buildRoadmap(d.snapshot, d.goal, d.shelfProducts, session.asOf, {
      version,
      reasonForChange,
    })
    await this.storeRoadmap(session, d, roadmap)
    return version
  }
}

/** Insert at the newest end and drop the oldest past `max`; a map in insertion order is the LRU. */
function remember<V>(memo: Map<string, V>, key: string, value: V, max: number): void {
  memo.delete(key)
  memo.set(key, value)
  while (memo.size > max) {
    const oldest = memo.keys().next().value
    if (oldest === undefined) break
    memo.delete(oldest)
  }
}
