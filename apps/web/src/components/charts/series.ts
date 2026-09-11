/**
 * The chart series model — the object a donut, an allocation bar, a bar list and a legend all
 * draw, and the arithmetic that turns numbers into arcs.
 *
 * Deliberately a plain `.ts` with no JSX. The parts of a chart that can be wrong in a way nobody
 * notices are all here: an arc that closes when the data does not, a slice that inverts because
 * the gap was wider than the slice, a colour handed out by meaning instead of by position. Those
 * are tested in `series.test.ts`; the `.tsx` files are then only markup.
 *
 * Four rules it exists to hold.
 *
 * **Colour is positional, never semantic.** A slice's rung is decided by where it sits and how
 * many there are — see `tonesFor` — and "Others" always
 * takes `--chart-5`, the grey, wherever it sits. Nothing in this file looks at what a category
 * means. The source app had no such rule and ended up with the same sky blue meaning Commodities
 * on its rebalancing screens and Debt on its dashboard; a hue that means two things is worse than
 * a hue that means nothing. The Charts comment in `styles/tokens.css` records the rest of it,
 * including why the ramp is order-independent — every pair clears the colour-blindness bar, not
 * just the adjacent ones — so nothing here re-sorts a series to separate two slices.
 *
 * **A series that does not fill its whole leaves a hole.** `total` is the denominator. Omit it
 * and the whole is the sum of the values, which is what you want for quantities (rupees, units,
 * counts) — the ring closes and each share is `value / sum`. Pass `total={100}` when the values
 * are already percentages, and then a series that sums to 95 draws 95% of a ring with the last
 * 5% in `--chart-idle`, rather than being quietly restated as 63/21/11/5. The source's own
 * Market Cap donut had exactly this data — a legend of 60/20/10/05 — and its demo build closed
 * the ring by inventing a fifth, unlabelled slice. A visible hole is the honest version of that.
 *
 * **Nothing overdraws.** The whole is `max(sum, total)`, so a series that sums past its stated
 * total is rendered as proportions of its own sum instead of wrapping an arc back over the first
 * slice. Over-100 data is a caller bug, but the chart's job is to stay readable while somebody
 * finds it.
 *
 * **Five is the cap.** `collapse` folds a long tail into a single "Others"; there is no sixth
 * ramp colour and `DESIGN.md` says why adding one is not a small change.
 */

/** A position in the ramp. `1`…`5` are `--chart-1`…`--chart-5`. */
export type Tone = 1 | 2 | 3 | 4 | 5

/** How many colours the ramp has. Also the default cap on slices in one chart. */
export const RAMP = 5

/** The grey. Reserved for "Others" wherever it sits, never handed to a named category. */
const OTHERS_TONE: Tone = 5

const TONES = [1, 2, 3, 4, 5] as const

/** The label `collapse` gives the folded tail. The source spells it exactly this way. */
export const OTHERS_LABEL = 'Others'

/** Below this a wedge is a hairline, but a hairline still beats a slice that vanished. */
const MIN_ARC = 1.5

export type Slice = {
  label: string
  /**
   * Any unit, as long as one series is consistent: rupees, percentage points, fund counts.
   * Negative and non-finite values read as zero — a slice cannot have a negative arc.
   */
  value: number
  /** The figure to print, when the derived percentage is not what the screen should say. */
  display?: string | undefined
  /**
   * Forces the grey and the last position. Also inferred from the label, because every screen in
   * the source spells it `Others` and a grey slice that turns gold because somebody forgot a
   * boolean is the exact class of bug this file exists to prevent.
   */
  others?: boolean | undefined
}

export type Portion = {
  label: string
  value: number
  /** 0…1 of the whole. */
  share: number
  /** What the legend prints. */
  display: string
  tone: Tone
  others: boolean
}

export type Series = {
  portions: Portion[]
  /** 0…1 — how much of the ring or track the portions cover. Below 1 leaves an idle remainder. */
  filled: number
  /** The denominator every share was taken against. */
  whole: number
  /** Nothing to draw: no slices, or every value zero. */
  empty: boolean
}

