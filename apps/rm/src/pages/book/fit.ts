import type { VisibilityState } from '@tanstack/react-table'
import { useCallback, useRef, useState } from 'react'

/**
 * Which columns the book table can show at the width it has.
 *
 * The table is `table-fixed`, so its columns never push it wider than the page or under the
 * preview rail; the cost is that something has to give when the room runs out. Rather than
 * squeezing every column until nothing reads, whole columns step aside in a fixed order, least
 * needed first, and come back as the room returns.
 *
 * With the rail open beside the list the rail itself draws the balances, the allocation, the goal
 * and the strength in full, so the balances line steps aside, two columns slim down (the value
 * takes its narrow header, the goal drops its second line) and the list keeps what the RM walks
 * down it for: who, how much, and why to call.
 */

/** Fixed widths in px, padding included. The top signal takes whatever is left. */
export const COLUMN_WIDTH = {
  name: 188,
  segment: 88,
  // The header, sorted ("↓ Relationship value"), is the widest thing in the column; the second
  // line ("₹1.59Cr with IDBI") is next.
  value: 148,
  // The 48px line under its own header, so it is never read as the value's trend.
  balances: 76,
  allocation: 96,
  goal: 140,
  strength: 92,
  activity: 108,
} as const

/** The columns that slim down beside the rail. */
export const RAIL_WIDTH: Readonly<Partial<Record<Fixed, number>>> = {
  // Its second line may run into the cell's left padding: the line is flush right, so it grows
  // leftwards, and the customer column's own padding keeps the two apart.
  value: 112,
  goal: 104,
}

type Fixed = keyof typeof COLUMN_WIDTH
export type BookColumnId = Fixed | 'signal' | 'change'

/**
 * Below this the signal column cannot hold the head of a title on one line ("₹3,150 a month
 * frees up in 3 months" is the longest in the demo books).
 */
export const SIGNAL_MIN = 264
/** Beside the rail, which shows the selected customer's signals in full, a little less will do. */
export const SIGNAL_MIN_RAIL = 240

/**
 * Least needed first. The balances line goes first of all: the rail draws the same year in full,
 * and the Sort menu still orders by its three-month fall. Allocation goes before last active: who
 * has gone quiet is a reason to call. The signal goes last, and only on a phone, where a row is
 * who and how much and a tap opens the rest.
 */
const DROP_WITH_LIST: readonly (Fixed | 'signal')[] = [
  'balances',
  'strength',
  'allocation',
  'activity',
  'segment',
  'goal',
  'signal',
]
/** Beside the rail the signal is the last to go: it is why the RM is walking the list. */
const DROP_WITH_RAIL: readonly (Fixed | 'signal')[] = [
  'strength',
  'allocation',
  'activity',
  'segment',
  'goal',
  'signal',
]

export interface ColumnFit {
  visibility: VisibilityState
  /** The signal column is shown, and is the column that takes the slack. */
  signal: boolean
  /** Each fixed column's width at this fit. */
  widths: Readonly<Record<Fixed, number>>
  /** The rail is open beside the list: the value and goal columns are in their slim form. */
  slim: boolean
}

export function widthsFor(railOpen: boolean): Record<Fixed, number> {
  return railOpen ? { ...COLUMN_WIDTH, ...RAIL_WIDTH } : { ...COLUMN_WIDTH }
}

/**
 * `railOpen` means the rail takes a column of its own beside the list. A rail that floats over
 * the list (a narrow window) takes no room from it, so the list is fitted as if it were shut.
 */
export function fitColumns(width: number, railOpen: boolean): ColumnFit {
  const widths = widthsFor(railOpen)
  const shown = new Set<Fixed | 'signal'>([...(Object.keys(widths) as Fixed[]), 'signal'])
  // Beside the rail, the rail's own chart is the balances line.
  if (railOpen) shown.delete('balances')
  const signalMin = railOpen ? SIGNAL_MIN_RAIL : SIGNAL_MIN
  const need = (): number =>
    [...shown].reduce((s, id) => s + (id === 'signal' ? signalMin : widths[id]), 0)
  const order = railOpen ? DROP_WITH_RAIL : DROP_WITH_LIST
  for (const id of order) {
    if (need() <= width) break
    shown.delete(id)
  }
  const visibility: VisibilityState = { change: false }
  for (const id of [...(Object.keys(widths) as Fixed[]), 'signal' as const]) {
    if (!shown.has(id)) visibility[id] = false
  }
  return { visibility, signal: shown.has('signal'), widths, slim: railOpen }
}

/**
 * An element's content width, kept current as the window or the split view resizes it.
 *
 * `estimate` is the first render's width, before there is an element to measure; when it is
 * right (the page derives it from the room the shell leaves), the measurement that follows
 * changes nothing and the table mounts in one commit. The ref is a callback, so an element
 * swapped for another (the list moving into or out of the split view) is measured afresh. Every
 * reading is rounded the same way, so the first measurement and the observer's agree.
 */
export function useWidth(
  estimate: () => number,
): [width: number, ref: (el: HTMLElement | null) => void] {
  const [width, setWidth] = useState(estimate)
  const observer = useRef<ResizeObserver | null>(null)
  const ref = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el) return
    setWidth(Math.round(el.getBoundingClientRect().width))
    const next = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(Math.round(entry.contentRect.width))
    })
    next.observe(el)
    observer.current = next
  }, [])
  return [width, ref]
}

/**
 * The room the shell leaves a page: `main`'s width less its gutters. Read before the page has
 * drawn anything of its own, for a first guess at a list's width.
 */
export function mainContentWidth(): number | null {
  const main = typeof document === 'undefined' ? null : document.getElementById('main')
  if (!main) return null
  const style = getComputedStyle(main)
  return Math.round(
    main.getBoundingClientRect().width -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight),
  )
}
