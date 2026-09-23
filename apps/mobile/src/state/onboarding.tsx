// What the onboarding flow has collected so far.
//
// The steps write here and only the last one talks to the API, so a customer who
// backs out halfway has changed nothing on the server. That is deliberate: the
// profile patch and the goal both cut a new roadmap version, and a half-finished
// signup should not appear in the audit record as advice the bank gave.
//
// The draft also forgets itself when the bearer goes. Someone who logs out from Profile and
// signs in again must not find the last person's number, answers and goal already filled in,
// so the provider listens for the token being dropped and starts again from empty. Log out
// only has to drop the token; it never has to know this module exists.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CustomerSummary, GoalKind, RiskProfile } from '@dhan/contracts'
import { getToken, onTokenChange } from '~/api/client'

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

export const EMPTY: Draft = {
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

  // Every bearer change fires this, the one that arrives at the mobile step included; only the
  // one that leaves nothing behind clears the draft.
  useEffect(
    () =>
      onTokenChange(() => {
        void getToken()
          .then((token) => {
            if (token === null) setDraft(EMPTY)
          })
          .catch(() => undefined)
      }),
    [],
  )

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

/** The step "Two things about you" is done once both of its screens have been answered. */
export function aboutDone(draft: Draft): boolean {
  return draft.dependents !== null && draft.annualIncome !== null && draft.risk !== null
}

/**
 * The five goal kinds, in the order the roadmap ladder considers them. The ready screen reads
 * the chosen one back to the customer before the hand-off to Uday.
 *
 * `readBack` is that read-back, in Uday's voice. The titles are the customer's own words ("Clear
 * what I owe", "Cover for my family") and read wrongly inside his sentence: "You're after clear
 * what I owe".
 */
export const GOALS: ReadonlyArray<{
  kind: GoalKind
  title: string
  description: string
  readBack: string
}> = [
  {
    kind: 'emergency_fund',
    title: 'A safety net',
    description: 'Enough saved to last a few months without income',
    readBack: 'a safety net',
  },
  {
    kind: 'debt_payoff',
    title: 'Clear what I owe',
    description: 'Clear what costs most, first',
    readBack: 'clearing what you owe',
  },
  {
    kind: 'protection',
    title: 'Cover for my family',
    description: 'Look after the people who depend on\u00a0me',
    readBack: 'cover for your family',
  },
  {
    kind: 'wealth_target',
    title: 'Something specific',
    description: 'A house, a car, a wedding — I have a number in mind',
    readBack: 'something specific',
  },
  {
    kind: 'retirement',
    title: 'The long game',
    description: 'Build towards the year I stop working',
    readBack: 'the long game',
  },
]

/**
 * The one question the risk step asks.
 *
 * `prompt` is the question, set as the screen's title. `lead` is the line under it, the one
 * thing worth knowing before answering — that nothing is being marked, and what the answer
 * is for. They live together so the question and its framing cannot drift apart.
 */
export const RISK_QUESTION: {
  prompt: string
  lead: string
  options: ReadonlyArray<{ value: RiskProfile; title: string; description: string }>
} = {
  prompt: 'Your investment drops 20% in a month. What\u00a0do you do?',
  lead: 'No right answer. It sets the ceiling on what I can\u00a0suggest.',
  options: [
    {
      value: 'Conservative',
      title: 'Sell it',
      description: "I wouldn't sleep through that",
    },
    {
      value: 'Balanced',
      title: 'Sit tight',
      description: "It goes up and down. That's the deal.",
    },
    { value: 'Growth', title: 'Buy more', description: 'Same thing, cheaper' },
  ],
}
