import type { ReactNode } from 'react'
import { formatMonth } from '../../lib/format.ts'
import { isLabelledMonth, monthShare } from './derive.ts'

/*
 * The frame every Insights small multiple is drawn in, so a line tile and a column tile put the
 * twelve months at the same x positions, label the same months, and float their tooltip the
 * same way. The page draws its own multiples rather than the kit's `AreaChart` because it needs
 * two things the kit does not offer yet: a line with no fill (a balance chart that does not
 * start at zero must not shade down to the floor as if it did) and an axis that always names the
 * latest month, which is the one each tile is titled with.
 */

/** Side margin inside the tile, so the first and last month labels are not cut by the edge. */
export const SIDE = 14
/** Room under the plot for the month labels. */
export const AXIS_BAND = 26

/** A month's position (see `monthShare`) as a CSS length inside the plot box. */
export function monthLeft(i: number, n: number): string {
  return `${monthShare(i, n) * 100}%`
}

/** The month labels along the bottom of a multiple. */
export function MonthTicks({ months }: { months: readonly string[] }) {
  const n = months.length
  return (
    <div
      aria-hidden
      className="absolute text-micro leading-none font-normal tracking-normal text-chart-axis"
      style={{ left: SIDE, right: SIDE, bottom: 6 }}
    >
      {months.map((month, i) =>
        isLabelledMonth(i, n) ? (
          <span
            key={month}
            className="absolute bottom-0 -translate-x-1/2"
            style={{ left: monthLeft(i, n) }}
          >
            {formatMonth(month, { year: false })}
          </span>
        ) : null,
      )}
    </div>
  )
}

/**
 * The hover card, beside the active month and on whichever side has room, so it never covers
 * the point it describes or runs off the tile.
 */
export function FloatingTip({
  index,
  n,
  top,
  children,
}: {
  index: number
  n: number
  top: number
  children: ReactNode
}) {
  const share = monthShare(index, n)
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-10 w-max"
      style={{
        top,
        left: `calc(${SIDE}px + (100% - ${SIDE * 2}px) * ${share})`,
        transform: `translate(${share > 0.5 ? 'calc(-100% - 10px)' : '10px'}, 0)`,
      }}
    >
      {children}
    </div>
  )
}

/**
 * One invisible strip per month, full height, that makes it the active month on hover. Strips
 * meet halfway between months, so the pointer is always over exactly one.
 */
export function HoverStrips({
  months,
  top,
  height,
  onActive,
}: {
  months: readonly string[]
  top: number
  height: number
  onActive: (index: number) => void
}) {
  const n = months.length
  const half = n <= 1 ? 50 : 50 / (n - 1)
  return (
    <div aria-hidden className="absolute" style={{ top, height, left: SIDE, right: SIDE }}>
      {months.map((month, i) => {
        const centre = monthShare(i, n) * 100
        const from = Math.max(0, centre - half)
        const to = Math.min(100, centre + half)
        return (
          <span
            key={month}
            className="absolute inset-y-0"
            style={{ left: `${from}%`, width: `${to - from}%` }}
            onPointerEnter={() => onActive(i)}
          />
        )
      })}
    </div>
  )
}
