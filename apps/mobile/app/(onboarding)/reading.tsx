// Step 3b — the read.
//
// This screen exists because the work behind it is real: /view runs the derivation,
// the roadmap and the suitability pass. Narrating it beats a spinner, and the last
// line is the first true thing the app says about this specific customer, which is
// the moment the product is supposed to land.
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { Screen } from '~/ui/Screen'
import { Type } from '~/ui/Text'
import { Button } from '~/ui/Button'
import { Glyph } from '~/ui/Glyph'
import { useSnapshot } from '~/state/snapshot'
import { color } from '@dhan/design'

const LINES = [
  'Opening your accounts',
  'Reading 24 months of transactions',
  'Telling bills apart from habits',
  'Finding what you already hold',
  'Checking what you are covered for',
]

export default function ReadingStep() {
  // The read this screen narrates is the read the tabs then open on. `api.createSession` ran
  // at the OTP step, so a bearer exists and the snapshot module is armed; everything since —
  // consent, the risk answer, the goal — has moved what /view returns, so this is a genuine
  // re-read rather than a repeat. Driving it through the module instead of calling
  // `api.view()` here is what stops the answer being thrown away and fetched again.
  const { refresh, state } = useSnapshot()
  const [done, setDone] = useState(0)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const timers = LINES.map((_, i) => setTimeout(() => setDone(i + 1), 500 + i * 620))
    void refresh().finally(() => {
      const id = setTimeout(() => setReady(true), 500 + LINES.length * 620)
      timers.push(id)
    })
    return () => timers.forEach(clearTimeout)
  }, [refresh])

  const failed = state === 'error'

  return (
    <Screen
      scroll={false}
      footer={
        ready ? (
          <Button label="Keep going" onPress={() => router.push('/(onboarding)/checklist')} />
        ) : undefined
      }
    >
      <View className="flex-1 justify-center">
        <Type role="display">{ready ? "Right. I've read it." : 'Reading your money'}</Type>

        <View className="mt-xxl gap-lg">
          {LINES.map((line, i) => {
            const complete = i < done
            return (
              <Animated.View
                key={line}
                entering={FadeInDown.delay(i * 120).duration(320)}
                className="flex-row items-center gap-md"
              >
                <View
                  className={
                    complete
                      ? 'h-6 w-6 items-center justify-center rounded-pill bg-success'
                      : 'h-6 w-6 items-center justify-center rounded-pill bg-ground-deep'
                  }
                >
                  {complete ? <Glyph name="check" size={14} tint={color.ink} /> : null}
                </View>
                <Type role="body" tone={complete ? 'ink' : 'faint'}>
                  {line}
                </Type>
              </Animated.View>
            )
          })}
        </View>

        {failed ? (
          <Type role="label" tone="danger" className="mt-xl">
            I could not reach the bank, so this is the offline read. Start the API on :3001 for the
            real one.
          </Type>
        ) : null}
      </View>
    </Screen>
  )
}
