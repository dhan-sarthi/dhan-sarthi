// The title row every tab opens with: the tab's name, and two quiet circular controls.
//
// The bell carries a dot while there is something urgent in the customer's findings, and
// says how many — the dot is never decoration, so it is never there without the count in the
// label. The person opens the profile sheet, which is where the record, the connections and
// the settings now live; it used to open the record directly, and the label said so.
import { View } from 'react-native'
import { router } from 'expo-router'
import { Type } from '~/ui/Text'
import { Tap } from '~/ui/Tap'
import { Glyph } from '~/ui/Glyph'
import { useSnapshot } from '~/state/snapshot'

export function TabHeader({
  title,
  onBell,
  onProfile,
}: {
  title: string
  onBell?: () => void
  onProfile?: () => void
}) {
  const { data } = useSnapshot()
  const urgent = data?.insights.filter((i) => i.severity === 'urgent').length ?? 0
  const bell = onBell ?? (() => router.push('/noticed'))
  const profile = onProfile ?? (() => router.push('/profile'))

  return (
    <View className="flex-row items-center justify-between gap-md px-pad pt-sm pb-xl">
      <Type role="display" className="flex-1" numberOfLines={1}>
        {title}
      </Type>
      <View className="flex-row gap-sm">
        {/* Small circular targets, so they take more scale than a full-width card would: 8%
            on a 40pt plate travels the same distance on screen as 3% on a 360pt button. The
            hitSlop takes the 40pt plate to the 44 a finger needs. */}
        <Tap
          accessibilityRole="button"
          accessibilityLabel={urgent > 0 ? `What I noticed, ${urgent} urgent` : 'What I noticed'}
          onPress={bell}
          scale={0.92}
          hitSlop={4}
          className="h-plate-lg w-plate-lg items-center justify-center rounded-pill bg-ground-deep"
        >
          <Glyph name="bell" size={22} />
          {urgent > 0 ? (
            <View className="absolute top-xs right-xs h-sm w-sm rounded-pill border-2 border-ground bg-danger" />
          ) : null}
        </Tap>
        <Tap
          accessibilityRole="button"
          accessibilityLabel="Profile"
          onPress={profile}
          scale={0.92}
          hitSlop={4}
          className="h-plate-lg w-plate-lg items-center justify-center rounded-pill bg-ground-deep"
        >
          <Glyph name="person" size={22} />
        </Tap>
      </View>
    </View>
  )
}
