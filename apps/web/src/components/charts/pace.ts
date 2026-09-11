/**
 * Two questions a progress bar in this app is currently unable to answer.
 *
 * *"Where should I be by now?"* — a bar at 40% is good news on a plan that is a third of the way
 * through and bad news on one that is nearly over, and the bar draws identically either way. Every
 * goal, stage and buffer in this app has a start, an end and an as-of date sitting right beside it
 * in the view, and none of them is on screen.
 *
 * *"When does each part of this happen?"* — the roadmap is a sequence of dated stages with a
 * current one, and the Plan screen renders it as a list. A list has no length. Five stages that
 * run 6, 4, 18 and 96 months read as four equal rows.
 *
 * `paceOf` answers the first and `lanesOf` the second. Both are pure arithmetic over dates the
 * server sent, and neither of them decides a colour.
 *
 * **On the straight line.** `expected` is elapsed time, which assumes a plan accrues evenly. For a
 * monthly mandate that is exactly right — twelve of eighteen instalments paid is two thirds of the
 * way — and for a market-linked corpus it is not, because compounding back-loads. So the pace
 * reading is offered for *contribution* progress and the projection chart is what shows a corpus.
 * Handing a customer a "behind schedule" verdict computed off a straight line through a compound
 * curve would be wrong in the direction that makes people give up, which is the worst direction.
 */

/** A day number from an ISO date. UTC midnight, so no zone can shift a boundary by one. */
export function dayOf(iso: string): number {
  const ms = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(ms) ? 0 : Math.round(ms / 86_400_000)
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0)

/** How far short of the pace something has to fall before the card says so. Two points. */
const TOLERANCE = 0.02

export type PaceStatus = 'ahead' | 'on' | 'behind' | 'done'

export interface Pace {
  /** 0…1 of the target actually reached. */
  progress: number
  /** 0…1 of the window that has gone by — the mark the bar carries. */
  expected: number
  /** Where the two sit relative to each other, with a two-point tolerance either side. */
  status: PaceStatus
  /** The amount that would have to appear today to be back on pace. Zero when ahead. */
  shortfall: number
  /** Whole months left, rounded up. Zero once the end date has passed. */
  monthsLeft: number
}

export interface PaceInput {
  /** What has been reached. Rupees, months of cover, instalments — one unit for both figures. */
  achieved: number
  target: number
  startsOn: string
  completesOn: string
  asOf: string
}

/**
 * Progress against a target, and against the calendar.
 *
 * A window of zero length reads as fully elapsed rather than dividing by zero: a plan whose end
 * date is its start date is either finished or was never a plan, and both of those are "the time
 * is up", which is the honest reading and the one that does not draw a mark at NaN.
 */
export function paceOf(input: PaceInput): Pace {
  const start = dayOf(input.startsOn)
  const end = dayOf(input.completesOn)
  const now = dayOf(input.asOf)
  const span = end - start

  const expected = span > 0 ? clamp01((now - start) / span) : 1
  const target = Number.isFinite(input.target) && input.target > 0 ? input.target : 0
  const progress = target > 0 ? clamp01(input.achieved / target) : 0
  const shortfall = Math.max(0, Math.round(expected * target - input.achieved))

  const status: PaceStatus =
    progress >= 1
      ? 'done'
      : progress > expected + TOLERANCE
        ? 'ahead'
        : progress < expected - TOLERANCE
          ? 'behind'
          : 'on'

  const daysLeft = Math.max(0, end - now)
  return { progress, expected, status, shortfall, monthsLeft: Math.ceil(daysLeft / 30.44) }
}

/* ---------------------------------------------------------------- Lanes */

export type LaneState = 'done' | 'now' | 'later'

export interface Lane {
  key: string
  label: string
  /** 0…1 across the whole roadmap. `to` is never less than `from` plus the minimum. */
  from: number
  to: number
  state: LaneState
  /** How far into this lane today is, 0…1. Only meaningful on the `now` lane. */
  through: number
}

export interface LaneInput {
  key: string
  label: string
  startsOn: string
  completesOn: string
}

/**
 * A run of dated stages laid on one axis, oldest start to latest end.
 *
 * The axis is shared, which is the entire point: a stage that takes eight years has to draw eight
 * times the bar of the one that takes a year, or the picture says the roadmap is four equal steps.
 * The roadmap's last stage is usually retirement and is usually most of the axis; that is what the
 * plan actually looks like, and a customer seeing it once is worth more than four tidy rows.
 *
 * `minWidth` is the floor a lane keeps so a two-month stage beside a thirty-year one is still a
 * mark you can see and tap. It distorts, and it distorts in the only direction that is safe: the
 * short stage is the one whose *label* carries the duration, and a lane that vanished would carry
 * nothing at all. The same trade as `MIN_ARC` in `series.ts`, for the same reason.
 *
 * Stages that run at the same time — the roadmap's `ongoing` cadence — are not special-cased here.
 * They overlap on the axis, which is true, and each has its own row.
 */
export function lanesOf(
  stages: readonly LaneInput[],
  asOf: string,
  minWidth: number = 0.04,
): { lanes: Lane[]; today: number } {
  if (stages.length === 0) return { lanes: [], today: 0 }

  const spans = stages.map((s) => ({ ...s, start: dayOf(s.startsOn), end: dayOf(s.completesOn) }))
  const first = Math.min(...spans.map((s) => s.start))
  const last = Math.max(...spans.map((s) => s.end))
  const total = last - first
  const now = dayOf(asOf)

  const at = (day: number): number => (total > 0 ? clamp01((day - first) / total) : 0)

  const lanes = spans.map((s): Lane => {
    const from = at(s.start)
    const to = Math.min(1, Math.max(at(s.end), from + minWidth))
    const state: LaneState = s.end <= now ? 'done' : s.start > now ? 'later' : 'now'
    const width = s.end - s.start
    const through = width > 0 ? clamp01((now - s.start) / width) : state === 'done' ? 1 : 0
    return { key: s.key, label: s.label, from, to, state, through }
  })

  return { lanes, today: at(now) }
}
