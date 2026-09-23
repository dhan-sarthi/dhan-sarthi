// Step 5 — risk profile.
//
// SEBI requires this before any advice, and the engine uses it as a hard ceiling:
// Conservative can be shown nothing above Moderate. So it is asked as a single
// behavioural question rather than a five-part quiz — the ceiling is coarse, and
// pretending to measure it finely would be dressing.
//
// Cleo's quiz shape: the question is the title, one line under it, then a card of answers. The
// question is set at title size rather than display so it reads as a question and not a
// headline — at display it ran to four lines on a small phone and left "do?" on its own. The
// answers are one radio group, so a screen reader hears "2 of 3" and knows the set is closed.
import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '~/ui/Screen'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { SelectCard } from '~/ui/SelectCard'
import { leave } from '~/ui/NavRow'
import { RISK_QUESTION, useOnboarding, type RiskProfile } from '~/state/onboarding'

export default function RiskStep() {
  const { draft, set } = useOnboarding()
  const [choice, setChoice] = useState<RiskProfile | null>(draft.risk)

  return (
    <Screen
      step={4}
      steps={5}
      onBack={() => leave('/(onboarding)/about')}
      title={RISK_QUESTION.prompt}
      titleRole="title"
      subtitle={RISK_QUESTION.lead}
      footer={
        <Button
          label="Next"
          haptic="none"
          disabled={choice === null}
          onPress={() => {
            if (choice === null) return
            set({ risk: choice })
            router.push('/(onboarding)/goal')
          }}
        />
      }
    >
      <View className="mt-xl">
        <Card
          accessibilityRole="radiogroup"
          accessibilityLabel={RISK_QUESTION.prompt}
          className="overflow-hidden"
        >
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
