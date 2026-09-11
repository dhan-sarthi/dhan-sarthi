/**
 * The half of the rebalancing surface that can be wrong invisibly.
 *
 * A drift screen is a machine for making claims about somebody's money, and the two ways it can
 * lie are both silent. It can claim a gap that is not there — which is how a distribution app
 * ends up recommending a product every quarter — and it can draw an unknown as a zero, which
 * looks identical to a real nothing on a donut. So the tests below are about *provenance* rather
 * than about arithmetic:
 *
 * - the month reconciles to income on both sides, so the comparison is a comparison and not two
 *   unrelated charts;
 * - a customer whose plan has not drifted produces no drift at all, because the honest empty
 *   state has to be reachable from real data and not only from a literal;
 * - unobservable is `null` and never `0`;
 * - and nothing reaches the transaction spine unless the shelf can actually sell it, because the
 *   spine is where the suitability gate lives and a change that skips it is the one bug on this
 *   screen that would matter.
 *
 * Run against the roadmaps the engine actually builds for the three personas, the way
 * `goals/jar.test.ts` does — a literal Snapshot would let every one of these pass while the real
 * pipeline produced something else.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildRoadmap,
  derive,
  monthlyInterest as coreMonthlyInterest,
  monthsToClear as coreMonthsToClear,
  paymentToClear as corePaymentToClear,
  suggestGoal,
} from '@dhan/core'
import type { Snapshot as CoreSnapshot } from '@dhan/core'
import { PRIYA, PRODUCT_SHELF, ROHAN, SUNIL, generateCustomerFile } from '@dhan/fixtures'
import type { PersonaSpec } from '@dhan/fixtures'
import type { Roadmap, Snapshot } from '@dhan/contracts'
import {
  changesFor,
  changeTotals,
  detectDrift,
  driftFor,
  fundingStage,
  investingNow,
  MONTH_SLICES,
  monthlyIncome,
  monthlyInterest,
  monthPair,
  monthsToClear,
  paymentToClear,
  observedMonth,
  plannedMonth,
} from './drift.ts'
import type { MonthSlice } from './drift.ts'

const ASOF = '2026-09-01'
const OPTS = { anchor: ASOF, asOf: ASOF, months: 24 }

const snap = (spec: PersonaSpec): CoreSnapshot => derive(generateCustomerFile(spec, OPTS), ASOF)

function plan(spec: PersonaSpec): [Roadmap, Snapshot] {
  const s = snap(spec)
  const roadmap = buildRoadmap(s, suggestGoal(s, ASOF, null), PRODUCT_SHELF, ASOF)
  return [roadmap as unknown as Roadmap, s as unknown as Snapshot]
}

const PERSONAS: [string, PersonaSpec][] = [
  ['Priya', PRIYA],
  ['Rohan', ROHAN],
  ['Sunil', SUNIL],
]

const sum = (slices: { value: number }[]): number => slices.reduce((n, s) => n + s.value, 0)

/* ---------------------------------------------------------------- The month */

