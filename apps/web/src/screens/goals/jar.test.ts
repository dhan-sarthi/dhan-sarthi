/**
 * The two halves of this surface that can be wrong invisibly.
 *
 * **The mapping.** A jar list built off the roadmap is only honest if it picks the right stages
 * and reports the right figure in each. Two of those are easy to get wrong and neither shows up
 * in a screenshot: `get_cover`'s `targetAmount` is a *cover amount* — ₹1 crore of term life — and
 * rendering it as a pot would tell a customer they are 0.5% of the way to a jar they are not
 * saving into; and the arrears stage carries a target of zero, which would draw an empty bar
 * over a real instruction. So the filter is tested against the roadmap the engine actually
 * builds for three real personas rather than against a literal.
 *
 * **The parity.** `lib/projection.ts` mirrors `packages/core/src/projection.ts` because the main
 * bundle may not import the engine (ADR-0001), and a mirror is only worth having if it is proved
 * to be one. These run both and compare — including the whole way round, from a target the
 * screen quotes to the monthly the *engine* puts on the stage a moment later.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildRoadmap,
  compoundedOneOff,
  fundingRatePct as coreFundingRatePct,
  derive,
  requiredMonthly as coreRequiredMonthly,
  suggestGoal,
} from '@dhan/core'
import type { Goal as CoreGoal, Snapshot as CoreSnapshot } from '@dhan/core'
import { PRIYA, PRODUCT_SHELF, ROHAN, SUNIL, generateCustomerFile } from '@dhan/fixtures'
import type { PersonaSpec } from '@dhan/fixtures'
import type { Roadmap, Snapshot } from '@dhan/contracts'
import { futureValue, inflated, requiredLumpSum, requiredMonthly } from '../../lib/projection.ts'
import {
  existingTowards,
  fundingRatePct,
  inflationMayMoveTarget,
  jars,
  monthsBetween,
  nonJarStages,
  share,
} from './jar.ts'

const ASOF = '2026-09-01'
const OPTS = { anchor: ASOF, asOf: ASOF, months: 24 }

const snap = (spec: PersonaSpec): CoreSnapshot => derive(generateCustomerFile(spec, OPTS), ASOF)

/** The engine's own output, in the shape the wire carries it in. Same object, narrower types. */
function plan(
  spec: PersonaSpec,
  override: number | null = null,
  basis: CoreGoal['amountBasis'] | null = null,
): [Roadmap, Snapshot] {
  const s = snap(spec)
  const roadmap = buildRoadmap(s, suggestGoal(s, ASOF, override, basis), PRODUCT_SHELF, ASOF)
  return [roadmap as unknown as Roadmap, s as unknown as Snapshot]
}

describe('which stages are jars', () => {
  it('leaves out the cover amount, which is not a pot', () => {
    const [roadmap, snapshot] = plan(ROHAN)
    assert.ok(
      roadmap.stages.some((s) => s.kind === 'get_cover' && s.targetAmount > 0),
      'this persona is only interesting while the engine still proposes term cover',
    )
    assert.deepEqual(
      jars(roadmap, snapshot).map((j) => j.kind),
      ['grow'],
    )
    assert.ok(nonJarStages(roadmap).some((s) => s.kind === 'get_cover'))
  })

  it('leaves out an instruction with no target — the arrears stage', () => {
    const [roadmap, snapshot] = plan(SUNIL)
    assert.ok(roadmap.stages.some((s) => s.kind === 'clear_debt' && s.targetAmount === 0))
    assert.deepEqual(
      jars(roadmap, snapshot).map((j) => j.kind),
      ['build_buffer'],
    )
  })

  it('leaves out freeing up money, which is a behaviour', () => {
    const [roadmap, snapshot] = plan(PRIYA)
    assert.ok(roadmap.stages.some((s) => s.kind === 'free_up' && s.targetAmount > 0))
    assert.deepEqual(
      jars(roadmap, snapshot).map((j) => j.kind),
      ['clear_debt', 'build_buffer'],
    )
  })
})

describe('what is in the pot', () => {
  it('counts the invested corpus towards a growth goal, and says so as a fraction', () => {
    const [roadmap, snapshot] = plan(ROHAN)
    const [goal] = jars(roadmap, snapshot)
    assert.ok(goal)
    assert.equal(goal.achieved, snapshot.holdings.equity)
    assert.equal(goal.fraction, snapshot.holdings.equity / goal.target)
    assert.ok(goal.isGoal)
  })

  it('counts the reachable balances towards the buffer', () => {
    const [roadmap, snapshot] = plan(SUNIL)
    const [buffer] = jars(roadmap, snapshot)
    assert.ok(buffer)
    assert.equal(buffer.achieved, Math.min(snapshot.balances.total, buffer.target))
  })

  it('reports a debt as unknowable rather than as zero', () => {
    const [roadmap, snapshot] = plan(PRIYA)
    const debt = jars(roadmap, snapshot).find((j) => j.kind === 'clear_debt')
    assert.ok(debt)
    assert.equal(debt.achieved, null)
    assert.equal(debt.fraction, null, 'null draws no bar; 0 would draw one at nothing')
    assert.equal(existingTowards('debt_payoff', snapshot), null)
  })

  it('never fills past full', () => {
    const [roadmap, snapshot] = plan(SUNIL)
    for (const jar of jars(roadmap, snapshot)) {
      if (jar.fraction !== null) assert.ok(jar.fraction <= 1)
    }
  })
})

