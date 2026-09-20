// Step 5 — risk profile.
//
// SEBI requires this before any advice, and the engine uses it as a hard ceiling:
// Conservative can be shown nothing above Moderate. So it is asked as a single
// behavioural question rather than a five-part quiz — the ceiling is coarse, and
// pretending to measure it finely would be dressing.
import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '~/ui/Screen'
import { Type } from '~/ui/Text'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { SelectCard } from '~/ui/SelectCard'
import { RISK_QUESTION, useOnboarding, type RiskProfile } from '~/state/onboarding'

export default function RiskStep() {
  const { draft, set } = useOnboarding()
  const [choice, setChoice] = useState<RiskProfile | null>(draft.risk)

  return (
    <Screen
      step={5}
      steps={5}
      onBack={() => router.back()}
      footer={
        <Button
          label="Next"
          disabled={!choice}
          onPress={() => {
            set({ risk: choice })
            router.push('/(onboarding)/goal')
          }}
        />
      }
    >
      <Type role="display">{RISK_QUESTION.prompt}</Type>
      <Type role="body" tone="soft" className="mt-sm">
        There is no right answer. This sets the ceiling on what I am allowed to suggest.
      </Type>

      <View className="mt-xl">
        <Card className="overflow-hidden">
          {RISK_QUESTION.options.map((o, i) => (
            <SelectCard
              key={o.value}
              title={o.title}
              description={o.description}
              selected={choice === o.value}
              divide={i > 0}
              onPress={() => setChoice(o.value)}
            />
          ))}
        </Card>
      </View>
    </Screen>
  )
}
