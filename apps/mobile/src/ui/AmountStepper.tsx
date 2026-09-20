// The − amount + control, from Cleo's "Set your limit".
//
// Two design decisions carry it.
//
// **The step is proportional, not fixed.** Cleo work in dollars where ₹100 and $100 are not
// the same gesture. A ₹500 step on a ₹47,000 envelope is ninety-four taps to cross it; a
// ₹5,000 step on a ₹4,000 cap overshoots to zero on the first press. So the step is a round
// figure derived from the number itself, which keeps the control to roughly the same number
// of presses whatever the scale.
//
// **Press-and-hold repeats.** A stepper without repeat is a stepper nobody uses twice, and
// the repeat accelerates after the first second because the coarse part of the journey is at
// the start. Cleared on release *and* on unmount — a timer left running after the screen
// closes will happily go on calling `onChange` into a dead component.
import { useEffect, useRef } from 'react'
import { View } from 'react-native'
import { Type } from '~/ui/Text'
import { Tap } from '~/ui/Tap'
import { Glyph } from '~/ui/Glyph'
import { cn } from '~/ui/cn'
import { color } from '@dhan/design'

/** A round step for the scale in hand: ₹100 under ₹5k, ₹500 under ₹50k, ₹1,000 above. */
export function stepFor(value: number): number {
  if (value < 5_000) return 100
  if (value < 50_000) return 500
  return 1_000
}

export function AmountStepper({
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  format,
  size = 'lg',
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  format: (n: number) => string
  size?: 'lg' | 'sm'
}) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const held = useRef(0)

  const stop = () => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    held.current = 0
  }
  useEffect(() => stop, [])

  const clamp = (n: number): number => Math.max(min, Math.min(max, n))
  const nudge = (dir: 1 | -1) => onChange(clamp(value + dir * stepFor(value)))

  const start = (dir: 1 | -1) => {
    nudge(dir)
    stop()
    timer.current = setInterval(() => {
      held.current += 1
      // Accelerates once the press stops reading as a tap: five steps a beat after a second.
      const times = held.current > 8 ? 5 : 1
      for (let i = 0; i < times; i += 1) nudge(dir)
    }, 120)
  }

  const big = size === 'lg'
  const plate = big ? 'h-12 w-12' : 'h-9 w-9'

  return (
    <View className="flex-row items-center justify-between gap-md">
      <StepButton
        name="minus"
        className={plate}
        disabled={value <= min}
        onIn={() => start(-1)}
        onOut={stop}
      />
      <View
        className={cn('flex-1 items-center rounded-lg bg-ground-deep', big ? 'py-lg' : 'py-md')}
      >
        <Type role={big ? 'display' : 'heading'}>{format(value)}</Type>
      </View>
      <StepButton
        name="plus"
        className={plate}
        disabled={value >= max}
        onIn={() => start(1)}
        onOut={stop}
      />
    </View>
  )
}

function StepButton({
  name,
  className,
  disabled,
  onIn,
  onOut,
}: {
  name: 'plus' | 'minus'
  className: string
  disabled: boolean
  onIn: () => void
  onOut: () => void
}) {
  return (
    <Tap
      haptic="selection"
      disabled={disabled}
      onPressIn={disabled ? undefined : onIn}
      onPressOut={onOut}
      className={cn(
        'items-center justify-center rounded-pill',
        className,
        disabled ? 'bg-ground-deep' : 'bg-ink',
      )}
    >
      <Glyph name={name} size={20} tint={disabled ? color.inkFaint : color.onInk} />
    </Tap>
  )
}
