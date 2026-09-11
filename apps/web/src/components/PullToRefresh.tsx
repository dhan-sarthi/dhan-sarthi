/**
 * Pull down at the top of a screen to reload it.
 *
 * The gesture every phone app has, and the reason it is worth the code: this app's numbers come
 * from a bank over a live connection, so "is this current?" is a question a customer will
 * actually have. A refresh button in a header answers it too, but nobody looks for one, whereas
 * everybody already knows this.
 *
 * Pointer events rather than touch events, so it works with a mouse as well and can be tested
 * without a device. It only engages when the scroller is already at the top, and it never
 * blocks a normal scroll: the first move decides which gesture this is, and once it is a scroll
 * this stays out of the way until the finger lifts.
 */
import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { usePrefersReducedMotion } from '../lib/motion.ts'

/** How far the finger travels before it counts, and how far the indicator can be dragged. */
const TRIGGER = 68
const MAX = 96

export function PullToRefresh({
  onRefresh,
  className = '',
  contentClassName = '',
  as: Host = 'div',
  children,
}: {
  onRefresh: () => Promise<void>
  /** The scrolling element's own classes. This component *is* the scroller. */
  className?: string
  /**
   * The element to render as. `Screen` passes `main`, because the scroller is the one region a
   * screen reader should be able to jump to — the app bar and the tab bar sit outside it.
   */
  as?: 'div' | 'main'
  /**
   * The wrapper the children sit in.
   *
   * Separate from the scroller because the entrance stagger is `nth-child` on the content, and
   * the pull indicator is a child of the scroller: without this the indicator would take the
   * first slot in the ladder and every card would animate one step late.
   */
  contentClassName?: string
  children: ReactNode
}): ReactNode {
  const host = useRef<HTMLDivElement>(null)
  const startY = useRef<number | null>(null)
  /** null until the first move tells us whether this is a pull or an ordinary scroll. */
  const pulling = useRef<boolean | null>(null)
  const [distance, setDistance] = useState(0)
  const [busy, setBusy] = useState(false)
  /** State rather than the ref, because render decides on it and a ref may not be read there. */
  const [dragging, setDragging] = useState(false)
  const reduced = usePrefersReducedMotion()

  const down = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (busy) return
      // Only from the very top. Starting a pull mid-list is how an app steals a scroll.
      if ((host.current?.scrollTop ?? 0) > 0) return
      startY.current = e.clientY
      pulling.current = null
    },
    [busy],
  )

  const move = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const from = startY.current
      if (from === null || busy) return
      const dy = e.clientY - from

      if (pulling.current === null) {
        // Four pixels of slop before committing, so a tap with a shaky thumb is not a pull and
        // a downward flick is not mistaken for one either.
        if (Math.abs(dy) < 4) return
        pulling.current = dy > 0 && (host.current?.scrollTop ?? 0) <= 0
      }
      if (!pulling.current) return

      // Resistance: the last pixels are the hardest, which is what makes the trigger point
      // findable by feel rather than by watching.
      setDistance(Math.min(MAX, dy * 0.55))
    },
    [busy],
  )

  const up = useCallback(async () => {
    const travelled = distance
    startY.current = null
    pulling.current = null
    setDragging(false)
    if (travelled < TRIGGER || busy) {
      setDistance(0)
      return
    }
    setBusy(true)
    setDistance(TRIGGER)
    try {
      await onRefresh()
    } finally {
      setBusy(false)
      setDistance(0)
    }
  }, [distance, busy, onRefresh])

  const active = distance > 0 || busy
  const ready = distance >= TRIGGER

  return (
    <Host
      ref={host}
      className={className}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={() => void up()}
      onPointerCancel={() => void up()}
    >
      <div
        aria-hidden={!busy}
        className="pointer-events-none flex items-center justify-center overflow-hidden"
        style={{
          height: active ? distance : 0,
          transition: dragging ? 'none' : 'height 220ms cubic-bezier(0.22,0.8,0.3,1)',
        }}
      >
        <span
          className={`grid size-8 place-items-center rounded-pill bg-surface text-accent-text shadow-card ${
            busy && !reduced ? 'ds-spin' : ''
          }`}
          style={{
            opacity: Math.min(1, distance / TRIGGER),
            transform: busy ? undefined : `rotate(${(distance / TRIGGER) * 180}deg)`,
          }}
        >
          <RefreshCw size={16} strokeWidth={2.6} />
        </span>
      </div>
      {busy ? <span className="sr-only">Refreshing</span> : null}
      {ready && !busy ? <span className="sr-only">Release to refresh</span> : null}
      <div className={contentClassName}>{children}</div>
    </Host>
  )
}
