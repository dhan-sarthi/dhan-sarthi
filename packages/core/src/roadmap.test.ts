/**
 * The route: which stages appear, in what order, and what they are sized at.
 *
 * `@dhan/fixtures/src/roadmap.test.ts` asks whether the four personas get sensible plans. This
 * asks whether each branch of `buildRoadmap` does what its comment says, one fact at a time,
 * with a hand-built snapshot in which nothing else is wrong. Both are needed and neither
 * substitutes for the other: a persona exercises the combinations, a literal isolates the rule.
 *
 * The cases here are the ones the source argues about at length — protection before debt, a
 * debt that never clears carrying no date and blocking the whole route, the real-versus-nominal
 * funding rate, and `currentStageIndex` being an array position rather than a `Stage.index`.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { REAL_RATE_HORIZON_YEARS, buildRoadmap, currentStage, fundingRatePct } from './roadmap.ts'
import type { Goal } from './roadmap.ts'
import { monthsToClear, paymentToClear } from './projection.ts'
import { SHELF, habit, snapshot } from './snapshot.testkit.ts'

const ASOF = '2026-09-01'

const goal = (overrides: Partial<Goal> = {}): Goal => ({
  id: 'goal-test',
  kind: 'wealth_target',
  purpose: 'A house deposit',
  targetAmount: 2_000_000,
  targetDate: '2036-09-01',
  createdAt: ASOF,
  ...overrides,
})

describe('fundingRatePct', () => {
  it('uses the deposit rate for anything that is not a growth goal', () => {
    for (const kind of ['emergency_fund', 'debt_payoff', 'protection'] as const) {
      assert.equal(fundingRatePct({ kind }, 30), 6.9)
    }
  })

  it('uses the real rate for a growth goal in today’s money at ten years or more', () => {
    assert.equal(fundingRatePct({ kind: 'retirement' }, REAL_RATE_HORIZON_YEARS), 10 - 5.5)
    assert.equal(fundingRatePct({ kind: 'wealth_target', amountBasis: 'today' }, 25), 4.5)
  })

  it('uses the nominal rate below the real-rate horizon', () => {
    assert.equal(fundingRatePct({ kind: 'wealth_target' }, REAL_RATE_HORIZON_YEARS - 0.01), 10)
  })

  it('never discounts an at_horizon target twice, however long the horizon', () => {
    // The customer already put the inflation in. Taking it out again here is the double
    // discount this branch exists to avoid.
    assert.equal(fundingRatePct({ kind: 'retirement', amountBasis: 'at_horizon' }, 30), 10)
  })

  it('reads an absent basis as today, so a goal written before the field keeps its numbers', () => {
    assert.equal(
      fundingRatePct({ kind: 'retirement', amountBasis: undefined }, 30),
      fundingRatePct({ kind: 'retirement', amountBasis: 'today' }, 30),
    )
  })
})

describe('buildRoadmap: the clean case', () => {
  it('goes straight to the goal when nothing is in the way', () => {
    const r = buildRoadmap(snapshot(), goal(), SHELF, ASOF)

    assert.deepEqual(
      r.stages.map((s) => s.kind),
      ['grow'],
    )
    assert.equal(r.stages[0]?.index, 1, 'stage indices are one-based')
    assert.equal(r.stages[0]?.isGoal, true)
    assert.equal(r.stages[0]?.productId, 'MF_INDEX_103')
    assert.equal(r.feasible, true)
    assert.equal(r.shortfallMonthly, 0)
    assert.ok(r.projection, 'a market-linked stage carries a projection')
  })

  it('runs the gate on a stage that starts today and leaves later ones unjudged', () => {
    const indebtedLater = snapshot({
      protection: { dependents: 2, lifeCoverNeeded: 12_000_000, gap: 12_000_000 },
    })
    const r = buildRoadmap(indebtedLater, goal(), SHELF, ASOF)

    const cover = r.stages.find((s) => s.kind === 'get_cover')
    assert.ok(cover)
    assert.ok(cover.verdict, 'a stage starting today is judged')
    assert.equal(cover.verdict.verdict, 'PASS')
    // The cover stage is `ongoing`, so the cursor does not move and the goal also starts
    // today — both are judged. A sequential stage in front would push the goal past `asOf`.
    assert.equal(cover.cadence, 'ongoing')
  })

  it('does not judge a stage that starts after a sequential one', () => {
    const thin = snapshot({
      balances: { savings: 20_000, total: 20_000, idleFloor: 0, idleMonths: 0 },
      buffer: { monthsCovered: 0, targetMonths: 6, shortfall: 160_000 },
    })
    const r = buildRoadmap(thin, goal(), SHELF, ASOF)

    const buffer = r.stages.find((s) => s.kind === 'build_buffer')
    const grow = r.stages.find((s) => s.kind === 'grow')
    assert.ok(buffer && grow)
    assert.equal(buffer.cadence, 'sequential')
    assert.notEqual(grow.startsOn, ASOF)
    // Running today's rules against a stage that begins after the buffer is built would show
    // the roadmap proposing a step and blocking it in the same breath.
    assert.equal(grow.verdict, null)
  })
})

describe('buildRoadmap: free_up', () => {
  const skint = snapshot({
    surplus: { monthly: 0, alreadyInvested: 0, deployable: 0 },
    discretionary: {
      monthly: 20_000,
      topHabits: [
        habit({ key: 'merchant:swiggy', merchant: 'Swiggy', monthlyAverage: 6_000 }),
        habit({ key: 'merchant:uber', merchant: 'Uber', monthlyAverage: 4_000 }),
        habit({ key: 'merchant:zepto', merchant: 'Zepto', monthlyAverage: 3_000 }),
      ],
    },
  })

  it('opens with a behavioural stage when there is nothing to deploy', () => {
    const r = buildRoadmap(skint, goal(), SHELF, ASOF)

    assert.equal(r.stages[0]?.kind, 'free_up')
    // The top two habits only, and 40% of what they cost between them.
    assert.equal(r.stages[0]?.targetAmount, 4_000)
    assert.match(r.stages[0]?.label ?? '', /4,000/)
    assert.match(r.stages[0]?.why ?? '', /Swiggy and Uber/)
    assert.doesNotMatch(r.stages[0]?.why ?? '', /Zepto/)
  })

  it('funds everything below it out of what the stage recovers', () => {
    const r = buildRoadmap(skint, goal(), SHELF, ASOF)
    const grow = r.stages.find((s) => s.kind === 'grow')
    // 4,000 recovered is what the goal stage now has to work with, not the zero surplus.
    assert.equal(grow?.monthly, 4_000)
  })

  it('says why it can name no habit rather than quoting ₹0 twice', () => {
    // A statement whose narrations carry no merchant recognises no habit at all, which over
    // IDBI's own feed is the normal case rather than an edge one.
    const habitless = snapshot({
      surplus: { monthly: 0, deployable: 0 },
      discretionary: { topHabits: [] },
    })
    const first = buildRoadmap(habitless, goal(), SHELF, ASOF).stages[0]

    assert.equal(first?.kind, 'free_up')
    assert.equal(first?.label, 'Find the first thing to spare')
    assert.doesNotMatch(first?.why ?? '', /₹0/)
    assert.match(first?.why ?? '', /cannot recognise a single habit/)
  })

  it('does not appear when there is money spare', () => {
    const r = buildRoadmap(snapshot(), goal(), SHELF, ASOF)
    assert.equal(
      r.stages.some((s) => s.kind === 'free_up'),
      false,
    )
  })
})

describe('buildRoadmap: protection', () => {
  const exposed = snapshot({
    customer: { dependents: 2 },
    protection: { dependents: 2, lifeCoverNeeded: 12_000_000, gap: 12_000_000 },
    debt: { total: 186_000, hasHighInterest: true, highInterestTotal: 186_000, highestRate: 34.8 },
  })

  it('comes before clearing debt, deliberately', () => {
    const kinds = buildRoadmap(exposed, goal(), SHELF, ASOF).stages.map((s) => s.kind)
    assert.ok(kinds.indexOf('get_cover') < kinds.indexOf('clear_debt'))
    assert.ok(kinds.indexOf('get_cover') >= 0 && kinds.indexOf('clear_debt') >= 0)
  })

  it('picks the cheapest policy that actually closes the gap, not the cheapest policy', () => {
    const cover = buildRoadmap(exposed, goal(), SHELF, ASOF).stages.find(
      (s) => s.kind === 'get_cover',
    )
    // PMJJBY is ₹37 and covers ₹2 lakh. Against a ₹1.2 crore shortfall that is technically a
    // recommendation and practically no cover at all.
    assert.equal(cover?.productId, 'INS_TERM_201')
    assert.equal(cover?.targetAmount, 10_000_000)
  })

  it('falls back to the widest affordable policy when nothing adequate is affordable', () => {
    const broke = snapshot({
      customer: { dependents: 3 },
      protection: { dependents: 3, lifeCoverNeeded: 30_000_000, gap: 30_000_000 },
      surplus: { monthly: 200, alreadyInvested: 0, deployable: 200 },
    })
    const cover = buildRoadmap(broke, goal(), SHELF, ASOF).stages.find(
      (s) => s.kind === 'get_cover',
    )

    assert.equal(cover?.productId, 'INS_PMJJBY_203')
    assert.match(cover?.why ?? '', /does not close it all/)
  })

  it('takes the premium off what every later stage has to work with', () => {
    const r = buildRoadmap(exposed, goal(), SHELF, ASOF)
    const debt = r.stages.find((s) => s.kind === 'clear_debt')
    // 40,000 deployable, less the 1,200 term premium, permanently.
    assert.equal(debt?.monthly, 38_800)
  })

  it('never proposes a ULIP as cover, however cheap', () => {
    const r = buildRoadmap(exposed, goal(), SHELF, ASOF)
    assert.equal(
      r.stages.some((s) => s.productId === 'INS_ULIP_205'),
      false,
    )
  })
})

describe('buildRoadmap: a debt that never clears', () => {
  // ₹5.83 lakh at 34.8% accrues about ₹16,900 a month; ₹6,898 does not touch it.
  const drowning = snapshot({
    surplus: { monthly: 6_898, alreadyInvested: 0, deployable: 6_898 },
    debt: { total: 583_000, hasHighInterest: true, highInterestTotal: 583_000, highestRate: 34.8 },
  })

  it('carries no completion date rather than a fictional one', () => {
    const stage = buildRoadmap(drowning, goal(), SHELF, ASOF).stages.find(
      (s) => s.kind === 'clear_debt',
    )

    assert.equal(monthsToClear(583_000, 34.8, 6_898), null, 'the premise of this test')
    assert.equal(stage?.monthsToComplete, 0, 'zero months is this type’s way of saying no end')
    assert.equal(stage?.completesOn, stage?.startsOn)
    assert.match(stage?.label ?? '', /will not clear/)
  })

  it('does not date the stages behind it off a payoff that does not happen', () => {
    const r = buildRoadmap(drowning, goal(), SHELF, ASOF)
    const debt = r.stages.find((s) => s.kind === 'clear_debt')
    const later = r.stages.filter((s) => s.index > (debt?.index ?? 0))
    for (const s of later) assert.equal(s.startsOn, ASOF, `${s.kind} should not be pushed out`)
  })

  it('marks the whole route infeasible and quotes the payment that would unblock it', () => {
    const r = buildRoadmap(drowning, goal(), SHELF, ASOF)

    assert.equal(r.feasible, false)
    // The shortfall worth quoting is the one that retires the balance in three years, less
    // what the plan can already pay — not whatever the goal stage worked out behind it.
    assert.equal(r.shortfallMonthly, paymentToClear(583_000, 34.8, 36) - 6_898)
  })

  it('reports infeasible even when a prerequisite carries the goal, so nothing looks reachable', () => {
    // A debt_payoff goal makes the clear_debt stage `isGoal`, which skips the goal stage —
    // and used to skip the only thing setting `feasible: false`.
    const r = buildRoadmap(
      drowning,
      goal({ kind: 'debt_payoff', targetAmount: 583_000 }),
      SHELF,
      ASOF,
    )

    assert.equal(
      r.stages.some((s) => s.kind === 'grow'),
      false,
    )
    assert.equal(r.feasible, false)
    assert.ok(r.shortfallMonthly > 0)
  })

  it('currentStage stops at an undated debt, because nothing behind it has a date either', () => {
    const r = buildRoadmap(drowning, goal(), SHELF, ASOF)
    // Ten years on, and the route still has not moved past it.
    assert.equal(currentStage(r, '2036-09-01')?.kind, 'clear_debt')
  })

  it('dates the stage normally once the payment beats the interest', () => {
    const paying = snapshot({
      surplus: { monthly: 30_000, alreadyInvested: 0, deployable: 30_000 },
      debt: {
        total: 583_000,
        hasHighInterest: true,
        highInterestTotal: 583_000,
        highestRate: 34.8,
      },
    })
    const stage = buildRoadmap(paying, goal(), SHELF, ASOF).stages.find(
      (s) => s.kind === 'clear_debt',
    )

    assert.equal(stage?.monthsToComplete, monthsToClear(583_000, 34.8, 30_000))
    assert.notEqual(stage?.completesOn, stage?.startsOn)
    assert.match(stage?.label ?? '', /about \d+ months/)
  })

  it('prices the payoff at the expensive balance only, not at every rupee owed', () => {
    // ₹1.86 lakh card at 34.8% beside a ₹6.28 lakh car loan at 9.4%. Pricing 8.14 lakh as if
    // it were all on the card is what made an otherwise feasible plan report itself impossible.
    const mixed = snapshot({
      surplus: { monthly: 30_000, alreadyInvested: 0, deployable: 30_000 },
      debt: {
        total: 814_000,
        hasHighInterest: true,
        highInterestTotal: 186_000,
        highestRate: 34.8,
        monthlyOutgo: 18_000,
      },
    })
    const stage = buildRoadmap(mixed, goal(), SHELF, ASOF).stages.find(
      (s) => s.kind === 'clear_debt',
    )

    assert.equal(stage?.targetAmount, 186_000)
    assert.equal(stage?.monthsToComplete, monthsToClear(186_000, 34.8, 30_000))
  })
})

describe('buildRoadmap: arrears and the buffer', () => {
  it('inserts a catch-up stage for a missed repayment', () => {
    const arrears = snapshot({ debt: { total: 400_000, missedRepayment: true } })
    const r = buildRoadmap(arrears, goal(), SHELF, ASOF)
    const stage = r.stages.find((s) => s.label === 'Catch up the missed instalment')

    assert.ok(stage, 'a route that stepped over arrears would propose what its own gate refuses')
    assert.equal(stage.monthly, 0)
  })

  it('sizes the buffer at three months of the real outflow and picks the sweep', () => {
    const thin = snapshot({
      balances: { savings: 20_000, total: 20_000, idleFloor: 0, idleMonths: 0 },
      buffer: { monthsCovered: 0, targetMonths: 6, shortfall: 160_000 },
    })
    const stage = buildRoadmap(thin, goal(), SHELF, ASOF).stages.find(
      (s) => s.kind === 'build_buffer',
    )

    // commitments 40,000 + discretionary 20,000, three months of it.
    assert.equal(stage?.targetAmount, 180_000)
    assert.equal(stage?.productId, 'IDBI_SWEEP_001')
    // 1,60,000 still to find at 40,000 a month.
    assert.equal(stage?.monthsToComplete, 4)
  })

  it('honours a different buffer floor', () => {
    const thin = snapshot({
      balances: { savings: 20_000, total: 20_000 },
      buffer: { monthsCovered: 0, shortfall: 160_000 },
    })
    const stage = buildRoadmap(thin, goal(), SHELF, ASOF, { bufferFloorMonths: 6 }).stages.find(
      (s) => s.kind === 'build_buffer',
    )
    assert.equal(stage?.targetAmount, 360_000)
  })

  it('skips the buffer stage when the balance already covers the floor', () => {
    const r = buildRoadmap(snapshot(), goal(), SHELF, ASOF)
    assert.equal(
      r.stages.some((s) => s.kind === 'build_buffer'),
      false,
    )
  })
})

describe('buildRoadmap: the goal stage', () => {
  it('is skipped when a prerequisite already is the goal', () => {
    const indebted = snapshot({
      debt: {
        total: 186_000,
        hasHighInterest: true,
        highInterestTotal: 186_000,
        highestRate: 34.8,
      },
    })
    const r = buildRoadmap(
      indebted,
      goal({ kind: 'debt_payoff', targetAmount: 186_000 }),
      SHELF,
      ASOF,
    )

    assert.equal(r.stages.filter((s) => s.isGoal).length, 1)
    assert.equal(r.stages.find((s) => s.isGoal)?.kind, 'clear_debt')
  })

  it('reports a shortfall rather than pretending an unaffordable target is reachable', () => {
    const modest = snapshot({ surplus: { monthly: 2_000, alreadyInvested: 0, deployable: 2_000 } })
    const r = buildRoadmap(modest, goal({ targetAmount: 20_000_000 }), SHELF, ASOF)

    assert.equal(r.feasible, false)
    assert.ok(r.shortfallMonthly > 0)
    assert.equal(r.stages.find((s) => s.isGoal)?.monthly, 2_000, 'it commits what there is')
  })

  it('says it cannot read the statement rather than claiming ₹0 is spare', () => {
    const unreadable = snapshot({
      income: { monthly: 0 },
      commitments: { total: 0, rent: 0, bills: 0, subscriptions: 0 },
      discretionary: { monthly: 0, topHabits: [] },
      surplus: { monthly: 0, alreadyInvested: 0, deployable: 0 },
    })
    const grow = buildRoadmap(unreadable, goal(), SHELF, ASOF).stages.find((s) => s.isGoal)

    assert.match(grow?.why ?? '', /cannot see any income/)
    assert.doesNotMatch(grow?.why ?? '', /₹0 spare/)
  })

  it('picks a deposit vehicle for a growth goal inside three years', () => {
    const near = buildRoadmap(snapshot(), goal({ targetDate: '2028-03-01' }), SHELF, ASOF)
    const far = buildRoadmap(snapshot(), goal({ targetDate: '2036-09-01' }), SHELF, ASOF)

    // Under three years the route takes the cheapest ticket among Debt and Recurring Deposit
    // — the RD at ₹500 here — because money with a near date on it should not be able to fall.
    assert.equal(near.stages.find((s) => s.isGoal)?.productId, 'IDBI_RD_004')
    assert.equal(far.stages.find((s) => s.isGoal)?.productId, 'MF_INDEX_103')
  })

  it('credits existing equity against a growth goal, lowering the contribution', () => {
    const invested = snapshot({ holdings: { total: 720_000, equity: 720_000, debt: 0 } })
    const withHoldings = buildRoadmap(invested, goal(), SHELF, ASOF)
    const without = buildRoadmap(snapshot(), goal(), SHELF, ASOF)

    const a = withHoldings.stages.find((s) => s.isGoal)?.monthly ?? 0
    const b = without.stages.find((s) => s.isGoal)?.monthly ?? 0
    assert.ok(a < b, `${a} should be below ${b}`)
  })

  it('funds a ten-year today’s-money target at the real rate, which costs more a month', () => {
    const real = buildRoadmap(snapshot(), goal({ kind: 'retirement' }), SHELF, ASOF)
    const nominal = buildRoadmap(
      snapshot(),
      goal({ kind: 'retirement', amountBasis: 'at_horizon' }),
      SHELF,
      ASOF,
    )

    const atReal = real.stages.find((s) => s.isGoal)?.monthly ?? 0
    const atNominal = nominal.stages.find((s) => s.isGoal)?.monthly ?? 0
    assert.ok(atReal > atNominal, 'a real-rate target needs a larger contribution')
  })
})

describe('buildRoadmap: assembly', () => {
  const exposed = snapshot({
    customer: { dependents: 2 },
    protection: { dependents: 2, lifeCoverNeeded: 12_000_000, gap: 12_000_000 },
    balances: { savings: 20_000, total: 20_000 },
    buffer: { monthsCovered: 0, shortfall: 160_000 },
  })

  it('opens at the first unfinished stage, as an array position', () => {
    const r = buildRoadmap(exposed, goal(), SHELF, ASOF)
    assert.equal(r.currentStageIndex, 0)
    // The array position, not the one-based Stage.index. The two have been read for each
    // other once already.
    assert.equal(r.stages[r.currentStageIndex]?.index, 1)
  })

  it('counts every stage running now into the monthly commitment', () => {
    const r = buildRoadmap(exposed, goal(), SHELF, ASOF)
    const running = r.stages.filter((s) => s.index === 1 || s.cadence === 'ongoing')
    assert.equal(
      r.monthlyCommitment,
      running.reduce((sum, s) => sum + s.monthly, 0),
    )
    assert.ok(running.length > 1, 'an ongoing premium runs alongside whatever is sequential')
  })

  it('is as long as the longer of the sequential chain and the goal, not their sum', () => {
    const r = buildRoadmap(exposed, goal(), SHELF, ASOF)
    const sequential = r.stages
      .filter((s) => s.cadence === 'sequential')
      .reduce((m, s) => m + s.monthsToComplete, 0)
    const goalStage = r.stages.find((s) => s.isGoal && s.cadence === 'ongoing')

    assert.equal(r.totalMonths, Math.max(sequential, goalStage?.monthsToComplete ?? 0))
    assert.ok(r.totalMonths < sequential + (goalStage?.monthsToComplete ?? 0))
  })

  it('carries the version and the reason for change it was given', () => {
    const r = buildRoadmap(snapshot(), goal(), SHELF, ASOF, {
      version: 3,
      reasonForChange: 'Card cleared.',
    })
    assert.equal(r.version, 3)
    assert.equal(r.reasonForChange, 'Card cleared.')
    assert.equal(r.createdAt, ASOF)
  })
})

describe('currentStage', () => {
  const thin = snapshot({
    balances: { savings: 20_000, total: 20_000 },
    buffer: { monthsCovered: 0, shortfall: 160_000 },
  })

  it('answers against a clock rather than against the stored index', () => {
    const r = buildRoadmap(thin, goal(), SHELF, ASOF)
    const buffer = r.stages.find((s) => s.kind === 'build_buffer')
    assert.ok(buffer)

    assert.equal(currentStage(r, ASOF)?.kind, 'build_buffer')
    // A month past the buffer's completion, the plan has moved on — even though
    // currentStageIndex still names the stage the route opened at.
    assert.equal(currentStage(r, buffer.completesOn)?.kind, 'grow')
    assert.equal(r.currentStageIndex, 0)
  })

  it('is null once every stage has finished, which is a real answer', () => {
    const r = buildRoadmap(snapshot(), goal(), SHELF, ASOF)
    assert.equal(currentStage(r, '2099-01-01'), null)
  })
})
