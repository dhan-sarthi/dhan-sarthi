// A week of spending, as bars.
//
// There is no chart library in this repo and there is not going to be one for seven
// rectangles. `react-native-svg` is already a dependency and would draw this — but a chart
// drawn in SVG is a chart that cannot use a single class in this app: NativeWind does not
// register `Svg`, `Path` or `Rect`, so every fill, radius and gutter would have to be a prop
// carrying a raw value, and the bars would be the only surfaces in the product whose colour is
// not the same lookup as everything beside them. A row of `Animated.View`s costs one view per
// day and keeps all of that. It is also the shape `Meter` already argues for, and these bars
// are `Meter` stood on end: a fixed track, an animated fraction of it, `dur.count` because a
// bar growing is a number being said.
//
// So the idiom is copied deliberately, down to the failure it avoids. Shared value plus an
// effect, never `useDerivedValue`: a derived value whose worklet returns an animation has no
// defined first frame, and a spending chart that flashes full before settling has told the
// customer something untrue about their week for exactly as long as they needed to read it.
// Under Reduce Motion the bars are simply drawn at their height.
//
// Five decisions the captures do not make for you:
//
// **The scale is the whole set's peak, not the visible week's.** Paging back to a quiet week
// and finding its ₹200 Tuesday drawn as tall as last week's ₹4,000 Saturday is the single
// most misleading thing a paged bar chart can do. One peak across every day handed in means
// week two is *visibly* the quiet one, which is the only reason anybody pages back.
//
// **Only two bars carry their figure: today's and the week's tallest.** Cleo print one over
// every bar, and at their widths that works; at ours a 320pt phone gives each column about
// 27pt, and "₹1.25k" is wider than that, so seven figures collide into a smear. The two worth
// reading at a glance are how today is going and which day did the damage — and when those
// two stand side by side only the tallest keeps its figure, so they never overlap either.
// Every other day's amount is in the column's VoiceOver label, where width costs nothing.
//
// **A zero day still draws something.** Elapsed and zero gets the flame plate with "₹0" under
// it, because in a challenge that is the win and it deserves a mark rather than a gap.
// Everything else gets a floor of a few percent of the track, so a day that has not happened
// yet reads as measured and empty rather than as missing — an actual hole in the row looks
// like the data failed to arrive, and the future half of a running challenge is mostly holes.
//
// **The flame plate is `streak`, not `success`.** Lime is this app's "done" colour — the
// switch that is on, the wizard step that is answered — and a no-spend day is not a completed
// task. It is a run being kept, and amber is the colour this product already gives a run.
//
// **Dates are parsed at local midnight, with the `T00:00:00` spelled out.** `new Date('2026-
// 09-20')` is parsed as UTC midnight by specification, and a UTC instant rendered through a
// device's own calendar is the previous day everywhere west of Greenwich. Nothing else in the
// app has been bitten by this because nothing else prints a weekday; a chart whose columns
// are labelled Mon Tue Wed is the one place where being one day out is legible at a glance.
//
// The pager sits on the axis, at the two ends of the row of dates, the way Cleo draw it —
// not over the chart as a date range. The dates under the columns already say which week
// this is, and a heading repeating them was a second place for the same fact.
import { useEffect, useState, type ReactNode } from 'react'
import { View, useWindowDimensions } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { Type } from '~/ui/Text'
import { Tap } from '~/ui/Tap'
import { Glyph } from '~/ui/Glyph'
import { cn } from '~/ui/cn'
import { dur, stagger, timing, useReducedMotion } from '~/ui/motion'
import { rupees } from '~/lib/money'
import { color, size, space } from '@dhan/design'

export interface SpendDay {
  date: string
  spent: number
  elapsed: boolean
}

/** One page. Seven is not a number here, it is a week. */
const WEEK = 7

/**
 * The shortest bar that still reads as a bar, as a fraction of its tallest.
 *
 * Below about three percent the capsule is thinner than its own radius and renders as a
 * smudge, so every bar is held to at least this much. It only ever shows on days with no spend
 * that are not flame days — the future half of a challenge — which is exactly the run of
 * columns that would otherwise be an unexplained gap.
 */
const FLOOR = 0.035

/**
 * Below this window width the dates under the columns drop from label to caption size. With
 * the pager at both ends a 320pt phone leaves each column about 27pt, and "Wed" at label size
 * is 28 — it printed as "W…".
 */
