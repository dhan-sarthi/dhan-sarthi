/**
 * Signals are the engine's insights re-voiced, so every test here feeds a snapshot through the
 * real `findInsights` rather than hand-writing an insight. That is the point: the figures are
 * read back out of the engine's own sentences, and a template that changes shape has to fail
 * here rather than quietly produce a title without its number.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findInsights } from '../insights.ts'
import type { Insight } from '../insights.ts'
import type { Series } from '../recurring.ts'
import { habit, snapshot } from '../snapshot.testkit.ts'
import type { SnapshotOverrides } from '../snapshot.testkit.ts'
import { byEngineRank, toSignal, toSignals, topSignal, voiceInsight } from './signals.ts'
import type { InsightLike, Signal } from './signals.ts'

function subscription(overrides: Partial<Series>): Series {
  return {
    key: 'SI/TEST/AUTOPAY',
    merchant: 'Test',
    category: 'Entertainment',
    kind: 'subscription',
    mode: 'SI',
    cadence: 'monthly',
    intervalDays: 30,
    dayOfMonth: 4,
    occurrences: 12,
    firstSeen: '2025-09-04',
    lastSeen: '2026-08-04',
    amount: 499,
    monthlyCost: 499,
    annualCost: 5_988,
    amountVariation: 0,
    fixed: true,
    active: true,
    priceChanges: [],
    reason: 'mandate',
    txnIds: [],
    ...overrides,
  }
}

/** One customer with every kind the engine can raise, each at a figure that is easy to read. */
const EVERYTHING: SnapshotOverrides = {
  debt: {
    total: 8_14_315,
    hasHighInterest: true,
    highInterestTotal: 1_86_240,
    highestRate: 34.8,
    missedRepayment: true,
    monthlyOutgo: 24_200,
    endingSoon: { loanType: 'Personal Loan', emiAmount: 14_800, monthsLeft: 3 },
  },
  protection: {
    dependents: 2,
    lifeCoverInForce: 0,
    lifeCoverNeeded: 1_20_00_000,
    gap: 1_20_00_000,
  },
  buffer: { monthsCovered: 1.4, targetMonths: 6, shortfall: 1_20_000 },
  balances: {
    savings: 3_20_000,
    deposits: 2_00_000,
    total: 5_20_000,
    idleFloor: 3_20_000,
    idleMonths: 7,
    maturingSoon: {
      accountType: 'FD',
      amount: 2_00_000,
      maturityDate: '2026-09-11',
      daysLeft: 10,
      interestRate: 7.1,
    },
  },
  commitments: {
    series: [
      subscription({
        merchant: 'Netflix',
        amount: 649,
        annualCost: 7_788,
        priceChanges: [{ on: '2026-04-04', from: 499, to: 649 }],
      }),
      subscription({
        key: 'SI/AUDIBLE/AUTOPAY',
        merchant: 'Audible',
        amount: 199,
        annualCost: 2_388,
      }),
    ],
  },
  discretionary: {
    topHabits: [
      habit({ merchant: 'Swiggy', timesPerMonth: 12, annualTotal: 43_200, typicalAmount: 300 }),
    ],
    categoryTrends: [{ category: 'Shopping', recent: 9_200, prior: 6_100, changePct: 0.508 }],
  },
}

const insights = findInsights(snapshot(EVERYTHING))
const signals = toSignals(insights)
const byKind = (kind: Signal['kind']): Signal => {
  const found = signals.find((s) => s.kind === kind)
  assert.ok(found, `no ${kind} signal`)
  return found
}

/** Every string the RM reads, from a signal and from its queue lines. */
function allCopy(list: readonly Insight[]): string[] {
  return list.flatMap((i) => {
    const v = voiceInsight(i)
    return v === null
      ? []
      : [v.signal.title, v.signal.detail, ...v.signal.evidence, v.why, v.opener]
  })
}

