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