/** A wedge ready to be drawn, in degrees from 3 o'clock, growing clockwise. */
export type Arc = { key: string; tone: Tone | 'idle'; from: number; sweep: number }

/* ---------------------------------------------------------------- Ramp classes */

/*
 * Tailwind needs the whole class name in the source to emit it, so these are lookup tables of
 * literals rather than `fill-chart-${n}`. `fill-*` and `stroke-*` resolve for the ramp because
 * `app.css` names it through `--color-*`.
 */

const FILL: Record<Tone, string> = {
  1: 'fill-chart-1',
  2: 'fill-chart-2',
  3: 'fill-chart-3',
  4: 'fill-chart-4',
  5: 'fill-chart-5',
}

const BG: Record<Tone, string> = {
  1: 'bg-chart-1',
  2: 'bg-chart-2',
  3: 'bg-chart-3',
  4: 'bg-chart-4',
  5: 'bg-chart-5',
}

/** The SVG fill utility for a tone, or the track grey for the unfilled remainder. */
export function fillOf(tone: Tone | 'idle'): string {
  return tone === 'idle' ? 'fill-chart-idle' : FILL[tone]
}

/** The background utility for a tone — legend dots and bar segments. */
export function bgOf(tone: Tone | 'idle'): string {
  return tone === 'idle' ? 'bg-chart-idle' : BG[tone]
}

/* ---------------------------------------------------------------- Model */

/** A share as a percentage, to two decimals, with the noise trimmed: `60%`, `7.58%`. */
export function pct(share: number): string {
  if (!Number.isFinite(share)) return '0%'
  return `${Math.round(share * 10000) / 100}%`
}

/** Is this the catch-all bucket? By flag, or by the label the whole source uses for it. */
export function isOthers(slice: Slice): boolean {
  return slice.others === true || slice.label.trim().toLowerCase() === OTHERS_LABEL.toLowerCase()
}

/*
 * Which rungs of the ramp a series of `count` named slices stands on.
 *
 * Walking 1,2,3,… is right when a series fills the ramp and wrong when it does not. The ramp is
 * one hue, so its rungs separate by lightness alone — about 1.8:1 between neighbours — and a
 * two-slice donut walking 1,2 draws the single worst pair in the palette at 1.88:1, two darks
 * that read as one. Two slices is also the *common* case here: a real IDBI portfolio is usually
 * debt and one other thing.
 *
 * So a short series spreads instead of crowding the dark end. Two named slices take 1 and 4 and
 * separate at 7.17:1 rather than 1.88 — the same picture, four times more legible, no second hue.
 * With an "Others" already holding the pale rung the spread shortens to 1 and 3 (3.09:1), because
 * 4 beside 5 is worse than 2 beside 1. Three and four named slices have no better arrangement
 * available and keep the plain walk.
 *
 * This does not weaken the positional rule in DESIGN.md — assignment is still by position and
 * never by meaning, and `AllocationCompare` still aligns its two series so a category keeps its
 * rung across a comparison. What it drops is the idea that a *rung* means a category across
 * unrelated charts, which was never true of a monochrome ramp: nobody reads "dark green = Equity"
 * off a wheel of five greens. They read the legend, which every slice has.
 */
const SPREAD: Record<number, readonly Tone[]> = {
  1: [1],
  2: [1, 4],
  3: [1, 2, 3],
  4: [1, 2, 3, 4],
}
const SPREAD_WITH_OTHERS: Record<number, readonly Tone[]> = {
  1: [1],
  2: [1, 3],
  3: [1, 2, 3],
}

function tonesFor(count: number, hasOthers: boolean): readonly Tone[] {
  const table = hasOthers ? SPREAD_WITH_OTHERS : SPREAD
  return table[count] ?? TONES.slice(0, hasOthers ? RAMP - 1 : RAMP)
}

function amount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * Fold a long tail into one "Others".
 *
 * A series of `max` or fewer is returned untouched, in the order it was given — this is not a
 * sorting step and the ramp does not need one. Past that, the largest `max - 1` named categories
 * survive **in their given order**, and everything else, including any "Others" that was already
 * there, is summed into a single grey bucket at the end.
 */
