/**
 * The projection, as a shape rather than as three rows of a list.
 *
 * `Plan` and `JarDetail` both receive a `Projection` — a monthly contribution, a horizon, an
 * existing corpus and a band of assumed rates — and both render it as one figure and three
 * `Leader` rows. Everything that makes a projection worth showing is in the part they drop: that
 * the line bends, that the bend is the compounding, that most of the corpus at thirty years was
 * never contributed, and that the gap between cautious and optimistic widens the further out you
 * look. Those are four sentences, or one picture.
 *
 * **This computes nothing new.** It evaluates `futureValue` — the same function, in the same file,
 * that produced the scenarios the server sent — at the years in between. The end of every line it
 * returns is the corpus already on the card, and `growth.test.ts` asserts exactly that: if the
 * curve's last point ever disagreed with the figure printed beside it, one of the two is lying and
 * the test says which. Nothing is interpolated, smoothed or extrapolated past the horizon.
 *
 * `charts/` has been self-contained on `series.ts` until now, and this is the first file in it to
 * reach into `lib/`. That is the right direction of the two available: the alternative is a second
 * copy of the compounding arithmetic living in a chart, and `lib/projection.ts` exists precisely
 * because two arithmetics show the customer two answers to the same question.
 */
import type { Projection } from '@dhan/contracts'
import { futureValue } from '../../lib/projection.ts'

export type GrowthLine = {
  label: string
  ratePct: number
  /** One value per mark in `years`, oldest first. The last is the scenario's own corpus. */
  values: number[]
}

export type Growth = {
  /** The x axis: years from today, starting at 0. */
  years: number[]
  /** The lowest and highest rates in the band. The region between them is the uncertainty. */
  low: GrowthLine
  high: GrowthLine
  /** The scenario the screens lead with — the middle rate, or the only one. */
  mid: GrowthLine
  /** Money in, ignoring growth. The line that makes the compounding visible as the gap above it. */
  contributed: number[]
  /** Every value in the picture, for the y scale. */
  ceiling: number
  /** Nothing to draw: no horizon, or nothing going in and nothing already there. */
  empty: boolean
}

/**
 * How many points the curve is sampled at.
 *
 * One a year up to thirty, which is a mark for every year of a retirement plan and four for a
 * four-year one. Below four marks a curve is a triangle, so a short horizon is sampled more often
 * than yearly instead. Above thirty the points are closer together than the stroke is wide and the
 * extra ones cost path length for nothing.
 */
function stepsFor(years: number): number {
  if (!Number.isFinite(years) || years <= 0) return 0
  return Math.max(4, Math.min(30, Math.round(years)))
}

/** The years each sample lands on. Always starts at 0 and ends exactly on the horizon. */
export function marksFor(years: number): number[] {
  const steps = stepsFor(years)
  if (steps === 0) return []
  return Array.from({ length: steps + 1 }, (_, i) => (i === steps ? years : (years * i) / steps))
}

/**
 * The curves behind a projection.
 *
 * The band is taken from the lowest and highest rate present rather than from positions in the
 * array, so a projection carrying one scenario draws a line and no band, and one carrying five
 * still bands its extremes. `mid` is the middle scenario by rate — the one both screens already
 * lead with — and where there are two it is the higher, which matches `scenarios[1]` on Plan.
 */
export function growthOf(p: Projection): Growth {
  const years = Number.isFinite(p.years) ? Math.max(0, p.years) : 0
  const monthly = Number.isFinite(p.monthlyContribution) ? Math.max(0, p.monthlyContribution) : 0
  const existing = Number.isFinite(p.existingCorpus) ? Math.max(0, p.existingCorpus) : 0
  const marks = marksFor(years)

  const scenarios = [...p.scenarios].sort((a, b) => a.ratePct - b.ratePct)
  const empty = marks.length === 0 || scenarios.length === 0 || (monthly <= 0 && existing <= 0)

  const line = (index: number): GrowthLine => {
    const s = scenarios[index]
    if (!s) return { label: '', ratePct: 0, values: marks.map(() => existing) }
    return {
      label: s.label,
      ratePct: s.ratePct,
      // The horizon reuses the server's own figure rather than recomputing it. Same inputs and
      // the same function, so they agree — but agreeing by construction beats agreeing by luck.
      values: marks.map((y, i) =>
        i === marks.length - 1 ? s.corpus : futureValue(monthly, y, s.ratePct, existing),
      ),
    }
  }

  const low = line(0)
  const high = line(scenarios.length - 1)
  const mid = line(Math.floor(scenarios.length / 2))
  const contributed = marks.map((y) => existing + Math.round(monthly * Math.round(y * 12)))

  return {
    years: marks,
    low,
    high,
    mid,
    contributed,
    ceiling: Math.max(0, ...high.values, ...contributed),
    empty,
  }
}

/**
 * The share of the horizon corpus that was never contributed.
 *
 * The one number this chart exists to make obvious, and the one neither screen prints. Null where
 * the corpus is zero — and clamped at zero below, because a projection at a rate lower than… well,
 * there is no such rate here, but a hand-typed 0% makes contributed equal corpus and the share
 * exactly zero, which is a true and unremarkable reading.
 */
export function earnedShare(g: Growth): number | null {
  const corpus = g.mid.values[g.mid.values.length - 1]
  const put = g.contributed[g.contributed.length - 1]
  if (corpus === undefined || put === undefined || corpus <= 0) return null
  return Math.max(0, (corpus - put) / corpus)
}
