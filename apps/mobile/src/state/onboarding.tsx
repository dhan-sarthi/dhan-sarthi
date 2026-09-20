// What the onboarding flow has collected so far.
//
// The steps write here and only the last one talks to the API, so a customer who
// backs out halfway has changed nothing on the server. That is deliberate: the
// profile patch and the goal both cut a new roadmap version, and a half-finished
// signup should not appear in the audit record as advice the bank gave.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { CustomerSummary, GoalKind, RiskProfile } from '@dhan/contracts'

/**
 * The goal kinds and the risk answers come from `@dhan/contracts` — `GoalKindSchema` and
 * `RiskProfileSchema`, which `PATCH /profile` enforces and `packages/core` advises from.
 *
 * They used to be restated here by hand, which is the same hand-copying of the wire that
 * `src/api/view.ts` did before it was deleted. **That is what broke.** There was a fourth
 * risk answer in the local union, `Moderate`, with the nicest copy of the four — "move some
 * out" — and no schema downstream has it, so every signup that chose it died on a 400 three
 * screens later, at the step that commits the whole draft. A hand-written union is checked
 * against nothing.
 *
 * Re-exported so the steps keep taking the names from the draft they are filling in, and so
 * that a value outside either union is now a compile error rather than a 400 the customer
 * meets three screens on. Do not "fix" a future mismatch by mapping the odd one out onto its
 * nearest neighbour — the risk profile lands in an audit record that has to say what the
 * customer actually answered.
 */
export type { GoalKind, RiskProfile } from '@dhan/contracts'

export type Draft = {
  mobile: string
  customer: CustomerSummary | null
  dependents: number | null
  annualIncome: number | null
  risk: RiskProfile | null
  goal: GoalKind | null
}

const EMPTY: Draft = {
  mobile: '',
  customer: null,
  dependents: null,
  annualIncome: null,
  risk: null,
  goal: null,
}

type Ctx = { draft: Draft; set: (patch: Partial<Draft>) => void; reset: () => void }

const OnboardingContext = createContext<Ctx | null>(null)

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const value = useMemo<Ctx>(
    () => ({
      draft,
      set: (patch) => setDraft((d) => ({ ...d, ...patch })),
      reset: () => setDraft(EMPTY),
    }),
    [draft],
  )
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}

export function useOnboarding(): Ctx {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error('useOnboarding outside OnboardingProvider')
  return ctx
}

/** The five goal kinds, in the order the roadmap ladder considers them. */
export const GOALS: Array<{ kind: GoalKind; title: string; description: string }> = [
  {
    kind: 'emergency_fund',
    title: 'A safety net',
    description: 'Enough saved to last a few months without income',
  },
  {
    kind: 'debt_payoff',
    title: 'Clear what I owe',
    description: 'Clear my expensive debt first',
  },
  {
    kind: 'protection',
    title: 'Cover for my family',
    description: 'Look after the people who depend on me',
  },
  {
    kind: 'wealth_target',
    title: 'Something specific',
    description: 'A house, a car, a wedding — I have a number in mind',
  },
  {
    kind: 'retirement',
    title: 'The long game',
    description: 'Build towards the year I stop working',
  },
]

export const RISK_QUESTION: {
  prompt: string
  options: Array<{ value: RiskProfile; title: string; description: string }>
} = {
  prompt: 'Your investment drops 20% in a month. What do you do?',
  options: [
    {
      value: 'Conservative',
      title: 'Sell it',
      description: 'I would not sleep through that',
    },
    {
      value: 'Balanced',
      title: 'Sit tight',
      description: 'It goes up and down. That is the deal.',
    },
    { value: 'Growth', title: 'Buy more', description: 'Same thing, cheaper' },
  ],
}
