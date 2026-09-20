// Step 3c — what is left.
//
// Cleo's "You're on a roll" screen: what is done gets a filled check, what is next
// gets a numbered dark circle, what is locked stays grey. It is the only screen in
// the flow that shows the shape of the whole flow, which is why it sits in the
// middle rather than at the start.
import { View } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '~/ui/Screen'
import { Type } from '~/ui/Text'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { Glyph } from '~/ui/Glyph'
import { color } from '@dhan/design'

const STEPS = [
  { title: 'Read your statement', state: 'done' as const },
  { title: 'A couple of things about you', state: 'next' as const },
  { title: 'Where you are headed', state: 'locked' as const },
]

export default function ChecklistStep() {
  return (
    <Screen
      onClose={() => router.replace('/(onboarding)/mobile')}
      footer={<Button label="Next" onPress={() => router.push('/(onboarding)/about')} />}
    >
      <Type role="display">You're nearly there</Type>

      <View className="mt-xl gap-md">
        {STEPS.map((s, i) => (
          <Card key={s.title} className={s.state === 'locked' ? 'opacity-50' : undefined}>
            <View className="flex-row items-center gap-lg px-lg py-lg">
              <View
                className={
                  s.state === 'done'
                    ? 'h-8 w-8 items-center justify-center rounded-pill bg-success'
                    : s.state === 'next'
                      ? 'h-8 w-8 items-center justify-center rounded-pill bg-ink'
                      : 'h-8 w-8 items-center justify-center rounded-pill bg-ground-deep'
                }
              >
                {s.state === 'done' ? (
                  <Glyph name="check" size={16} tint={color.ink} />
                ) : (
                  <Type role="label" tone={s.state === 'next' ? 'onInk' : 'soft'}>
                    {i + 1}
                  </Type>
                )}
              </View>
              <Type role="heading" tone={s.state === 'locked' ? 'faint' : 'ink'}>
                {s.title}
              </Type>
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  )
}
