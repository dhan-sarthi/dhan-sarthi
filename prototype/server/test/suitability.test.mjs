// The suitability gate, exercised against every rule. No model, no network, no key —
// which is the point: the gate's decisions must be reproducible and explainable.
import { evaluate, ruleBook } from '../src/suitability.js'
import shelf from '../src/fixtures/rohan.js'

const products = shelf.productShelf
const P = (id) => products.find((p) => p.productId === id)
const others = (id) => products.filter((p) => p.productId !== id)

const healthy = {
  hasHighInterestDebt: false, missedEmi: false, emergencyFundMonths: 4.2,
  investableSurplus: 18400, dependents: 2, hasTermCover: false,
}
const balanced = { riskProfile: 'Balanced' }
const conservative = { riskProfile: 'Conservative' }

let pass = 0, fail = 0
function check(label, got, want) {
  const ok = got === want
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : `  (got ${got}, wanted ${want})`}`)
  ok ? pass++ : fail++
}

console.log(`\nRule book — ${ruleBook.length} rules:`)
ruleBook.forEach((r) => console.log(`   ${r.id}: ${r.description}`))

console.log('\nA suitable recommendation passes:')
const good = evaluate({ product: P('IDBI_MF_00184'), customer: balanced, facts: healthy, amount: 8000, alternatives: others('IDBI_MF_00184') })
check('index fund, balanced profile, affordable', good.verdict, 'PASS')

console.log('\nEach rule blocks what it should:')

const debt = evaluate({ product: P('IDBI_MF_00184'), customer: balanced, facts: { ...healthy, hasHighInterestDebt: true }, amount: 8000, alternatives: [] })
check('high-interest debt blocks investing', debt.verdict, 'BLOCKED')
check('  → correct rule fires', debt.ruleId, 'HIGH_INTEREST_DEBT')

const missed = evaluate({ product: P('IDBI_MF_00184'), customer: balanced, facts: { ...healthy, missedEmi: true }, amount: 8000, alternatives: [] })
check('missed repayment blocks investing', missed.ruleId, 'MISSED_REPAYMENT')

const thinBuffer = evaluate({ product: P('IDBI_ELSS_0077'), customer: balanced, facts: { ...healthy, emergencyFundMonths: 1.9 }, amount: 5000, alternatives: [] })
check('thin buffer blocks a locked-in product', thinBuffer.ruleId, 'EMERGENCY_BUFFER')

const tooRisky = evaluate({ product: P('IDBI_MF_00184'), customer: conservative, facts: healthy, amount: 5000, alternatives: [] })
check('conservative profile blocks a Very High product', tooRisky.ruleId, 'RISK_CEILING')

const unaffordable = evaluate({ product: P('IDBI_MF_00184'), customer: balanced, facts: healthy, amount: 40000, alternatives: [] })
check('amount above surplus is blocked', unaffordable.ruleId, 'AFFORDABILITY')

const wrongShape = evaluate({ product: P('IDBI_ELSS_0077'), customer: balanced, facts: healthy, amount: 5000, goal: { horizonYears: 2 }, alternatives: [] })
check('lock-in longer than the goal is blocked', wrongShape.ruleId, 'HORIZON_VS_LOCKIN')

console.log('\nThe refusal — a product IDBI itself sells:')
const ulip = evaluate({ product: P('LIC_ULIP_0088'), customer: balanced, facts: healthy, amount: 2500, alternatives: others('LIC_ULIP_0088') })
check('ULIP is refused', ulip.verdict, 'BLOCKED')
check('  → bundled-protection rule fires', ulip.ruleId, 'BUNDLED_PROTECTION')
check('  → names a cheaper alternative', ulip.alternative?.productId, 'LIC_TERM_0021')
console.log(`\n   spoken:   "${ulip.spoken}"`)
console.log(`   recorded: ${ulip.recorded}`)

console.log('\nThe alternative it names is itself suitable:')
const term = evaluate({ product: P('LIC_TERM_0021'), customer: balanced, facts: healthy, amount: 850, alternatives: others('LIC_TERM_0021') })
check('term cover passes', term.verdict, 'PASS')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
