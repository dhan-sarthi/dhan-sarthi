// Regression tests for the memory safeguard.
//
// Every "blocked" case here is a topic label a real model actually produced when asked to
// summarise a conversation about a diabetes diagnosis. The first version of this guard used
// exact string matching against a block-list and stored all of them, because the model says
// "medical-expenses" and "chronic-illness-costs" where the list said "medical" and "illness".
//
// The lesson worth keeping: the earlier test passed only because the stub obligingly
// returned exactly the label the block-list contained. A safeguard tested against a
// cooperative stub is not tested.
import { isSafeToStore } from '../src/memory.js'

const cases = [
  // observed model output, all from the same blocked conversation
  ['medical-expenses',          { topics: ['medical-expenses', 'long-term-planning'], summary: 'Concerned about long-term costs of diabetes treatment.' }, false],
  ['chronic-illness-costs',     { topics: ['chronic-illness-costs', 'healthcare-planning'], summary: 'Shared a recent diagnosis.' }, false],
  ['healthcare-planning',       { topics: ['long-term-healthcare-planning'], summary: 'Worried about future costs.' }, false],
  ['plain health label',        { topics: ['health'], summary: 'x' }, false],

  // summary-level catch, where topics look innocent
  ['surgery in summary only',   { topics: ['planning', 'budgeting'], summary: 'He mentioned his upcoming surgery costs.' }, false],
  ['divorce in summary only',   { topics: ['planning'], summary: 'Splitting assets after a divorce.' }, false],

  // identifiers
  ['PAN in summary',            { topics: ['tax'], summary: 'PAN ABCDE1234F filed on time' }, false],
  ['Aadhaar in summary',        { topics: ['kyc'], summary: 'Verified against 123456789012' }, false],

  // legitimate memories must still get through — a guard that blocks everything is useless
  ['SIP commitment',            { topics: ['sip', 'commitment'], summary: 'Agreed to raise the monthly investment to twelve thousand.' }, true],
  ['lock-in hesitation',        { topics: ['tax-saving-fund', 'investment-lock-in', 'wedding-expenses'], summary: 'Postponed the tax saving fund because of the three-year lock-in.' }, true],
  ['FD maturity',               { topics: ['fixed-deposit', 'maturity'], summary: 'Undecided about renewing the FD maturing in September.' }, true],
  ['goal setting',              { topics: ['retirement-goal'], summary: 'Wants to retire at sixty with about nine crore.' }, true],
]

let pass = 0, fail = 0
for (const [label, input, wantSafe] of cases) {
  const r = isSafeToStore(input)
  const ok = r.safe === wantSafe
  const verdict = r.safe ? 'stored' : 'blocked'
  console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(26)} ${verdict}${r.reason ? ` — ${r.reason}` : ''}`)
  ok ? pass++ : fail++
}
console.log(`\n  ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
