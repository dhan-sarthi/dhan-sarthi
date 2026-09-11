/**
 * The arithmetic behind every chart that has an axis: a series of numbers turned into points, and
 * points turned into a path.
 *
 * `series.ts` is the model for charts of *composition* — a whole cut into slices. This is its
 * sibling for charts of *change*: a value that moves along a run of months or years. The split is
 * real and not cosmetic. A donut has no scale, no baseline and no empty space; a line has all
 * three, and each of them is a way to mislead somebody.
 *
 * Four rules it exists to hold.
 *
 * **A magnitude is drawn from zero.** Spending, a balance, a corpus: the whole reading is "how
 * big", and a line cropped to its own range turns a 4% wobble into a mountain. `baseline: 'zero'`
 * is the default and every caller in the app uses it. `'range'` exists for the one honest case —
 * a series whose zero is not a meaningful floor — and it is a decision the caller has to type.
 *
 * **A flat series draws flat, in the middle.** Twelve identical months have no range, and a naive
 * `(v - min) / (max - min)` is `0/0`. Every one of them then lands on the same edge of the box,
 * which reads as twelve months at zero or twelve months at the top. They sit on the centre line
 * instead, which is what "nothing changed" looks like.
 *
 * **The extremes are inside the box.** A 2px stroke centred on the top edge loses half its width
 * to the viewBox, and the marker on the last point loses most of itself to the right edge. Every
 * projection insets by the box's own padding, so the geometry never depends on the SVG being
 * allowed to overflow — which it is not, inside a `Card` with `overflow-hidden` above it.
 *
 * **Nothing here reads a colour.** These functions return numbers and path strings. Which rung of
 * the ramp draws them is the component's business, and the ramp is positional there too.
 */

/** A point in the SVG's own coordinates. y grows downwards. */
export type Point = { x: number; y: number }

/**
 * The drawing area.
 *
 * `padX` and `padY` are separate because the two insets are not the same job. A sparkline runs
 * edge to edge horizontally — the card's own gutter is the margin — and insets vertically only
 * enough that a 2px stroke through the highest month keeps both of its pixels. Every chart here
 * is drawn in a normalised 100×100 viewBox stretched by CSS, so an inset given once and applied
 * to both axes would come out as 20px at the sides and 4px at the top of the same card.
 */
export type Box = { w: number; h: number; padX: number; padY: number }

/** The value range a series is drawn against. */
export type Bounds = { min: number; max: number }

/** Where a magnitude starts. `zero` unless the caller has a reason, and then it has to say so. */
export type Baseline = 'zero' | 'range'

const finite = (n: number): number => (Number.isFinite(n) ? n : 0)