describe('the two months are comparable', () => {
  for (const [name, spec] of PERSONAS) {
    it(`${name}: both sides carry the same five labels in the same order`, () => {
      const [roadmap, snapshot] = plan(spec)
      assert.deepEqual(
        plannedMonth(roadmap, snapshot).map((s) => s.label),
        [...MONTH_SLICES],
      )
      assert.deepEqual(
        observedMonth(snapshot).map((s) => s.label),
        [...MONTH_SLICES],
      )
    })

    it(`${name}: the observed month reconciles to income`, () => {
      const [, snapshot] = plan(spec)
      const income = monthlyIncome(snapshot).amount
      if (income === 0) return // nothing recognisable as income; the screen refuses to draw it
      const running = investingNow(snapshot)
      // Exact where the statement and the declared mandates agree. Two documented slacks: the
      // mandate figure winning over a statement that cannot see it, and a customer who spends
      // more than they earn, whose `deployable` is floored at zero rather than going negative.
      const slack =
        Math.max(0, running.amount - snapshot.commitments.investments) +
        Math.max(0, -snapshot.surplus.monthly)
      assert.ok(
        Math.abs(sum(observedMonth(snapshot)) - slack - income) <= 2,
        `observed ${sum(observedMonth(snapshot))} against income ${income} (slack ${slack})`,
      )
    })

    it(`${name}: the pair is drawn against one whole, and no row is dead on both sides`, () => {
      const [roadmap, snapshot] = plan(spec)
      const pair = monthPair(roadmap, snapshot)
      assert.deepEqual(
        pair.planned.map((s) => s.label),
        pair.observed.map((s) => s.label),
        'the two cards must run the same positions or their colours mean different things',
      )
      assert.ok(pair.whole >= sum(pair.planned) - 2, 'the plan overdraws its own denominator')
      assert.ok(pair.whole >= sum(pair.observed) - 2, 'the month overdraws its own denominator')
      for (let i = 0; i < pair.planned.length; i += 1) {
        const a = pair.planned[i]?.value ?? 0
        const b = pair.observed[i]?.value ?? 0
        assert.ok(a > 0 || b > 0, `${pair.planned[i]?.label} is zero on both sides`)
      }
    })

    it(`${name}: no slice is negative`, () => {
      const [roadmap, snapshot] = plan(spec)
      for (const s of [...plannedMonth(roadmap, snapshot), ...observedMonth(snapshot)]) {
        assert.ok(s.value >= 0, `${s.label} drew ${s.value}`)
      }
    })
  }

  it('the plan moves money out of what is unallocated and into the plan', () => {
    const [roadmap, snapshot] = plan(ROHAN)
    const before = observedMonth(snapshot)
    const after = plannedMonth(roadmap, snapshot)
    const at = (list: { label: string; value: number }[], label: MonthSlice): number =>
      list.find((s) => s.label === label)?.value ?? 0
    assert.ok(roadmap.monthlyCommitment > 0, 'this persona is only interesting with a live plan')
    // Named through the constant rather than by literal: the labels are short because the legend
    // truncates, and a test carrying its own copy of them passes while the screen draws nothing.
    assert.ok(at(after, 'Into the plan') > at(before, 'Into the plan'))
    assert.ok(at(after, 'Not spoken for') <= at(before, 'Not spoken for'))
  })
})

/* ---------------------------------------------------------------- Provenance */

describe('what the app will and will not claim', () => {
  it('prefers the declared mandate over a statement that cannot see it', () => {
    // derive.ts records the bug this guards: over a feed whose narrations carry no merchant the
    // statement figure is zero for a customer with a live mandate, and the screen said so.
    assert.deepEqual(
      investingNow({
        commitments: { investments: 0 },
        holdings: { sipMonthly: 5000 },
      } as unknown as Snapshot),
      { amount: 5000, source: 'mandates' },
    )

    assert.deepEqual(
      investingNow({
        commitments: { investments: 7000 },
        holdings: { sipMonthly: 5000 },
      } as unknown as Snapshot),
      { amount: 7000, source: 'statement' },
    )

    assert.deepEqual(
      investingNow({
        commitments: { investments: 0 },
        holdings: { sipMonthly: 0 },
      } as unknown as Snapshot),
      { amount: 0, source: 'none' },
    )
  })

  it('falls back to the declared income and says which figure answered', () => {
    assert.equal(
      monthlyIncome({
        income: { monthly: 84000 },
        customer: { declaredMonthlyIncome: 90000 },
      } as unknown as Snapshot).source,
      'statement',
    )
    assert.equal(
      monthlyIncome({
        income: { monthly: 0 },
        customer: { declaredMonthlyIncome: 90000 },
      } as unknown as Snapshot).source,
      'declared',
    )
    assert.equal(
      monthlyIncome({
        income: { monthly: 0 },
        customer: { declaredMonthlyIncome: 0 },
      } as unknown as Snapshot).source,
      'none',
    )
  })

  for (const [name, spec] of PERSONAS) {
    it(`${name}: an unobservable figure is null, never zero`, () => {
      const [roadmap, snapshot] = plan(spec)
      for (const d of detectDrift(roadmap, snapshot)) {
        // The buffer and cover drifts are the two the statement cannot witness — money into a
        // savings buffer never leaves the bank, and a premium's absence is not a debit.
        if (d.kind === 'buffer' || d.kind === 'cover') {
          assert.equal(d.observed, null, `${d.id} drew an observation it cannot have`)
        }
        assert.ok(d.detail.length > 40, `${d.id} has no sentence behind it`)
      }
    })

    it(`${name}: every drift maps onto one of the two measures`, () => {
      const [roadmap, snapshot] = plan(spec)
      const all = detectDrift(roadmap, snapshot)
      assert.equal(driftFor(all, 'add').length + driftFor(all, 'realign').length, all.length)
    })

    it(`${name}: drift ids are unique`, () => {
      const [roadmap, snapshot] = plan(spec)
      const ids = detectDrift(roadmap, snapshot).map((d) => d.id)
      assert.equal(new Set(ids).size, ids.length)
    })
  }
})

