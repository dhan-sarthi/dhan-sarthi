/*
 * The choices on the two screens that set a customer's profile.
 *
 * They lived in `ProfileSheet.tsx` and `Onboarding.tsx` as byte-identical copies, and the copies
 * drifted: the onboarding picker labelled the `Conservative` value "Careful" long after the fuller
 * screen had stopped, so the screen that set the value and the screen that read it back disagreed
 * on its name. One list, imported twice, is the fix — a divergence here is not a cosmetic one,
 * because `riskProfile` is what `RISK_CEILING` refuses a product against.
 */

export const EMPLOYMENT = [
  { id: 'Salaried', label: 'Salaried' },
  { id: 'Self-employed', label: 'Self-employed' },
  { id: 'Business', label: 'Business' },
] as const

/*
 * `Conservative`, not `Careful`.
 *
 * The value is the one the customer is read back: `RISK_CEILING` in
 * `packages/core/src/suitability.ts` refuses a product with the sentence "Your profile says
 * Conservative and this is rated Very High". A control that calls it something else is asking
 * someone to recognise a word they were never shown.
 */
export const RISK = [
  { id: 'Conservative', label: 'Conservative' },
  { id: 'Balanced', label: 'Balanced' },
  { id: 'Growth', label: 'Growth' },
] as const

export const MARITAL = [
  { id: 'Single', label: 'Single' },
  { id: 'Married', label: 'Married' },
] as const

export const REGIME = [
  { id: 'new', label: 'New regime' },
  { id: 'old', label: 'Old regime' },
] as const

export type EmploymentId = (typeof EMPLOYMENT)[number]['id']
export type RiskId = (typeof RISK)[number]['id']
export type RegimeId = (typeof REGIME)[number]['id']