const NARROW = 360

/** Room over the tallest bar for the figure riding on it: one line and the gap beneath it. */
const HEADROOM = space.lg + space.xs

/** How tall the peak day's bar stands, so its figure still lands inside the track. */
const TALLEST = size.track - HEADROOM

const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const WEEKDAY_SPOKEN = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

/** Local midnight, deliberately. See the header. */
function parse(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

/** Monday first, like the captures and like `DayGrid`'s header row. */
function weekdayIndex(iso: string): number | null {
  const d = parse(iso)
  return Number.isNaN(d.getTime()) ? null : (d.getDay() + 6) % 7
}

function dayOfMonth(iso: string): string {
  const d = parse(iso)
  return Number.isNaN(d.getTime()) ? '' : String(d.getDate())
}

/** The page today is on: the one holding the last elapsed day, or the first before any has. */
function currentPage(days: ReadonlyArray<SpendDay>): number {
  let last = -1
  days.forEach((d, i) => {
    if (d.elapsed) last = i
  })
  return last < 0 ? 0 : Math.floor(last / WEEK)
}

/**
 * Which columns of this week print their figure: the tallest, and today's unless it stands
 * next to the tallest. Today is the last elapsed day of the whole set, which is only on this
 * page when this page is the current week.
 */
function figured(days: ReadonlyArray<SpendDay>, week: ReadonlyArray<SpendDay>): Set<number> {
  const out = new Set<number>()
  let tallest = -1
  week.forEach((d, i) => {
    const best = week[tallest]
    if (d.elapsed && d.spent > 0 && (best === undefined || d.spent > best.spent)) tallest = i
  })
  if (tallest >= 0) out.add(tallest)

  const elapsed = days.filter((d) => d.elapsed)
  const today = elapsed[elapsed.length - 1]
  const at = today === undefined ? -1 : week.findIndex((d) => d.date === today.date)
  const shown = week[at]
  if (shown !== undefined && shown.spent > 0 && (tallest < 0 || Math.abs(at - tallest) !== 1)) {
    out.add(at)
  }
  return out
}

export function SpendBars({
  days,
  format,
}: {
  days: ReadonlyArray<SpendDay>
  format: (n: number) => string
}) {
  const pages = Math.max(1, Math.ceil(days.length / WEEK))
  const current = Math.min(pages - 1, currentPage(days))

  // Opens on today's page, not the first — and not the last either, which is what it used to
  // open on: three days into a fortnight the last page is seven days that have not happened,
  // drawn as seven empty stubs. A running challenge is read from today backwards; the customer
  // wants to know how this week is going, and paging to find it every time would be the app
  // making them ask.
  const [page, setPage] = useState(current)

  // Adjusted during render rather than in an effect, the way `InsightCarousel` does it: when
  // the clock moves today onto the next page, the frame that shows it is already on that page
  // instead of painting once on the page today used to be on.
  const [shown, setShown] = useState(current)
  if (shown !== current) {
    setShown(current)
    setPage(current)
  }

  const reduced = useReducedMotion()
  const axis = useWindowDimensions().width < NARROW ? 'caption' : 'label'

  if (days.length === 0) return null

  const here = Math.max(0, Math.min(pages - 1, page))
  const week = days.slice(here * WEEK, here * WEEK + WEEK)
  const peak = days.reduce((max, d) => (d.spent > max ? d.spent : max), 0)
  const marked = figured(days, week)
  const paged = pages > 1
  // A short last page keeps seven slots, so a bar stands in the same place and at the same
  // width on every page rather than two days stretching across the whole card.
  const slots = Array.from({ length: WEEK }, (_, i) => week[i] ?? null)

  return (
    <View>
      <View className="flex-row border-b border-hairline">
        {paged ? <View className="w-ring" /> : null}
        {slots.map((d, i) =>
          d === null ? (
            <View key={`empty-${i}`} className="flex-1" />
          ) : (
            <Column
              // The date, not the index. Paging swaps every column's meaning, and keying on the
              // position would leave seven bars animating from last week's heights to this
              // week's — a travel nobody asked for between two unrelated sets of numbers.
              key={d.date}
              day={d}
              peak={peak}
              format={format}
              figure={marked.has(i)}
              delay={reduced ? 0 : stagger(i)}
            />
          ),
        )}
        {paged ? <View className="w-ring" /> : null}
      </View>

      <View className="mt-sm flex-row items-center">
        {paged ? (
          <Step
            direction="back"
            label="Previous week"
            disabled={here === 0}
            onPress={() => setPage(here - 1)}
          />
        ) : null}
        {/* Hidden from VoiceOver: every column above already says its own date. */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="flex-1 flex-row"
        >
          {slots.map((d, i) => (
            <View key={d?.date ?? `empty-${i}`} className="flex-1 items-center">
              {d === null ? null : (
                <>
                  <Type role={axis} tone="mid" numberOfLines={1} maxFontSizeMultiplier={1.2}>
                    {WEEKDAY[weekdayIndex(d.date) ?? 0]}
                  </Type>
                  <Type role={axis} tone="mid" numberOfLines={1} maxFontSizeMultiplier={1.2}>
                    {dayOfMonth(d.date)}
                  </Type>
                </>
              )}
            </View>
          ))}
        </View>
        {paged ? (
          <Step
            direction="forward"
            label="Next week"
            disabled={here === pages - 1}
            onPress={() => setPage(here + 1)}
          />
        ) : null}
      </View>
    </View>
  )
}

function Column({
  day,
  peak,
  format,
  figure,
  delay,
}: {
  day: SpendDay
  peak: number
  format: (n: number) => string
  /** Print the amount over the bar. See `figured`. */
  figure: boolean
  delay: number
}) {
  const zeroDay = day.elapsed && day.spent <= 0
  const fraction = peak > 0 ? day.spent / peak : 0
  const index = weekdayIndex(day.date)
  const name = index === null ? '' : `${WEEKDAY_SPOKEN[index]} `

  return (
    <View
      accessible
      accessibilityLabel={`${name}${dayOfMonth(day.date)}, ${
        day.elapsed ? rupees(day.spent) : 'to come'
      }`}
      className="h-track flex-1 items-center justify-end"
    >
      {zeroDay ? (
        <>
          <View className="h-ring w-ring items-center justify-center rounded-pill bg-streak">
            <Glyph name="flame" size={16} tint={color.ink} />
          </View>
          <Figure className="mt-xs mb-xs">{format(0)}</Figure>
        </>
      ) : (
        <>
          {figure ? <Figure className="mb-xs">{format(day.spent)}</Figure> : null}
          <Bar
            fraction={Math.max(FLOOR, Math.min(1, fraction))}
            tone={day.elapsed ? 'bg-ink' : 'bg-ink/10'}
            delay={delay}
          />
        </>
      )}
    </View>
  )
}

/**
 * The amount over a bar. Allowed to run wider than its column — a figure is wider than the
 * bar it names — which `figured` makes safe by never marking two neighbours.
 */
function Figure({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <View className={cn('-mx-lg items-center', className)}>
      <Type role="label" weight="semibold" plain numberOfLines={1} maxFontSizeMultiplier={1.2}>
        {children}
      </Type>
    </View>
  )
}

function Bar({ fraction, tone, delay }: { fraction: number; tone: string; delay: number }) {
  const reduced = useReducedMotion()
  const grown = useSharedValue(reduced ? fraction : 0)

  useEffect(() => {
    grown.value = reduced ? fraction : withDelay(delay, withTiming(fraction, timing(dur.count)))
  }, [fraction, delay, grown, reduced])

  // Points rather than a percentage of the column: the column also holds the figure riding on
  // the bar, and a percentage of that would move every bar whenever a figure came or went.
  const fill = useAnimatedStyle(() => ({ height: grown.value * TALLEST }))

  return <Animated.View style={fill} className={cn('w-lg rounded-pill', tone)} />
}

function Step({
  direction,
  label,
  disabled,
  onPress,
}: {
  direction: 'back' | 'forward'
  label: string
  disabled: boolean
  onPress: () => void
}) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      haptic="selection"
      disabled={disabled}
      // A 28pt plate, so the target is widened to 48 rather than the plate drawn bigger.
      hitSlop={10}
      // A 28pt plate needs far more than the default 3% to register as pressed; `Tap` says so
      // and this is the size it means.
      scale={0.88}
      onPress={onPress}
      className="h-ring w-ring items-center justify-center rounded-pill bg-ground-deep"
    >
      <Glyph
        name={direction === 'back' ? 'chevronLeft' : 'chevronRight'}
        size={16}
        tint={disabled ? color.inkFaint : color.ink}
      />
    </Tap>
  )
}