export function collapse(slices: readonly Slice[], max: number = RAMP): Slice[] {
  const list = slices.filter((s) => Number.isFinite(s.value))
  if (list.length <= max) return [...list]

  const named = list.map((s, i) => i).filter((i) => !isOthers(list[i] as Slice))
  const rank = (i: number) => amount((list[i] as Slice).value)
  const survivors = new Set(
    [...named].sort((a, b) => rank(b) - rank(a)).slice(0, Math.max(0, max - 1)),
  )

  const kept = list.filter((_, i) => survivors.has(i))
  const folded = list.filter((_, i) => !survivors.has(i))
  const tail = folded.reduce((n, s) => n + amount(s.value), 0)
  return [...kept, { label: OTHERS_LABEL, value: tail, others: true }]
}

/**
 * Resolve slices into shares, colours and printable figures.
 *
 * `total` is the whole the values are shares of. Omit it for quantities and the sum is the whole;
 * pass `100` when the values are already percentages, which is the only way a series that sums to
 * 95 can draw a 5% hole instead of silently restating every figure.
 */
export function series(slices: readonly Slice[], total?: number): Series {
  const values = slices.map((s) => amount(s.value))
  const sum = values.reduce((n, v) => n + v, 0)
  const target = total !== undefined && Number.isFinite(total) && total > 0 ? total : 0
  const whole = Math.max(sum, target)

  const hasOthers = slices.some(isOthers)
  const namedCount = slices.filter((slice) => !isOthers(slice)).length
  const tones = tonesFor(namedCount, hasOthers)
  let named = 0

  const portions = slices.map((slice, i): Portion => {
    const value = values[i] ?? 0
    const share = whole > 0 ? value / whole : 0
    const others = isOthers(slice)
    return {
      label: slice.label,
      value,
      share,
      display: slice.display ?? pct(share),
      tone: others ? OTHERS_TONE : (tones[named++] ?? OTHERS_TONE),
      others,
    }
  })

  return { portions, filled: whole > 0 ? sum / whole : 0, whole, empty: sum <= 0 }
}

/**
 * Align two series onto one order so a category keeps one colour in both.
 *
 * This is what makes a current-versus-recommended pair a comparison rather than two donuts that
 * happen to line up: positional colour is only meaningful across two charts if both charts run
 * the same positions. Categories are matched on their label, case- and space-insensitively; the
 * first series' order is preserved exactly and anything only the second has is appended. A
 * category missing from one side becomes a zero there, which still earns a legend row — "you
 * hold none of this and we suggest 10%" is the whole point of the screen.
 *
 * Note what this is *not*: it never re-sorts by weight. If the union is longer than `max`, both
 * sides fold the *same* categories into "Others", ranked by whichever side holds more of each,
 * so the two cards stay comparable after collapsing too.
 */
export function align(
  a: readonly Slice[],
  b: readonly Slice[],
  max: number = RAMP,
): [Slice[], Slice[]] {
  type Pair = { label: string; a: Slice | undefined; b: Slice | undefined; others: boolean }

  const index = new Map<string, Pair>()
  const order: Pair[] = []
  const put = (slice: Slice, side: 'a' | 'b'): void => {
    const key = slice.label.trim().toLowerCase()
    let pair = index.get(key)
    if (!pair) {
      pair = { label: slice.label, a: undefined, b: undefined, others: false }
      index.set(key, pair)
      order.push(pair)
    }
    pair[side] = slice
    if (isOthers(slice)) pair.others = true
  }
  a.forEach((s) => put(s, 'a'))
  b.forEach((s) => put(s, 'b'))

  const named = order.filter((p) => !p.others)
  let kept = named
  let folded = order.filter((p) => p.others)

  if (named.length + (folded.length > 0 ? 1 : 0) > max) {
    const weight = (p: Pair) => Math.max(amount(p.a?.value ?? 0), amount(p.b?.value ?? 0))
    const survivors = new Set(
      [...named].sort((x, y) => weight(y) - weight(x)).slice(0, Math.max(0, max - 1)),
    )
    kept = named.filter((p) => survivors.has(p))
    folded = [...named.filter((p) => !survivors.has(p)), ...folded]
  }

  const build = (side: 'a' | 'b'): Slice[] => {
    const rows = kept.map((pair): Slice => {
      const from = pair[side]
      const value = amount(from?.value ?? 0)
      return from?.display === undefined
        ? { label: pair.label, value }
        : { label: pair.label, value, display: from.display }
    })
    if (folded.length > 0) {
      const value = folded.reduce((n, p) => n + amount(p[side]?.value ?? 0), 0)
      rows.push({ label: OTHERS_LABEL, value, others: true })
    }
    return rows
  }

  return [build('a'), build('b')]
}

