import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../lib/cn.ts'
import { slideFromRight } from '../lib/motion.ts'
import { IconButton } from './IconButton.tsx'

/**
 * A list with a preview beside it. The rail takes a column of its own instead of covering the
 * page, so the RM can move down the book with the arrow keys and watch the preview follow,
 * without ever losing their place in the list.
 */
export function SplitView({
  rail,
  open,
  children,
  className,
}: {
  rail: ReactNode
  open: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid items-start transition-[grid-template-columns] duration-300 ease-out',
        // No gap while shut: the list runs to the same right edge as anything full-width above it.
        open
          ? 'grid-cols-[minmax(0,1fr)_var(--spacing-rail)] gap-5'
          : 'grid-cols-[minmax(0,1fr)_0px] gap-0',
        className,
      )}
    >
      <div className="min-w-0">{children}</div>
      <AnimatePresence initial={false}>{open ? rail : null}</AnimatePresence>
    </div>
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
  /** Sticks under the top bar while the list scrolls. */
  stickyTop?: number
  /** Accessible name for the region. */
  label: string
  className?: string
}

export function SideRail({
  title,
  subtitle,
  leading,
  actions,
  onClose,
  children,
  stickyTop = 72,
  label,
  className,
}: SideRailProps) {
  const ref = useRef<HTMLElement>(null)

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

  return (
    <motion.aside
      key="side-rail"
      ref={ref}
      aria-label={label}
      onKeyDown={onKeyDown}
      {...slideFromRight}
      style={{ top: stickyTop, maxHeight: `calc(100vh - ${stickyTop + 20}px)` }}
      className={cn(
        'sticky flex w-rail flex-col overflow-y-auto rounded-lg border border-hairline bg-surface',
        className,
      )}
    >
      <header className="sticky top-0 z-[1] flex items-start gap-3 border-b border-hairline-soft bg-surface px-5 pt-4 pb-3">
        {leading}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-heading text-ink">{title}</h2>
          {subtitle ? (
            <p className="truncate text-caption font-normal text-ink-faint">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {actions}
          <IconButton label="Close preview" icon={<X aria-hidden />} size="sm" onClick={onClose} />
        </div>
      </header>
      <div className="grid gap-5 px-5 py-4">{children}</div>
    </motion.aside>
  )
}
