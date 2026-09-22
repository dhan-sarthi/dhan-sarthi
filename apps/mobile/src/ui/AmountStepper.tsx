// The − amount + control, from Cleo's "Set your limit".
//
// Two design decisions carry it.
//
// **The step is proportional, not fixed.** Cleo work in dollars where ₹100 and $100 are not
// the same gesture. A ₹500 step on a ₹47,000 envelope is ninety-four taps to cross it; a
// ₹5,000 step on a ₹4,000 cap overshoots to zero on the first press. So the step is a round
// figure derived from the number itself, which keeps the control to roughly the same number
// of presses whatever the scale. A caller whose scale is its own (days, percent) passes `step`.
//
// **Press-and-hold repeats.** A stepper without repeat is a stepper nobody uses twice, and
// the repeat accelerates after the first second because the coarse part of the journey is at
// the start. Cleared on release, on reaching either end, and on unmount — a timer left running
// after the screen closes will happily go on calling `onChange` into a dead component.
//
// The repeat reads the *latest* value, not the one the press began on. The interval is created
// once per press and lives for the whole hold; a `nudge` it closed over at press time would add
// one step to the same starting figure on every tick, which is exactly what it used to do —
// hold + and the figure moved once and stopped.
//
// The shape is Cleo's measured one: light plates rather than inked ones, so the figure is the
// darkest thing in the row, and the figure boxed in a hairline well with its ₹ at about 60% of
// the digits — the currency is context, the number is the answer. `inline` is the compact form
// from their category limits, where a row already has its own name on the left and the well
// would be one box too many. Every plate is a 44pt target whatever the size.
//
// For VoiceOver the figure is the control: an adjustable element named by `label`, read as its
// formatted amount, moved with a swipe up or down. The plates stay separate buttons that say
// what they do ("Increase by ₹100"), because a customer exploring by touch lands on them first.
import { useCallback, useEffect, useRef } from 'react'
import { View, useWindowDimensions, type AccessibilityActionEvent } from 'react-native'
import { Type } from '~/ui/Text'
import { Tap } from '~/ui/Tap'
import { Glyph } from '~/ui/Glyph'
import { cn } from '~/ui/cn'
import { color, space } from '@dhan/design'

/** A round step for the scale in hand: ₹100 under ₹5k, ₹500 under ₹50k, ₹1,000 above. */
export function stepFor(value: number): number {
  if (value < 5_000) return 100
  if (value < 50_000) return 500
  return 1_000
}

// "₹71,707" → "₹" and "71,707"; a figure with no leading symbol keeps everything in `digits`.
const SPLIT = /^(\D*)(.*)$/

// The inline figure holds its width while the digits change underneath it, so the plates on
// either side do not shuffle sideways on every press. Wide enough for "₹10,000".
const INLINE_FIGURE = space.xxl * 2 + space.lg

// Below this width the big figure steps down a role, as Spend's tiles do. `adjustsFontSizeToFit`
// shrinks it on iOS, but the web build ignores it and cut "₹1,86,240" to "₹1,86,2…" at 320pt.
const NARROW = 360

