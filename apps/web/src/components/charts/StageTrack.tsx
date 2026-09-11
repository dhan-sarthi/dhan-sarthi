/**
 * The roadmap, on a calendar.
 *
 * `Plan` renders `roadmap.stages` as a numbered spine of cards, and `roadmap.totalMonths`,
 * `roadmap.completesOn` and `roadmap.currentStageIndex` are read by no screen at all. So the one
 * thing a plan *is* — a sequence, with lengths, that you are somewhere inside — is the one thing
 * the plan screen does not show. Four stages of six, four, eighteen and ninety-six months draw as
 * four identical rows.
 *
 * This is those stages on one shared axis. It is the chart in this set with the highest ratio of
 * information to ink, because every number it draws was already on the screen as text.
 *
 * **Weight carries the state, not hue.** Done is solid `chart-1`. The stage under way is the same
 * solid up to today, `accent-soft` beyond it, and the whole lane is ringed in `chart-1` so it is
 * the heaviest object on the axis — which is the one thing the first render of this got backwards:
 * the current stage, drawn soft and unringed, came out fainter than the stages that have not
 * started. Later stages are the pale rung inside a hairline. Solid / part-filled-and-ringed /
 * outline, and the whole picture survives being printed in grey.
 *
 * **The axis is honest about the long tail.** A retirement stage really is nine tenths of the
 * roadmap and it draws that way; `lanesOf` gives every lane a floor of 4% of the axis so a
 * two-month stage stays tappable, and the caption on each row prints the true duration.
 *
 * **The today mark lives on the axis strip, not across the rows.** A vertical rule ruled down
 * through four rows of 15px labels at 430px is noise, and the row it matters on carries it anyway:
 * the current lane changes weight exactly where today is.
 */
import type { ReactNode } from 'react'
import { lanesOf, type Lane, type LaneInput } from './pace.ts'

export interface TrackStage extends LaneInput {
  /** The figure for the row — usually `₹x a month`. Printed, never encoded in the geometry. */
  figure?: string | undefined
  /** The quiet line under the lane: the dates, the duration, what it buys. */
  caption?: string | undefined
}

const at = (share: number): string => `${Math.round(share * 10000) / 100}%`

export function StageTrack({
  stages,
  asOf,
  from,
  to,
}: {
  stages: readonly TrackStage[]
  /** The session's as-of date. Everything before it is behind you. */
  asOf: string
  /** The label under the left end of the axis — `Today`, or the month the plan started. */
  from: string
  /** The label under the right end — the month the last stage completes. */
  to: string
}): ReactNode {
  const { lanes, today } = lanesOf(stages, asOf)
  if (lanes.length === 0) return null

  return (
    <div className="min-w-0">
      {/* The axis strip. A hairline with a caret on today, and the two ends named. Every lane
          below is measured against this one line, which is what makes the rows comparable. */}
      <div className="relative mb-3 h-4">
        <span className="absolute inset-x-0 top-2 block h-px bg-hairline-mint" />
        <span
          className="absolute top-1 size-2 -translate-x-1/2 rotate-45 rounded-[1px] bg-brand-deep"
          style={{ left: at(today) }}
        />
      </div>
      <ol className="m-0 list-none p-0">
        {lanes.map((lane, i) => (
          <li key={lane.key} className="pt-4 first:pt-0">
            <div className="flex items-baseline gap-2 text-[15px] leading-snug">
              <span className="min-w-0 truncate text-ink-mid">{lane.label}</span>
              {/* The one row you are standing in, said in a word as well as in weight. A ring on
                  a 10px lane is a fine second channel and a poor only one. */}
              {lane.state === 'now' && (
                <span className="inline-flex shrink-0 rounded-pill bg-legend-chip px-2 py-[3px] text-[11px] font-semibold text-brand-deep">
                  Now
                </span>
              )}
              <span className="flex-1" />
              {stages[i]?.figure !== undefined && (
                <span className="shrink-0 font-semibold tabular-nums text-ink">
                  {stages[i]?.figure}
                </span>
              )}
            </div>
            <Rail lane={lane} />
            {stages[i]?.caption !== undefined && (
              <p className="m-0 mt-1.5 text-xs text-ink-soft">{stages[i]?.caption}</p>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex items-baseline justify-between text-[11px] text-ink-soft">
        <span>{from}</span>
        <span>{to}</span>
      </div>
    </div>
  )
}

/**
 * One stage's span on the shared axis.
 *
 * The lane is positioned rather than laid out — `left` and `width` in per cent of the same rail —
 * so two rows with the same dates line up to the pixel. A flex row of spacers would not: the
 * spacer rounds one way and the lane the other, and at 430px that is a visible stagger down the
 * left edge of a column of four.
 */
function Rail({ lane }: { lane: Lane }): ReactNode {
  const span = { left: at(lane.from), width: at(Math.max(0, lane.to - lane.from)) }
  return (
    <div className="relative mt-2 h-2.5 rounded-pill bg-chart-idle" role="presentation">
      {lane.state === 'later' ? (
        <span
          className="absolute inset-y-0 rounded-pill border border-solid border-chart-4 bg-chart-5"
          style={span}
        />
      ) : lane.state === 'done' ? (
        <span className="absolute inset-y-0 rounded-pill bg-chart-1" style={span} />
      ) : (
        /* The stage under way: dark up to today, soft beyond it, in one clipped lane so the two
           parts share the pill's rounded ends instead of each growing their own — and ringed, so
           a stage that is one month into ten still reads as the one you are standing in. */
        <span
          className="absolute inset-y-0 overflow-hidden rounded-pill border-[1.5px] border-solid border-chart-1 bg-accent-soft"
          style={span}
        >
          <span
            className="ds-bar-fill absolute inset-0 bg-chart-1"
            style={{ transform: `scaleX(${lane.through})` }}
          />
        </span>
      )}
    </div>
  )
}
