// Step 3b — the read.
//
// This screen exists because the work behind it is real: /view runs the derivation,
// the roadmap and the suitability pass. Narrating it beats a spinner, and the last
// line is the first true thing the app says about this specific customer, which is
// the moment the product is supposed to land.
//
// The narration never gets ahead of the read. Lines land on their own clock, but the last one
// waits for the answer, and a read that fails stops the list where it stood — ticking "Sizing
// your safety net" over a request that never came back would be the first false thing the
// app said. Each step wears the checklist's plate, so the three states look the same here as
// they do on the next screen: done, working on it, not yet.
//
// Three ways it can go, each with a way on. The read lands: "Next" wakes up — it is on screen,
// off, from the start, so the list does not jump up the page the moment the read finishes. It
// fails: say so, and offer it again or the choice to carry on without it. It hangs: after eight
// seconds say that too, with a Try again, rather than leaving a customer to guess.
//
// A screen reader hears the narration as it happens: each line is announced as it lands, and
// the list is a polite live region for the readers that listen for one instead.
import { useCallback, useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Platform, View } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '~/ui/Screen'
import { Type } from '~/ui/Text'
import { Button, ButtonStack } from '~/ui/Button'
import { Reveal } from '~/ui/Reveal'
import { StepPlate, type ChecklistState } from '~/ui/Checklist'
import { useSnapshot } from '~/state/snapshot'
import { size } from '@dhan/design'

const LINES = [
  'Reading your statement',
  'Working out what goes out each month',
  'Checking what you owe',
  'Sizing your safety net',
  'Sequencing your plan',
]

/** When the first line lands, and the beat between the rest. */
const FIRST_MS = 500
const BEAT_MS = 620
/** How long a read may take before the screen admits it is taking a while. */
const SLOW_MS = 8000

const SPOKEN: Record<ChecklistState, string> = {
  done: 'done',
  current: 'in progress',
  locked: 'not started',
}

export default function ReadingStep() {
  // The read this screen narrates is the read the tabs then open on. `api.createSession` ran
  // at the mobile step, so a bearer exists and the snapshot module is armed; consent has moved
  // what /view returns since, so this is a genuine re-read rather than a repeat. Driving it
  // through the module instead of calling `api.view()` here is what stops the answer being
  // thrown away and fetched again.
  const { refresh, state } = useSnapshot()
  const [attempt, setAttempt] = useState(0)
  const [ticked, setTicked] = useState(0)
  const [settled, setSettled] = useState(false)
  const [slow, setSlow] = useState(false)

  // Every timer an attempt starts is held here and cleared with it: leaving the screen, or
  // trying again, must not let an old line land or an old read flip the state.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    let alive = true
    setTicked(0)
    setSettled(false)
    setSlow(false)
    const mine = LINES.map((_, i) =>
      setTimeout(
        () => {
          if (alive) setTicked(i + 1)
        },
        FIRST_MS + i * BEAT_MS,
      ),
    )
    mine.push(
      setTimeout(() => {
        if (alive) setSlow(true)
      }, SLOW_MS),
    )
    timers.current = mine
    void refresh().finally(() => {
      if (alive) setSettled(true)
    })
    return () => {
      alive = false
      mine.forEach(clearTimeout)
    }
  }, [refresh, attempt])

  const failed = settled && state === 'error'

  // A failed read stops the narration where it stood.
  useEffect(() => {
    if (failed) timers.current.forEach(clearTimeout)
  }, [failed])

  // The last line is the read itself: it cannot land before the answer does, and it never
  // lands on a read that failed.
  const done = Math.min(ticked, settled && !failed ? LINES.length : LINES.length - 1)
  const ready = settled && !failed && done === LINES.length

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  // Say each line as it lands; the live region below covers the readers that listen for one.
  useEffect(() => {
    if (Platform.OS !== 'ios') return
    if (ready) AccessibilityInfo.announceForAccessibility("Right. I've read it.")
    else if (failed) AccessibilityInfo.announceForAccessibility("I couldn't reach the bank.")
    else if (done > 0) AccessibilityInfo.announceForAccessibility(`${LINES[done - 1]}, done`)
  }, [done, ready, failed])

  return (
    <Screen
      scroll={false}
      footer={
        failed ? (
          <ButtonStack>
            <Button label="Try again" haptic="none" onPress={retry} />
            <Button
              label="Keep going anyway"
              variant="secondary"
              haptic="none"
              onPress={() => router.push('/(onboarding)/checklist')}
            />
          </ButtonStack>
        ) : (
          <Button
            label="Next"
            haptic="none"
            disabled={!ready}
            onPress={() => router.push('/(onboarding)/checklist')}
          />
        )
      }
    >
      <View className="flex-1 justify-center">
        <Type role="display">{ready ? "Right. I've read it." : 'Reading your money'}</Type>

        <View accessibilityLiveRegion="polite" aria-live="polite" className="mt-xxl gap-lg">
          {LINES.map((line, i) => {
            const at: ChecklistState = i < done ? 'done' : i === done ? 'current' : 'locked'
            return (
              <Reveal key={line} i={i}>
                <View
                  accessible
                  accessibilityLabel={`${line}, ${SPOKEN[at]}`}
                  className="flex-row items-center gap-md"
                >
                  <StepPlate n={i + 1} state={at} size={size.ring} />
                  <Type role="body" tone={at === 'locked' ? 'soft' : 'ink'} className="flex-1">
                    {line}
                  </Type>
                </View>
              </Reveal>
            )
          })}
        </View>

        {failed ? (
          <Type role="body" tone="danger" accessibilityRole="alert" className="mt-xl">
            I couldn't reach the bank.
          </Type>
        ) : slow && !settled ? (
          <View className="mt-xl gap-md">
            <Type role="caption" tone="mid">
              This is taking longer than usual.
            </Type>
            <Button size="sm" variant="secondary" label="Try again" haptic="none" onPress={retry} />
          </View>
        ) : null}
      </View>
    </Screen>
  )
}
