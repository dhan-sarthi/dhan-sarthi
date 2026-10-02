import type { VisibilityState } from '@tanstack/react-table'
import { useCallback, useLayoutEffect, useState, useSyncExternalStore, type RefObject } from 'react'

/**
 * Which columns the book table can show at the width it has.
 *
 * The table is `table-fixed`, so its columns never push it wider than the page or under the
 * preview rail; the cost is that something has to give when the room runs out. Rather than
 * squeezing every column until nothing reads, whole columns step aside in a fixed order, least
 * needed first, and come back as the room returns.
 *
 * With the rail open the rail itself draws the balances, the allocation, the goal and the
 * strength in full, so two columns slim down (the value drops its sparkline, the goal its second
 * line) and the list keeps what the RM walks down it for: who, how much, and why to call.
 */

/** Fixed widths in px, padding included. The top signal takes whatever is left. */
export const COLUMN_WIDTH = {
  name: 188,
  segment: 88,
  value: 152,
  allocation: 96,
  goal: 140,
  strength: 92,
  activity: 108,
} as const

/** The two columns that slim down beside the rail. */
export const RAIL_WIDTH: Readonly<Partial<Record<Fixed, number>>> = {
  value: 108,
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

/** Least needed first. Allocation goes before last active: who has gone quiet is a reason to call. */
const DROP_WITH_LIST: readonly (Fixed | 'signal')[] = [
  'strength',
  'allocation',
  'activity',
  'segment',
  'goal',
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
  /** The rail is open: the value and goal columns are in their slim form. */
  slim: boolean
}

export function widthsFor(railOpen: boolean): Record<Fixed, number> {
  return railOpen ? { ...COLUMN_WIDTH, ...RAIL_WIDTH } : { ...COLUMN_WIDTH }
}

export function fitColumns(width: number, railOpen: boolean): ColumnFit {
  const widths = widthsFor(railOpen)
  const shown = new Set<Fixed | 'signal'>([...(Object.keys(widths) as Fixed[]), 'signal'])
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

/** The element's content width, kept current as the window or the split view resizes it. */
export function useWidth(ref: RefObject<HTMLElement | null>, initial: number): number {
  const [width, setWidth] = useState(initial)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(Math.round(entry.contentRect.width))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return width
}

/** True while the window matches a media query, following resizes. */
export function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => true,
  )
}
