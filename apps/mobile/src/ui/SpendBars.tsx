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
// Height as a percentage of the track rather than `scaleY`, for `Meter`'s reason as well —
// scaling a capsule squashes its caps into ellipses at every fraction below one.
//
// Four decisions the captures do not make for you:
//
// **The scale is the whole set's peak, not the visible week's.** Paging back to a quiet week
// and finding its ₹200 Tuesday drawn as tall as last week's ₹4,000 Saturday is the single
// most misleading thing a paged bar chart can do. One peak across every day handed in means
// week two is *visibly* the quiet one, which is the only reason anybody pages back.
//
// **A zero day still draws something.** Elapsed and zero gets the flame plate, because in a
// challenge that is the win and it deserves a mark rather than a gap. Everything else gets a
// floor of a few percent of the track, so a day that has not happened yet reads as measured
// and empty rather than as missing — an actual hole in the row looks like the data failed to
// arrive, and the future half of a running challenge is mostly holes.
//
// **The flame plate is `streak`, not `success`.** Lime is this app's "done" colour — the
// switch that is on, the wizard step that is answered — and a no-spend day is not a completed
// task. It is a run being kept, and amber is the colour this product already gives a run.
//
// **Dates are parsed at local midnight, with the `T00:00:00` spelled out.** `new Date('2026-
// 09-20')` is parsed as UTC midnight by specification, and a UTC instant rendered through a
// device's own calendar is the previous day everywhere west of Greenwich. Nothing else in the
// app has been bitten by this because nothing else prints a weekday initial; a chart whose
// columns are labelled M T W is the one place where being one day out is legible at a glance.
import { useEffect, useState } from 'react'
import { View } from 'react-native'
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
import { shortDate } from '~/lib/money'
import { color } from '@dhan/design'

export interface SpendDay {
  date: string
  spent: number
  elapsed: boolean
}

/** One page. Seven is not a number here, it is a week. */
const WEEK = 7

/**
 * The shortest bar that still reads as a bar, as a fraction of the track.
 *
 * Below about three percent of 110pt the capsule is thinner than its own radius and renders as
 * a smudge, so every bar is held to at least this much. It only ever shows on days with no
 * spend that are not flame days — the future half of a challenge — which is exactly the run of
 * columns that would otherwise be an unexplained gap.
 */
const FLOOR = 0.035

const WEEKDAY = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

/** Local midnight, deliberately. See the header. */
function parse(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

/** Monday first, like the captures and like `DayGrid`'s header row. */
function weekdayInitial(iso: string): string {
  const d = parse(iso)
  if (Number.isNaN(d.getTime())) return ''
  return WEEKDAY[(d.getDay() + 6) % 7] ?? ''
}

function dayOfMonth(iso: string): string {
  const d = parse(iso)
  return Number.isNaN(d.getTime()) ? '' : String(d.getDate())
}

export function SpendBars({
  days,
  format,
}: {
  days: ReadonlyArray<SpendDay>
  format: (n: number) => string
}) {
  const pages = Math.max(1, Math.ceil(days.length / WEEK))

  // Opens on the last page, not the first. A running challenge is read from today backwards —
  // the customer wants to know how this week is going, and paging left to find it every time
  // would be the app making them ask.
  const [page, setPage] = useState(pages - 1)

  // Adjusted during render rather than in an effect, the way `InsightCarousel` does it: when
  // the challenge gains a week the frame that shows it is already on the new last page, instead
  // of painting once on the page that used to be last.
  const [shown, setShown] = useState(pages)
  if (shown !== pages) {
    setShown(pages)
    setPage(pages - 1)
  }

  const reduced = useReducedMotion()

  if (days.length === 0) return null

  const here = Math.max(0, Math.min(pages - 1, page))
  const week = days.slice(here * WEEK, here * WEEK + WEEK)
  const peak = days.reduce((max, d) => (d.spent > max ? d.spent : max), 0)

  const first = week[0]
  const last = week[week.length - 1]
  const range =
    first === undefined || last === undefined
      ? ''
      : first.date === last.date
        ? shortDate(first.date)
        : `${shortDate(first.date)} – ${shortDate(last.date)}`

  return (
    <View>
      {pages > 1 && (
        <View className="mb-md flex-row items-center justify-between">
          <Step
            direction="back"
            label="Previous week"
            disabled={here === 0}
            onPress={() => setPage(here - 1)}
          />
          <Type role="label" tone="mid">
            {range}
          </Type>
          <Step
            direction="forward"
            label="Next week"
            disabled={here === pages - 1}
            onPress={() => setPage(here + 1)}
          />
        </View>
      )}

      <View className="flex-row items-end">
        {week.map((d, i) => (
          <Column
            // The date, not the index. Paging swaps every column's meaning, and keying on the
            // position would leave seven bars animating from last week's heights to this
            // week's — a travel nobody asked for between two unrelated sets of numbers.
            key={d.date}
            day={d}
            peak={peak}
            format={format}
            delay={reduced ? 0 : stagger(i)}
          />
        ))}
      </View>
    </View>
  )
}

function Column({
  day,
  peak,
  format,
  delay,
}: {
  day: SpendDay
  peak: number
  format: (n: number) => string
  delay: number
}) {
  const zeroDay = day.elapsed && day.spent <= 0
  const fraction = peak > 0 ? day.spent / peak : 0

  return (
    <View
      accessibilityLabel={`${shortDate(day.date)}: ${day.elapsed ? format(day.spent) : 'not yet'}`}
      className="flex-1 items-center gap-xs"
    >
      {/* The caption slot is held open whether or not it carries a figure. A future column that
          simply omits it stands its bar 15pt taller than the elapsed one beside it, and the
          baseline of a bar chart is the one line in it that cannot move. */}
      <View className="h-[15px] items-center justify-center">
        {day.elapsed && !zeroDay ? (
          <Type role="caption" tone="mid">
            {format(day.spent)}
          </Type>
        ) : null}
      </View>

      <View className="h-[110px] w-full items-center justify-end">
        {zeroDay ? (
          <View className="h-[26px] w-[26px] items-center justify-center rounded-pill bg-streak">
            <Glyph name="flame" size={15} tint={color.ink} />
          </View>
        ) : (
          <Bar
            fraction={Math.max(FLOOR, Math.min(1, fraction))}
            tone={day.elapsed ? 'bg-ink' : 'bg-ink/10'}
            delay={delay}
          />
        )}
      </View>

      <Type role="caption" tone="faint">
        {weekdayInitial(day.date)}
      </Type>
      <Type role="label" tone={day.elapsed ? 'mid' : 'faint'}>
        {dayOfMonth(day.date)}
      </Type>
    </View>
  )
}

function Bar({ fraction, tone, delay }: { fraction: number; tone: string; delay: number }) {
  const grown = useSharedValue(0)

  useEffect(() => {
    grown.value = withDelay(delay, withTiming(fraction, timing(dur.count)))
  }, [fraction, delay, grown])

  const fill = useAnimatedStyle(() => ({ height: `${grown.value * 100}%` }))

  return <Animated.View style={fill} className={cn('w-[22px] rounded-pill', tone)} />
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
      hitSlop={10}
      // A 28pt plate needs far more than the default 3% to register as pressed; `Tap` says so
      // and this is the size it means.
      scale={0.88}
      onPress={onPress}
      className="h-[28px] w-[28px] items-center justify-center rounded-pill bg-ground-deep"
    >
      <Glyph
        name={direction === 'back' ? 'chevronLeft' : 'chevronRight'}
        size={15}
        tint={disabled ? color.inkFaint : color.ink}
      />
    </Tap>
  )
}