describe('toSignals', () => {
  it('covers every kind the engine raised, and nothing for the handoff', () => {
    assert.equal(insights.length, 12)
    assert.deepEqual(
      signals.map((s) => s.kind),
      insights.map((i) => i.kind).filter((k) => k !== 'human_handoff'),
      'the engine order, handoff removed',
    )
    assert.equal(toSignal(insights[insights.length - 1] as Insight), null)
  })

  it('keeps the engine’s severity and deadline', () => {
    for (const [i, s] of insights.filter((x) => x.kind !== 'human_handoff').entries()) {
      assert.equal(signals[i]?.severity, s.severity)
    }
    assert.equal(byKind('deposit_maturing').deadlineDays, 10)
    assert.equal(byKind('idle_cash').deadlineDays, null)
  })

  it('writes the spec’s own example for expensive debt', () => {
    const s = byKind('expensive_debt')
    assert.equal(s.title, 'Card at 34.8% — ₹1.86L outstanding')
    assert.equal(s.figure, 1_86_240)
    assert.equal(
      s.detail,
      '₹5,401 a month in interest. Uday blocks every investment until it is cleared.',
    )
  })

  it('leads every other title with the insight’s own figure', () => {
    const expected: [Signal['kind'], string, number | null][] = [
      ['missed_repayment', '₹24,200 a month in EMIs, a repayment missed', 24_200],
      ['deposit_maturing', '₹2L deposit matures in 10 days', 2_00_000],
      ['buffer_thin', '1.4 months of savings — ₹1.2L short of 6 months', 1_20_000],
      ['protection_gap', '₹1.2Cr short on life cover — 2 dependents, no policy', 1_20_00_000],
      ['emi_ending', '₹14,800 a month frees up in 3 months', 14_800],
      ['idle_cash', '₹3.2L idle in savings for 7 months', 3_20_000],
      ['price_increase', '₹1,800 a year more for Netflix', 1_800],
      ['subscription_review', '₹10,176 a year on 2 subscriptions', 10_176],
      ['category_drift', '₹3,100 a month more on shopping — up 51%', 3_100],
      ['habit_cost', '₹43,200 a year on Swiggy — 12 times a month', 43_200],
    ]
    for (const [kind, title, figure] of expected) {
      assert.equal(byKind(kind).title, title, kind)
      assert.equal(byKind(kind).figure, figure, kind)
    }
  })

  it('re-voices the evidence into the third person and keeps its figures', () => {
    assert.deepEqual(byKind('protection_gap').evidence, [
      '2 people depend on them',
      '₹0 of cover today',
      '₹1,20,00,000 needed — ten times their income',
      '₹12,00,000 a year, from their statement',
    ])
    assert.deepEqual(byKind('idle_cash').evidence, [
      '₹3,20,000 — their lowest balance in twelve months',
      'Never dipped below it in 7 months',
    ])
  })

  it('never says "you", and never uses the words the copy rules ban', () => {
    for (const text of allCopy(insights)) {
      assert.doesNotMatch(text, /\byou(r|rs|'re|'ve|rself)?\b/i, text)
      assert.doesNotMatch(text, /envelope|deployable|\bDPD\b|indicative requirement/i, text)
    }
  })
})