describe('status', () => {
  it('flags the goal the engine says is out of reach', () => {
    const [roadmap, snapshot] = plan(ROHAN)
    assert.equal(roadmap.feasible, false)
    assert.equal(jars(roadmap, snapshot)[0]?.status, 'attention')
  })

  it('calls a jar with nothing going into it unfunded, not started', () => {
    const [roadmap, snapshot] = plan(SUNIL)
    const buffer = jars(roadmap, snapshot)[0]
    assert.ok(buffer)
    // Most of the way full and queued behind another stage: both facts are true at once, which
    // is the case the reference's three chips have no word for.
    assert.equal(buffer.running, false)
    assert.ok((buffer.fraction ?? 0) > 0.5)
    assert.equal(buffer.status, 'queued')
  })

  it('refuses a payoff date on a balance the payment does not beat', () => {
    /*
     * The engine gives such a stage `monthsToComplete: 0`, so its `completesOn` lands back on
     * `startsOn` — a start date, not a payoff date. Rendering it as "clear by October 2036"
     * would be the promise core's own comment says will never arrive, and the card decides
     * before it prints rather than trusting the field.
     */
    const [roadmap, snapshot] = plan(PRIYA)
    const debt = jars(roadmap, snapshot).find((j) => j.kind === 'clear_debt')
    assert.ok(debt)
    const interest = (debt.target * snapshot.debt.highestRate) / 100 / 12
    assert.ok(
      debt.monthly <= interest,
      'this persona is only interesting while the debt outruns it',
    )
    assert.equal(debt.dated, false)
    assert.equal(debt.status, 'attention', 'and it outranks "not funded yet", which is also true')
  })

  it('dates every jar that does have a date', () => {
    for (const spec of [ROHAN, SUNIL]) {
      const [roadmap, snapshot] = plan(spec)
      for (const jar of jars(roadmap, snapshot)) assert.equal(jar.dated, true)
    }
  })

  it('reads "running" the way core reads it, not off currentStageIndex', () => {
    const [roadmap, snapshot] = plan(ROHAN)
    assert.equal(roadmap.currentStageIndex, 0, 'the engine leaves this at zero; indices start at 1')
    assert.equal(jars(roadmap, snapshot)[0]?.running, true)
  })
})

