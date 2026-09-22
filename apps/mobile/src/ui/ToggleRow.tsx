// A white card with a name, a sentence and a switch, from Cleo's "Repay gradually".
//
// Cleo's settings put each switch in its own white card: a semibold name, a line or four of what
// it does in plain words, and the switch level with the middle of the card. The save-hack editor
// opens on one, and /connections stacks one per block of data IDBI may read, so the card has to
// carry a long sentence without the switch drifting. The text takes the width; the switch keeps
// its own.
//
// The switch is Cleo's: on a phone the platform's own, which every iOS customer can identify from
// across a room; on the web a drawn one in the same proportions, because react-native-web's is a
// 40×20 Material track with the thumb hanging off both ends — nothing like Cleo's, and small
// enough to miss. Either way it is only the picture. The press, the name, the sentence as the
// hint and the checked state belong to the slot around it, so VoiceOver and the keyboard meet one
// switch, the same one on every platform.
//
// That slot is the target, 44pt or more on both axes: the switch is 31pt tall, and a finger that
// lands just under it should still move it. It reaches into the gap and the card's padding rather
// than pushing the switch inward, so the switch is drawn where it always was. The row is still
// not a target. A row-wide press would be a bigger, kinder hit area and it is wrong here: the rest
// of the card is the sentence explaining what the switch does, and a customer reading it with a
// finger resting on the card would turn it on by accident.
//
// Off is `inkHint`, 4.7:1 on the white card. The hairline it used to be was 1.25:1 — an off
// switch that dissolved into the card and left a floating thumb. On stays the brand green, the
// thumb is white in both, and the plate turns lime when the switch is on, the same fill the app
// uses everywhere to say "this one is live".
//
// Two states a caller can put it in. `disabled` dims the card and holds the switch, for a row
// that cannot be changed right now — the other blocks on /connections while one is saving, or an
// editor whose read has not landed. `busy` swaps the switch for a spinner in the same slot, for
// the row whose own change is in flight, and still reads as a switch with its state and "busy".
import { useEffect } from 'react'
import { ActivityIndicator, Platform, Switch, View } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated'
import { Card } from '~/ui/Card'
import { Type } from '~/ui/Text'
import { GlyphPlate, type GlyphName } from '~/ui/Glyph'
import { Tap } from '~/ui/Tap'
import { to } from '~/ui/motion'
import { cn } from '~/ui/cn'
import { color, size, space } from '@dhan/design'

const web = Platform.OS === 'web'

// The drawn switch is a `plateXl` × `ring` track with a thumb `xl` across, `xxs` in from every
// edge — the platform's proportions in this app's sizes. The thumb travels what is left.
const TRAVEL = size.plateXl - space.xl - 2 * space.xxs

export function ToggleRow({
  glyph,
  title,
  detail,
  value,
  onValueChange,
  disabled = false,
  busy = false,
}: {
  glyph?: GlyphName
  title: string
  detail?: string
  value: boolean
  onValueChange: (v: boolean) => void
  /** Held: dimmed, and the switch cannot move. */
  disabled?: boolean
  /** This row's change is in flight: a spinner stands where the switch was. */
  busy?: boolean
}) {
  const held = disabled || busy

  function flip() {
    if (!held) onValueChange(!value)
  }

  return (
    <Card className={cn('flex-row items-center gap-md px-lg py-lg', disabled && 'opacity-60')}>
      {glyph === undefined ? null : (
        <GlyphPlate
          name={glyph}
          size={size.plateMd}
          fill={value ? 'bg-success' : 'bg-ground-deep'}
        />
      )}
      <View className="flex-1">
        <Type role="heading" plain>
          {title}
        </Type>
        {detail === undefined ? null : (
          <Type role="body" tone="mid" className="mt-xxs">
            {detail}
          </Type>
        )}
      </View>
      <Tap
        accessibilityRole="switch"
        accessibilityLabel={title}
        {...(detail === undefined ? {} : { accessibilityHint: detail })}
        accessibilityState={{ checked: value, disabled: held, busy }}
        aria-checked={value}
        aria-busy={busy}
        disabled={held}
        // A switch does not sink under a finger; it answers by moving.
        scale={1}
        onPress={flip}
        {...switchKeys(flip)}
        // `rounded-pill` shapes the web's focus ring round the switch rather than a box.
        className="-mx-sm min-h-target min-w-target items-center justify-center rounded-pill px-sm"
      >
        {busy ? (
          <View className="h-ring w-plate-xl items-center justify-center">
            <ActivityIndicator color={color.ink} aria-hidden />
          </View>
        ) : (
          <SwitchMark on={value} disabled={disabled} />
        )}
      </Tap>
    </Card>
  )
}

/**
 * The switch as a picture, for a control whose press, name and state are on the element around
 * it (ToggleRow's slot, set-limit's "Limit by category" row): the platform's own on a phone,
 * the drawn one on the web. Hidden from the screen reader, so the element around it is the one
 * switch it announces.
 */
export function SwitchMark({ on, disabled = false }: { on: boolean; disabled?: boolean }) {
  if (web) return <DrawnSwitch on={on} />
  return (
    <View
      style={{ pointerEvents: 'none' }}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Switch
        value={on}
        disabled={disabled}
        trackColor={{ true: color.brand, false: color.inkHint }}
        thumbColor={color.surface}
        ios_backgroundColor={color.inkHint}
      />
    </View>
  )
}

/**
 * Space for a switch on the web. react-native-web presses a focused control on Enter, and on
 * Space only when it is a button; Space is the key a switch answers to, so it is added here, and
 * it must not scroll the page. Spread onto the element with `accessibilityRole="switch"`.
 */
export function switchKeys(flip: () => void): object {
  if (!web) return {}
  return {
    onKeyDown: (e: { key: string; repeat: boolean; preventDefault: () => void }) => {
      if (e.key !== ' ' && e.key !== 'Spacebar') return
      e.preventDefault()
      if (!e.repeat) flip()
    },
  }
}

/**
 * The web's switch: a pill track and a white thumb with a hairline round it, as Cleo draws the
 * thumb. One value drives the slide and the fill, so the colour lands with the thumb, and
 * `to.state` snaps it under Reduce Motion. Seeded at rest, so a screen opened on a switch that is
 * already on shows it on instead of switching itself on in front of someone who did nothing.
 */
function DrawnSwitch({ on }: { on: boolean }) {
  const progress = useSharedValue(on ? 1 : 0)

  useEffect(() => {
    progress.value = to.state(on ? 1 : 0)
  }, [on, progress])

  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [color.inkHint, color.brand]),
  }))
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * TRAVEL }],
  }))

  return (
    <Animated.View
      aria-hidden
      style={track}
      className="h-ring w-plate-xl justify-center rounded-pill px-xxs"
    >
      <Animated.View
        style={thumb}
        className="h-xl w-xl rounded-pill border border-hairline bg-surface"
      />
    </Animated.View>
  )
}
