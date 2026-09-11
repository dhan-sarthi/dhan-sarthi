/**
 * A progress bar that knows what day it is.
 *
 * `Bar` in `ui.tsx` draws one number: how much of the envelope is gone. That is the right chart for
 * a monthly allowance, where the month is the same length for everybody and the reader supplies the
 * calendar themselves. It is the wrong chart for a goal, and every goal in this app currently gets
 * it — a jar at 40% draws identically on a plan that is a third of the way through and on one that
 * finishes next month, and the second is the only one worth interrupting somebody about.
 *
 * So this bar carries a second mark: **where the plan says you should be by now**, taken from the
 * stage's own `startsOn` and `completesOn` against the session's as-of date. Three regions come out
 * of it, and they are told apart by weight, which is the documented answer here and also the more
 * informative one:
 *
 * - **solid** `chart-1` — reached. The darkest thing on the card, because it is the fact.
 * - **soft** `accent-soft` — the gap between what is reached and what today asks for. It is the
 *   only region that should not exist, and soft-against-solid is how `DESIGN.md` already draws
 *   "observed against projected".
 * - **track** `chart-idle` — the rest of the plan, which is not late and must not look it.
 *
 * The mark itself is a hairline notch standing above and below the rail, outside the rail's own
 * `overflow-hidden` — a notch clipped to the track is invisible against a filled bar, which is
 * exactly the case that matters.
 *
 * **Ahead of pace draws no soft region at all.** There is nothing to show: the solid bar has
 * already passed the notch, which is the whole reading, and a second colour celebrating it would
 * be the app congratulating itself in a place a customer is scanning for problems.
 */
import type { ReactNode } from 'react'
import { paceOf, type Pace, type PaceInput } from './pace.ts'

const width = (share: number): string => `${Math.round(share * 10000) / 100}%`

export function PaceBar({
  achieved,
  target,
  startsOn,
  completesOn,
  asOf,
  label,
}: PaceInput & {
  /** The whole bar as one sentence, for a screen reader. The figures beside it are the visual. */
  label: string
}): ReactNode {
  const pace = paceOf({ achieved, target, startsOn, completesOn, asOf })
  const behind = pace.status === 'behind'
  const gap = behind ? pace.expected - pace.progress : 0

  // `role="img"` and not `progressbar`: a progress bar has one value and this has two, and a
  // screen reader announcing 40% would drop the half of the reading that matters.
  return (
    <div className="relative" role="img" aria-label={label}>
      <div className="relative h-2.5 overflow-hidden rounded-pill bg-chart-idle">
        <span
          className="ds-bar-fill absolute inset-0 bg-chart-1"
          style={{ transform: `scaleX(${pace.progress})` }}
        />
        {gap > 0 && (
          <span
            className="ds-bar-fill absolute inset-0 bg-accent-soft"
            style={{ transform: `translateX(${width(pace.progress)}) scaleX(${gap})` }}
          />
        )}
      </div>
      {/* The notch. A sibling of the rail, not a child: the rail clips, and a mark that vanishes
          the moment the bar reaches it is a mark that only works when it does not matter. */}
      {pace.expected > 0 && pace.expected < 1 && (
        <span
          className="pointer-events-none absolute -top-1 h-[18px] w-0.5 -translate-x-1/2 rounded-pill bg-brand-deep"
          style={{ left: width(pace.expected) }}
        />
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- PaceCard */

/**
 * The bar with the two figures it needs to be honest, and the sentence that reads it.
 *
 * A pace mark with no figure beside it is a mark nobody can act on — "you are behind" without
 * "by ₹41,000" is a mood, not information — and colour is never the only channel here, so the
 * status is a word as well as a geometry.
 *
 * `on` deliberately says nothing beyond the pair of figures. A plan that is running to plan is the
 * expected case, and an app that congratulates you every time you open it stops being read.
 */
export function PaceRow({
  title,
  achieved,
  target,
  startsOn,
  completesOn,
  asOf,
  format,
  note,
}: PaceInput & {
  title: string
  /** How to print a figure in this unit — `inr` for rupees, or a months-of-cover formatter. */
  format: (n: number) => string
  /** A quieter line under the title: what the target is, when it lands. */
  note?: string | undefined
}): ReactNode {
  const pace = paceOf({ achieved, target, startsOn, completesOn, asOf })
  const onPace = Math.round(pace.expected * target)

  return (
    <div className="min-w-0 py-1">
      <div className="flex items-baseline gap-3 text-[15px] leading-snug">
        <span className="min-w-0 flex-1 truncate text-ink-mid">{title}</span>
        <span className="shrink-0 font-semibold tabular-nums text-ink">{format(achieved)}</span>
      </div>
      {note !== undefined && <p className="m-0 mt-0.5 mb-2 text-xs text-ink-soft">{note}</p>}
      <div className="mt-2">
        <PaceBar
          achieved={achieved}
          target={target}
          startsOn={startsOn}
          completesOn={completesOn}
          asOf={asOf}
          label={`${title}: ${format(achieved)} of ${format(target)}. By today the plan asks for ${format(onPace)}.`}
        />
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3 text-xs text-ink-soft">
        <span>
          {statusWord(pace)}
          {pace.status === 'behind' && (
            <span className="font-semibold text-ink"> {format(pace.shortfall)}</span>
          )}
        </span>
        <span className="tabular-nums">
          of {format(target)}
          {pace.monthsLeft > 0 && ` · ${pace.monthsLeft}mo left`}
        </span>
      </div>
    </div>
  )
}

function statusWord(pace: Pace): string {
  if (pace.status === 'done') return 'Target reached'
  if (pace.status === 'behind') return 'Behind the pace by'
  if (pace.status === 'ahead') return 'Ahead of the pace'
  return 'On pace'
}
