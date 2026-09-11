/**
 * The offline tier: the engine in the browser, and nothing but the browser.
 *
 * This is the module `lib/view.ts` used to be. It is loaded lazily, and only when the API cannot
 * be reached and the build allows it (`VITE_OFFLINE_FALLBACK`). It exists so a reviewer on hotel
 * wifi never sees a blank app — but it is a *simulation*: nothing here is recorded, no advice
 * record is written, and every screen says so. The bank build sets the flag false and
 * `scripts/check-bundle.mjs` asserts this chunk is absent from that artefact.
 *
 * It returns the same `View` shape the API does, stamped `tier: 'offline'`, so no screen has two
 * code paths. `@dhan/core` and `@dhan/fixtures` may be imported from this directory and nowhere
 * else in the app.
 */
import {
  addDays,
  addMonths,
  answer,
  buildDailyPlan,
  buildRoadmap,
  derive,
  evaluate,
  findInsights,
  openingLine,
  ruleBook,
  suggestGoal,
  suggestedQuestions,
} from '@dhan/core'
import type { CustomerFile } from '@dhan/core'
import { PERSONAS, PRODUCT_SHELF, generateCustomerFile } from '@dhan/fixtures'
import type { PersonaSpec } from '@dhan/fixtures'
import type {
  Answer,
  AskSuggestions,
  CustomerSummary,
  HoldingsResponse,
  SessionState,
  ShelfProduct,
  SpendCategory,
  TransactionsPage,
  Verdict,
  View,
} from '@dhan/contracts'

/** The persona anchor. Every window in the fixtures is measured from here and it never moves. */
export const ANCHOR = '2026-09-01'
const HISTORY_MONTHS = 24
/** The same headroom the seed gives the server's clock (SEED_FORWARD_MONTHS). */
const FORWARD_MONTHS = 18
const HORIZON = { from: addMonths(ANCHOR, -HISTORY_MONTHS), to: addMonths(ANCHOR, FORWARD_MONTHS) }

export interface OfflineState {
  cif: string
  asOf: string
  lastSeen: string
  /** Mirrors the server's optimistic version so the Clock has one code path. */
  version: number
}

/* ---------------------------------------------------------------- Customers */

function ageOn(dob: string, asOf: string): number {
  const [y, m, d] = asOf.split('-').map(Number)
  const [by, bm, bd] = dob.split('-').map(Number)
  let age = (y ?? 0) - (by ?? 0)
  if ((m ?? 0) < (bm ?? 0) || (m === bm && (d ?? 0) < (bd ?? 0))) age -= 1
  return age
}

function summary(p: PersonaSpec): CustomerSummary {
  return {
    cif: p.customer.cif,
    slug: p.slug,
    name: p.customer.custName,
    age: ageOn(p.customer.dateOfBirth, ANCHOR),
    city: p.customer.city,
    pitch: p.pitch,
    demonstrates: p.demonstrates,
  }
}

export function listCustomers(): CustomerSummary[] {
  return PERSONAS.map(summary)
}

function personaByCif(cif: string): PersonaSpec | null {
  return PERSONAS.find((p) => p.customer.cif === cif) ?? null
}

/* ---------------------------------------------------------------- State */

export function createState(cif: string): OfflineState | null {
  if (!personaByCif(cif)) return null
  return { cif, asOf: ANCHOR, lastSeen: addDays(ANCHOR, -6), version: 1 }
}

/**
 * Advance the clock. `lastSeen` moves to the old `asOf`, which is what makes "since you were
 * away" mean anything. Past the generated horizon the answer is the same sentence the server
 * gives for 422, because the ledger genuinely has no more days.
 */
export function advance(
  state: OfflineState,
  days: number,
): { state: OfflineState; error: string | null } {
  const next = addDays(state.asOf, days)
  if (next > HORIZON.to) {
    return {
      state,
      error: `The ledger has been generated up to ${HORIZON.to}. The clock cannot go past it.`,
    }
  }
  return {
    state: { ...state, lastSeen: state.asOf, asOf: next, version: state.version + 1 },
    error: null,
  }
}

export function reset(state: OfflineState): OfflineState {
  return { ...state, asOf: ANCHOR, lastSeen: addDays(ANCHOR, -6), version: state.version + 1 }
}

export function sessionState(state: OfflineState): SessionState {
  return {
    id: `offline:${state.cif}`,
    cif: state.cif,
    asOf: state.asOf,
    lastSeen: state.lastSeen,
    goalTarget: null,
    caps: [],
    scopeOverrides: [],
    version: state.version,
    ledgerHorizon: HORIZON,
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    capabilities: { simulatedClock: true, avatar: 'none' },
  }
}

/* ---------------------------------------------------------------- The view */

const SHELF: ShelfProduct[] = PRODUCT_SHELF.map((p) => ({
  ...p,
  aliases: [],
  source: 'fixture',
  verified: false,
}))

/**
 * Not a cryptographic hash. The server's `snapshotHash` is a SHA-256 the audit chain is built
 * on; this one only has to be 64 hex characters so the View shape holds, and it never enters a
 * record because the offline tier records nothing. `crypto.subtle` is absent over plain http,
 * which is how a phone on the same wifi reaches a dev build.
 */