describe('the client mirror of the engine s arithmetic', () => {
  const grid = [
    { target: 2_500_000, years: 8, rate: 10, existing: 0 },
    { target: 22_000_000, years: 31, rate: 4.5, existing: 124_950 },
    { target: 400_000, years: 2, rate: 6.9, existing: 151_676 },
    { target: 1_00_00_000, years: 0.5, rate: 0, existing: 0 },
    { target: 500_000, years: 15, rate: 12, existing: 800_000 },
  ]

  it('gives the same monthly as core, to the rupee', () => {
    for (const { target, years, rate, existing } of grid) {
      assert.equal(
        requiredMonthly(target, years, rate, existing),
        coreRequiredMonthly(target, years, rate, existing),
        `${target} over ${years}y at ${rate}%`,
      )
    }
  })

  it('inflates the way core compounds a one-off — annually, not monthly', () => {
    for (const years of [1, 3, 8, 30]) {
      for (const rate of [5, 6, 7, 8, 9]) {
        assert.equal(inflated(2_500_000, years, rate), compoundedOneOff(2_500_000, years, rate))
      }
    }
    // The mistake this guards: monthly compounding at the same quoted rate is a different, and
    // always larger, number.
    assert.ok(inflated(2_500_000, 8, 5) < futureValue(0, 8, 5, 2_500_000))
  })

  it('sizes a lump sum that grows back to the target', () => {
    for (const { target, years, rate } of grid) {
      const lump = requiredLumpSum(target, years, rate)
      const grown = futureValue(0, years, rate, lump)
      assert.ok(grown >= target, `${grown} should reach ${target}`)
      // And not wildly over: ceil on the present value, so at most one month's growth of slack.
      assert.ok(grown <= target * (1 + rate / 100 / 12) + 1)
    }
  })

  it('quotes the monthly the engine will put on the stage a moment later', () => {
    /*
     * The whole point of the mirror, end to end.
     *
     * A target small enough to be affordable, so the engine's stage carries the *needed* figure
     * rather than "all that was available" — then the screen's quote and the plan's commitment
     * are the same number or the customer has been told two things.
     */
    const [roadmap, snapshot] = plan(ROHAN, 1_500_000)
    const grow = roadmap.stages.find((s) => s.kind === 'grow')
    assert.ok(grow)
    assert.equal(roadmap.feasible, true)

    const horizon = monthsBetween(ASOF, roadmap.goal.targetDate) / 12
    const rate = fundingRatePct(roadmap.goal, horizon)
    const existing = existingTowards(roadmap.goal.kind, snapshot) ?? 0
    assert.equal(requiredMonthly(roadmap.goal.targetAmount, horizon, rate, existing), grow.monthly)
  })

  it('picks the same rate as core across every kind, basis and horizon', () => {
    // The mirror, proved rather than asserted. ADR-0001 keeps the engine out of the main
    // bundle, so this branch is written twice; the only defence against the two drifting is to
    // run both. The basis is in the grid because it is the argument that was missing.
    const kinds = [
      'wealth_target',
      'retirement',
      'emergency_fund',
      'debt_payoff',
      'protection',
    ] as const
    for (const kind of kinds) {
      for (const amountBasis of [undefined, 'today', 'at_horizon'] as const) {
        for (const years of [0.5, 5, 9.99, 10, 15, 31]) {
          const goal = { kind, ...(amountBasis === undefined ? {} : { amountBasis }) }
          assert.equal(
            fundingRatePct(goal, years),
            coreFundingRatePct(goal, years),
            `${kind}/${amountBasis ?? 'absent'} over ${years}y`,
          )
        }
      }
    }
  })

  it('quotes the nominal rate on a long target the customer already inflated', () => {
    /*
     * The defect this screen used to work around, from the screen's side.
     *
     * ₹25,00,000 fifteen years out, inflated by the customer at 5.5% to what the deposit will
     * actually cost. Funded in real terms it demanded ₹20,733 a month; funded at the nominal
     * rate — which is what an `at_horizon` target gets — it is ₹12,023. The screen quotes the
     * second only because it can now say which money the amount is in.
     */
    const atHorizon = inflated(2_500_000, 15, 5.5)
    assert.equal(atHorizon, 5_581_191)

    const snapshot = snap(ROHAN)
    const existing = snapshot.holdings.equity
    const stated = { kind: 'wealth_target', amountBasis: 'at_horizon' } as const
    const todaysMoney = { kind: 'wealth_target' } as const

    assert.equal(fundingRatePct(stated, 15), 10)
    assert.equal(fundingRatePct(todaysMoney, 15), 4.5)
    assert.equal(requiredMonthly(atHorizon, 15, fundingRatePct(stated, 15), existing), 12_023)
    assert.equal(requiredMonthly(atHorizon, 15, fundingRatePct(todaysMoney, 15), existing), 20_733)
  })

  it('leaves a goal with no basis on exactly the plan it had', () => {
    // The compatibility claim, run end to end through the engine rather than asserted about
    // the rate alone: an absent basis is `today`, and `today` is what every persona has always
    // been funded as.
    for (const spec of [ROHAN, PRIYA, SUNIL]) {
      const [absent] = plan(spec)
      const [today] = plan(spec, null, 'today')
      assert.deepEqual(today.stages, absent.stages)
      assert.equal(today.goal.amountBasis, undefined, 'no override, so no basis to record')
    }
  })
})

describe('when inflation may move the target', () => {
  it('offers it on a long growth horizon, which is where it matters most', () => {
    // The lifted guard. This returned false until `Goal.amountBasis` gave the engine a way to
    // be told, and the refusal landed on exactly the horizons inflation dominates.
    assert.equal(inflationMayMoveTarget('retirement'), true)
    assert.equal(inflationMayMoveTarget('wealth_target'), true)
  })

  it('offers it on a short one too, as it always did', () => {
    assert.equal(inflationMayMoveTarget('emergency_fund'), true)
    assert.equal(inflationMayMoveTarget('protection'), true)
  })

  it('refuses on a balance owed, which accrues rather than inflates', () => {
    assert.equal(inflationMayMoveTarget('debt_payoff'), false)
  })

  it('takes the rate branch out of the engine with it', () => {
    assert.equal(fundingRatePct({ kind: 'retirement' }, 31), 4.5)
    assert.equal(fundingRatePct({ kind: 'wealth_target' }, 5), 10)
    assert.equal(fundingRatePct({ kind: 'emergency_fund' }, 2), 6.9)
    // And the branch the guard exists to make safe: an inflated target, at the nominal rate.
    assert.equal(fundingRatePct({ kind: 'retirement', amountBasis: 'at_horizon' }, 31), 10)
  })
})

describe('the share on the card', () => {
  it('keeps a decimal where rounding would hide the whole figure', () => {
    assert.equal(share(0.092), '9.2%')
    assert.equal(share(0.004), '0.4%')
  })

  it('drops it once the number is worth reading whole', () => {
    assert.equal(share(0.254), '25%')
    assert.equal(share(1), '100%')
  })
})