describe('the spending trend, whose fields are fractions and are not named like it', () => {
  /*
   * `derive.ts` stores `(recent − prior) / prior`, so a 21% rise arrives as `0.209`. Reading
   * `trendPct` as a percentage prints "up 0%" and silences the branch at any threshold worth
   * having — the bug this exists to keep fixed.
   */
  it('fires for a persona whose spending is actually rising, and quotes it as a percentage', () => {
    const [roadmap, snapshot] = plan(ROHAN)
    assert.equal(snapshot.discretionary.trend, 'rising')
    assert.ok(
      snapshot.discretionary.trendPct < 1,
      'this guard is only meaningful while the field is a fraction',
    )
    const spending = detectDrift(roadmap, snapshot).find((d) => d.kind === 'spending')
    assert.ok(spending, 'a rising trend produced no drift')
    const quoted = /up (\d+)% over the last three months/.exec(spending.detail)?.[1]
    assert.ok(quoted, `no percentage in: ${spending.detail}`)
    assert.equal(Number(quoted), Math.round(snapshot.discretionary.trendPct * 100))
    assert.ok(Number(quoted) >= 10, 'a rise worth reporting cannot round to single digits')
  })
})

describe('a plan that has not drifted', () => {
  /**
   * The empty state, from a position rather than from an absence of data: money in the buffer,
   * cover in force, no expensive debt, spending flat, and the goal's SIP already running at the
   * figure the plan asks for. The source has no such screen anywhere — its own brief says it has
   * no empty states at all — so this is the one that had to be designed, and it is only worth
   * designing if it is reachable.
   */
  const settled = (): [Roadmap, Snapshot] => {
    const [roadmap, snapshot] = plan(ROHAN)
    const grow = roadmap.stages.find((s) => s.kind === 'grow')
    const calm: Snapshot = {
      ...snapshot,
      income: { ...snapshot.income, monthly: 200_000 },
      commitments: { ...snapshot.commitments, investments: grow?.monthly ?? 0 },
      holdings: { ...snapshot.holdings, sipMonthly: grow?.monthly ?? 0 },
      protection: { ...snapshot.protection, gap: 0 },
      debt: { ...snapshot.debt, hasHighInterest: false, missedRepayment: false, total: 0 },
      buffer: { ...snapshot.buffer, monthsCovered: 8, targetMonths: 6 },
      discretionary: { ...snapshot.discretionary, trend: 'flat', trendPct: 0 },
      surplus: { ...snapshot.surplus, deployable: roadmap.monthlyCommitment + 10_000 },
    }
    return [{ ...roadmap, feasible: true, shortfallMonthly: 0 }, calm]
  }

  it('reports no drift at all', () => {
    const [roadmap, snapshot] = settled()
    assert.deepEqual(detectDrift(roadmap, snapshot), [])
  })

  it('proposes no changes either', () => {
    const [roadmap, snapshot] = settled()
    const drifts = detectDrift(roadmap, snapshot)
    const changes = changesFor(roadmap, snapshot, drifts, {
      extraMonthly: 0,
      lumpSum: 0,
      sellable: new Set(PRODUCT_SHELF.map((p) => p.productId)),
    })
    // A free_up stage is behavioural and is not gated on a drift, so the only lines that may
    // survive a settled plan are its caps — and this persona has no free_up stage.
    assert.ok(roadmap.stages.every((s) => s.kind !== 'free_up'))
    assert.deepEqual(changes, [])
  })
})

/* ---------------------------------------------------------------- The terminus */

