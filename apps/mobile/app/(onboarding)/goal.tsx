// Step 6 — the destination.
//
// Cleo asks "What are you saving for?" and offers four shapes rather than a free
// text box, because a named shape is something the product can plan against. Ours
// offers the five goal kinds the roadmap ladder already knows how to sequence, in
// the order it considers them — a customer who picks the long game still gets the
// safety net first, and the roadmap will say so.
//
// This is the last step, so it is also where the draft is committed: profile and
// goal go to the API together, and only now does anything exist server-side.
import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '~/ui/Screen'
import { Type } from '~/ui/Text'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { SelectCard } from '~/ui/SelectCard'
import { GOALS, useOnboarding, type GoalKind } from '~/state/onboarding'
import { api } from '~/api/client'

export default function GoalStep() {
  const { draft, set } = useOnboarding()
  const [choice, setChoice] = useState<GoalKind | null>(draft.goal)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function commit() {
    if (!choice) return
    setBusy(true)
    setError(null)
    try {
      const patch = {
        ...(draft.dependents !== null ? { dependents: draft.dependents } : {}),
        ...(draft.annualIncome !== null ? { declaredAnnualIncome: draft.annualIncome } : {}),
        ...(draft.risk !== null ? { riskProfile: draft.risk } : {}),
      }
      // A customer who skipped the optional steps has nothing to save, and the route is right
      // to refuse an empty patch — "the patch named no fields to change" is a real mistake
      // worth catching. It just is not this one, so do not make the call.
      if (Object.keys(patch).length > 0) await api.patchProfile(patch)
      set({ goal: choice })
      router.push('/(onboarding)/ready')
    } catch {
      setError('Could not save that. Check the API and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      onBack={() => router.back()}
      footer={
        <Button
          label="That's the one"
          loading={busy}
          disabled={!choice}
          onPress={() => void commit()}
        />
      }
    >
      <Type role="display">What are you{'\n'}working towards?</Type>
      <Type role="body" tone="soft" className="mt-sm">
        Pick the one that matters most. I'll sequence the rest around it.
      </Type>

      <View className="mt-xl">
        <Card className="overflow-hidden">
          {GOALS.map((g, i) => (
            <SelectCard
              key={g.kind}
              title={g.title}
              description={g.description}
              selected={choice === g.kind}
              divide={i > 0}
              onPress={() => setChoice(g.kind)}
            />
          ))}
        </Card>
      </View>

      {error ? (
        <Type role="label" tone="danger" className="mt-md">
          {error}
        </Type>
      ) : null}
    </Screen>
  )
}
