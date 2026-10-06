/**
 * The three tiles at the top of a brief: what to raise first, where the plan stands, and one
 * more figure worth having in hand before the call. The RM reads them in the seconds before
 * dialling; the sentences under them are for when there is more time.
 *
 * Each tile is built from the customer's file and cites a fact from the brief, and a tile is
 * only shown when its fact vouches for it: every figure or phrase on the tile must appear in
 * the cited fact's own words, the same check the server makes of every sentence. A file and a
 * brief that disagree (a brief written before the plan changed) lose the tile rather than show
 * a footnote that says something else. Figures are printed the way the facts print them
 * (`rupeesTitle`), so ₹2.28Cr on a tile is ₹2.28Cr in its footnote.
 *
 * Pure, with type-only contract imports, so `node --test` runs it without a bundler.
 */
import type { Customer360, Fact, FactId, SignalSeverity } from '@dhan/contracts'
import { SIGNAL_LABELS, rupees, rupeesTitle } from '@dhan/core'

export type TileId = 'raise' | 'plan' | 'cover' | 'then' | 'share'

export interface BriefTile {
  id: TileId
  /** The eyebrow: "Raise first", "Plan", "Cover gap". */
  label: string
  /** The one thing to remember: "Missed repayment", "Stage 1 of 3", "₹2.28Cr". */
  value: string
  /** The line under it, in the record's words. */
  detail: string
  /** A signal's level, where the tile is a signal. */
  severity: SignalSeverity | null
  cites: FactId[]
}

/** What the tiles read from the file. A `Customer360` satisfies it. */
export type TileSource = Pick<Customer360, 'signals' | 'roadmap' | 'money'>

export const TILE_MAX = 3

/** The first fact of these kinds that says every one of `phrases`, in order of preference. */
function vouching(
  facts: readonly Fact[],
  match: (fact: Fact) => boolean,
  phrases: readonly string[],
): Fact | undefined {
  return facts.find((fact) => match(fact) && phrases.every((p) => fact.text.includes(p)))
}

/**
 * A tile has room for one clause: "₹30,500 a month in EMIs" of "₹30,500 a month in EMIs, a
 * repayment missed", "Card at 34.8%" of "Card at 34.8% — ₹1.86L outstanding", "LIC Term
 * Assurance" of the plan stage. The rest is one footnote away, and in the talking points under
 * the tiles. A first clause too short to stand alone keeps the line.
 */
export function firstClause(text: string): string {
  const cuts = [text.indexOf(', '), text.indexOf(' — ')].filter((i) => i >= 8)
  return cuts.length > 0 ? text.slice(0, Math.min(...cuts)) : text
}

const isSignal =
  (kind: string) =>
  (fact: Fact): boolean =>
    fact.source.kind === 'insight' && fact.source.ref === kind

function signalTile(
  id: 'raise' | 'then',
  label: string,
  signal: TileSource['signals'][number] | undefined,
  facts: readonly Fact[],
): BriefTile | null {
  if (!signal) return null
  const fact = vouching(facts, isSignal(signal.kind), [signal.title])
  if (!fact) return null
  return {
    id,
    label,
    value: SIGNAL_LABELS[signal.kind],
    detail: firstClause(signal.title),
    severity: signal.severity,
    cites: [fact.id],
  }
}

function planTile(roadmap: TileSource['roadmap'], facts: readonly Fact[]): BriefTile | null {
  const { stages, currentStageIndex } = roadmap
  const stage = stages[currentStageIndex]
  if (!stage) return null
  const fact = vouching(facts, (f) => f.source.kind === 'roadmap', [
    `${stages.length} stage`,
    `Stage ${stage.index}`,
    stage.label,
  ])
  if (!fact) return null
  return {
    id: 'plan',
    label: 'Plan',
    value: `Stage ${stage.index} of ${stages.length}`,
    detail: firstClause(stage.label),
    severity: null,
    cites: [fact.id],
  }
}

function coverTile(money: TileSource['money'], facts: readonly Fact[]): BriefTile | null {
  const { gap, healthCover } = money.protection
  if (gap <= 0) return null
  // The signal's line first: it says the gap short. The money snapshot says it in full.
  const about = (f: Fact) =>
    isSignal('protection_gap')(f) || (f.source.kind === 'snapshot' && f.text.includes('life cover'))
  for (const figure of [rupeesTitle(gap), rupees(gap)]) {
    const fact = vouching(facts, about, [figure])
    if (!fact) continue
    const noHealth = !healthCover && fact.text.includes('no health cover')
    return {
      id: 'cover',
      label: 'Cover gap',
      value: figure,
      detail: noHealth ? 'Short on life cover; no health cover' : 'Short on life cover',
      severity: null,
      cites: [fact.id],
    }
  }
  return null
}

function shareTile(money: TileSource['money'], facts: readonly Fact[]): BriefTile | null {
  if (money.walletSharePct === null) return null
  const pct = `${money.walletSharePct}%`
  const fact = vouching(facts, (f) => f.source.kind === 'snapshot', [pct, 'with IDBI'])
  if (!fact) return null
  return {
    id: 'share',
    label: 'With IDBI',
    value: pct,
    detail: 'Of balances at every bank',
    severity: null,
    cites: [fact.id],
  }
}

/**
 * Up to three tiles, in this order of preference: the engine's top signal, the plan's current
 * stage, the life-cover gap (unless the top signal already is it), the next signal, and the
 * share of balances with IDBI. Any the facts cannot vouch for are skipped.
 */
export function briefTiles(source: TileSource, facts: readonly Fact[]): BriefTile[] {
  const [top, next] = source.signals
  const candidates = [
    signalTile('raise', 'Raise first', top, facts),
    planTile(source.roadmap, facts),
    top?.kind === 'protection_gap' ? null : coverTile(source.money, facts),
    signalTile('then', 'Then', next, facts),
    shareTile(source.money, facts),
  ]
  return candidates.filter((t): t is BriefTile => t !== null).slice(0, TILE_MAX)
}
