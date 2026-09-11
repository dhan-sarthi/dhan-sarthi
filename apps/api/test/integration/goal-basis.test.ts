/**
 * Which money the customer's target is counted in, carried the whole way and back.
 *
 * `buildRoadmap` has funded a long `wealth_target` or `retirement` goal at the *real* rate —
 * nominal less inflation — since the day it was written, because `suggestGoal` states its
 * proposals in money the customer recognises now. That is right for a proposal and wrong for a
 * figure the customer inflated themselves: a ₹25,00,000 deposit fifteen years out, adjusted to
 * ₹55,81,191, was discounted a second time and asked for 72% more a month than it needed.
 *
 * `Goal.amountBasis` fixed the engine. It fixed nothing a customer could reach, because every
 * seam between the screen and the engine dropped the field on the floor: `GoalSchema` is a
 * non-strict zod object and *strips* what it does not name, so the basis never reached a
 * client; `GoalPatchSchema` is `.strict()` and named only `targetAmount`, so it never reached
 * the server; and the session row had nowhere to keep it if it had.
 *
 * So this walk is deliberately end to end through the real routes rather than against the
 * service: a unit test of `setGoal` would have passed on every one of those days. It asserts
 * the basis on the way in, on the way out, and — the only assertion that actually matters — in
 * the rate the stage the customer is shown was sized at.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { fundingRatePct, requiredMonthly } from '@dhan/core'
import type { SessionState, View } from '@dhan/contracts'
import { ROHAN_CIF, bearer, createSession, makeRoot } from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

/** ₹25,00,000 in today's money, inflated at 5.5% over fifteen years by the customer. */
const AT_HORIZON_TARGET = 5_581_191

describe('the money a goal target is counted in, over the wire', () => {
  let root: TestRoot

  before(async () => {
    root = await makeRoot()
  })
  after(() => root.close())

  /** A session of its own per case: the goal override is session state and these must not share. */
  async function open(): Promise<{
    session: () => Promise<SessionState>
    view: () => Promise<View>
    setGoal: (body: Record<string, unknown>) => Promise<{ status: number; body: string }>
  }> {
    const { token } = await createSession(root.app, ROHAN_CIF)
    const headers = bearer(token)
    return {
      session: async () => {
        const res = await root.app.inject({ method: 'GET', url: '/api/v1/session', headers })
        assert.equal(res.statusCode, 200, res.body)
        return res.json<SessionState>()
      },
      view: async () => {
        const res = await root.app.inject({ method: 'GET', url: '/api/v1/view', headers })
        assert.equal(res.statusCode, 200, res.body)
        return res.json<View>()
      },
      setGoal: async (payload) => {
        const res = await root.app.inject({
          method: 'PATCH',
          url: '/api/v1/session/goal',
          headers,
          payload,
        })
        return { status: res.statusCode, body: res.body }
      },
    }
  }

  /**
   * What the goal stage would need a month, as against what it got.
   *
   * `Stage.monthly` is capped at what the customer has spare, so two very different
   * requirements come out as the same number once neither is affordable. The requirement is the
   * stage's contribution plus the shortfall the roadmap reports against it — `roadmap.test.ts`
   * in the fixtures reads it the same way.
   */
  function requirement(view: View): number {
    const grow = view.roadmap.stages.find((s) => s.kind === 'grow')
    assert.ok(grow, 'expected a growth stage')
    return grow.monthly + view.roadmap.shortfallMonthly
  }

  const horizonOf = (view: View): number =>
    Number(view.goal.targetDate.slice(0, 4)) - Number(view.meta.asOf.slice(0, 4))

  it('carries an at-horizon target in, out, and into the rate the stage was sized at', async () => {
    const api = await open()
    const before = await api.view()
    assert.equal(before.goal.kind, 'retirement', 'this persona is a long growth goal or nothing')
    assert.equal(before.goal.amountBasis, undefined, 'nothing has been stated yet')

    const patched = await api.setGoal({
      targetAmount: AT_HORIZON_TARGET,
      amountBasis: 'at_horizon',
    })
    assert.equal(patched.status, 200, patched.body)

    // In: the session row kept both halves of the override, not just the amount.
    const state = await api.session()
    assert.equal(state.goalTarget, AT_HORIZON_TARGET)
    assert.equal(state.goalBasis, 'at_horizon')

    // Out: `GoalSchema` no longer strips it on the way through the response parser, which is
    // where it used to disappear without a trace of having been sent.
    const after = await api.view()
    assert.equal(after.goal.targetAmount, AT_HORIZON_TARGET)
    assert.equal(after.goal.amountBasis, 'at_horizon')
    assert.equal(after.roadmap.goal.amountBasis, 'at_horizon')

    // And the part a customer can see: funded at the nominal rate, not the real one.
    const years = horizonOf(after)
    assert.equal(fundingRatePct(after.goal, years), 10)
    assert.equal(
      requirement(after),
      requiredMonthly(AT_HORIZON_TARGET, years, 10, after.snapshot.holdings.equity),
    )
  })

  it('leaves a target sent with no basis exactly where it was', async () => {
    const api = await open()
    const patched = await api.setGoal({ targetAmount: AT_HORIZON_TARGET })
    assert.equal(patched.status, 200, patched.body)

    // Absent on the wire, null in the row, absent on the goal: three spellings of "today's
    // money", and the same plan every client written before this field existed would get.
    assert.equal((await api.session()).goalBasis, null)
    const view = await api.view()
    assert.equal(view.goal.amountBasis, undefined)

    const years = horizonOf(view)
    assert.equal(fundingRatePct(view.goal, years), 4.5)
    assert.equal(
      requirement(view),
      requiredMonthly(AT_HORIZON_TARGET, years, 4.5, view.snapshot.holdings.equity),
    )
  })

  it('asks for materially less on the same figure once it is known to be inflated', async () => {
    const [stated, assumed] = await Promise.all([open(), open()])
    await stated.setGoal({ targetAmount: AT_HORIZON_TARGET, amountBasis: 'at_horizon' })
    await assumed.setGoal({ targetAmount: AT_HORIZON_TARGET })

    const once = requirement(await stated.view())
    const twice = requirement(await assumed.view())
    assert.ok(
      twice > once * 1.5,
      `double-discounting should be far dearer: ${twice} against ${once}`,
    )
  })

  it('takes today’s money back when the customer restates the amount', async () => {
    // The stale-basis trap. `setGoal` writes the basis on every call, absent meaning null, so a
    // customer who clears the inflation adjustment and saves again is not left funding a plain
    // today's-money target at the nominal rate for a reason nothing on screen explains.
    const api = await open()
    await api.setGoal({ targetAmount: AT_HORIZON_TARGET, amountBasis: 'at_horizon' })
    assert.equal((await api.session()).goalBasis, 'at_horizon')

    await api.setGoal({ targetAmount: 2_500_000 })
    assert.equal((await api.session()).goalBasis, null)
    assert.equal((await api.view()).goal.amountBasis, undefined)

    await api.setGoal({ targetAmount: 2_500_000, amountBasis: 'today' })
    assert.equal((await api.session()).goalBasis, 'today')
    assert.equal((await api.view()).goal.amountBasis, 'today')
  })

  it('refuses a basis that is not one of the two', async () => {
    const api = await open()
    const bad = await api.setGoal({ targetAmount: 2_500_000, amountBasis: 'nominal' })
    assert.equal(bad.status, 400, bad.body)
    assert.equal((await api.session()).goalTarget, null, 'and writes nothing on the way past')
  })
})
