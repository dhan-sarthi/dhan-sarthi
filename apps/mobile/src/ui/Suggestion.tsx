// A question you are about to ask.
//
// Three things changed from what this was, and the first is the one that carries the look.
//
// **It flushes right.** The wrap used to default to `justify-start`, so three questions of
// different lengths began at the same x and the sheet read as a settings list. In the
// reference the right edge is the only aligned edge — which puts the choices on the same
// side as your own message bubble, and that is the whole reason they read as things *you*
// are about to say rather than as navigation the app is offering.
//
// **It rests lighter than the sheet, not darker.** It was `bg-ground` — cream — on a white
// sheet, which made every pill a well sunk *into* the surface it sits on, exactly inverting
// the depth system. The canvas, the sheet and the pill are now three stacked washes of
// white over one bloom, each a step lighter than the last, which is how the reference gets
// five planes out of ten points of lightness without a single shadow.
//
// **It is 46pt and it is a rounded rectangle.** It was 42pt — under the 44pt touch minimum —
// and a full capsule. A capsule is a tag, something that labels a thing; a 16pt-radius
// rectangle with the same silhouette as the message bubble is an utterance. The reference
// makes its chips and its user bubbles the same shape deliberately, so that tapping one
// visibly turns it into the other.
import { Tap } from '~/ui/Tap'
import { Type } from '~/ui/Text'

export function Suggestion({
  label,
  disabled,
  onPress,
}: {
  label: string
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      // Choosing between things, which is the haptic Pills and the TabBar already use for
      // the same gesture. These had none.
      haptic="selection"
      onPress={onPress}
      className="rounded-chip border border-hairline-soft bg-pill-wash px-lg py-md"
    >
      {/* `body` rather than `label`: 13pt is the app's metadata size, and the three things
          the customer is meant to choose between were typeset smaller than the evidence.
          15/22 with py-md lands the pill on exactly 46pt. */}
      <Type role="body" tone="ink">
        {label}
      </Type>
    </Tap>
  )
}