function marker(text: string): string {
  let out = ''
  for (let seed = 0; seed < 8; seed += 1) {
    let h = 0x811c9dc5 ^ seed
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
    out += h.toString(16).padStart(8, '0')
  }
  return out
}

interface Built {
  file: CustomerFile
  view: View
}

const cache = new Map<string, Built>()

function build(state: OfflineState): Built {
  const key = `${state.cif}|${state.asOf}|${state.lastSeen}`
  const hit = cache.get(key)
  if (hit) return hit

  const spec = personaByCif(state.cif)
  if (!spec) throw new Error(`no synthetic customer ${state.cif}`)

  const file = generateCustomerFile(spec, {
    anchor: ANCHOR,
    asOf: state.asOf,
    months: HISTORY_MONTHS,
  })
  const snapshot = derive(file, state.asOf)
  const goal = suggestGoal(snapshot, state.asOf, null)
  const roadmap = buildRoadmap(snapshot, goal, PRODUCT_SHELF, state.asOf, {
    version: 1,
    reasonForChange: 'First plan, from twenty-four months of your statements. Offline simulation.',
  })
  const plan = buildDailyPlan(snapshot, roadmap, file.transactions, PRODUCT_SHELF, state.asOf, {
    lastSeen: state.lastSeen,
    caps: [],
    horizonYears: Math.max(5, 60 - snapshot.customer.age),
  })

  const view: View = {
    snapshot,
    accounts: file.accounts,
    goal,
    roadmap,
    plan,
    insights: findInsights(snapshot),
    shelf: SHELF,
    rules: ruleBook.map((r) => ({ id: r.id, description: r.description })),
    meta: {
      asOf: state.asOf,
      ledgerHorizon: HORIZON,
      dataFreshnessDate: state.asOf,
      source: 'memory',
      simulatedClock: true,
      snapshotId: `offline:${state.cif}:${state.asOf}`,
      snapshotHash: marker(JSON.stringify(snapshot)),
      roadmapVersion: roadmap.version,
      provenance: {
        PROFILE: 'fixture',
        ACCOUNTS: 'fixture',
        TXN: 'fixture',
        LIABILITIES: 'fixture',
        HOLDINGS: 'fixture',
      },
      tier: 'offline',
    },
  }

  // Small and bounded: at most a handful of clock positions per session.
  if (cache.size > 24) cache.clear()
  const built = { file, view }
  cache.set(key, built)
  return built
}

export function buildView(state: OfflineState): View {
  return build(state).view
}

/* ---------------------------------------------------------------- Transactions */

/** Newest first, up to as-of, paged the way /transactions is so Money has one code path. */
export function transactionsPage(
  state: OfflineState,
  cursor: string | null,
  limit: number,
  /** Matches `/transactions`'s own filter, so Money's list behaves the same on both tiers. */
  category?: SpendCategory,
): TransactionsPage {
  const all = build(state)
    .file.transactions.filter(
      (t) => t.txnDate <= state.asOf && (category === undefined || t.spendCategory === category),
    )
    .reverse()
  const start = cursor ? Number(cursor) : 0
  const items = all.slice(start, start + limit)
  const next = start + limit
  return { items, nextCursor: next < all.length ? String(next) : null }
}

/* ---------------------------------------------------------------- Holdings */

/**
 * The declared holdings block, in the shape `GET /api/v1/holdings` answers.
 *
 * The Dashboard needs the rows and not just the snapshot's four totals, and without this the
 * whole Holdings and Analytics half of the surface would be an error card on the tier a reviewer
 * on hotel wifi actually sees. The generated customer file already carries them, so this is the
 * same read `transactionsPage` is.
 *
 * `editable: false`, because it is: nothing offline is recorded, and the sheet that writes these
 * rows has no endpoint to write to.
 */
export function holdings(state: OfflineState): HoldingsResponse {
  const { file } = build(state)
  const withIds = (rows: CustomerFile['holdings'], prefix: string): HoldingsResponse['holdings'] =>
    rows.map((h, i) => ({ ...h, holdingId: `${prefix}-${i}` }))
  return {
    holdings: withIds(file.holdings, 'offline-h'),
    policies: withIds(file.policies, 'offline-p'),
    updatedAt: `${state.asOf}T00:00:00.000Z`,
    totalValue: file.holdings.reduce((sum, h) => sum + h.currentValue, 0),
    editable: false,
  }
}

/* ---------------------------------------------------------------- Text tier */

export function suggestions(state: OfflineState): AskSuggestions {
  const { view } = build(state)
  return { opening: openingLine(view.snapshot), questions: suggestedQuestions(view.snapshot) }
}

export function ask(state: OfflineState, question: string): Answer {
  const { file, view } = build(state)
  return answer(question, view.snapshot, file)
}

/** The same gate the server runs. The verdict is real; the record of it is not kept. */
export function evaluateProduct(state: OfflineState, productId: string, amount: number): Verdict {
  const { view } = build(state)
  const product = PRODUCT_SHELF.find((p) => p.productId === productId)
  if (!product) throw new Error(`no product ${productId} on the shelf`)
  return evaluate({
    product,
    snapshot: view.snapshot,
    amount,
    goal: {
      kind: view.goal.kind,
      horizonYears: Math.max(
        1,
        Number(view.goal.targetDate.slice(0, 4)) - Number(state.asOf.slice(0, 4)),
      ),
    },
    alternatives: PRODUCT_SHELF,
  })
}
