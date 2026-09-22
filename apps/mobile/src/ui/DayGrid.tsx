// The month of a challenge, as one dot per day.
//
// `SpendBars` answers "how much, on which day"; this answers the only other question a
// challenge raises, which is "how many of these did I get right". Seven across, so a column is
// a weekday and the customer can see that it is Fridays that go wrong — that is the whole
// reason this exists alongside the bars rather than instead of them, and it is why the first
// day of the challenge is padded into its real weekday column instead of being dropped in the
// top-left corner. A challenge that starts on a Thursday starts in the fourth column.
//
// Which is also the one thing `columns` changes. At seven the grid is a calendar and gets the
// weekday header and the leading pad; at any other width it is a plain run of days in order,
// because there is no honest header for a five-wide grid and a pad computed against one would
// silently shift every dot. The prop exists for the narrow card the Save pane puts this in,
// not as a general layout knob.
//
// **Nothing here animates, and that is a decision rather than an omission.** Everything else in
// this app that changes colour does it on `dur.state` because a customer is looking at the
// control at the moment it changes: the switch they just flipped, the wizard step they just
// answered. Nobody is looking at a dot when it changes. A day flips from pending to spent
// behind a refetch or a clock advance, which re-renders the whole pane around it, and
// twenty-eight shared values tinting in unison inside that re-render is a light show over a
// record of the past. The bars carry this screen's motion; the grid is the receipt.
//
// **Today is not marked, and that is the same kind of decision.** A ring around the current
// day was drawn and taken out: the boundary between the ink dots and the grey ones *is* today,
// the grid already says it once, and a second marker is a second thing that can be wrong — on
// a day with no data the ring and the boundary disagree and the customer has to work out which
// of the two to believe.
//
// Dates parse at local midnight with the `T00:00:00` spelled out, for the reason `SpendBars`
// argues at length: a bare ISO date is UTC by specification, and a grid whose columns are
// weekdays is where being one day out shows.
//
// **A dot says its state in a mark as well as a colour.** A kept day carries a tick and an
// over day a dash, the way Cleo mark theirs, because ink against danger-soft against a grey
// wash is a distinction a colour-blind customer cannot make — and the whole grid is that one
// distinction repeated. Each day is its own element for VoiceOver ("Day 3, over"), and the
// weekday header row reads once as the summary, since seven initials read one by one say
// nothing.
import { View } from 'react-native'
import { Type } from '~/ui/Text'
import { Glyph } from '~/ui/Glyph'
import { cn } from '~/ui/cn'
import { color } from '@dhan/design'

export interface DayGridDay {
  date: string
  spent: number
  elapsed: boolean
}

const WEEK = 7

/** Monday first, matching the captures and `SpendBars`' column initials. */
const WEEKDAY = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

function weekdayIndex(iso: string): number {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? 0 : (d.getDay() + 6) % WEEK
}

export function DayGrid({
  days,
  limitPerDay,
  columns = WEEK,
}: {
  days: ReadonlyArray<DayGridDay>
  limitPerDay: number
  columns?: number
}) {
  const first = days[0]
  if (first === undefined) return null

  const cols = Math.max(1, Math.round(columns))
  const calendar = cols === WEEK
  // A percentage rather than `flex-1` with a gap: a wrapping row cannot carry both a gap and a
  // fractional width without the last cell of each line falling to the next one. The cells
  // divide the width exactly and the dot inside each keeps its own size, which is what stops a
  // five-column grid from drawing dinner plates.
  // `as const` on the template rather than on the object: it is what gives the value the
  // `${number}%` literal type React Native's `DimensionValue` wants, where a plain `string`
  // would not compile.
  const cell = { width: `${100 / cols}%` as const }

  const lead = calendar ? weekdayIndex(first.date) : 0
  const over = days.filter((d) => d.elapsed && d.spent > limitPerDay).length
  const elapsed = days.filter((d) => d.elapsed).length
  const summary =
    over === 0
      ? `${elapsed} days in, every one inside your daily share`
      : `${over} of ${elapsed} days went over your daily share`

  return (
    <View>
      {calendar && (
        <View accessible accessibilityLabel={summary} className="flex-row">
          {WEEKDAY.map((initial, i) => (
            <View key={i} style={cell} className="items-center pb-xs">
              <Type role="caption" tone="mid">
                {initial}
              </Type>
            </View>
          ))}
        </View>
      )}

      <View className="flex-row flex-wrap">
        {Array.from({ length: lead }, (_, i) => (
          // Empty cells, not a margin on the first dot: a margin would push the whole first row
          // across and leave its last day hanging outside the Sunday column.
          <View key={`lead-${i}`} style={cell} className="py-xs" />
        ))}

        {days.map((d, i) => {
          const state = stateOf(d, limitPerDay)
          return (
            <View key={d.date} style={cell} className="items-center py-xs">
              <View
                accessible
                accessibilityLabel={`Day ${i + 1}, ${SPOKEN[state]}`}
                className={cn(
                  'h-ring w-ring items-center justify-center rounded-pill',
                  FILL[state],
                )}
              >
                {state === 'kept' ? (
                  <Glyph name="check" size={14} tint={color.onInk} />
                ) : state === 'over' ? (
                  <Glyph name="minus" size={14} tint={color.ink} />
                ) : null}
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}

type DayState = 'kept' | 'over' | 'ahead'

const FILL: Record<DayState, string> = {
  kept: 'bg-ink',
  over: 'bg-danger-soft',
  ahead: 'bg-ink/10',
}

const SPOKEN: Record<DayState, string> = { kept: 'kept', over: 'over', ahead: 'to come' }

/**
 * Three states and no fourth.
 *
 * A day that has not happened yet is the wash of the surface underneath, because it is not a
 * result — it is a space where one will go. An elapsed day inside its share is ink, the same
 * ink as every other settled fact in the app. Over its share is `danger-soft` rather than
 * `danger`: the strong red is reserved for a figure the customer has to act on, and a single
 * Friday over budget inside a month that is otherwise fine is not that.
 *
 * `limitPerDay` at or below zero makes any spend at all a breach, which is the truthful reading
 * of a challenge with no allowance left rather than an edge case to special-case away.
 */
function stateOf(day: DayGridDay, limitPerDay: number): DayState {
  if (!day.elapsed) return 'ahead'
  return day.spent > limitPerDay ? 'over' : 'kept'
}
