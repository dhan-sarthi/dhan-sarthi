/**
 * The goal the customer chose, carried the whole way and back.
 *
 * Onboarding's last question is "What are you working towards?", with the five goal kinds the
 * ladder knows how to sequence. Until this route took a kind, the answer was read back on the
 * next screen and thrown away: the profile patch had no field for it, `setGoal` took only an
 * amount, and the roadmap Uday speaks from was built from the ladder alone.
 *
 * So this walk is end to end through the real routes, the way `goal-basis.test.ts` walks the
 * amount's basis: the kind on the way in, on the session on the way out, as the goal of the plan
 * the customer is shown, and as a line on the record saying the customer chose it. It asserts the
 * two rules that make a choice safe to store — a kind other than the stored one takes its target
 * with it, and a kind with nothing to aim at falls back to the ladder rather than failing.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { CustomerFile } from '@dhan/core'
import type { OpenApiDocument, RecordView, SessionState, View } from '@dhan/contracts'
import {
  FIRST_PLAN_REASON,
  GOAL_CHOSEN_REASON,
  TARGET_CHANGED_REASON,
} from '../../src/application/advisory.service.ts'
import type { BankDataPort } from '../../src/ports/index.ts'
import { PRIYA_CIF, ROHAN_CIF, bearer, createSession, makeRoot } from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

describe('the goal the customer chose, over the wire', () => {
  let root: TestRoot

  before(async () => {
    root = await makeRoot()
  })
  after(() => root.close())

  /** A session of its own per case: the chosen goal is session state and these must not share. */
  async function open(cif = ROHAN_CIF): Promise<{
    session: () => Promise<SessionState>
    view: () => Promise<View>
    record: () => Promise<RecordView>
    setGoal: (body: Record<string, unknown>) => Promise<{ status: number; body: string }>
  }> {
    const { token } = await createSession(root.app, cif)
    const headers = bearer(token)
    const get = async <T>(url: string): Promise<T> => {
      const res = await root.app.inject({ method: 'GET', url, headers })
      assert.equal(res.statusCode, 200, res.body)
      return res.json<T>()
    }
    return {
      session: () => get<SessionState>('/api/v1/session'),
      view: () => get<View>('/api/v1/view'),
      record: () => get<RecordView>('/api/v1/record'),
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

  it('stores the kind, plans around it, and puts the choice on the record', async () => {
    const api = await open()
    const before = await api.view()
    // Rohan's ladder proposes the long game; he has two dependents and no life cover.
    assert.equal(before.goal.kind, 'retirement')
    assert.equal((await api.session()).goalKind, null, 'nothing chosen yet')

    const patched = await api.setGoal({ kind: 'protection' })
    assert.equal(patched.status, 200, patched.body)
    assert.equal(JSON.parse(patched.body).goalKind, 'protection')
    assert.equal((await api.session()).goalKind, 'protection')

    const after = await api.view()
    assert.equal(after.goal.kind, 'protection')
    assert.equal(after.roadmap.goal.kind, 'protection')
    // The cover stage carries the goal: the plan is now *for* the family's cover.
    const goalStage = after.roadmap.stages.find((s) => s.isGoal)
    assert.equal(goalStage?.kind, 'get_cover')
    assert.equal(after.goal.targetAmount, after.snapshot.protection.lifeCoverNeeded)
    assert.equal(after.meta.roadmapVersion, before.meta.roadmapVersion + 1)

    const rec = await api.record()
    assert.deepEqual(
      rec.roadmapVersions.map((v) => [v.version, v.reasonForChange]),
      [
        [1, FIRST_PLAN_REASON],
        [2, GOAL_CHOSEN_REASON],
      ],
    )
  })

  it('makes a goal chosen before the first plan that plan’s goal', async () => {
    // Onboarding saves the choice before anything has asked for a view.
    const api = await open()
    assert.equal((await api.setGoal({ kind: 'wealth_target' })).status, 200)
    const first = await api.view()
    assert.equal(first.goal.kind, 'wealth_target')
    assert.equal(first.meta.roadmapVersion, 1)
    assert.equal((await api.record()).roadmapVersions[0]?.reasonForChange, FIRST_PLAN_REASON)
  })

  it('takes a target typed for one goal away when the customer picks another', async () => {
    const api = await open()
    await api.view()
    await api.setGoal({ targetAmount: 25_000_000, amountBasis: 'at_horizon' })
    const typed = await api.view()
    assert.equal(typed.goal.kind, 'retirement')
    assert.equal(typed.goal.targetAmount, 25_000_000)

    // ₹2.5 crore was a retirement number. It is not a number for something specific.
    assert.equal((await api.setGoal({ kind: 'wealth_target' })).status, 200)
    const state = await api.session()
    assert.equal(state.goalKind, 'wealth_target')
    assert.equal(state.goalTarget, null)
    assert.equal(state.goalBasis, null)
    const moved = await api.view()
    assert.equal(moved.goal.kind, 'wealth_target')
    assert.notEqual(moved.goal.targetAmount, 25_000_000)
    assert.equal(moved.goal.amountBasis, undefined)

    // Unless the same patch names the new goal's figure, which then lands on it.
    assert.equal((await api.setGoal({ kind: 'retirement', targetAmount: 30_000_000 })).status, 200)
    const both = await api.session()
    assert.equal(both.goalKind, 'retirement')
    assert.equal(both.goalTarget, 30_000_000)
    assert.equal((await api.view()).goal.targetAmount, 30_000_000)

    const reasons = (await api.record()).roadmapVersions.map((v) => v.reasonForChange)
    assert.deepEqual(reasons, [
      FIRST_PLAN_REASON,
      TARGET_CHANGED_REASON,
      GOAL_CHOSEN_REASON,
      GOAL_CHOSEN_REASON,
    ])
  })

  it('changes nothing when the same kind is chosen again', async () => {
    const api = await open()
    await api.setGoal({ kind: 'protection' })
    await api.setGoal({ targetAmount: 15_000_000 })
    await api.view()
    const held = await api.session()

    const again = await api.setGoal({ kind: 'protection' })
    assert.equal(again.status, 200, again.body)
    const state = await api.session()
    assert.equal(state.goalTarget, 15_000_000, 'the target set on this goal stays on it')
    assert.equal(state.version, held.version, 'and nothing was written')
    const view = await api.view()
    assert.equal(view.goal.targetAmount, 15_000_000)
    assert.equal((await api.record()).roadmapVersions.length, view.meta.roadmapVersion)
  })

  it('falls back to the engine’s own goal, without an error, where the choice has nothing to aim at', async () => {
    // Rohan's buffer already covers six months, so a safety net would be planned as though
    // nothing were saved; Priya has no dependents, so there is no cover to buy.
    const rohan = await open()
    const planned = await rohan.view()
    const safety = await rohan.setGoal({ kind: 'emergency_fund' })
    assert.equal(safety.status, 200, safety.body)
    assert.equal((await rohan.session()).goalKind, 'emergency_fund', 'kept as the customer said')
    const kept = await rohan.view()
    assert.equal(kept.goal.kind, 'retirement')
    // Nothing about the plan moved, so no version is cut for it.
    assert.equal(kept.meta.roadmapVersion, planned.meta.roadmapVersion)

    const priya = await open(PRIYA_CIF)
    assert.equal((await priya.setGoal({ kind: 'protection' })).status, 200)
    assert.equal((await priya.view()).goal.kind, 'debt_payoff')
  })

  it('pins the kind the plan is on when a figure is sent beside it', async () => {
    // The goal screen's save: the stored safety net has nothing to aim at, so the plan is on the
    // long game, and the figure typed on it goes with the long game's kind.
    const api = await open()
    await api.view()
    assert.equal((await api.setGoal({ kind: 'emergency_fund' })).status, 200)
    assert.equal((await api.view()).goal.kind, 'retirement')

    const typed = await api.setGoal({ kind: 'retirement', targetAmount: 25_000_000 })
    assert.equal(typed.status, 200, typed.body)
    const state = await api.session()
    assert.equal(state.goalKind, 'retirement')
    assert.equal(state.goalTarget, 25_000_000)
    const view = await api.view()
    assert.equal(view.goal.kind, 'retirement')
    assert.equal(view.goal.targetAmount, 25_000_000)
    // The plan's goal kept its kind and took the customer's figure: a target, not a choice.
    assert.deepEqual(
      (await api.record()).roadmapVersions.map((v) => v.reasonForChange),
      [FIRST_PLAN_REASON, TARGET_CHANGED_REASON],
    )
  })

  it('keeps a figure sent alone for the stored kind, off the goal the plan fell back to', async () => {
    const api = await open()
    const planned = await api.view()
    await api.setGoal({ kind: 'emergency_fund' })
    const alone = await api.setGoal({ targetAmount: 25_000_000 })
    assert.equal(alone.status, 200, alone.body)
    assert.equal((await api.session()).goalTarget, 25_000_000)
    // A figure for the safety net is not a retirement number, so the long game keeps its own.
    const view = await api.view()
    assert.equal(view.goal.kind, 'retirement')
    assert.equal(view.goal.targetAmount, planned.goal.targetAmount)
    assert.equal(view.meta.roadmapVersion, planned.meta.roadmapVersion)
  })

  it('records a kind that clears a figure as the customer’s choice, though the plan kept its goal', async () => {
    // A figure typed on the ladder's goal, then a kind with nothing to aim at: the plan stays on
    // the long game, and the figure goes with the choice — which is what moved it.
    const api = await open()
    await api.view()
    await api.setGoal({ targetAmount: 25_000_000 })
    assert.equal((await api.view()).goal.targetAmount, 25_000_000)
    await api.setGoal({ kind: 'emergency_fund' })
    const view = await api.view()
    assert.equal(view.goal.kind, 'retirement')
    assert.notEqual(view.goal.targetAmount, 25_000_000)
    assert.deepEqual(
      (await api.record()).roadmapVersions.map((v) => v.reasonForChange),
      [FIRST_PLAN_REASON, TARGET_CHANGED_REASON, GOAL_CHOSEN_REASON],
    )
  })

  it('publishes the two bodies the route accepts, so the contract refuses what the route does', async () => {
    const res = await root.app.inject({ method: 'GET', url: '/api/v1/openapi.json' })
    assert.equal(res.statusCode, 200)
    const doc = res.json<OpenApiDocument>()
    const op = (doc.paths['/api/v1/session/goal'] as Record<string, unknown> | undefined)?.patch as
      | { requestBody: { content: { 'application/json': { schema: Record<string, unknown> } } } }
      | undefined
    const schema = op?.requestBody.content['application/json'].schema
    const shapes = (schema?.anyOf ?? []) as Array<{
      required?: string[]
      properties?: Record<string, unknown>
      additionalProperties?: boolean
    }>
    assert.deepEqual(
      shapes.map((x) => x.required),
      [['kind'], ['targetAmount']],
    )
    // A lone kind admits nothing else, so a basis with no amount is refused on paper too.
    assert.deepEqual(Object.keys(shapes[0]?.properties ?? {}), ['kind'])
    assert.equal(shapes[0]?.additionalProperties, false)
    assert.equal(shapes[1]?.additionalProperties, false)
  })

  it('refuses a patch naming neither, a basis with no amount, and a sixth kind', async () => {
    const api = await open()
    for (const body of [{}, { kind: 'retirement', amountBasis: 'today' }, { kind: 'house' }]) {
      const bad = await api.setGoal(body)
      assert.equal(bad.status, 400, `${JSON.stringify(body)}: ${bad.body}`)
    }
    const state = await api.session()
    assert.equal(state.goalKind, null, 'and writes nothing on the way past')
    assert.equal(state.goalTarget, null)
  })
})

