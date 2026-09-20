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
// photograph into the ink and then ended on a seam. Same gradient stops as the
// carousel, so the last screen of onboarding is built like the first.
import { View } from 'react-native'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Type } from '~/ui/Text'
import { PhotoScrim } from '~/ui/PhotoScrim'
import { Button } from '~/ui/Button'
import { useOnboarding } from '~/state/onboarding'
import readyPhoto from '../../assets/onboarding/ready.jpg'

export default function ReadyStep() {
  const { draft } = useOnboarding()

  /*
   * The name is an ornament here, not the sentence.
   *
   * The headline used to be `{firstName}, ready?` against a `'there'` fallback, which prints
   * "there, ready?" for every customer the draft has no name for — the one screen in the flow
   * that is pure welcome, opening on broken English. Writing the greeting so it stands up on
   * its own and *takes* a name when there is one means the empty case is a shorter line rather
   * than a wrong one.
   */
  const firstName = draft.customer?.name.split(' ')[0]

  return (
    <View className="flex-1 bg-hero">
      <StatusBar style="light" />

      {/* The positioning lives on a plain View and the Image only fills it, which is the
          shape `welcome.tsx` already ships on native. `absolute inset-0` directly on the
          Image renders correctly too, but expo-image is a cssInterop-registered library
          component and this keeps the layout on a core view either way. */}
      <View className="absolute inset-0">
        <Image source={readyPhoto} className="h-full w-full" contentFit="cover" transition={280} />
      </View>

      <PhotoScrim />

      {/* SafeAreaView writes all four padding values itself, zeroing the edges it is not
          managing, so the gutter has to live on a child rather than on it. */}
      <SafeAreaView edges={['bottom']} className="flex-1 justify-end">
        <View className="px-pad pb-sm">
          <Type role="display" tone="onInk">
            {firstName ? `Ready when you are,\n${firstName}` : 'Ready when you are'}
          </Type>
          <Type role="body" tone="onInk" className="mt-sm opacity-85">
            {`I’ve read your statement. Let’s go through what I found.`}
          </Type>
          <View className="mt-xl">
            <Button
              label="Meet Uday"
              variant="light"
              onPress={() => router.replace('/(tabs)/uday')}
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  )
}
