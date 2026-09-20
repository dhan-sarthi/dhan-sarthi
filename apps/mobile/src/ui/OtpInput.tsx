// Six boxes over one hidden input.
//
// Rendering six real TextInputs means fighting focus on every keystroke and losing
// the OS autofill. One invisible input holds the value and the boxes are just a
// drawing of it, which keeps SMS autofill working.
//
// Because the boxes are a drawing, they have to do the work a real caret would: the box
// awaiting the next digit darkens its border, and each digit lands with a small settle rather
// than appearing. On a six-box code entered in two seconds that is the only signal that the
// keypress registered — and when autofill drops all six at once, they land in sequence, which
// is the one time in the flow the app gets to look quick rather than merely fast.
import { useRef } from 'react'
import { Pressable, TextInput, View } from 'react-native'
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated'
import { Type } from '~/ui/Text'
import { cn } from '~/ui/cn'
import { dur, stagger, useReducedMotion } from '~/ui/motion'

const LENGTH = 6

export function OtpInput({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const input = useRef<TextInput>(null)
  const reduced = useReducedMotion()

  // Typing one digit is one arrival and must be instant; autofill is six arrivals and reads
  // better in sequence. The difference is whether the value grew by one or by six, so the
  // stagger is applied to the burst only — a per-index delay on ordinary typing would put
  // 165ms between the key and the digit, which is indistinguishable from a slow app.
  const was = useRef(0)
  const burst = value.length - was.current > 1
  was.current = value.length

  return (
    <Pressable onPress={() => input.current?.focus()} accessibilityLabel="Verification code">
      <View className="flex-row gap-sm">
        {Array.from({ length: LENGTH }, (_, i) => {
          const char = value[i]
          const active = i === value.length
          return (
            <View
              key={i}
              className={cn(
                'h-[54px] flex-1 items-center justify-center rounded-md border bg-surface',
                active ? 'border-ink' : 'border-hairline',
              )}
            >
              {char ? (
                <Animated.View
                  // Keyed on the character so re-typing the same position re-runs the landing.
                  key={char}
                  entering={
                    reduced
                      ? FadeIn.duration(dur.tap)
                      : ZoomIn.springify()
                          .damping(17)
                          .stiffness(320)
                          .delay(burst ? stagger(i) : 0)
                  }
                >
                  <Type role="title">{char}</Type>
                </Animated.View>
              ) : null}
            </View>
          )
        })}
      </View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, LENGTH))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={LENGTH}
        autoFocus
        className="absolute h-full w-full opacity-0"
      />
    </Pressable>
  )
}
