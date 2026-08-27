// Turning the behaviour engine's output into the two things a voice session needs:
// the figures the future self is allowed to state, and the signals that decide his register.
//
// Kept separate from the persona because these are the parts that will be replaced wholesale
// when the real IDBI feed arrives. Nothing here should know how the model is prompted.

import { formatINR } from '../data.js'

/**
 * The only numbers the model may speak. Written as short natural-language statements
 * rather than a JSON blob, because the model reproduces phrasing far more reliably than
 * it reformats structured data mid-sentence.
 */
export function buildFacts({ persona, insights, spendTotal, sip, riskProfile, corpus, coverage, needed }) {
  const facts = [
    `Monthly income ${formatINR(persona.monthlyIncome)}, monthly spend about ${formatINR(spendTotal)}.`,
    `Roughly ${formatINR(insights.avgMonthlySurplus)} a month goes unspent and unused.`,
    `${formatINR(insights.idleBalance)} has been sitting in savings for ${insights.idleMonths} months, earning ${Math.round(insights.savingsAccountRate * 100)}% while prices rise ${Math.round(insights.inflationRate * 100)}%.`,
    `Current SIP on the planner: ${formatINR(sip)} a month. Existing SIP on record: ${formatINR(insights.existingSip)}.`,
    `Risk profile: ${riskProfile}.`,
    `At this pace the corpus at 60 is about ${formatINR(corpus)}, against a target of ${formatINR(needed)} — ${Math.round(coverage * 100)}% of the way there.`,
  ]

  if (insights.fdMaturingDays <= 30) {
    facts.push(`A ${formatINR(insights.fdAmount)} fixed deposit matures in ${insights.fdMaturingDays} days.`)
  }
  if (!insights.hasTermCover && insights.dependents > 0) {
    facts.push(`No term life cover on record, with ${insights.dependents} dependents. A ₹1 crore LIC term policy is about ₹850 a month at age ${persona.age}.`)
  }
  if (insights.emergencyFundMonths < 3) {
    facts.push(`Emergency buffer covers only ${insights.emergencyFundMonths.toFixed(1)} months of spending. Three to six is the usual floor.`)
  }
  if (insights.hasHighInterestDebt) {
    facts.push('There is high-interest debt outstanding. Clearing it beats any investment return available.')
  }

  return facts
}

/**
 * Signals for classifyTone(). Deliberately mirrors the shape the classifier expects rather
 * than passing the whole app state, so the rule order stays readable at the call site.
 *
 * `commitments` comes from memory — it is what lets the future self notice you kept your word,
 * which is the single moment in the product where he is allowed to be visibly pleased.
 */
export function buildToneSignals({ insights, coverage, commitments = [], memoryCount = 0, sip = 0, marketDrop = false }) {
  const last = commitments[0]
  const keptLastCommitment = Boolean(last?.amount && sip >= last.amount)

  return {
    isFirstSession: memoryCount === 0,
    marketDrop,
    facts: {
      hasHighInterestDebt: insights.hasHighInterestDebt,
      missedEmi: insights.missedEmi,
      emergencyFundMonths: insights.emergencyFundMonths,
      dependents: insights.dependents,
      hasTermCover: insights.hasTermCover,
      daysSinceSalary: insights.daysSinceSalary,
      keptLastCommitment,
      idleMonths: insights.idleMonths,
      idleAmount: insights.idleBalance,
      goalShortfallPct: Math.max(0, Math.round((1 - coverage) * 100)),
    },
  }
}
