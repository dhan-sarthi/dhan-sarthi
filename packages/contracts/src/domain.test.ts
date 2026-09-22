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
import {
  CREDIT_BLIND_SPOTS,
  CreditComponentSchema,
  CreditFactsSchema,
  GoalSchema,
  SessionStateSchema,
  SnapshotSchema,
} from './domain.ts'
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
      goalKind: null,
      caps: [],
      spendLimit: null,
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

describe('the goal the customer chose', () => {
  it('is accepted on the patch alone, beside an amount, or as the amount alone', () => {
    assert.deepEqual(GoalPatchSchema.parse({ kind: 'retirement' }), { kind: 'retirement' })
    assert.deepEqual(GoalPatchSchema.parse({ kind: 'wealth_target', targetAmount: 2_500_000 }), {
      kind: 'wealth_target',
      targetAmount: 2_500_000,
    })
    assert.deepEqual(
      GoalPatchSchema.parse({
        kind: 'wealth_target',
        targetAmount: 5_581_191,
        amountBasis: 'at_horizon',
      }),
      { kind: 'wealth_target', targetAmount: 5_581_191, amountBasis: 'at_horizon' },
    )
    // A client written before the kind existed sends what it always sent.
    assert.deepEqual(GoalPatchSchema.parse({ targetAmount: 2_500_000 }), {
      targetAmount: 2_500_000,
    })
  })

  it('refuses a patch that changes nothing, a basis with no amount, and a sixth kind', () => {
    assert.equal(GoalPatchSchema.safeParse({}).success, false)
    // The basis qualifies an amount; with none beside it there is nothing for it to say.
    assert.equal(
      GoalPatchSchema.safeParse({ kind: 'retirement', amountBasis: 'today' }).success,
      false,
    )
    assert.equal(GoalPatchSchema.safeParse({ kind: 'house' }).success, false)
    assert.equal(GoalPatchSchema.safeParse({ kind: 'retirement', label: 'Goa' }).success, false)
  })

  it('is on the session state, null until chosen, and never simply absent', () => {
    const state = {
      id: '00000000-0000-4000-8000-000000000000',
      cif: 'IDBI0009182731',
      asOf: '2026-09-01',
      lastSeen: '2026-08-26',
      goalTarget: null,
      goalBasis: null,
      goalKind: 'protection',
      caps: [],
      spendLimit: null,
      scopeOverrides: [],
      version: 2,
      ledgerHorizon: { from: '2024-09-01', to: '2028-03-01' },
      expiresAt: '2026-10-01T09:00:00.000Z',
      capabilities: { simulatedClock: true, avatar: 'none' },
    }
    assert.equal(SessionStateSchema.parse(state).goalKind, 'protection')
    // Null is "never chosen, the ladder picks", and it has to survive the response parse as
    // itself: stripped to absent, a client could not tell it from a server that never said.
    assert.equal(SessionStateSchema.parse({ ...state, goalKind: null }).goalKind, null)
    const { goalKind: _omitted, ...without } = state
    assert.equal(SessionStateSchema.safeParse(without).success, false)
    assert.equal(SessionStateSchema.safeParse({ ...state, goalKind: 'house' }).success, false)
  })
})

/**
 * Karan at the anchor, the demo persona: a card at 34.8% and an instalment twelve days down.
 * Written out rather than imported because `snapshot.testkit.ts` is excluded from `@dhan/core`'s
 * `dist` and this package resolves core through it — so a literal is the only shape available
 * here, and it is the right one anyway: a fixture that moved with the generator could not pin
 * a wire contract.
 */
const CREDIT = {
  conductScore: 40,
  outOf: 100,
  capped: false,
  components: [
    { id: 'repayment', weight: 50, earned: 20 },
    { id: 'cost', weight: 30, earned: 0 },
    { id: 'load', weight: 20, earned: 20 },
  ],
  dpdDays: 12,
  highestRate: 34.8,
  emiToIncome: 0.159,
  revolvingBalance: 84_000,
  instalmentBalance: 412_000,
  liabilityCount: 2,
  blind: ['utilisation', 'credit_age', 'enquiries', 'other_lenders'],
}

