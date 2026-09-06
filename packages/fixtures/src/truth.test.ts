import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addMonths,
  answer,
  buildDailyPlan,
  buildRoadmap,
  derive,
  detectRecurring,
  findInsights,
  monthKey,
  suggestGoal,
} from '@dhan/core'
import { generateCustomerFile } from './generate.ts'
import { PERSONAS, PRIYA, ROHAN, SUNIL } from './personas.ts'
import type { PersonaSpec } from './personas.ts'
import { PRODUCT_SHELF } from './shelf.ts'

const ANCHOR = '2026-09-01'
const CLOCK_DATES = [
  ANCHOR,
  '2026-09-02',
  '2026-09-08',
  '2026-10-01',
  '2026-10-31',
  '2026-11-01',
  '2026-12-31',
  '2027-01-01',
]
const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`

function view(persona: PersonaSpec, asOf = ANCHOR) {
  const file = generateCustomerFile(persona, { anchor: ANCHOR, asOf, months: 24 })
  const snapshot = derive(file, asOf)
  const goal = suggestGoal(snapshot, asOf, null)
  const roadmap = buildRoadmap(snapshot, goal, PRODUCT_SHELF, asOf)
  const plan = buildDailyPlan(snapshot, roadmap, file.transactions, PRODUCT_SHELF, asOf)
  return { file, snapshot, roadmap, plan }
}

describe('income claims across the simulated clock', () => {
  it('keeps every persona’s payroll classification consistent through clock advances', () => {
    for (const persona of PERSONAS) {
      for (const asOf of CLOCK_DATES) {
        const { file, snapshot, plan } = view(persona, asOf)
        const label = `${persona.slug} ${asOf}`
        const salaried = persona.customer.employmentType === 'Salaried'
        assert.equal(snapshot.income.stability, salaried ? 'regular' : 'variable', label)
        assert.equal(snapshot.income.source, salaried ? 'salary-series' : 'monthly-credits', label)
        assert.equal(snapshot.income.payDay !== null, salaried, label)
        assert.equal(plan.safeToSpend.incomeStability, snapshot.income.stability, label)

        for (const context of [undefined, { safeToSpend: plan.safeToSpend }]) {
          const reply = answer('What can I safely spend today?', snapshot, file, context)
          assert.ok(reply.matched, label)
          const claims = [reply.text, ...reply.evidence].join(' ')
          if (salaried) assert.match(claims, /salary/i, label)
          else assert.doesNotMatch(claims, /salary/i, label)
        }
      }
    }
  })

  it('does not turn low variation in shop collections into a salary or a single payer’s income', () => {
    for (const asOf of ['2026-10-01', '2026-11-01']) {
      const { snapshot } = view(SUNIL, asOf)
      assert.ok(snapshot.income.variation < 0.15, 'exercise the variation threshold crossing')
      assert.equal(snapshot.income.stability, 'variable')
      assert.equal(snapshot.income.source, 'monthly-credits')
      assert.equal(snapshot.income.payDay, null)
      // In November a single ₹19,975 shop-sales series previously displaced the whole month's
      // receipts. Changing only the stability label would leave the advice arithmetic wrong.
      assert.ok(snapshot.income.monthly > 60_000, `${asOf}: ${snapshot.income.monthly}`)
    }
  })

  it('resets a trader’s budget at the calendar boundary even when the first is a weekend', () => {
    for (const asOf of CLOCK_DATES) {
      const { snapshot, plan } = view(SUNIL, asOf)
      const boundary = addMonths(`${monthKey(asOf)}-01`, 1)
      assert.equal(snapshot.income.nextPayDate, boundary, asOf)
      assert.equal(plan.safeToSpend.nextSalaryDate, boundary, asOf)
    }
    const { plan } = view(SUNIL, '2026-10-01')
    assert.equal(plan.safeToSpend.nextSalaryDate, '2026-11-01')
    assert.equal(plan.safeToSpend.daysToSalary, 31)
  })

  it('requires payroll evidence even when business credits are fixed and monthly', () => {
    const { file } = view(ROHAN)
    const business = {
      ...file,
      transactions: file.transactions.map((t) =>
        t.isSalaryCredit
          ? { ...t, isSalaryCredit: false, narration: 'NEFT/ACME/CUSTOMER INVOICE' }
          : t,
      ),
    }
    const credits = detectRecurring(business.transactions, ANCHOR)
    assert.ok(
      credits.some((s) => s.kind === 'income' && s.cadence === 'monthly' && s.dayOfMonth !== null),
    )
    const snapshot = derive(business, ANCHOR)
    assert.ok(snapshot.income.variation < 0.15)
    assert.equal(snapshot.income.stability, 'variable')
    assert.equal(snapshot.income.payDay, null)
    assert.equal(snapshot.income.source, 'monthly-credits')
  })

  it('recognises payroll from the narration when the bank has no salary flag', () => {
    for (const persona of [ROHAN, PRIYA]) {
      const { file } = view(persona)
      const withoutFlags = {
        ...file,
        transactions: file.transactions.map((t) => ({ ...t, isSalaryCredit: false })),
      }
      const snapshot = derive(withoutFlags, ANCHOR)
      assert.equal(snapshot.income.stability, 'regular')
      assert.equal(snapshot.income.source, 'salary-series')
      assert.equal(snapshot.income.monthly, persona.income.amount)
      assert.notEqual(snapshot.income.payDay, null)
    }
  })

  it('does not promise a payroll date when salary credits have no consistent day', () => {
    const { file } = view(ROHAN)
    const irregular = {
      ...file,
      transactions: file.transactions.map((t) => {
        if (!t.isSalaryCredit) return t
        const day = ['03', '12', '21'][Number(t.txnDate.slice(5, 7)) % 3]
        assert.ok(day)
        const date = `${monthKey(t.txnDate)}-${day}`
        return { ...t, txnDate: date, valueDate: date }
      }),
    }
    const snapshot = derive(irregular, ANCHOR)
    assert.ok(snapshot.income.variation < 0.15)
    assert.equal(snapshot.income.stability, 'variable')
    assert.equal(snapshot.income.payDay, null)
    assert.equal(snapshot.income.source, 'monthly-credits')
  })
})

describe('protection claims match the cover in force', () => {
  it('acknowledges existing cover and the remaining gap in both insight and roadmap', () => {
    for (const asOf of CLOCK_DATES) {
      const { snapshot, roadmap, plan } = view(SUNIL, asOf)
      const protection = snapshot.protection
      assert.equal(protection.lifeCoverInForce, 200_000)
      assert.ok(protection.gap > 0)
      const insight = plan.insights.find((i) => i.kind === 'protection_gap')
      const stage = roadmap.stages.find((s) => s.kind === 'get_cover')
      assert.ok(insight, asOf)
      assert.ok(stage, asOf)
      for (const claim of [insight.headline, stage.why]) {
        assert.ok(claim.includes(inr(protection.lifeCoverInForce)), claim)
        assert.ok(claim.includes(inr(protection.gap)), claim)
        assert.doesNotMatch(claim, /no life cover|nothing in force|uncovered/i)
      }
      assert.equal(stage.label, 'Increase life cover')
    }
  })

  it('still identifies no cover when the customer actually has none', () => {
    const { snapshot, roadmap } = view(ROHAN)
    assert.equal(snapshot.protection.lifeCoverInForce, 0)
    const insight = findInsights(snapshot).find((i) => i.kind === 'protection_gap')
    const stage = roadmap.stages.find((s) => s.kind === 'get_cover')
    assert.ok(insight)
    assert.ok(stage)
    assert.match(insight.headline, /no life cover in force/)
    assert.match(stage.why, /no life cover in force/)
    assert.equal(stage.label, 'Put life cover in force')
  })

  it('does not invent a gap when the cover is sufficient or there are no dependents', () => {
    const { file, snapshot: before } = view(SUNIL)
    const covered = derive(
      {
        ...file,
        policies: [
          {
            holdingType: 'INSURANCE',
            name: 'Term life cover',
            assetClass: 'Protection',
            investedAmount: before.protection.lifeCoverNeeded,
            currentValue: 0,
            sipActive: false,
          },
        ],
      },
      ANCHOR,
    )
    for (const snapshot of [covered, view(PRIYA).snapshot]) {
      assert.equal(snapshot.protection.gap, 0)
      assert.ok(!findInsights(snapshot).some((i) => i.kind === 'protection_gap'))
      const roadmap = buildRoadmap(
        snapshot,
        suggestGoal(snapshot, ANCHOR, null),
        PRODUCT_SHELF,
        ANCHOR,
      )
      assert.ok(!roadmap.stages.some((s) => s.kind === 'get_cover'))
    }
  })
})