/* ---------------------------------------------------------------- Geometry */

/**
 * The wedges of a donut, in draw order, with the separating gaps already taken out.
 *
 * `gapDeg` is subtracted from each wedge and the remainder is centred in it, so the boundaries
 * stay exactly where the data puts them and the gap straddles them. Two guards:
 *
 * - A ring with one region gets no gap. A gap with nothing on the other side of it is a seam,
 *   and a seam reads as a rendering bug rather than as a separation.
 * - A wedge narrower than the gap keeps a hairline instead of inverting into a negative sweep.
 *   A 0.3% slice is unreadable at any donut size — its legend row is what carries it — but a
 *   slice that disappears entirely looks like missing data rather than like a small number.
 */
export function arcs(s: Series, gapDeg: number, minDeg: number = MIN_ARC): Arc[] {
  const wedges: { key: string; tone: Tone | 'idle'; wedge: number }[] = []
  s.portions.forEach((p, i) => {
    if (p.share > 0) wedges.push({ key: `${i}-${p.label}`, tone: p.tone, wedge: p.share * 360 })
  })
  const rest = 1 - s.filled
  if (rest > 0.0005) wedges.push({ key: 'idle', tone: 'idle', wedge: rest * 360 })

  const gap = wedges.length > 1 ? Math.max(0, gapDeg) : 0
  let cursor = 0
  return wedges.map(({ key, tone, wedge }) => {
    const sweep = Math.max(wedge - gap, Math.min(wedge, minDeg))
    const from = cursor + (wedge - sweep) / 2
    cursor += wedge
    return { key, tone, from, sweep }
  })
}

/** A gap of `px` measured along the middle of the ring, in degrees. */
export function gapDegrees(px: number, rOuter: number, rInner: number): number {
  const mid = (rOuter + rInner) / 2
  return mid > 0 ? (px / mid) * (180 / Math.PI) : 0
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

/** A point on a circle. Degrees from 3 o'clock, growing clockwise — SVG's y grows downwards. */
function point(cx: number, cy: number, r: number, deg: number): string {
  const a = (deg * Math.PI) / 180
  return `${round(cx + r * Math.cos(a))} ${round(cy + r * Math.sin(a))}`
}

/** One annulus sector — a filled slice with square-cut radial edges, as the source draws them. */
export function sector(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  from: number,
  sweep: number,
): string {
  const to = from + sweep
  const large = sweep > 180 ? 1 : 0
  return [
    `M${point(cx, cy, rOuter, from)}`,
    `A${round(rOuter)} ${round(rOuter)} 0 ${large} 1 ${point(cx, cy, rOuter, to)}`,
    `L${point(cx, cy, rInner, to)}`,
    `A${round(rInner)} ${round(rInner)} 0 ${large} 0 ${point(cx, cy, rInner, from)}`,
    'Z',
  ].join('')
}

/**
 * The closed ring — one slice at 100%, or the empty chart.
 *
 * Two circles rather than one 360° arc, because an arc whose start and end are the same point is
 * degenerate and renders as nothing. Needs `fill-rule="evenodd"` to punch the hole.
 */
export function ring(cx: number, cy: number, rOuter: number, rInner: number): string {
  const circle = (r: number): string =>
    `M${round(cx - r)} ${round(cy)}` +
    `A${round(r)} ${round(r)} 0 1 1 ${round(cx + r)} ${round(cy)}` +
    `A${round(r)} ${round(r)} 0 1 1 ${round(cx - r)} ${round(cy)}Z`
  return circle(rOuter) + circle(rInner)
}
