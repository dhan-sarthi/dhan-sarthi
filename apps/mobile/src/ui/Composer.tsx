// The open question.
//
// This was two 56pt objects side by side — a field and a circle with an 8pt gap — which is
// the default shape of every chat app shipped since about 2014. The reference builds one
// object instead: a single capsule with the round button nested inside its right edge, so
// there is one input and one accent rather than two blocks competing for the same row. The
// button sits at 44pt inside a 56pt field with a 6pt inset, and the text is padded clear of
// it so a long question never runs underneath.
//
// Two failures fixed here that were not cosmetic:
//
//   - The placeholder was `inkFaint` on cream: **1.99:1**. "Ask about your money" was
//     effectively invisible, which meant the one open-text affordance on the screen never
//     announced itself. It is now `inkHint`, a token added for this, at 4.6:1 on the field.
//   - The field itself was `bg-ground` on a white sheet — 1.12:1, no border, no shadow — so
//     the input had no perceptible boundary either. It is now the opaque near-white the
//     reference reserves for exactly two things: what you typed, and what you are about to
//     type. Those are the only opaque surfaces on the screen, which is what makes them lift
//     off it without using any colour.
//
// The single-line constraint is load-bearing and is left alone: `multiline` makes
// react-native-web swallow Enter, so `onSubmitEditing` stops firing and the one gesture
// everybody expects of a composer does nothing.
//
// Two things the reference puts beside the field rather than in it. A mark to the left of the
// capsule (Cleo's lightning bolt), which is `leading` here and is the screen's to fill — the
// chat puts its suggestions toggle there. And a field that grows instead of clipping: the
// height was fixed at 56, so at the largest text setting the question was cut through its
// middle. It is a minimum now, and the font scale is capped at 1.6× so the capsule never
// becomes a slab.
import { useRef, type ReactNode } from 'react'
import { TextInput, View, useWindowDimensions } from 'react-native'
import { Tap } from '~/ui/Tap'
import { Glyph } from '~/ui/Glyph'
import { cn } from '~/ui/cn'
import { color, control } from '@dhan/design'

export function Composer({
  value,
  onChangeText,
  onSend,
  busy,
  leading,
}: {
  value: string
  onChangeText: (v: string) => void
  onSend: () => void
  busy: boolean
  /** A 44pt control to the left of the field. */
  leading?: ReactNode
}) {
  const armed = value.trim().length > 0 && !busy
  const inset = (control.height - control.sendSize) / 2
  // At 320pt, with the mark beside it, the field has ~160pt for words and "Ask me about your
  // money" needs 177 — it was cut off mid-word. The shorter line says the same thing.
  const { width } = useWindowDimensions()
  const hint = width < 360 ? 'Ask about your money' : 'Ask me about your money'

  // See the note on `onKeyPress` below. Collapses every path to the same send — Enter on the
  // web, the keyboard's Send key, and the button — into one call per gesture.
  const latch = useRef(false)
  const sendOnce = (_from: 'submit' | 'key' | 'tap'): void => {
    if (latch.current) return
    latch.current = true
    requestAnimationFrame(() => {
      latch.current = false
    })
    onSend()
  }

  return (
    <View className="flex-row items-center gap-xs">
      {leading}
      <View className="relative flex-1 justify-center">
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={() => sendOnce('submit')}
          /*
           * Two paths to one send, and on the web target BOTH of them fire.
           *
           * `onSubmitEditing` is the native path (a phone keyboard's Send key); `onKeyPress` was
           * added for react-native-web, where Enter is handled by the DOM. The note here used to
           * say the web path was "untested but inert if the event does not arrive". It arrives —
           * and so does `onSubmitEditing`, so one Enter sent the question twice.
           *
           * Both copies passed every guard downstream, because each guard reads React state that
           * the first call has only *scheduled*: `typed` is still non-empty and `busy` is still
           * false when the second handler runs in the same tick. So the screen fired two
           * identical `/ask` requests, appended two answers, and minted two turn ids from the
           * same `Date.now()` — which is where "Encountered two children with the same key" came
           * from. One bug, three symptoms.
           *
           * A ref is the fix rather than more state, because the whole problem is that state
           * updates are not visible to the second handler in the same tick. The latch clears on
           * the next frame, which is long after both handlers for one keypress have run.
           */
          onKeyPress={(e) => {
            if ((e.nativeEvent as { key?: string }).key === 'Enter') sendOnce('key')
          }}
          editable={!busy}
          placeholder={busy ? 'Working it out…' : hint}
          placeholderTextColor={color.inkHint}
          returnKeyType="send"
          maxLength={500}
          maxFontSizeMultiplier={1.6}
          accessibilityLabel="Ask Uday a question"
          style={{ minHeight: control.height, paddingRight: control.sendSize + inset * 2 }}
          // The full-weight hairline rather than the soft one the pills take: the field sits at
          // the bottom of the sheet where the bloom has already washed out, and at 7% its edge
          // disappeared into the surface it was supposed to be a well in. The text starts 24pt
          // in, clear of the capsule's curve, where the reference starts it.
          className="rounded-pill border border-hairline bg-surface-raised pl-xl text-body font-normal text-ink"
        />

        <Tap
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !armed }}
          disabled={!armed}
          haptic="light"
          onPress={() => sendOnce('tap')}
          scale={0.9}
          style={{
            position: 'absolute',
            right: inset,
            width: control.sendSize,
            height: control.sendSize,
          }}
          className={cn(
            'items-center justify-center rounded-pill',
            // `bg-ink/30` rather than the `/25` this used to carry: Button already states the
            // disabled fill for the whole app and two near-identical alphas is drift.
            armed ? 'bg-ink' : 'bg-ink/30',
          )}
        >
          <Glyph name="send" size={20} tint={color.onInk} />
        </Tap>
      </View>
    </View>
  )
}
