/**
 * The seam where a field can exist on both sides and reach neither.
 *
 * A zod object that is not `.strict()` does not reject an unknown key — it *strips* it, without
 * an error anyone could see. Every response leaves the API through `parseWith` in
 * `http/register.ts`, so for as long as `GoalSchema` did not name `amountBasis`, the engine
 * could compute it, the store could hold it and no client would ever be told. The mirror of it
 * on the request side is `.strict()`, which does reject — so a client that sent the field got a
 * 400 and a client that did not got silence.
 *
 * These are cheap and they are the tests that would have failed on the day the engine grew the
 * field and nothing else did.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { GoalSchema, SessionStateSchema } from './domain.ts'
import { GoalPatchSchema } from './routes/session.ts'

const GOAL = {
  id: 'goal-house',
  kind: 'wealth_target',
  purpose: 'House deposit',
  targetAmount: 5_581_191,
  targetDate: '2041-09-01',
  createdAt: '2026-09-01',
}

describe('the money a goal amount is counted in', () => {
  it('survives a response parse instead of being stripped out of it', () => {
    const parsed = GoalSchema.parse({ ...GOAL, amountBasis: 'at_horizon' })
    assert.equal(parsed.amountBasis, 'at_horizon')
  })

  it('stays absent where it was absent, rather than being defaulted to today', () => {
    // Absence is the compatibility story: `core` reads a missing basis as today's money, and a
    // roadmap version written before the field existed has to come back out meaning that.
    const parsed = GoalSchema.parse(GOAL)
    assert.equal(parsed.amountBasis, undefined)
    assert.ok(!('amountBasis' in parsed))
  })

  it('refuses a basis that is neither', () => {
    assert.equal(GoalSchema.safeParse({ ...GOAL, amountBasis: 'nominal' }).success, false)
  })

  it('is accepted on the patch, which is strict and would otherwise reject it', () => {
    assert.deepEqual(
      GoalPatchSchema.parse({ targetAmount: 5_581_191, amountBasis: 'at_horizon' }),
      { targetAmount: 5_581_191, amountBasis: 'at_horizon' },
    )
    assert.deepEqual(GoalPatchSchema.parse({ targetAmount: 2_500_000 }), {
      targetAmount: 2_500_000,
    })
    assert.equal(GoalPatchSchema.safeParse({ amountBasis: 'today' }).success, false)
  })

  it('is on the session state beside the amount it qualifies', () => {
    // Nullable, not optional: an amount stored without the money it is in is the half-carry
    // this whole field exists to close.
    const state = {
      id: '00000000-0000-4000-8000-000000000000',
      cif: 'IDBI0009182731',
      asOf: '2026-09-01',
      lastSeen: '2026-08-26',
      goalTarget: 5_581_191,
      goalBasis: 'at_horizon',
      caps: [],
      scopeOverrides: [],
      version: 2,
      ledgerHorizon: { from: '2024-09-01', to: '2028-03-01' },
      expiresAt: '2026-10-01T09:00:00.000Z',
      capabilities: { simulatedClock: true, avatar: 'none' },
    }
    assert.equal(SessionStateSchema.parse(state).goalBasis, 'at_horizon')
    assert.equal(SessionStateSchema.parse({ ...state, goalBasis: null }).goalBasis, null)
    const { goalBasis: _omitted, ...without } = state
    assert.equal(SessionStateSchema.safeParse(without).success, false)
  })
})
