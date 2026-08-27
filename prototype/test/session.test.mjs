// Integration: two sessions in sequence. The second must know about the first.
// Model calls are stubbed so this runs without a key.
import { persona, insights, spendTotal, riskProfiles, sipFutureValue, corpusNeeded } from '../src/data.js'
import { buildFacts, buildToneSignals } from '../src/lib/facts.js'
import { classifyTone } from '../src/lib/character.js'
import { buildInstructions } from '../src/lib/persona.js'

const extraction = {
  summary: 'Rohan agreed to raise his SIP to ₹12,000 a month after seeing the corpus gap; hesitated about the FD renewal.',
  topics: ['sip', 'fd-maturity', 'commitment'], emotionalTone: 'motivated',
  commitment: { what: 'raise SIP', amount: 12000, cadence: 'monthly' }, worthRemembering: true,
}
function fakeEmbed(text) {
  const v = new Array(32).fill(0)
  for (const ch of text.toLowerCase()) v[ch.charCodeAt(0) % 32] += 1
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1
  return v.map((x) => x / n)
}
globalThis.fetch = async (_u, o) => {
  const b = JSON.parse(o.body)
  return b.task === 'embed'
    ? { ok: true, json: async () => ({ embedding: fakeEmbed(b.input) }) }
    : { ok: true, json: async () => ({ content: JSON.stringify(extraction) }) }
}

const { remember, recall, openCommitments, listMemories } = await import('../src/lib/memory/index.js')
const CUST = 'integration-rohan'

const years = persona.retireAt - persona.age
const needed = corpusNeeded(spendTotal, years)
const project = (sip, profile = 'Balanced') => {
  const corpus = sipFutureValue(sip, years, riskProfiles[profile].rate)
  return { corpus, coverage: Math.min(1, corpus / needed) }
}

function session(label, { sip, insightsOverride = {}, commitments, memoryCount }) {
  const ins = { ...insights, ...insightsOverride }
  const { corpus, coverage } = project(sip)
  const facts = buildFacts({ persona, insights: ins, spendTotal, sip, riskProfile: 'Balanced', corpus, coverage, needed })
  const signals = buildToneSignals({ insights: ins, coverage, sip, commitments, memoryCount })
  const tone = classifyTone(signals)
  console.log(`\n${label}`)
  console.log('  register :', tone)
  console.log('  facts    :', facts.length, 'statements')
  return { facts, tone, coverage }
}

// --- Session 1: he has never spoken to his future self before.
const s1 = session('SESSION 1 — first ever call', { sip: 5000, memoryCount: 0, commitments: [] })
if (s1.tone !== 'first_meeting') throw new Error('expected first_meeting, got ' + s1.tone)

console.log('\n  ...they talk. He agrees to raise the SIP to ₹12,000.')
const stored = await remember(CUST, [
  { role: 'assistant', text: 'At five thousand a month I only reach about one point three crore. I need nine.' },
  { role: 'user', text: 'okay what if I do 12000 a month instead' },
  { role: 'assistant', text: 'That changes things. Shall we set it?' },
  { role: 'user', text: 'yes lets do 12000, but I am not sure about the FD renewal' },
])
console.log('  remembered:', stored ? `"${stored.text.slice(0, 62)}..."` : 'nothing')
console.log('  commitment:', stored?.commitment)

// --- Session 2: he comes back, having actually done it.
const commitments = await openCommitments(CUST)
const memoryCount = (await listMemories(CUST)).length
const s2 = session('SESSION 2 — he returns, SIP now at ₹12,000', {
  sip: 12000, memoryCount, commitments,
  insightsOverride: { hasTermCover: true, emergencyFundMonths: 4, daysSinceSalary: 9 },
})
if (s2.tone !== 'good_progress') throw new Error('expected good_progress, got ' + s2.tone)

const recalled = await recall(CUST, 'following up on the sip he committed to', { topics: ['sip'] })
console.log('  recalled :', recalled.map((m) => `"${m.text.slice(0, 50)}..." (${m.whenLabel})`).join(', ') || 'nothing')

const instructions = buildInstructions({
  riskProfile: 'Balanced', toneContext: s2.tone, language: 'hi-IN',
  memories: recalled, facts: s2.facts,
})
console.log('\nINSTRUCTIONS for session 2:', instructions.length, 'chars')
const checks = {
  'opens in the right register': instructions.includes('crossed a milestone'),
  'carries the memory': instructions.includes('12,000') || instructions.includes('12000'),
  'speaks Hindi': instructions.includes('हिन्दी'),
  'has live figures': instructions.includes('LIVE FIGURES'),
  'keeps the guardrails': instructions.includes('Never shame'),
}
for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? '✓' : '✗'} ${k}`)
if (Object.values(checks).some((v) => !v)) throw new Error('instruction assembly incomplete')
console.log('\nAll checks passed.')
