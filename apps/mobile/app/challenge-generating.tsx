// "Building your challenge" — the dark screen between the promo and the wizard, Cleo's
// "Generating your Challenge".
//
// Cleo's version is theatre. It is a fixed delay with a progress animation over it, shown so
// that a list the app already had reads as something that was worked out; the same pattern
// runs in a dozen products and it is a lie told at a moment when the customer is inclined to
// believe it. Ours is the same screen with the delay taken out, and it is worth being exact
// about why rather than just copying the picture: **the wait here is the request.** This
// screen is on the stack for precisely as long as `/api/v1/challenges` and
// `/api/v1/challenges/quote` take to answer, and it leaves the frame after the second one
// lands. On a warm local API that is a blink, and a blink is the correct length — a bank app
// that pauses for two seconds to look clever has spent the customer's time on its own image.
//
// What it is actually waiting for is a recommendation. The engine picks one target across
// both lists (`recommended` is true on exactly one of them) and one length, and the quote for
// that pair carries the recommended limit. Those four facts are a whole challenge, which is
// what lets `/challenge` open on its review step with the card already drawn — Cleo's flow,
// where the interstitial is followed by the generated challenge and not by step one. Arriving
// at the wizard by the other door, "Create my own", skips this screen entirely and starts at
// step one with nothing chosen.
//
// It replaces itself rather than pushing, so the back gesture from the wizard returns to the
// Grow tab and not to a dead loading screen that would immediately generate a second time.
//
// Three endings other than the happy one, and none of them strands the customer:
//
// - **A challenge is still running.** Only one can be, and the server would answer the start
//   with a 409. There is nothing to generate, so this pops back to the tabs on Grow's Challenges
//   pane, which is showing the running one. A challenge whose days are over does not count: the
//   server lets a new one start over a finished one, and turning the customer away from a
//   generator because of a challenge that has already ended was a dead end.
// - **Nothing to challenge.** No target or no length means the engine found no habit in the
//   statement. It still hands over to `/challenge`, with no pick: step one says so in its own
//   words, and that is a better place to read it than a dark screen with no way out.
// - **The read failed.** The dots stop, the screen says what did not happen, and it offers
//   another go or the wizard with nothing chosen. A read that never answers counts: the client
//   has no timeout of its own, so this screen keeps one, and past `PATIENCE` the wait is treated
//   as the failure it almost certainly is rather than left spinning.
//
// The × is there the whole time, working or failed. On a warm API the screen is a blink and the ×
// sits exactly where the wizard's own × lands, so it reads as one control staying put; on a read
// that hangs it is the way out, and on the web, where there is no back gesture, the only one.
//
// The line under the title is a live region and the failure is an alert, and on iOS, which has no
// live regions, the failure is announced outright: a customer listening for the result of a wait
// should hear how it ended without having to go looking.
//
// Back to the tabs is a pop to them, never a push or a replace: either would mount a second tab
// navigator over the first — a second tab bar, and a back gesture that lands on the first.
//
// It reads `/challenges/quote` itself — that is a payload of its own, not part of the
// snapshot. Nothing here writes, so there is nothing to refresh on the way out.
import { useEffect, useState } from 'react'
import { AccessibilityInfo, Platform, View } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '~/ui/Screen'
import { leave } from '~/ui/NavRow'
import { Type } from '~/ui/Text'
import { Button, ButtonStack } from '~/ui/Button'
import { Thinking } from '~/ui/Thinking'
import { api } from '~/api/client'
import type { ChallengeView, TargetSpend } from '@dhan/contracts'

/** The engine's pick, or the biggest thing it found if nothing carries the flag. */
function pickTarget(view: ChallengeView): TargetSpend | null {
  const all = [...view.targets.merchants, ...view.targets.categories]
  const flagged = all.find((t) => t.recommended)
  if (flagged !== undefined) return flagged
  // Both lists arrive biggest first, but they are two lists, so the head of the merged pair is
  // not necessarily the larger of the two heads. Reduce rather than index.
  return all.reduce<TargetSpend | null>(
    (best, t) => (best === null || t.spent > best.spent ? t : best),
    null,
  )
}

/** Likewise for the length: the flagged one, else the first the server offered. */
function pickDays(view: ChallengeView): number | null {
  const flagged = view.lengths.find((l) => l.recommended)
  if (flagged !== undefined) return flagged.days
  return view.lengths[0]?.days ?? null
}

/** What VoiceOver is told when the reads did not come back; the screen says it in two lines. */
const FAILED = "Couldn't build one. Try again."

/**
 * How long the two reads get before the wait is called a failure. Both are reads of a statement
 * the server already holds and answer in well under a second; fifteen is generous on a poor
 * connection and still short of the point where a customer gives up on the screen.
 */
const PATIENCE = 15_000

export default function ChallengeGenerating() {
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    // Set by a failure, the timeout or the unmount, whichever comes first. After it nothing else may
    // act — in particular a late answer must not whisk away a failure already on screen.
    let cancelled = false

    function fail(): void {
      if (cancelled) return
      cancelled = true
      setFailed(true)
      if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(FAILED)
    }

    const timer = setTimeout(fail, PATIENCE)

    async function generate(): Promise<void> {
      const view = await api.challenges()
      if (cancelled) return

      if (view.active !== null && !view.active.complete) {
        router.dismissTo({ pathname: '/(tabs)/grow', params: { pane: 'challenges' } })
        return
      }

      const target = pickTarget(view)
      const days = pickDays(view)
      if (target === null || days === null) {
        router.replace('/challenge')
        return
      }

      const quote = await api.quoteChallenge(target.target.kind, target.target.name, days)
      if (cancelled) return

      // The recommended tier is the easiest of the three, deliberately — a challenge nobody
      // finishes teaches nothing. Falling back to the first is only a guard: `suggestLimits`
      // always flags one, and an empty list would mean the target has no spend at all.
      const option = quote.options.find((o) => o.recommended) ?? quote.options[0]
      router.replace({
        pathname: '/challenge',
        params: {
          kind: target.target.kind,
          name: target.target.name,
          days: String(days),
          ...(option === undefined
            ? {}
            : { limit: String(option.limit), saving: String(option.predictedSaving) }),
        },
      })
    }

    void generate()
      .catch(fail)
      .finally(() => clearTimeout(timer))

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [attempt])

  return (
    <Screen
      dark
      scroll={false}
      onClose={() => leave('/(tabs)/grow')}
      {...(failed
        ? {
            footer: (
              <ButtonStack>
                <Button
                  label="Try again"
                  variant="light"
                  onPress={() => {
                    setFailed(false)
                    setAttempt((n) => n + 1)
                  }}
                />
                <Button
                  label="Choose my own"
                  variant="outlineLight"
                  haptic="none"
                  onPress={() => router.replace('/challenge')}
                />
              </ButtonStack>
            ),
          }
        : {})}
    >
      <View className="flex-1 justify-center">
        {failed ? null : (
          <Thinking
            tone="bg-on-ink"
            size={9}
            accessibilityLabel="Building your challenge"
            className="mb-xl"
          />
        )}
        <Type
          role="display"
          tone="onInk"
          {...(failed ? { accessibilityRole: 'alert' as const } : {})}
        >
          {failed ? "Couldn't build one" : 'Building your challenge'}
        </Type>
        <Type role="body" tone="onInk" accessibilityLiveRegion="polite" className="mt-md">
          {failed
            ? "Your statement didn't load. Try again, or pick one yourself."
            : 'Reading the last few weeks of your statement for a habit worth cutting.'}
        </Type>
      </View>
    </Screen>
  )
}