describe('edge cases', () => {
  it('says "as declared" when no salary was found in the statement', () => {
    const s = snapshot({
      income: { monthly: 0 },
      customer: { declaredMonthlyIncome: 90_000 },
      protection: {
        dependents: 1,
        lifeCoverInForce: 0,
        lifeCoverNeeded: 1_08_00_000,
        gap: 1_08_00_000,
      },
    })
    const gap = toSignals(findInsights(s)).find((x) => x.kind === 'protection_gap')
    assert.ok(gap)
    assert.equal(gap.title, '₹1.08Cr short on life cover — 1 dependent, no policy')
    assert.equal(
      gap.evidence[3],
      '₹10,80,000 a year, as declared — no salary found in the statement',
    )
  })

  it('reports a partial cover gap, not an absence', () => {
    const s = snapshot({
      protection: {
        dependents: 2,
        lifeCoverInForce: 40_00_000,
        lifeCoverNeeded: 1_20_00_000,
        gap: 80_00_000,
      },
    })
    const gap = toSignals(findInsights(s)).find((x) => x.kind === 'protection_gap')
    assert.equal(gap?.title, '₹80L short on life cover — 2 dependents')
    assert.equal(gap?.figure, 80_00_000)
    assert.match(gap?.detail ?? '', /₹1.2Cr needed, ₹40L held/)
  })

  it('raises no buffer signal where the outflow is unknown', () => {
    const s = snapshot({ buffer: { monthsCovered: null, shortfall: 0 } })
    assert.ok(!toSignals(findInsights(s)).some((x) => x.kind === 'buffer_thin'))
  })

  it('raises no debt signal for a customer with no debt', () => {
    const kinds = toSignals(findInsights(snapshot())).map((x) => x.kind)
    assert.ok(!kinds.includes('expensive_debt') && !kinds.includes('missed_repayment'))
  })

  it('names a missed repayment without a figure where there are no EMIs', () => {
    const s = snapshot({ debt: { missedRepayment: true, monthlyOutgo: 0 } })
    const missed = toSignals(findInsights(s)).find((x) => x.kind === 'missed_repayment')
    assert.equal(missed?.title, 'A loan repayment missed')
    assert.equal(missed?.figure, null)
  })

  it('says today and tomorrow for a deposit that close', () => {
    const at = (daysLeft: number): string | undefined =>
      toSignals(
        findInsights(
          snapshot({
            balances: {
              maturingSoon: {
                accountType: 'FD',
                amount: 50_000,
                maturityDate: '2026-09-01',
                daysLeft,
                interestRate: null,
              },
            },
          }),
        ),
      ).find((x) => x.kind === 'deposit_maturing')?.title
    assert.equal(at(0), '₹50,000 deposit matures today')
    assert.equal(at(1), '₹50,000 deposit matures tomorrow')
  })

  it('reads a habit counted in fractions of a month', () => {
    const s = snapshot({
      discretionary: {
        topHabits: [habit({ merchant: 'Zomato', timesPerMonth: 6.5, annualTotal: 23_400 })],
      },
    })
    assert.equal(
      toSignals(findInsights(s)).find((x) => x.kind === 'habit_cost')?.title,
      '₹23,400 a year on Zomato — 6.5 times a month',
    )
  })

  it('falls back to the kind’s name and the insight’s own words, re-voiced, on an unknown template', () => {
    const odd: InsightLike = {
      kind: 'idle_cash',
      severity: 'opportunity',
      headline: 'You keep ₹2,50,000 in your account.',
      detail: 'Your money could work harder.',
      monthlyValue: 800,
      evidence: ['Seen in your statement'],
    }
    const v = voiceInsight(odd)
    assert.equal(v?.signal.title, 'Idle cash — ₹2.5L')
    assert.equal(v?.signal.figure, 2_50_000)
    assert.equal(v?.signal.detail, 'Their money could work harder.')
    assert.deepEqual(v?.signal.evidence, ['Seen in their statement'])
    assert.equal(v?.why, 'They keep ₹2,50,000 in their account.')
  })

  it('accepts the wire shape, where an absent deadline may arrive as undefined', () => {
    const wire: InsightLike = { ...(insights[0] as Insight), deadlineDays: undefined }
    assert.equal(toSignal(wire)?.deadlineDays, null)
  })
})

describe('topSignal', () => {
  it('is the engine’s first insight that is not the handoff', () => {
    assert.equal(topSignal(insights)?.kind, 'missed_repayment')
  })

  it('is null for a customer the engine has nothing to say about', () => {
    const quiet = findInsights(snapshot({ balances: { idleMonths: 0 } }))
    assert.deepEqual(
      quiet.map((i) => i.kind),
      ['human_handoff'],
    )
    assert.equal(topSignal(quiet), null)
    assert.deepEqual(toSignals(quiet), [])
  })
})

describe('byEngineRank', () => {
  it('sorts a shuffled engine list back into the engine’s own order', () => {
    // A fixed permutation, not a random one, so a failure reproduces.
    const shuffled = [...insights].reverse()
    const mid = shuffled.splice(0, 5)
    shuffled.push(...mid)
    assert.deepEqual(
      [...shuffled].sort(byEngineRank).map((i) => i.kind),
      insights.map((i) => i.kind),
    )
  })

  it('lets a deadline inside fourteen days jump the waterfall within a severity', () => {
    const base = { severity: 'important' as const, monthlyValue: 0 }
    const deposit = { ...base, kind: 'deposit_maturing' as const, deadlineDays: 14 }
    const cover = { ...base, kind: 'protection_gap' as const }
    assert.ok(byEngineRank(deposit, cover) < 0)
    assert.ok(byEngineRank({ ...deposit, deadlineDays: 15 }, cover) > 0)
  })
})
