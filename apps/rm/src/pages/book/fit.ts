import type { VisibilityState } from '@tanstack/react-table'
import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * Which columns the book table can show at the width it has.
 *
 * The table is `table-fixed`, so its columns never push it wider than the page or under the
 * preview rail; the cost is that something has to give when the room runs out. Rather than
 * squeezing every column until nothing reads, whole columns step aside in a fixed order, least
 * needed first, and come back as the room returns. With the rail open the rail itself shows the
 * signal, the allocation and the strength in full, so the list keeps only what you scan down.
 */

/** Fixed widths in px, padding included. The top signal takes whatever is left. */
export const COLUMN_WIDTH = {
  name: 208,
  segment: 92,
  value: 160,
  allocation: 100,
  goal: 108,
  strength: 96,
  activity: 108,
} as const

type Fixed = keyof typeof COLUMN_WIDTH
export type BookColumnId = Fixed | 'signal' | 'change'

/** Below this the signal column cannot hold a readable title. */
const SIGNAL_MIN = 200

const DROP_WITH_LIST: readonly Fixed[] = ['strength', 'activity', 'allocation', 'segment', 'goal']
const DROP_WITH_RAIL: readonly (Fixed | 'signal')[] = [
  'signal',
  'strength',
  'allocation',
  'activity',
  'segment',
  'goal',
]

export interface ColumnFit {
  visibility: VisibilityState
  /** The signal column is shown, and is the column that takes the slack. */
  signal: boolean
}

export function fitColumns(width: number, railOpen: boolean): ColumnFit {
  const shown = new Set<Fixed | 'signal'>([...(Object.keys(COLUMN_WIDTH) as Fixed[]), 'signal'])
  const need = (): number =>
    [...shown].reduce((s, id) => s + (id === 'signal' ? SIGNAL_MIN : COLUMN_WIDTH[id]), 0)
  const order = railOpen ? DROP_WITH_RAIL : DROP_WITH_LIST
  for (const id of order) {
    if (need() <= width) break
    shown.delete(id)
  }
  const visibility: VisibilityState = { change: false }
  for (const id of [...(Object.keys(COLUMN_WIDTH) as Fixed[]), 'signal' as const]) {
    if (!shown.has(id)) visibility[id] = false
  }
  return { visibility, signal: shown.has('signal') }
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
