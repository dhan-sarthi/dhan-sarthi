/**
 * One row of a chart legend: a ramp-coloured dot, a label, and the figure in bold.
 *
 * `Leader` in `ui.tsx` is the near-miss `COMPONENT-GAP.md` points at, and it is close — dot,
 * label, value, same type sizes. It is not extended here because the two things that would have
 * to change are the two it has no props for: its dot is `bg-brand` green, and it draws a dotted
 * rule between label and value that a legend does not have. Making it take a ramp colour would
 * mean editing `ui.tsx`, which this directory does not own, so this is its sibling rather than
 * its variant. If the two ever merge, `Leader` is the one to keep and this is a `legend` tone
 * on it.
 *
 * The dot is 12px, against `Leader`'s 8px and the source's 14px. Two of the five ramp colours are
 * light on purpose (`--chart-3` gold and `--chart-5` grey read at under 2:1 on white) and a
 * smaller dot loses them; the reason that trade is the right one is in the Charts comment in
 * `tokens.css`. No ring or border around the swatch — that is the "fix" the ramp was designed not
 * to need, and the label and the figure beside it are what actually carry the row.
 */
import type { ReactNode } from 'react'
import { bgOf, type Tone } from './series.ts'

export function LegendRow({
  tone,
  label,
  value,
  note,
}: {
  /** Position in the ramp. Positional, never chosen for what the category means. */
  tone: Tone | 'idle'
  label: string
  /** The figure, already formatted — `60%`, `05%`, `₹3.5L`. */
  value: string
  /** A quieter second line under the label: the rupee amount behind the percentage. */
  note?: string | undefined
}): ReactNode {
  return (
    <div className="flex items-center gap-2.5 py-[9px] text-[15px] leading-snug">
      <span className={`size-3 shrink-0 rounded-pill ${bgOf(tone)}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ink-mid">{label}</span>
        {note !== undefined && <span className="block truncate text-xs text-ink-soft">{note}</span>}
      </span>
      <span className="shrink-0 font-semibold tabular-nums text-ink">{value}</span>
    </div>
  )
}