export function AmountStepper({
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  format,
  size = 'lg',
  step,
  disabled = false,
  layout = 'boxed',
  label = 'Amount',
  hint,
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  format: (n: number) => string
  size?: 'lg' | 'sm'
  /** A fixed step, for a scale `stepFor` does not describe. */
  step?: number
  /** Holds both plates and the adjustable figure. */
  disabled?: boolean
  layout?: 'boxed' | 'inline'
  /** What the figure is, for VoiceOver: "Spending limit", "Weekly amount". */
  label?: string
  /** One line under the figure. */
  hint?: string
}) {
  const narrow = useWindowDimensions().width < NARROW
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const held = useRef(0)
  const latest = useRef({ value, min, max, step, onChange })
  latest.current = { value, min, max, step, onChange }

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    held.current = 0
  }, [])
  useEffect(() => stop, [stop])
  useEffect(() => {
    if (disabled) stop()
  }, [disabled, stop])

  /** One step, from the latest value. False when there was nowhere left to go. */
  const nudge = useCallback(
    (dir: 1 | -1): boolean => {
      const now = latest.current
      const next = Math.max(
        now.min,
        Math.min(now.max, now.value + dir * (now.step ?? stepFor(now.value))),
      )
      // At either end the repeat has nothing left to do. The plate goes disabled here too, and a
      // Pressable that is disabled mid-press may never see its own release.
      if (next === now.value) {
        stop()
        return false
      }
      // Written through at once, so the five nudges of an accelerated tick build on each other
      // before the parent has re-rendered with the first of them.
      now.value = next
      now.onChange(next)
      return true
    },
    [stop],
  )

  const start = (dir: 1 | -1) => {
    stop()
    if (!nudge(dir)) return
    timer.current = setInterval(() => {
      held.current += 1
      // Accelerates once the press stops reading as a tap: five steps a beat after a second.
      const times = held.current > 8 ? 5 : 1
      for (let i = 0; i < times; i += 1) nudge(dir)
    }, 120)
  }

  const onAction = (e: AccessibilityActionEvent) => {
    if (disabled) return
    if (e.nativeEvent.actionName === 'increment') nudge(1)
    else if (e.nativeEvent.actionName === 'decrement') nudge(-1)
  }

  const by = format(step ?? stepFor(value))
  const inline = layout === 'inline'
  const plate = !inline && size === 'lg' ? 'h-plate-xl w-plate-xl' : 'h-target w-target'
  const shown = format(value)

  const minus = (
    <StepButton
      name="minus"
      label={`Decrease by ${by}`}
      className={plate}
      disabled={disabled || value <= min}
      onIn={() => start(-1)}
      onOut={stop}
    />
  )
  const plus = (
    <StepButton
      name="plus"
      label={`Increase by ${by}`}
      className={plate}
      disabled={disabled || value >= max}
      onIn={() => start(1)}
      onOut={stop}
    />
  )
  // The adjustable element's own props, shared by the well and the inline figure. The aria pair
  // is the same value and state again for the web, which reads nothing else.
  const adjustable = {
    accessible: true,
    accessibilityRole: 'adjustable' as const,
    accessibilityLabel: label,
    accessibilityValue: { text: shown },
    accessibilityState: { disabled },
    'aria-valuetext': shown,
    'aria-disabled': disabled,
    accessibilityActions: [{ name: 'increment' }, { name: 'decrement' }],
    onAccessibilityAction: onAction,
  }

  if (inline) {
    return (
      <View className="self-end">
        <View className="flex-row items-center gap-sm">
          {minus}
          <View {...adjustable} style={{ minWidth: INLINE_FIGURE }}>
            <Type role="body" plain numberOfLines={1} className="text-center">
              {shown}
            </Type>
          </View>
          {plus}
        </View>
        {hint === undefined ? null : (
          <Type role="caption" tone="mid" className="mt-xs text-center">
            {hint}
          </Type>
        )}
      </View>
    )
  }

  const big = size === 'lg'
  const [, lead = '', rest = ''] = SPLIT.exec(shown) ?? []
  // A figure that is all symbol ("Off") has nothing to set small beside; it is all digits.
  const [symbol, digits] = rest === '' ? ['', shown] : [lead, rest]

  return (
    <View>
      <View className="flex-row items-center justify-between gap-md">
        {minus}
        <View
          {...adjustable}
          className={cn(
            'min-w-0 flex-1 items-center rounded-md border border-hairline bg-ground-deep px-sm',
            big ? 'py-xl' : 'py-md',
          )}
        >
          {big ? (
            <View className="max-w-full flex-row items-baseline">
              {symbol === '' ? null : (
                <Type role="heading" plain className="mr-xs">
                  {symbol}
                </Type>
              )}
              <Type
                role={narrow ? 'title' : 'display'}
                plain
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                className="shrink"
              >
                {digits}
              </Type>
            </View>
          ) : (
            <Type role="heading" plain numberOfLines={1}>
              {shown}
            </Type>
          )}
        </View>
        {plus}
      </View>
      {hint === undefined ? null : (
        <Type role={big ? 'body' : 'caption'} tone="mid" className="mt-md text-center">
          {hint}
        </Type>
      )}
    </View>
  )
}

function StepButton({
  name,
  label,
  className,
  disabled,
  onIn,
  onOut,
}: {
  name: 'plus' | 'minus'
  label: string
  className: string
  disabled: boolean
  onIn: () => void
  onOut: () => void
}) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      haptic="selection"
      hitSlop={4}
      disabled={disabled}
      onPressIn={disabled ? undefined : onIn}
      onPressOut={onOut}
      className={cn('items-center justify-center rounded-pill bg-ground-deep', className)}
    >
      <Glyph name={name} size={20} tint={disabled ? color.inkFaint : color.ink} />
    </Tap>
  )
}
