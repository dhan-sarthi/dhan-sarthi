import { View } from 'react-native'
import { Type } from '~/ui/Text'
import { router } from 'expo-router'
import { Tap } from '~/ui/Tap'
import { Glyph } from '~/ui/Glyph'

/** The title row every tab opens with: the tab's name, and two quiet circular controls. */
export function TabHeader({
  title,
  onBell,
  onProfile,
}: {
  title: string
  onBell?: () => void
  onProfile?: () => void
}) {
  const bell = onBell ?? (() => router.push('/noticed'))
  const profile = onProfile ?? (() => router.push('/record'))
  return (
    <View className="flex-row items-center justify-between px-pad pt-sm pb-lg">
      <Type role="display">{title}</Type>
      <View className="flex-row gap-sm">
        {/* Small circular targets, so they take more scale than a full-width card would: 8%
            on a 40pt plate travels the same distance on screen as 3% on a 360pt button. */}
        <Tap
          accessibilityRole="button"
          accessibilityLabel="What I noticed"
          onPress={bell}
          scale={0.92}
          className="h-10 w-10 items-center justify-center rounded-pill bg-ground-deep"
        >
          <Glyph name="bell" size={19} />
        </Tap>
        <Tap
          accessibilityRole="button"
          accessibilityLabel="Your record"
          onPress={profile}
          scale={0.92}
          className="h-10 w-10 items-center justify-center rounded-pill bg-ground-deep"
        >
          <Glyph name="person" size={19} />
        </Tap>
      </View>
    </View>
  )
}
