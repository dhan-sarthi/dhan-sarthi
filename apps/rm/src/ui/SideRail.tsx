import { web } from '@dhan/design'
import { X } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { cn } from '../lib/cn.ts'
import { MEDIA, useMediaQuery } from '../lib/media.ts'
import { slideFromRight } from '../lib/motion.ts'
import { IconButton } from './IconButton.tsx'

/**
 * How a split view shows its rail. `column`: a column of its own beside the list. `overlay`: a
 * sheet floating over the list's right edge, so a narrow window keeps the list's full width and
 * its names instead of squeezing it beside a 380px column.
 */
export type SplitMode = 'column' | 'overlay'

// Pure, so a page that never draws a split view does not keep this module (and motion) alive.
const SplitModeContext = /* @__PURE__ */ createContext<SplitMode>('column')

/**
 * True below the laptop breakpoint (about 1100px), where the rail floats over the list. A page
 * that fits its columns to the room it has (the Book) reads this to know whether an open rail
 * takes room from the list at all.
 */
export function useRailOverlay(): boolean {
  return !useMediaQuery(MEDIA.laptop)
}

/**
 * A list with a preview beside it. On a laptop and up the rail takes a column of its own instead
 * of covering the page, so the RM can move down the book with the arrow keys and watch the
 * preview follow, without ever losing their place in the list; below that it floats over the
 * list as a sheet.
 *
 * The grid snaps rather than animating its columns: the rail slides and fades in on its own
 * (transform and opacity), and the list changes width once, when the rail opens, and once more
 * after it has gone, so a table beside it re-fits its columns twice, not every frame.
 */
export function SplitView({
  rail,
  open,
  children,
  overlay,
  className,
}: {
  rail: ReactNode
  open: boolean
  children: ReactNode
  /** Force a mode; left out, the rail floats below the laptop breakpoint. */
  overlay?: boolean
  className?: string
}) {
  const narrow = useRailOverlay()
  const mode: SplitMode = (overlay ?? narrow) ? 'overlay' : 'column'
  // The column stays reserved until the rail's exit has finished, so the closing rail never
  // spills over the list's edge.
  const [reserved, setReserved] = useState(open)
  if (open && !reserved) setReserved(true)
  const column = mode === 'column' && reserved

  return (
    <SplitModeContext.Provider value={mode}>
      <div
        className={cn(
          'grid items-start',
          // No gap while shut: the list runs to the same right edge as anything full-width above it.
          column ? 'grid-cols-[minmax(0,1fr)_var(--spacing-rail)] gap-5' : 'grid-cols-1',
          // The floating sheet is placed against this box: it starts at the box's top and sticks
          // under the top bar from there, as the column does.
          mode === 'overlay' && 'relative',
          className,
        )}
      >
        <div className="min-w-0">{children}</div>
        <AnimatePresence initial={false} onExitComplete={() => setReserved(false)}>
          {open ? rail : null}
        </AnimatePresence>
      </div>
    </SplitModeContext.Provider>
  )
}

export interface SideRailProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Leading element in the header: the customer's avatar. */
  leading?: ReactNode
  /** Header buttons beside close: "Open file". */
  actions?: ReactNode
  onClose: () => void
  children: ReactNode
  /** Sticks this far from the top of the window, under the top bar, while the list scrolls. */
  stickyTop?: number
  /** Accessible name for the region. */
  label: string
  className?: string
}

const RAIL_TOP = web.size.topbar + 16

export function SideRail({
  title,
  subtitle,
  leading,
  actions,
  onClose,
  children,
  stickyTop = RAIL_TOP,
  label,
  className,
}: SideRailProps) {
  const ref = useRef<HTMLElement>(null)
  const mode = useContext(SplitModeContext)

  // Opening the rail from a row moves nothing: focus stays on the row so the arrow keys keep
  // walking the list. The rail is reachable with Tab, and Esc inside it closes it.
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 })
  }, [title])

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
    }
  }

  const aside = (
    <m.aside
      key="side-rail"
      ref={ref}
      aria-label={label}
      onKeyDown={onKeyDown}
      {...slideFromRight}
      style={{ top: stickyTop, maxHeight: `calc(100dvh - ${stickyTop + 20}px)` }}
      className={cn(
        'sticky flex flex-col overflow-y-auto overscroll-contain rounded-lg border border-hairline bg-surface',
        mode === 'column' ? 'w-rail' : 'pointer-events-auto w-full shadow-overlay',
        className,
      )}
    >
      <header className="sticky top-0 z-[1] flex items-start gap-3 border-b border-hairline-soft bg-surface px-5 pt-4 pb-3">
        {leading}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-heading text-ink">{title}</h2>
          {subtitle ? (
            <p className="truncate text-caption-plain text-ink-faint">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {actions}
          <IconButton label="Close preview" icon={<X aria-hidden />} size="sm" onClick={onClose} />
        </div>
      </header>
      <div className="grid gap-5 px-5 py-4">{children}</div>
    </m.aside>
  )

  if (mode === 'column') return aside
  // Over the list: a track down the split view's right edge, as tall as the list, that the sheet
  // sticks inside; the track itself lets clicks through to the rows under it.
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 z-30 w-[min(var(--spacing-rail),100%)]">
      {aside}
    </div>
  )
}
