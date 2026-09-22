// Cleo's checklist, in the two shapes it draws it.
//
// `rows` is the "Next steps" card on the budget pane: every step in one white card, hairlines
// between them. `cards` is the "Builder is almost yours" screen: one card per step, the steps
// still to come sunk into the ground. Same plate, same words, same announcement — the variant
// is only how much of the page the list may take. A pane where the checklist is one card among
// several uses rows; a screen whose whole job is the list uses cards.
//
// Three states are the whole vocabulary. Done is a lime plate with a ringed tick and no chevron:
// there is nothing left to do there, so it is not a way in. Current is an ink plate with a cream
// numeral and a chevron. Later is a plate one step darker than whatever it sits on — ink at 12%
// rather than a solid grey, because the same plate has to read on the white row card and on the
// sunken card, and a solid ground-deep plate vanished into the second. Its numeral is mid, not
// soft: soft on that plate measures 4.3:1, mid measures 5.1.
//
// A later step with `onPress` stays tappable. The order is a suggestion, not a gate — someone who
// wants to set a limit before confirming bills can — and the row still says "later", so a
// screen-reader user hears where it falls before choosing to go there anyway.
//
// Measured on Cleo (393pt wide): 40pt plates inset 16 from the card edge, 12 to the text on rows
// and 16 on cards, 16 above and below. On rows the hairline starts at the text, not the card
// edge, so the plates read as one unbroken column. Cards stand about 12 apart.
//
// The plate moves on one shared value along later → current → done, which is StepDots' idiom and
// for the same reason: colour, numeral and tick change as one event. It is seeded at rest, so a
// list that opens with two steps done draws them done instead of animating them in, and
// `timing()` / `to.settle` snap under Reduce Motion.
import { useEffect, type ReactNode } from 'react'
import { View } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Card } from '~/ui/Card'
import { Glyph } from '~/ui/Glyph'
import { Tap } from '~/ui/Tap'
import { ROLE, Type } from '~/ui/Text'
import { cn } from '~/ui/cn'
import { dur, timing, to } from '~/ui/motion'
import { color, size as SIZE } from '@dhan/design'

export type ChecklistState = 'done' | 'current' | 'locked'

export type ChecklistStep = {
  id: string
  title: string
  /** One short line under the title: what the step asks for. */
  detail?: string
  /** Worked out by the screen; the list never infers it from position. */
  state: ChecklistState
  /** Makes the step a way in. A locked step with `onPress` stays tappable. */
  onPress?: () => void
  accessibilityHint?: string
}

/** later → current → done. Ordered, because the plate interpolates along it. */
const LATER = 0
const CURRENT = 1
const DONE = 2

const AT: Record<ChecklistState, number> = { locked: LATER, current: CURRENT, done: DONE }
const SPOKEN: Record<ChecklistState, string> = { done: 'done', current: 'current', locked: 'later' }

// The white card, spelled on the step itself when the step is the target: a card that scales
// under a finger has to be the thing that scales, not a frame around it.
const SURFACE = 'rounded-card border border-hairline bg-surface'
const SUNK = 'rounded-card border border-transparent bg-ground-deep'

export function Checklist({
  steps,
  dense = false,
  variant = 'rows',
  className,
}: {
  steps: ReadonlyArray<ChecklistStep>
  /** A 28pt plate and a row-title line, for a checklist that sits inside a sheet or beside a rule. */
  dense?: boolean
  variant?: 'rows' | 'cards'
  className?: string
}) {
  const total = steps.length

  if (variant === 'cards') {
    return (
      <View className={cn('gap-md', className)}>
        {steps.map((step, i) => (
          <Target
            key={step.id}
            step={step}
            n={i + 1}
            total={total}
            className={cn(
              'flex-row items-center px-lg',
              dense ? 'gap-md py-md' : 'gap-lg py-lg',
              step.state === 'locked' ? SUNK : SURFACE,
            )}
          >
            <StepPlate n={i + 1} state={step.state} size={dense ? SIZE.ring : SIZE.plateLg} />
            <Words step={step} dense={dense} />
            <Chevron step={step} />
          </Target>
        ))}
      </View>
    )
  }

  return (
    <Card className={className}>
      {steps.map((step, i) => (
        <Target
          key={step.id}
          step={step}
          n={i + 1}
          total={total}
          className="flex-row items-stretch px-lg"
        >
          <View className={cn('justify-center', dense ? 'py-md' : 'py-lg')}>
            <StepPlate n={i + 1} state={step.state} size={dense ? SIZE.ring : SIZE.plateLg} />
          </View>
          {/* The text column carries the hairline, so the rule is inset to the words. */}
          <View
            className={cn(
              'ml-md flex-1 flex-row items-center gap-md',
              dense ? 'py-md' : 'py-lg',
              i > 0 && 'border-t border-hairline',
            )}
          >
            <Words step={step} dense={dense} />
            <Chevron step={step} />
          </View>
        </Target>
      ))}
    </Card>
  )
}