function round(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * The range a series is drawn against.
 *
 * `zero` pins the floor at 0 — or at the lowest value, when a series goes negative, because a
 * refund month that draws off the bottom of the card is worse than a floor that moved. `range`
 * takes the series' own extremes.
 *
 * A range of nothing is padded to ±1 around the value, so the flat series lands on the centre
 * line rather than dividing by zero. `1` rather than a share of the value, because a flat series
 * at zero has no share to take.
 */
export function bounds(values: readonly number[], baseline: Baseline = 'zero'): Bounds {
  const list = values.map(finite)
  if (list.length === 0) return { min: 0, max: 1 }

  const lo = Math.min(...list)
  const hi = Math.max(...list)
  const min = baseline === 'zero' ? Math.min(0, lo) : lo
  const max = hi

  if (max - min <= 0) return { min: min - 1, max: max + 1 }
  return { min, max }
}

/** Where a single value sits vertically. Outside the bounds it clamps to the edge of the box. */
export function yOf(value: number, b: Bounds, box: Box): number {
  const span = b.max - b.min
  const t = span > 0 ? (finite(value) - b.min) / span : 0.5
  const clamped = Math.max(0, Math.min(1, t))
  return round(box.padY + (1 - clamped) * (box.h - box.padY * 2))
}

/**
 * Where the nth of `count` values sits horizontally.
 *
 * The first is on the left inset and the last on the right inset, so a twelve-month series
 * touches both ends of the card and the marker on the last month is whole. A series of one is
 * centred: there is no run to spread it along and a lone dot pinned to the left edge reads as a
 * chart that failed to load the rest.
 */
export function xOf(index: number, count: number, box: Box): number {
  const usable = box.w - box.padX * 2
  if (count <= 1) return round(box.padX + usable / 2)
  const i = Math.max(0, Math.min(count - 1, index))
  return round(box.padX + (i / (count - 1)) * usable)
}

/** A series as points, evenly spaced left to right. */
export function project(values: readonly number[], b: Bounds, box: Box): Point[] {
  return values.map((v, i) => ({ x: xOf(i, values.length, box), y: yOf(v, b, box) }))
}

/**
 * The line through the points.
 *
 * Straight segments, not a spline. A smoothed monthly series invents values between the months —
 * the curve dips below the lower of two adjacent points and somebody reads a month that did not
 * happen — and the wobble a spline buys is not worth a number nobody spent.
 */
export function linePath(points: readonly Point[]): string {
  if (points.length === 0) return ''
  const [first, ...rest] = points as [Point, ...Point[]]
  return `M${first.x} ${first.y}` + rest.map((p) => `L${p.x} ${p.y}`).join('')
}

/**
 * The line, closed down to a floor. The pale wash under a sparkline.
 *
 * A single point still returns a path: a zero-width area is invisible, so the wash is skipped by
 * the component and the dot carries the reading. Returning `''` here rather than a degenerate
 * `M…Z` keeps that decision in one place.
 */
export function areaPath(points: readonly Point[], floorY: number): string {
  if (points.length < 2) return ''
  const first = points[0] as Point
  const last = points[points.length - 1] as Point
  return `${linePath(points)}L${last.x} ${round(floorY)}L${first.x} ${round(floorY)}Z`
}

/**
 * The region between two lines of the same length — the projection's cautious-to-optimistic band.
 *
 * Drawn as one closed path rather than two areas stacked, because two translucent fills of the
 * same token do not make one flat region: they make a seam wherever they overlap, and at 430px
 * that seam is the most visible thing on the card.
 */
export function bandPath(upper: readonly Point[], lower: readonly Point[]): string {
  if (upper.length < 2 || upper.length !== lower.length) return ''
  const back = [...lower].reverse()
  const [first, ...rest] = back as [Point, ...Point[]]
  return (
    `${linePath(upper)}L${first.x} ${first.y}` + rest.map((p) => `L${p.x} ${p.y}`).join('') + 'Z'
  )
}

/**
 * The median of a series — the rule a sparkline is read against.
 *
 * The median and not the mean, and this is the same choice `derive.ts` makes for every figure in
 * the snapshot: one hospital bill drags a mean somewhere no month ever was. The rule on the chart
 * has to be the same statistic as the figure printed beside it, or the line crosses a level the
 * card says it is at.
 */
export function median(values: readonly number[]): number {
  const list = values.map(finite).sort((a, b) => a - b)
  if (list.length === 0) return 0
  const mid = Math.floor(list.length / 2)
  if (list.length % 2 === 1) return list[mid] as number
  return ((list[mid - 1] as number) + (list[mid] as number)) / 2
}

/**
 * How the last value compares with the rule, as a signed share of it.
 *
 * `0.18` is "18% above the median". Null where the reference is zero — a share of nothing is not
 * infinity, it is a sentence the card should not attempt.
 */
export function deltaShare(value: number, reference: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(reference) || reference === 0) return null
  return (value - reference) / Math.abs(reference)
}

/**
 * The columns of a bar sparkline: one rectangle per month, evenly pitched with a gap between.
 *
 * A line is the right mark for a *level* — a balance, a corpus — and the wrong one for a run of
 * monthly totals, which the harness made obvious the moment it was rendered: twelve months of
 * spending drawn from a zero baseline is a nearly flat line pinned to the top of a pale slab, and
 * the reading everybody actually wants from it ("which month was the bad one") takes a second look.
 * Twelve columns from the same zero baseline are the same honest scale and one glance, because the
 * eye compares twelve heights far better than it reads one shallow slope.
 *
 * The gap is a share of the pitch rather than a fixed width, so twelve columns and six columns both
 * come out looking deliberate. Columns are never narrower than `MIN_COL` of the pitch: past about
 * twenty months a bar chart on a 430px card is a comb, and the caller should be drawing a line.
 */
const MIN_COL = 0.35

export function columns(count: number, box: Box, gapShare = 0.34): { x: number; w: number }[] {
  if (count <= 0) return []
  const usable = box.w - box.padX * 2
  const pitch = usable / count
  const w = Math.max(pitch * MIN_COL, pitch * (1 - Math.max(0, Math.min(0.8, gapShare))))
  return Array.from({ length: count }, (_, i) => ({
    x: round(box.padX + pitch * i + (pitch - w) / 2),
    w: round(w),
  }))
}

/**
 * The height of a column, floored so a zero month still leaves a mark.
 *
 * A month with no spending in it is a real fact and it has to be visible as one. Drawn at its true
 * height it is nothing at all — indistinguishable from a month the chart does not have — so it
 * keeps a 1.5-unit stub, which is the same trade `MIN_ARC` makes in `series.ts`.
 */
export function columnHeight(value: number, b: Bounds, box: Box): number {
  const base = yOf(Math.max(0, b.min), b, box)
  return round(Math.max(1.5, base - yOf(value, b, box)))
}
