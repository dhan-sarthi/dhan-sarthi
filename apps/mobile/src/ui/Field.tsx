// The labelled input.
//
// Cleo floats a small permanent label above the value inside the same white card,
// which is what lets a stack of six of them stay readable without a caption under
// each one. The label never moves, so there is no float animation to get wrong.
//
// The label is drawn once and read once. The input carries it as its own name — so VoiceOver
// lands on "Mobile number, text field" rather than on a caption and then an unnamed field — and
// the drawn label is hidden from assistive tech so a swipe does not read it twice. Android and
// the web also get the label linked by id, which is how their readers expect a form to be built.
//
// Three states besides empty: focused (the card's edge goes to ink, the one sign a field has the
// keyboard when the caret is thin), `hint` (a line under the card that says what the figure is
// for) and `error` (the edge goes red and the line says what is wrong, announced as it appears).
// An error replaces the hint rather than stacking under it; the field has one thing to say.
//
// The placeholder is `inkHint`, the lightest ink that still clears 4.5:1 on white. A placeholder
// is an example of an answer, and one too faint to read is not an example of anything.
import { forwardRef, useId, useState } from 'react'
import { TextInput, View, type TextInputProps } from 'react-native'
import { Type } from '~/ui/Text'
import { cn } from '~/ui/cn'
import { color } from '@dhan/design'

// `className` is deliberately not a prop. Every caller wraps the field in a `View` for its
// layout, and the one class that matters here — the input's own — is written below. A
// `className` prop landed on `rest`, was overridden by that literal, and styled nothing.
export const Field = forwardRef<
  TextInput,
  TextInputProps & { label: string; prefix?: string; hint?: string; error?: string }
>(function Field({ label, prefix, hint, error, keyboardType, onFocus, onBlur, ...rest }, ref) {
  const id = useId()
  const [focused, setFocused] = useState(false)
  // Read after the name: what is wrong, else what it is for, else the unit a bare figure is in.
  const said = error ?? hint ?? (prefix === '₹' ? 'in rupees' : undefined)

  return (
    <View>
      <View
        className={cn(
          'rounded-md border bg-surface px-lg py-md',
          error !== undefined ? 'border-danger' : focused ? 'border-ink' : 'border-hairline',
        )}
      >
        <Type id={id} aria-hidden role="caption" tone="mid">
          {label}
        </Type>
        <View className="flex-row items-center">
          {prefix ? (
            <Type aria-hidden role="body" tone="mid" className="mr-xs">
              {prefix}
            </Type>
          ) : null}
          <TextInput
            ref={ref}
            {...(keyboardType === 'number-pad' ? { inputMode: 'numeric' as const } : {})}
            {...rest}
            {...(keyboardType === undefined ? {} : { keyboardType })}
            accessibilityLabel={label}
            aria-labelledby={id}
            {...(said === undefined ? {} : { accessibilityHint: said })}
            onFocus={(e) => {
              setFocused(true)
              onFocus?.(e)
            }}
            onBlur={(e) => {
              setFocused(false)
              onBlur?.(e)
            }}
            placeholderTextColor={color.inkHint}
            className="flex-1 py-xxs text-body font-normal text-ink"
          />
        </View>
      </View>
      {/* Present while empty, so the region exists before the message arrives in it — a live
          region that appears together with its first message is often not read at all. */}
      <View aria-live="polite">
        {error === undefined ? null : (
          <Type role="caption" tone="danger" className="mt-xs">
            {error}
          </Type>
        )}
      </View>
      {error !== undefined || hint === undefined ? null : (
        <Type role="caption" tone="mid" className="mt-xs">
          {hint}
        </Type>
      )}
    </View>
  )
})
