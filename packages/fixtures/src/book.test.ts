/**
 * The relationship manager's book, held to what the console needs from it.
 *
 * Three kinds of claim, and they fail for different reasons.
 *
 * **The seams with the rest of the system.** `PERSONAS` is what the mobile picker reads and has
 * to stay the four heroes in their order; every book customer's bundle carries no picker
 * position; every identifier the database keys on is unique across all fifty; every customer is
 * in exactly one RM's book. A failure here breaks a seed or a screen, not a story.
 *
 * **The spread the spec asks for.** Ages, genders, how the money arrives, incomes, risk
 * profiles, cities, banks: the differences an RM sorts a book by. These are counts over the
 * specs, so they fail the moment somebody edits the book into forty-six copies of one customer.
 *
 * **What the engine finds in it.** Every insight the engine can raise is raised somewhere in the
 * book, all three segments are populated, and most of the customers with SIPs are on track.
 * These run the real derivation over the generated ledgers, so they are arithmetic, not
 * declarations: a book that only claimed an FD was maturing would fail.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildRoadmap, findInsights, suggestGoal } from '@dhan/core'
import type { InsightKind } from '@dhan/core'
import { ALL_PERSONAS, RM_BOOK } from './book/index.ts'
import { snapshotOf } from './ledger.testkit.ts'
import { PERSONAS } from './personas.ts'
import { BOOK_ACTIVITY, RM_ASSIGNMENTS, RM_USERS } from './rm-desk.ts'
import { seedBundles } from './seed-bundle.ts'
import { PRODUCT_SHELF } from './shelf.ts'

const ASOF = '2026-09-01'
const MASKED = /^[X*]{2,}[0-9]{4}$/
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/

const ageAt = (dob: string, on: string): number => {
  const [y, m, d] = dob.split('-').map(Number)
  const [ay, am, ad] = on.split('-').map(Number)
  let age = (ay ?? 0) - (y ?? 0)
  if ((am ?? 0) < (m ?? 0) || ((am ?? 0) === (m ?? 0) && (ad ?? 0) < (d ?? 0))) age -= 1
  return age
}

const unique = (label: string, values: readonly string[]): void => {
  const seen = new Set<string>()
  for (const v of values) {
    assert.ok(!seen.has(v), `${label} ${v} is used twice`)
    seen.add(v)
  }
}

describe('the seams', () => {
  it('leaves PERSONAS the four heroes, in picker order', () => {
    assert.deepEqual(
      PERSONAS.map((p) => p.slug),
      ['karan', 'rohan', 'priya', 'sunil'],
    )
    assert.deepEqual(ALL_PERSONAS, [...PERSONAS, ...RM_BOOK])
    assert.ok(RM_BOOK.length >= 40 && RM_BOOK.length <= 50, `${RM_BOOK.length} in the book`)
  })

  it('bundles every persona, and gives a picker position only to the heroes', () => {
    // A short window: what is under test is which bundles exist and how they are numbered,
    // and the ledgers inside them are checked everywhere else.
    const bundles = seedBundles({ historyMonths: 1, forwardMonths: 0 })
    assert.deepEqual(
      bundles.map((b) => b.slug),
      ALL_PERSONAS.map((p) => p.slug),
    )
    assert.deepEqual(
      bundles.slice(0, PERSONAS.length).map((b) => b.displayOrder),
      [1, 2, 3, 4],
    )
    const book = new Set(RM_BOOK.map((p) => p.slug))
    for (const b of bundles) {
      if (book.has(b.slug)) assert.equal(b.displayOrder, null, `${b.slug} is on the picker`)
    }
  })

  it('keys every customer on identifiers nobody else holds', () => {
    unique(
      'slug',
      ALL_PERSONAS.map((p) => p.slug),
    )
    unique(
      'cif',
      ALL_PERSONAS.map((p) => p.customer.cif),
    )
    unique(
      'custId',
      ALL_PERSONAS.map((p) => p.customer.custId),
    )
    unique(
      'consent',
      ALL_PERSONAS.map((p) => `CONS_SYN_${p.slug.toUpperCase()}`),
    )
    unique(
      'seed',
      ALL_PERSONAS.map((p) => String(p.seed)),
    )
    unique(
      'name',
      ALL_PERSONAS.map((p) => p.customer.custName),
    )
    // Every account in the book, at every bank: the masked number is how a line is attributed
    // to an account once four ledgers are merged into one.
    const accounts = ALL_PERSONAS.flatMap((p) => [
      p.accountNumberMasked,
      ...(p.satellites ?? []).map((s) => s.accountNumberMasked),
      ...p.extraAccounts.map((a) => a.accountNumberMasked),
    ])
    unique('account', accounts)
    for (const a of accounts) assert.match(a, MASKED)
    for (const p of RM_BOOK) assert.match(p.customer.cif, /^IDBI\d{10}$/)
  })

  it('writes every IFSC the rails will print in the shape the schema checks', () => {
    for (const p of RM_BOOK) {
      const codes = [
        p.employer.ifsc,
        p.rent?.payee.ifsc,
        ...p.obligations.map((o) => o.payee.ifsc),
        ...(p.income.payers ?? []).map((x) => x.ifsc),
        p.income.settlementAgent?.ifsc,
        ...p.lumps.map((l) => l.payee.ifsc),
        ...(p.satellites ?? []).map((s) => s.branchIfsc),
        ...p.extraAccounts.map((a) => a.branchIfsc),
      ].filter((c): c is string => c !== undefined)
      for (const c of codes) {
        assert.match(c, IFSC, `${p.slug}: ${c}`)
        assert.ok(!c.startsWith('IDIB'), `${p.slug}: ${c} is Indian Bank's prefix`)
      }
      // An inward salary is stamped by the bank that sent it, never by IDBI.
      assert.ok(!p.employer.ifsc.startsWith('IBKL'), `${p.slug}: employer banks with IDBI`)
    }
  })

  it('puts every customer in exactly one RM’s book', () => {
    const cifs = ALL_PERSONAS.map((p) => p.customer.cif)
    assert.deepEqual(Object.keys(RM_ASSIGNMENTS).sort(), [...cifs].sort())

    const ids = new Set(RM_USERS.map((u) => u.rmId))
    for (const rmId of Object.values(RM_ASSIGNMENTS)) assert.ok(ids.has(rmId), rmId)

    const [meera, arjun] = RM_USERS
    assert.ok(meera && arjun)
    assert.equal(meera.employeeNo, '204117')
    assert.equal(arjun.employeeNo, '204388')
    const count = (rmId: string): number =>
      Object.values(RM_ASSIGNMENTS).filter((r) => r === rmId).length
    // The heroes are Meera's, so the reviewer's handoff lands in the book she signs in to.
    for (const p of PERSONAS) assert.equal(RM_ASSIGNMENTS[p.customer.cif], meera.rmId)
    assert.equal(count(meera.rmId), PERSONAS.length + 34)
    assert.equal(count(arjun.rmId), 12)
    unique(
      'demo password',
      RM_USERS.map((u) => u.demoPassword),
    )
  })

  it('gives every book customer a replayable journey, and none to the heroes', () => {
    const book = new Set(RM_BOOK.map((p) => p.customer.cif))
    assert.deepEqual(Object.keys(BOOK_ACTIVITY).sort(), [...book].sort())

    let handoffs = 0
    for (const [cif, activity] of Object.entries(BOOK_ACTIVITY)) {
      assert.ok(activity.enquiries.length <= 3, cif)
      for (const e of activity.enquiries) {
        const product = PRODUCT_SHELF.find((x) => x.productId === e.productId)
        assert.ok(product, `${cif}: ${e.productId} is not on the shelf`)
        assert.ok(e.amount >= product.minInvestment, `${cif}: ${e.amount} below the minimum`)
        assert.ok(e.monthsAgo >= 1 && e.monthsAgo <= 11, `${cif}: asked ${e.monthsAgo} months ago`)
      }
      assert.equal(activity.handoffDaysAgo === null, !activity.recentHandoff, cif)
      if (activity.recentHandoff) handoffs += 1
    }
    assert.ok(handoffs >= 4 && handoffs <= 8, `${handoffs} recent handoffs`)

    // Every product a customer can be refused on the strength of its structure is asked about.
    const asked = new Set(
      Object.values(BOOK_ACTIVITY).flatMap((a) => a.enquiries.map((e) => e.productId)),
    )
    for (const id of ['LIC_ULIP_401', 'LIC_ENDOW_402', 'MF_ELSS_104', 'MF_INDEX_103']) {
      assert.ok(asked.has(id), `nobody in the book asks about ${id}`)
    }
  })
})

describe('the copy', () => {
  it('opens every pitch with the age the customer is at the anchor', () => {
    // The picker copy is typed, so it is the one field that can drift from the data under it.
    for (const p of RM_BOOK) {
      const age = ageAt(p.customer.dateOfBirth, ASOF)
      assert.ok(p.pitch.startsWith(`${age}, `), `${p.slug} is ${age}: "${p.pitch}"`)
    }
  })
})

describe('the spread', () => {
  it('reads like a real Indian book, not forty-six copies of one customer', () => {
    const ages = RM_BOOK.map((p) => ageAt(p.customer.dateOfBirth, ASOF))
    assert.equal(Math.min(...ages), 23)
    assert.equal(Math.max(...ages), 64)

    const women = RM_BOOK.filter((p) => p.customer.gender === 'Female').length
    assert.ok(Math.abs(women - (RM_BOOK.length - women)) <= 4, `${women} women`)

    for (const work of ['Salaried', 'Self-employed', 'Business'] as const) {
      const n = RM_BOOK.filter((p) => p.customer.employmentType === work).length
      assert.ok(n >= 5, `only ${n} ${work}`)
    }
    for (const risk of ['Conservative', 'Balanced', 'Growth'] as const) {
      const n = RM_BOOK.filter((p) => p.customer.riskProfile === risk).length
      assert.ok(n >= 8, `only ${n} ${risk}`)
    }

    const incomes = RM_BOOK.map((p) => p.income.amount)
    assert.equal(Math.min(...incomes), 28_000)
    assert.equal(Math.max(...incomes), 600_000)

    assert.ok(new Set(RM_BOOK.map((p) => p.customer.city)).size >= 8)

    // Wallet share means something only where somebody banks elsewhere, at each of the three.
    const elsewhere = RM_BOOK.filter((p) => (p.satellites ?? []).length > 0)
    assert.ok(elsewhere.length >= 6, `${elsewhere.length} multi-bank customers`)
    const banks = new Set(elsewhere.flatMap((p) => (p.satellites ?? []).map((s) => s.institution)))
    assert.deepEqual([...banks].map((b) => b.ifscPrefix).sort(), ['HDFC', 'ICIC', 'KKBK'])

    // A healthy majority run SIPs.
    const withSips = RM_BOOK.filter((p) => p.sips.length > 0).length
    assert.ok(withSips > RM_BOOK.length / 2, `${withSips} with SIPs`)
  })
})

describe('what the engine finds in the book', () => {
  const read = RM_BOOK.map((spec) => {
    const snapshot = snapshotOf(spec)
    const insights = findInsights(snapshot)
    const roadmap = buildRoadmap(snapshot, suggestGoal(snapshot, ASOF, null), PRODUCT_SHELF, ASOF)
    return { spec, snapshot, insights, roadmap }
  })

  it('raises every insight the engine has, somewhere in the book', () => {
    const KINDS: readonly InsightKind[] = [
      'idle_cash',
      'emi_ending',
      'subscription_review',
      'price_increase',
      'category_drift',
      'protection_gap',
      'expensive_debt',
      'missed_repayment',
      'buffer_thin',
      'habit_cost',
      'deposit_maturing',
    ]
    for (const kind of KINDS) {
      const who = read.filter((r) => r.insights.some((i) => i.kind === kind))
      assert.ok(who.length >= 2, `${kind} is raised for ${who.length} customers`)
    }
  })

  it('fills all three segments, with a handful of Priority customers', () => {
    // The console's definition: assets we can see are every balance plus every holding.
    const assets = read.map((r) => r.snapshot.balances.total + r.snapshot.holdings.total)
    const priority = assets.filter((a) => a >= 50_00_000).length
    const affluent = assets.filter((a) => a >= 10_00_000 && a < 50_00_000).length
    const mass = assets.filter((a) => a < 10_00_000).length
    assert.ok(priority >= 4 && priority <= 10, `${priority} Priority`)
    assert.ok(affluent >= 10, `${affluent} Affluent`)
    assert.ok(mass >= 10, `${mass} Mass`)
  })

  it('keeps most SIP customers on track, and the trouble to a minority', () => {
    // On track: the plan is feasible, nothing is short, and nothing urgent stands against it.
    const onTrack = read.filter(
      (r) =>
        r.roadmap.feasible &&
        r.roadmap.shortfallMonthly === 0 &&
        !r.insights.some((i) => i.severity === 'urgent'),
    )
    const sips = read.filter((r) => r.spec.sips.length > 0)
    const sipsOnTrack = onTrack.filter((r) => r.spec.sips.length > 0)
    assert.ok(
      sipsOnTrack.length > sips.length / 2,
      `${sipsOnTrack.length} of ${sips.length} SIP customers on track`,
    )
    const urgent = read.filter((r) => r.insights.some((i) => i.severity === 'urgent'))
    assert.ok(urgent.length < read.length / 4, `${urgent.length} customers in urgent trouble`)
  })
})
