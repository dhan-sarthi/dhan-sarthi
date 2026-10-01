/**
 * The RM console's shapes at the edges a builder is most likely to get wrong: what is refused
 * on the way in, and what a response row must be able to carry on the way out.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AdviceItemSchema,
  BalancePointSchema,
  BookRowSchema,
  CitedSentenceSchema,
  FactSchema,
  SignalSchema,
} from './rm-domain.ts'
import { RmAskRequestSchema } from './routes/rm-copilot.ts'
import {
  RmCustomerQuerySchema,
  RmHandoffPatchSchema,
  RmNoteRequestSchema,
  RmRevealRequestSchema,
  RmSignInRequestSchema,
} from './routes/rm.ts'

const SIGNAL = {
  kind: 'expensive_debt',
  severity: 'urgent',
  title: '₹1.86L on a card at 34.8%',
  detail: 'Karan’s card costs ₹5,394 a month in interest.',
  figure: 186_000,
  deadlineDays: null,
  evidence: ['Card statement, 1 Sep 2026'],
}

const HASH = 'a'.repeat(64)

describe('a signal', () => {
  it('carries an engine insight kind', () => {
    assert.equal(SignalSchema.safeParse(SIGNAL).success, true)
  })

  it('never carries the handoff the engine adds to every customer', () => {
    // A request to talk to the RM reaches the console as a Handoff. As a signal it would be
    // on every row of the book and mean nothing on any of them.
    assert.equal(SignalSchema.safeParse({ ...SIGNAL, kind: 'human_handoff' }).success, false)
  })

  it('says "no figure" with a null rather than by leaving the key out', () => {
    const { figure: _figure, ...withoutFigure } = SIGNAL
    assert.equal(SignalSchema.safeParse(withoutFigure).success, false)
    assert.equal(SignalSchema.safeParse({ ...SIGNAL, figure: null }).success, true)
  })
})

describe('a book row', () => {
  const month = (m: number) => `2025-${String(m).padStart(2, '0')}`
  const ROW = {
    cif: 'IDBI0003308471',
    name: 'Karan Mehta',
    initials: 'KM',
    age: 34,
    gender: 'M',
    city: 'Pune',
    employmentType: 'Salaried',
    riskProfile: 'Balanced',
    segment: 'priority',
    relationshipValue: 5_245_774,
    withIdbi: 1_245_774,
    walletSharePct: 60.3,
    netWorth: 4_431_459,
    monthlyIncome: 185_000,
    monthlySurplus: 42_000,
    sipMonthly: 15_000,
    allocation: { cash: 2_065_774, equity: 2_400_000, fixed: 780_000 },
    balanceSeries: Array.from({ length: 12 }, (_, i) => ({
      month: month(i + 1),
      total: 2_000_000 + i * 5_000,
      withIdbi: 1_200_000 + i * 4_000,
    })),
    balanceChange3mPct: 1.2,
    goal: {
      kind: 'debt_payoff',
      label: 'Clear the card',
      targetAmount: 186_000,
      targetDate: '2027-03-01',
      health: 'at_risk',
    },
    topSignal: SIGNAL,
    signalCount: 3,
    strength: { level: 'high', reason: 'Active 6 days ago · 3 IDBI products · 62% with IDBI' },
    attrition: { flagged: false, reasons: [] },
    lastActivityAt: '2026-08-26',
    openHandoff: true,
    refusals: 1,
    products: { idbi: ['Savings', 'FD'], gaps: ['Term cover'] },
  }

  it('parses a whole row', () => {
    assert.equal(BookRowSchema.safeParse(ROW).success, true)
  })

  it('takes a customer with no activity, no signal and no three-month baseline', () => {
    const quiet = { ...ROW, lastActivityAt: null, topSignal: null, balanceChange3mPct: null }
    assert.equal(BookRowSchema.safeParse(quiet).success, true)
  })

  it('takes a customer with no balance anywhere, whose wallet share is null rather than 0', () => {
    assert.equal(BookRowSchema.safeParse({ ...ROW, walletSharePct: null }).success, true)
  })

  it('refuses a segment that is not one of the three', () => {
    assert.equal(BookRowSchema.safeParse({ ...ROW, segment: 'gold' }).success, false)
  })

  it('cuts balance history by calendar month', () => {
    assert.equal(
      BalancePointSchema.safeParse({ month: '2026-13', total: 0, withIdbi: 0 }).success,
      false,
    )
    assert.equal(
      BalancePointSchema.safeParse({ month: '2026-09-01', total: 0, withIdbi: 0 }).success,
      false,
    )
  })
})

describe('an advice item', () => {
  const ITEM = {
    id: 'adv-1',
    at: '2026-06-01',
    cif: 'IDBI0003308471',
    name: 'Karan Mehta',
    productId: 'LIC_ULIP_301',
    productName: 'LIC ULIP',
    amount: 5000,
    source: 'avatar_tool',
    verdict: 'BLOCKED',
    ruleId: 'HIGH_INTEREST_DEBT',
    rulesPassed: [],
    spoken: 'Clear the card first.',
    recorded: 'Blocked by HIGH_INTEREST_DEBT.',
    hash: HASH,
    prevHash: HASH,
  }

  it('shows every outcome the chain can hold, the off-shelf product included', () => {
    for (const verdict of ['PASS', 'BLOCKED', 'UNKNOWN_PRODUCT']) {
      assert.equal(AdviceItemSchema.safeParse({ ...ITEM, verdict }).success, true, verdict)
    }
  })

  it('refuses a hash that is not a sha256', () => {
    assert.equal(AdviceItemSchema.safeParse({ ...ITEM, hash: 'abc' }).success, false)
  })
})

describe('the copilot’s facts and citations', () => {
  it('numbers facts F1 upwards', () => {
    const fact = (id: string) => ({ id, text: 'x', source: { kind: 'snapshot', ref: null } })
    assert.equal(FactSchema.safeParse(fact('F1')).success, true)
    assert.equal(FactSchema.safeParse(fact('F12')).success, true)
    for (const id of ['F0', 'f1', '1', 'F01', 'F']) {
      assert.equal(FactSchema.safeParse(fact(id)).success, false, id)
    }
  })

  it('cites facts by id and nothing else', () => {
    assert.equal(CitedSentenceSchema.safeParse({ text: 'x', cites: ['F1', 'F3'] }).success, true)
    assert.equal(CitedSentenceSchema.safeParse({ text: 'x', cites: ['snapshot'] }).success, false)
  })

  it('takes at most twelve turns of history and a question of at most 500 characters', () => {
    const turn = { role: 'user', text: 'And the card?' }
    const ask = (n: number) => ({ question: 'Is he on track?', history: Array(n).fill(turn) })
    assert.equal(RmAskRequestSchema.safeParse(ask(12)).success, true)
    assert.equal(RmAskRequestSchema.safeParse(ask(13)).success, false)
    assert.equal(RmAskRequestSchema.safeParse({ question: 'x'.repeat(501) }).success, false)
    assert.equal(RmAskRequestSchema.safeParse({ question: '   ' }).success, false)
  })
})

describe('what the console sends', () => {
  it('rejects a key a body does not name', () => {
    // Strict, so a field the console thinks it is setting and the server ignores is a 400
    // rather than a silent no-op.
    assert.equal(
      RmNoteRequestSchema.safeParse({ kind: 'note', text: 'Called.', pinned: true }).success,
      false,
    )
    assert.equal(
      RmSignInRequestSchema.safeParse({ employeeNo: '204117', password: 'x', rm: 'x' }).success,
      false,
    )
  })

  it('asks for a reveal reason long enough to be one', () => {
    const reveal = (reason: string) =>
      RmRevealRequestSchema.safeParse({ field: 'dateOfBirth', reason })
    assert.equal(reveal('KYC').success, false)
    assert.equal(reveal('   KYC   ').success, false)
    assert.equal(reveal('KYC refresh').success, true)
    assert.equal(reveal('x'.repeat(201)).success, false)
    assert.equal(
      RmRevealRequestSchema.safeParse({ field: 'pan', reason: 'KYC refresh' }).success,
      false,
    )
  })

  it('keeps a note between one and 2,000 characters', () => {
    assert.equal(RmNoteRequestSchema.safeParse({ kind: 'call', text: '' }).success, false)
    assert.equal(
      RmNoteRequestSchema.safeParse({ kind: 'call', text: 'x'.repeat(2000) }).success,
      true,
    )
    assert.equal(
      RmNoteRequestSchema.safeParse({ kind: 'call', text: 'x'.repeat(2001) }).success,
      false,
    )
  })

  it('sets a handoff to contacted or resolved, never back to open', () => {
    assert.equal(RmHandoffPatchSchema.safeParse({ status: 'contacted' }).success, true)
    assert.equal(
      RmHandoffPatchSchema.safeParse({ status: 'resolved', note: 'Booked a call.' }).success,
      true,
    )
    assert.equal(RmHandoffPatchSchema.safeParse({ status: 'open' }).success, false)
  })

  it('logs an open with a purpose even when the link gave none', () => {
    assert.deepEqual(RmCustomerQuerySchema.parse({}), { purpose: 'Relationship review' })
    assert.deepEqual(RmCustomerQuerySchema.parse({ purpose: 'FD maturing' }), {
      purpose: 'FD maturing',
    })
  })
})