describe('the goal the customer chose, when the statements move under it', () => {
  /*
   * A chosen kind can come into force, or fall back, without the customer doing anything: the
   * file moves at the same as-of date — a re-sync, a declared fact corrected. The record must not
   * say the customer chose it then. The bank here is the real generated one, with a switch that
   * gives Priya two dependents from the next read on.
   */
  let plain: TestRoot
  let root: TestRoot
  let dependents: number | null = null

  before(async () => {
    plain = await makeRoot()
    const bank = plain.deps.bank
    const drifting = new Proxy(bank, {
      get(target, prop) {
        if (prop === 'loadCustomerFile') {
          return async (...args: Parameters<BankDataPort['loadCustomerFile']>) => {
            const loaded = await target.loadCustomerFile(...args)
            if (dependents === null) return loaded
            const file: CustomerFile = {
              ...loaded.file,
              customer: { ...loaded.file.customer, dependents },
            }
            return { ...loaded, file }
          }
        }
        const value: unknown = Reflect.get(target, prop, target)
        return typeof value === 'function'
          ? (value as (...a: unknown[]) => unknown).bind(target)
          : value
      },
    })
    root = await makeRoot({ deps: { bank: drifting } })
  })
  after(async () => {
    await root.close()
    await plain.close()
  })

  it('records a chosen kind the statements bring into force as the statements, not a choice', async () => {
    const { token } = await createSession(root.app, PRIYA_CIF)
    const headers = bearer(token)
    const view = async (): Promise<View> =>
      (await root.app.inject({ method: 'GET', url: '/api/v1/view', headers })).json<View>()

    // Nobody depends on Priya, so cover she chooses has nothing to aim at: the card stays.
    const patched = await root.app.inject({
      method: 'PATCH',
      url: '/api/v1/session/goal',
      headers,
      payload: { kind: 'protection' },
    })
    assert.equal(patched.statusCode, 200, patched.body)
    assert.equal((await view()).goal.kind, 'debt_payoff')

    // The same day's file now carries two dependents, so the cover she chose has a gap to close.
    dependents = 2
    const moved = await view()
    assert.equal(moved.goal.kind, 'protection')
    assert.equal(moved.meta.roadmapVersion, 2)
    const record = (
      await root.app.inject({ method: 'GET', url: '/api/v1/record', headers })
    ).json<RecordView>()
    assert.deepEqual(
      record.roadmapVersions.map((v) => v.reasonForChange),
      [FIRST_PLAN_REASON, 'Re-cut on 1 September 2026 with the latest statements.'],
    )
  })
})
