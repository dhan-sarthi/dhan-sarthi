// The handover.
//
// Cleo ends onboarding on a full-bleed photograph with the copy sitting in a dark
// band along the bottom — the only screen in the flow that is not a form, and the
// one that says the setup is over. Ours ends the same way and hands off to Uday,
// because the avatar is the product's first person and the flow should end at a
// face rather than at a dashboard.
//
// **The photograph runs the whole screen and the copy sits on top of it**, which is
// what `welcome.tsx` does four times immediately before this screen. It used to give
// the image a flex-[62] slice and the copy a flex-[38] one, which drew a hard line
// straight across the screen at the join — the flow spent five slides fading a
// photograph into the ink and then ended on a seam. Same scrim as the carousel, built
// around the copy the same way, so the last screen of onboarding is built like the first.
//
// The hand-off lands on Uday's call screen — his face and "Start a call" — not on the text
// chat. The owner's call, 22 September 2026: the face is the product, so it is the first thing a
// new customer sees when onboarding ends. The first call is briefed from the customer's
// statement and from the plan, which is built around the goal goal.tsx has just saved; that goal
// is read back here by name. It replaces rather than pushes: onboarding is finished, and the tabs
// are where the customer lives now, with one tab bar. The draft is cleared on the way out, and
// the screen reads its words once, on arrival, so the greeting does not change under the customer
// while the transition is still on screen.
import { useCallback, useState } from 'react'
import { View, type LayoutChangeEvent } from 'react-native'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Type } from '~/ui/Text'
import { PhotoScrim } from '~/ui/PhotoScrim'
import { Button } from '~/ui/Button'
import { GOALS, useOnboarding } from '~/state/onboarding'
import readyPhoto from '../../assets/onboarding/ready.jpg'

export default function ReadyStep() {
  const { draft, reset } = useOnboarding()
  const [cover, setCover] = useState<number | undefined>(undefined)

  /*
   * The name is an ornament here, not the sentence.
   *
   * The headline used to be `{firstName}, ready?` against a `'there'` fallback, which prints
   * "there, ready?" for every customer the draft has no name for — the one screen in the flow
   * that is pure welcome, opening on broken English. Writing the greeting so it stands up on
   * its own and *takes* a name when there is one means the empty case is a shorter line rather
   * than a wrong one.
   */
  const [said] = useState(() => {
    const firstName = draft.customer?.name.split(' ')[0]
    const goal = GOALS.find((g) => g.kind === draft.goal) ?? null
    return {
      title: firstName ? `Ready, ${firstName}?` : 'Ready?',
      body:
        goal === null
          ? "I've read your statement. Let's start with what matters\u00a0most."
          : // Nothing claimed about the pick beyond having heard it. It is stored and the plan is
            // built around it (see goal.tsx), but "let's start there" would be a promise the route
            // might not keep — the card at 34.8% comes before the long game — and a pick with
            // nothing to aim at leaves the engine's own goal in place. Uday says where to start.
            `I've read your statement. You're after ${goal.readBack} — ask me where to\u00a0start.`,
    }
  })

  const onCopy = useCallback((e: LayoutChangeEvent) => {
    setCover(Math.ceil(e.nativeEvent.layout.height))
  }, [])

  return (
    <View className="flex-1 bg-hero">
      <StatusBar style="light" />

      {/* The positioning lives on a plain View and the Image only fills it, which is the
          shape `welcome.tsx` already ships on native. `absolute inset-0` directly on the
          Image renders correctly too, but expo-image is a cssInterop-registered library
          component and this keeps the layout on a core view either way. */}
      <View className="absolute inset-0">
        <Image
          source={readyPhoto}
          accessible={false}
          className="h-full w-full"
          contentFit="cover"
          transition={280}
        />
      </View>

      <PhotoScrim cover={cover} />

      {/* SafeAreaView writes all four padding values itself, zeroing the edges it is not
          managing, so the gutter has to live on a child rather than on it. */}
      <SafeAreaView edges={['bottom']} className="flex-1 justify-end">
        <View onLayout={onCopy} className="px-pad pb-lg">
          <Type role="display" tone="onInk">
            {said.title}
          </Type>
          <Type role="body" tone="onInk" className="mt-sm opacity-85">
            {said.body}
          </Type>
          <View className="mt-xl">
            <Button
              label="Meet Uday"
              variant="light"
              haptic="none"
              onPress={() => {
                reset()
                router.replace('/(tabs)/uday')
              }}
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  )
}
