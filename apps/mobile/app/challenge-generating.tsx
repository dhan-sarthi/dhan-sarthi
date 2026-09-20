// "Generating your Challenge" — the dark screen between the promo and the wizard.
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
// - **A challenge is already running.** Only one can be, and the server would answer the start
//   with a 409. There is nothing to generate, so this goes straight back to the tab, which is
//   already showing the running challenge.
// - **Nothing to challenge.** No target or no length means the engine found no habit in the
//   statement. It still hands over to `/challenge`, with no pick: step one says so in its own
//   words, and that is a better place to read it than a dark screen with no way out.
// - **The read failed.** The dots stop, the screen says what did not happen, and it offers
//   another go. This is the only state where the screen grows a close button — while it is
//   working there is nothing to dismiss, and an X that flashes up for 200ms is noise.
//
// It reads `/challenges/quote` itself — that is a payload of its own, not part of the
// snapshot. Nothing here writes, so there is nothing to refresh on the way out.
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '~/ui/Screen'
import { Type } from '~/ui/Text'
import { Button } from '~/ui/Button'
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

export default function ChallengeGenerating() {
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function generate(): Promise<void> {
      const view = await api.challenges()
      if (cancelled) return

      if (view.active !== null) {
        router.replace('/(tabs)/grow')
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

    void generate().catch(() => {
      if (!cancelled) setFailed(true)
    })

    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <Screen
      dark
      scroll={false}
      {...(failed ? { onClose: () => router.back() } : {})}
      {...(failed
        ? {
            footer: (
              <Button
                label="Try again"
                onPress={() => {
                  setFailed(false)
                  setAttempt((n) => n + 1)
                }}
              />
            ),
          }
        : {})}
    >
      <View className="flex-1 justify-center">
        {failed ? null : <Thinking tone="bg-on-ink" size={9} className="mb-xl" />}
        <Type role="display" tone="onInk">
          {failed ? 'Could not read\nyour spending' : 'Generating your\nchallenge'}
        </Type>
        <Type role="body" tone="onInk" className="mt-md opacity-70">
          {failed
            ? 'A challenge is built from your own statement, and that read failed.'
            : 'Looking through your statement for the habit worth cutting.'}
        </Type>
      </View>
    </Screen>
  )
}
