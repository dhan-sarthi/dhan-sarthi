import { View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { Tap } from '~/ui/Tap'
import { color } from '@dhan/design'

function Chevron({ tint }: { tint: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 19l-7-7 7-7"
        stroke={tint}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function Cross({ tint }: { tint: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6l12 12M18 6L6 18" stroke={tint} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  )
}

export function NavRow({
  onBack,
  onClose,
  dark = false,
}: {
  onBack?: (() => void) | undefined
  onClose?: (() => void) | undefined
  dark?: boolean
}) {
  const tint = dark ? color.onInk : color.ink
  return (
    <View className="h-11 flex-row items-center justify-between px-pad">
      {onBack ? (
        <Tap
          onPress={onBack}
          hitSlop={12}
          scale={0.86}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Chevron tint={tint} />
        </Tap>
      ) : (
        <View className="w-[22px]" />
      )}
      {onClose ? (
        <Tap
          onPress={onClose}
          hitSlop={12}
          scale={0.86}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Cross tint={tint} />
        </Tap>
      ) : (
        <View className="w-[22px]" />
      )}
    </View>
  )
}
