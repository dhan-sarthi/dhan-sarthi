import type { Fact } from '@dhan/contracts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { briefTiles, firstClause, type TileSource } from './tiles.ts'

// Karan's file and the facts his brief was written from, cut to what the tiles read.
const fact = (id: string, kind: Fact['source']['kind'], ref: string | null, text: string): Fact =>
  ({ id, text, source: { kind, ref } }) as Fact

const facts: Fact[] = [
  fact(
    'F7',
    'snapshot',
    null,
    'Karan has ₹2,70,000 of life cover against a need of ₹2,30,40,000 (ten times annual income, a rule of thumb), so ₹2,27,70,000 short; no health cover on file.',
  ),
  fact(
    'F10',
    'snapshot',
    null,
    "Relationship value ₹42,79,914. ₹3,18,774 of Karan's ₹12,45,774 in balances is with IDBI (25.6%); the rest is at HDFC Bank.",
  ),
  fact(
    'F12',
    'roadmap',
    'v0',
    "Karan's plan has 3 stages and takes ₹22,501 a month. Stage 1 now: LIC Term Assurance, ₹1 crore cover, ₹985 a month. Why first: 2 people depend on their income.",
  ),
  fact(
    'F13',
    'insight',
    'missed_repayment',
    'Urgent: ₹30,500 a month in EMIs, a repayment missed. A missed repayment is on record.',
  ),
  fact(
    'F14',
    'insight',
    'expensive_debt',
    'Urgent: Card at 34.8% — ₹1.86L outstanding. ₹5,401 a month in interest.',
  ),
  fact(
    'F15',
    'insight',
    'protection_gap',
    'Important: ₹2.28Cr short on life cover — 2 dependents. Term cover is the cheapest way to close it.',
  ),
]

const signal = (kind: string, severity: string, title: string) => ({
  kind,
  severity,
  title,
  detail: '',
  figure: null,
  deadlineDays: null,
  evidence: [],
})

const karan = {
  signals: [
    signal('missed_repayment', 'urgent', '₹30,500 a month in EMIs, a repayment missed'),
    signal('expensive_debt', 'urgent', 'Card at 34.8% — ₹1.86L outstanding'),
    signal('protection_gap', 'important', '₹2.28Cr short on life cover — 2 dependents'),
  ],
  roadmap: {
    stages: [
      { index: 1, label: 'LIC Term Assurance, ₹1 crore cover, ₹985 a month' },
      { index: 2, label: 'Clear ₹1,86,240 at 34.8%, about 11 months' },
      { index: 3, label: 'Catch up the missed instalment' },
    ],
    currentStageIndex: 0,
  },
  money: {
    walletSharePct: 25.6,
    protection: { gap: 22_770_000, healthCover: false },
  },
} as unknown as TileSource

test('Karan: raise first, the plan, and the cover gap, each citing its fact', () => {
  const tiles = briefTiles(karan, facts)
  assert.deepEqual(
    tiles.map((t) => [t.label, t.value, t.cites]),
    [
      ['Raise first', 'Missed repayment', ['F13']],
      ['Plan', 'Stage 1 of 3', ['F12']],
      ['Cover gap', '₹2.28Cr', ['F15']],
    ],
  )
  assert.equal(tiles[0]?.severity, 'urgent')
  // One clause each: the rest is in the footnote and the talking points.
  assert.equal(tiles[0]?.detail, '₹30,500 a month in EMIs')
  assert.equal(tiles[1]?.detail, 'LIC Term Assurance')
})

test('every figure on a tile appears in the fact it cites', () => {
  const byId = new Map(facts.map((f) => [f.id, f]))
  for (const tile of briefTiles(karan, facts)) {
    const cited = tile.cites.map((id) => byId.get(id)?.text ?? '').join(' ')
    for (const figure of `${tile.value} ${tile.detail}`.match(/₹[\d,.]+(?:Cr|L|k)?|\d+/g) ?? []) {
      assert.ok(cited.includes(figure), `${figure} on "${tile.label}" is not in its fact`)
    }
  }
})

test('the cover gap falls back to the full figure when only the snapshot says it', () => {
  const tiles = briefTiles(
    karan,
    facts.filter((f) => f.id !== 'F15'),
  )
  const cover = tiles.find((t) => t.id === 'cover')
  assert.equal(cover?.value, '₹2,27,70,000')
  assert.deepEqual(cover?.cites, ['F7'])
  assert.equal(cover?.detail, 'Short on life cover; no health cover')
})

test('a cover gap that is already the top signal gives way to the next signal', () => {
  const rajesh = {
    ...karan,
    signals: [karan.signals[2], karan.signals[1]],
  } as unknown as TileSource
  assert.deepEqual(
    briefTiles(rajesh, facts).map((t) => [t.id, t.value]),
    [
      ['raise', 'Protection gap'],
      ['plan', 'Stage 1 of 3'],
      ['then', 'Expensive card debt'],
    ],
  )
})

test('a tile its fact does not vouch for is left out, never shown uncited', () => {
  // A brief written before the plan moved on: the fact names another stage.
  const stale = facts.map((f) =>
    f.id === 'F12' ? { ...f, text: "Karan's plan has 3 stages. Stage 2 now: something else." } : f,
  )
  const ids = briefTiles(karan, stale).map((t) => t.id)
  assert.ok(!ids.includes('plan'))
  assert.deepEqual(ids, ['raise', 'cover', 'then'])
})

test('no signals and no plan still leaves the figures the facts carry', () => {
  const quiet = {
    signals: [],
    roadmap: { stages: [], currentStageIndex: 0 },
    money: karan.money,
  } as unknown as TileSource
  assert.deepEqual(
    briefTiles(quiet, facts).map((t) => [t.id, t.value]),
    [
      ['cover', '₹2.28Cr'],
      ['share', '25.6%'],
    ],
  )
})

test('a tile keeps the first clause of a line, unless that clause is too short to stand', () => {
  assert.equal(firstClause('Card at 34.8% — ₹1.86L outstanding'), 'Card at 34.8%')
  assert.equal(firstClause('1.4 months of savings — ₹3.89L short'), '1.4 months of savings')
  assert.equal(firstClause('Clear ₹1,86,240 at 34.8%, about 11 months'), 'Clear ₹1,86,240 at 34.8%')
  assert.equal(firstClause('₹25L deposit matures in 20 days'), '₹25L deposit matures in 20 days')
  assert.equal(firstClause('Yes, ₹500 a month'), 'Yes, ₹500 a month')
})