/**
 * The step's number on its plate, or the tick once it is done.
 *
 * Exported on its own for the screens that draw a step without a list around it — the reading
 * screen's progress lines, the Plan stage header. It is always decorative: whatever holds it says
 * which step it is.
 */
export function StepPlate({
  n,
  state,
  size = SIZE.plateLg,
}: {
  n: number
  state: ChecklistState
  size?: number
}) {
  const target = AT[state]
  const at = useSharedValue(target)
  const ticked = useSharedValue(target === DONE ? 1 : 0)

  useEffect(() => {
    at.value = withTiming(target, timing(dur.state))
    ticked.value = to.settle(target === DONE ? 1 : 0)
  }, [target, at, ticked])

  const plate = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      at.value,
      [LATER, CURRENT, DONE],
      [color.hairline, color.ink, color.success],
    ),
  }))
  // Cream on ink, mid on the later plate. Where it lands on DONE does not matter — the tick has
  // taken the plate by then — so it holds the cream rather than crossing to a colour nobody sees.
  const numeral = useAnimatedStyle(() => ({
    color: interpolateColor(
      at.value,
      [LATER, CURRENT, DONE],
      [color.inkMid, color.onInk, color.onInk],
    ),
    opacity: 1 - ticked.value,
  }))
  const tick = useAnimatedStyle(() => ({
    opacity: ticked.value,
    transform: [{ scale: ticked.value }],
  }))

  // Cleo's numeral is ~17pt on a 40pt plate; `heading` is the nearest of the seven roles. A ring
  // plate is too small for it and takes `label`, as StepDots does.
  const role = size >= SIZE.plateMd ? ROLE.heading : ROLE.label
  // The ringed tick: a ring at 45% of the plate, the tick inside at 35% — which is where the
  // 1.7 stroke lands on ~1pt and matches the ring's own hairline.
  const ring = Math.round(size * 0.45)

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: size, height: size }, plate]}
      className="items-center justify-center rounded-pill"
    >
      <Animated.Text style={numeral} className={role} maxFontSizeMultiplier={1.35}>
        {n}
      </Animated.Text>
      {/* Absolute, so the numeral does not shift sideways as the tick takes over from it. */}
      <Animated.View
        style={[{ width: ring, height: ring }, tick]}
        className="absolute items-center justify-center rounded-pill border border-ink"
      >
        <Glyph name="check" size={Math.round(size * 0.35)} tint={color.ink} />
      </Animated.View>
    </Animated.View>
  )
}

/** The press target and the announcement, one per step, whichever shape the list takes. */
function Target({
  step,
  n,
  total,
  className,
  children,
}: {
  step: ChecklistStep
  n: number
  total: number
  className: string
  children: ReactNode
}) {
  const label = `Step ${n} of ${total}, ${SPOKEN[step.state]}: ${step.title}${
    step.detail === undefined ? '' : `. ${step.detail}`
  }`
  const hint =
    step.accessibilityHint === undefined ? {} : { accessibilityHint: step.accessibilityHint }

  if (step.onPress === undefined) {
    return (
      <View
        accessible
        accessibilityLabel={label}
        {...hint}
        accessibilityState={{ disabled: step.state === 'locked' }}
        aria-disabled={step.state === 'locked'}
        className={className}
      >
        {children}
      </View>
    )
  }

  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      {...hint}
      accessibilityState={{ disabled: false }}
      haptic="none"
      scale={0.98}
      onPress={step.onPress}
      className={className}
    >
      {children}
    </Tap>
  )
}

function Words({ step, dense }: { step: ChecklistStep; dense: boolean }) {
  const locked = step.state === 'locked'
  return (
    <View className="flex-1">
      {dense ? (
        <Type role="body" weight="semibold" plain numberOfLines={2} tone={locked ? 'soft' : 'ink'}>
          {step.title}
        </Type>
      ) : (
        <Type role="heading" plain numberOfLines={2} tone={locked ? 'soft' : 'ink'}>
          {step.title}
        </Type>
      )}
      {step.detail === undefined ? null : (
        <Type role="body" tone={locked ? 'soft' : 'mid'}>
          {step.detail}
        </Type>
      )}
    </View>
  )
}

function Chevron({ step }: { step: ChecklistStep }) {
  if (step.onPress === undefined || step.state === 'done') return null
  return <Glyph name="chevronRight" size={22} tint={color.ink} />
}
