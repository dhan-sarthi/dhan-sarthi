/**
 * The projection band at a rate the customer chooses.
 *
 * The server sends the roadmap's band at the engine's default rates. The slider on Plan lets a
 * customer move the assumed rate and see the band move, and that arithmetic has to happen here:
 * the main bundle may not import `@dhan/core` (ADR-0001), and a round trip per slider tick is a
 * spinner on a phone. So this mirrors `packages/core/src/projection.ts` exactly — monthly rate
 * as the annual rate over twelve, contributions at the start of the month, the real-terms line
 * deflated over the whole horizon — and the parity is what keeps the number the customer moved
 * to consistent with the one the server wrote down.
 */
import type { Projection } from '@dhan/contracts'

export function futureValue(
  monthly: number,
  years: number,
  annualRatePct: number,
  existingCorpus = 0,
): number {
  const n = Math.round(years * 12)
  const i = annualRatePct / 100 / 12

  if (n <= 0) return existingCorpus

  const growthOfExisting = existingCorpus * (1 + i) ** n
  const growthOfContributions = i === 0 ? monthly * n : monthly * (((1 + i) ** n - 1) / i) * (1 + i)

  return Math.round(growthOfExisting + growthOfContributions)
}

/**
 * The monthly contribution needed to reach a target. Line-for-line `requiredMonthly` in
 * `packages/core/src/projection.ts`, and it has to be: it is the number the goal screens quote
 * before a target is saved, and the roadmap the server cuts a second later quotes it again.
 * Two arithmetics would show the customer two answers to the same question.
 */
export function requiredMonthly(
  target: number,
  years: number,
  annualRatePct: number,
  existingCorpus = 0,
): number {
  const n = Math.round(years * 12)
  if (n <= 0) return Math.max(0, target - existingCorpus)

  const i = annualRatePct / 100 / 12
  const fromExisting = existingCorpus * (1 + i) ** n
  const remaining = Math.max(0, target - fromExisting)

  if (i === 0) return Math.ceil(remaining / n)
  return Math.ceil(remaining / ((((1 + i) ** n - 1) / i) * (1 + i)))
}

/**
 * The one-off the same target costs if nothing goes in monthly.
 *
 * The other half of "an SIP of ₹20,000 **or** a lump sum of ₹14 lakh", and the half core has no
 * function for — it plans in monthly contributions, because that is what a mandate is. Same
 * convention as everything above it: the annual rate over twelve, compounded monthly.
 */
export function requiredLumpSum(
  target: number,
  years: number,
  annualRatePct: number,
  existingCorpus = 0,
): number {
  const n = Math.round(years * 12)
  const i = annualRatePct / 100 / 12
  const growth = (1 + i) ** n
  return Math.max(0, Math.ceil(target / growth - existingCorpus))
}

/**
 * What a sum in today's money costs at the horizon.
 *
 * The inverse of `band`'s real-terms line, and the same arithmetic as `compoundedOneOff` in
 * core. **Annual compounding, not monthly** — an inflation rate is quoted per year and a price
 * rises once a year, so twelve-times-a-year compounding would quote a customer 1% more than the
 * rate they picked. That is also why this is not `futureValue(0, …)`, which compounds monthly
 * because a SIP does.
 */
export function inflated(amount: number, years: number, inflationPct: number): number {
  return Math.round(amount * (1 + inflationPct / 100) ** years)
}

export function band(
  monthly: number,
  years: number,
  existingCorpus: number,
  rates: readonly { label: string; ratePct: number }[],
  inflationPct: number,
  disclaimer: string,
): Projection {
  const contributed = Math.round(monthly * Math.round(years * 12)) + existingCorpus
  return {
    monthlyContribution: monthly,
    existingCorpus,
    years,
    inflationPct,
    scenarios: rates.map(({ label, ratePct }) => {
      const corpus = futureValue(monthly, years, ratePct, existingCorpus)
      return {
        label,
        ratePct,
        corpus,
        realCorpus: Math.round(corpus / (1 + inflationPct / 100) ** years),
        contributed,
      }
    }),
    disclaimer,
  }
}