/** The smallest `Snapshot` the schema accepts, so the parse under test is the credit key's. */
const SNAPSHOT = {
  asOf: '2026-09-01',
  customer: {
    name: 'Karan Mehta',
    age: 29,
    dependents: 0,
    city: 'Pune',
    riskProfile: 'Growth',
    employmentType: 'Salaried',
    language: 'en',
    taxRegime: 'new',
    declaredMonthlyIncome: 95_000,
  },
  income: {
    monthly: 95_000,
    stability: 'regular',
    variation: 0.02,
    payDay: 1,
    nextPayDate: '2026-10-01',
    daysToNextPay: 30,
    source: 'salary-series',
  },
  commitments: {
    total: 41_000,
    rent: 22_000,
    emis: 15_100,
    bills: 2_400,
    obligations: 0,
    subscriptions: 1_500,
    investments: 0,
    series: [],
  },
  discretionary: {
    monthly: 28_000,
    byCategory: [],
    topHabits: [],
    trend: 'flat',
    trendPct: 0,
    categoryTrends: [],
  },
  irregular: { oneOffs: [], total: 0, monthlyRunRate: 0, monthlyProvision: 0 },
  surplus: { monthly: 26_000, alreadyInvested: 0, deployable: 26_000 },
  balances: {
    savings: 61_000,
    deposits: 0,
    total: 61_000,
    idleFloor: 18_000,
    idleMonths: 0.9,
    maturingSoon: null,
  },
  buffer: { monthsCovered: 0.9, targetMonths: 6, shortfall: 353_000 },
  debt: {
    total: 496_000,
    hasHighInterest: true,
    highInterestTotal: 84_000,
    highestRate: 34.8,
    missedRepayment: true,
    monthlyOutgo: 15_100,
    endingSoon: null,
  },
  credit: CREDIT,
  protection: {
    dependents: 0,
    lifeCoverInForce: 0,
    healthCoverInForce: 0,
    lifeCoverNeeded: 0,
    gap: 0,
  },
  holdings: { total: 0, equity: 0, debt: 0, sipMonthly: 0 },
  quality: {
    transactions: 1_204,
    monthsOfHistory: 24,
    categorisedShare: 0.97,
    unexplainedShare: 0.03,
  },
}

describe('what IDBI can see about how somebody borrows', () => {
  it('survives a response parse instead of being stripped out of it', () => {
    // The test that would have failed on the day the engine grew `credit` and nothing else did.
    // `SnapshotSchema` is not `.strict()`, every response leaves through `parseWith`, and the
    // compile-time parity assert is core -> wire — so nothing else in this repo can catch it.
    const parsed = SnapshotSchema.parse(SNAPSHOT)
    assert.equal(parsed.credit.conductScore, 40)
    assert.equal(parsed.credit.components.length, 3)
  })

  it('refuses a snapshot with no credit block at all', () => {
    // Absence is not the compatibility story it is for `Goal.amountBasis`. The Snapshot is
    // content-addressed and recomputed from the file on every read, never loaded back from a
    // row written before the field existed — so a missing block is a bug, not an old record.
    const { credit: _omitted, ...without } = SNAPSHOT
    assert.equal(SnapshotSchema.safeParse(without).success, false)
  })

  it('refuses a blind spot that is not one of the four', () => {
    // The union is closed so the gap cannot drift into copy: a fifth thing the bank cannot see
    // has to be argued for in core, mirrored here, and given a row on the screen.
    assert.equal(CreditFactsSchema.safeParse({ ...CREDIT, blind: ['income'] }).success, false)
  })

  it('carries a null component rather than a zero one', () => {
    // `.nullable()` against `.optional()`, which is the half-carry this whole block guards.
    // Zero earned is a verdict — "you scored nothing on this" — and unreadable is not a verdict.
    assert.equal(CreditComponentSchema.parse({ id: 'load', weight: 20, earned: null }).earned, null)
    assert.equal(
      CreditComponentSchema.safeParse({ id: 'load', weight: 20, earned: undefined }).success,
      false,
    )
  })

  it("keeps the wire enum and core's own list in step", () => {
    // Cheap, and it is what fails when somebody adds a fifth blind spot to `CREDIT_BLIND_SPOTS`
    // in core and forgets the mirror. The order is load-bearing too: the screen lists them in it.
    assert.deepEqual(
      [...CREDIT_BLIND_SPOTS],
      ['utilisation', 'credit_age', 'enquiries', 'other_lenders'],
    )
  })
})