describe('where a change ends', () => {
  const sellableAll = new Set(PRODUCT_SHELF.map((p) => p.productId))

  for (const [name, spec] of PERSONAS) {
    it(`${name}: only a product the shelf can sell reaches the spine`, () => {
      const [roadmap, snapshot] = plan(spec)
      const drifts = detectDrift(roadmap, snapshot)
      const changes = changesFor(roadmap, snapshot, drifts, {
        extraMonthly: 0,
        lumpSum: 0,
        sellable: sellableAll,
      })
      for (const c of changes) {
        if (c.terminus === 'spine') {
          assert.ok(c.productId, `${c.id} would enter the spine with no product`)
          assert.ok(sellableAll.has(c.productId), `${c.id} names a product not on the shelf`)
        } else {
          // Everything else is behavioural or a repayment: nothing to place, so nothing to gate.
          assert.ok(c.productId === null || !sellableAll.has(c.productId))
        }
        assert.ok(c.terminusNote.length > 10, `${c.id} does not say where it ends`)
      }
    })

    it(`${name}: an empty shelf sends nothing to the spine`, () => {
      const [roadmap, snapshot] = plan(spec)
      const drifts = detectDrift(roadmap, snapshot)
      const changes = changesFor(roadmap, snapshot, drifts, {
        extraMonthly: 0,
        lumpSum: 0,
        sellable: new Set<string>(),
      })
      assert.ok(changes.every((c) => c.terminus !== 'spine'))
    })

    it(`${name}: a card repayment never becomes a purchase`, () => {
      const [roadmap, snapshot] = plan(spec)
      const drifts = detectDrift(roadmap, snapshot)
      const changes = changesFor(roadmap, snapshot, drifts, {
        extraMonthly: 0,
        lumpSum: 0,
        sellable: sellableAll,
      })
      const card = changes.find((c) => c.id === 'change-debt')
      if (card) {
        assert.equal(card.terminus, 'self_report')
        assert.equal(card.productId, null)
      }
    })
  }

  for (const [name, spec] of PERSONAS) {
    it(`${name}: the funding screen's amounts land exactly once`, () => {
      const [roadmap, snapshot] = plan(spec)
      const drifts = detectDrift(roadmap, snapshot)
      const bare = changeTotals(
        changesFor(roadmap, snapshot, drifts, {
          extraMonthly: 0,
          lumpSum: 0,
          sellable: sellableAll,
        }),
      )
      const dialled = changeTotals(
        changesFor(roadmap, snapshot, drifts, {
          extraMonthly: 4000,
          lumpSum: 150_000,
          sellable: sellableAll,
        }),
      )
      // Counted once, not once per line that happens to touch the funding stage — a lump sum
      // double-counted is a review screen that quotes a number nobody agreed to.
      assert.equal(dialled.oneOff - bare.oneOff, 150_000)
      assert.equal(dialled.monthly - bare.monthly, 4000)
    })
  }

  it('sends a lump sum against a card to the self-report, never to the spine', () => {
    // Priya's goal is a debt payoff: she has no growth stage at all, and the extra money belongs
    // against a balance at 34.8% rather than into a fund. Assuming a growth stage was the bug.
    const [roadmap, snapshot] = plan(PRIYA)
    assert.ok(roadmap.stages.every((s) => s.kind !== 'grow'))
    assert.equal(fundingStage(roadmap)?.kind, 'clear_debt')
    const changes = changesFor(roadmap, snapshot, detectDrift(roadmap, snapshot), {
      extraMonthly: 0,
      lumpSum: 150_000,
      sellable: sellableAll,
    })
    const carrying = changes.filter((c) => c.oneOff > 0)
    assert.equal(carrying.length, 1)
    assert.equal(carrying[0]?.terminus, 'self_report')
  })
})

/* ---------------------------------------------------------------- The mirror */

describe('the debt arithmetic is a mirror, and is proved to be one', () => {
  /*
   * ADR-0001 keeps `@dhan/core` out of the main bundle, so the funding screen carries its own
   * copy of three functions. A mirror is only worth having if it is checked against the thing it
   * mirrors — `goals/jar.test.ts` makes the same argument about `lib/projection.ts`.
   *
   * The case that matters is the `null`: at IDBI's own 34.8% a payment below the accruing
   * interest never clears the balance, and a screen that divided the balance by the payment
   * would print a payoff date that cannot arrive.
   */
  const cases: [number, number, number][] = [
    [582_776, 34.8, 5_992],
    [582_776, 34.8, 16_900],
    [582_776, 34.8, 25_000],
    [100_000, 0, 5_000],
    [0, 34.8, 5_000],
    [292_552, 11.4, 4_000],
    [50_000, 18, 0],
  ]

  for (const [principal, rate, payment] of cases) {
    it(`${principal} at ${rate}% paying ${payment}`, () => {
      assert.equal(
        monthsToClear(principal, rate, payment),
        coreMonthsToClear(principal, rate, payment),
      )
      assert.equal(monthlyInterest(principal, rate), coreMonthlyInterest(principal, rate))
    })
  }

  for (const months of [12, 36, 60]) {
    it(`the payment that clears 5.83 lakh at 34.8% in ${months} months`, () => {
      assert.equal(paymentToClear(582_776, 34.8, months), corePaymentToClear(582_776, 34.8, months))
    })
  }

  it('refuses to name a date for a payment the interest swallows', () => {
    assert.equal(monthsToClear(582_776, 34.8, 5_992), null)
  })
})
