// The row of round buttons under a balance: Cleo's Add cash · Account details · Manage card.
//
// Each action is a ring with its word underneath, and the ring is an ink outline rather than
// Cleo's light-grey disc (D9). It borrows the tab bar's outlined plate, so the dial reads as
// "things you can do from here" in the app's own vocabulary; a grey disc on cream read as a
// decoration. The ring is 44pt, so the plate is the target — nothing about it is a hitSlop
// promise.
//
// The columns are a quarter of the row each and the row is centred, which is Cleo's spacing
// (plates ~87pt apart on a 393pt screen) turned into a rule: three actions sit as a centred
// group, four fill the row, five share it. A caption gets two lines inside its column, so
// "Where my money went" wraps under its own ring instead of pushing its neighbours apart, and
// three actions still fit at 320. The word sits 8pt under the ring, as Cleo's does.
//
// `busy` swaps the glyph for a spinner in place — the ring stays, so the row does not move —
// and holds the button until the work lands. `disabled` drops the ring to a hairline and the
// word to soft, which is visibly off without depending on colour alone: the state is also
// announced. Pressing is navigation or a sheet, never a commit, so there is no haptic.
import { ActivityIndicator, View } from 'react-native'
import { Glyph, type GlyphName } from '~/ui/Glyph'
import { Tap } from '~/ui/Tap'
import { Type } from '~/ui/Text'
import { cn } from '~/ui/cn'
import { color } from '@dhan/design'

export type DialAction = {
  id: string
  glyph: GlyphName
  /** The word under the ring. Two lines at most. */
  label: string
  onPress: () => void
  disabled?: boolean
  /** Working: the glyph becomes a spinner and the button holds. */
  busy?: boolean
  /** When the word alone is not the whole action, e.g. "Add money to your goal". */
  accessibilityLabel?: string
  accessibilityHint?: string
}

export function ActionDial({
  actions,
  className,
}: {
  actions: ReadonlyArray<DialAction>
  className?: string
}) {
  return (
    <View className={cn('flex-row justify-center', className)}>
      {actions.map((action) => (
        <Dial key={action.id} action={action} />
      ))}
    </View>
  )
}

function Dial({ action }: { action: DialAction }) {
  const {
    glyph,
    label,
    onPress,
    disabled = false,
    busy = false,
    accessibilityLabel,
    accessibilityHint,
  } = action

  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      accessibilityState={{ disabled, busy }}
      // The web drops `accessibilityState`: disabled arrives through the Pressable, busy here.
      aria-busy={busy}
      disabled={disabled || busy}
      haptic="none"
      onPress={onPress}
      className="min-w-target shrink basis-1/4 items-center gap-sm"
    >
      <View
        className={cn(
          'h-target w-target items-center justify-center rounded-pill border',
          disabled ? 'border-hairline' : 'border-ink',
        )}
      >
        {busy ? (
          // Hidden: the button's busy state says it is working; the spinner is only the picture.
          <ActivityIndicator color={color.ink} aria-hidden />
        ) : (
          <Glyph name={glyph} size={22} tint={disabled ? color.inkFaint : color.ink} />
        )}
      </View>
      <Type
        role="label"
        tone={disabled ? 'soft' : 'mid'}
        className="text-center"
        numberOfLines={2}
        maxFontSizeMultiplier={1.3}
      >
        {label}
      </Type>
    </Tap>
  )
}
