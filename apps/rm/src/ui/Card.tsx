import { ChevronRight } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Link, type To } from 'react-router'
import { cn } from '../lib/cn.ts'
import { SectionLabel } from './SectionLabel.tsx'

/**
 * A white surface on the cream ground, separated by a hairline rather than a shadow. Cards hold
 * one answer each ("who do I call", "what is coming up"); they never nest.
 */
export function Card({
  className,
  padded = true,
  ...props
}: ComponentProps<'section'> & { padded?: boolean }) {
  return (
    <section
      className={cn('rounded-lg border border-hairline bg-surface', padded && 'p-5', className)}
      {...props}
    />
  )
}

export interface CardHeaderProps {
  /** Short, and in the label style: "Call today", "Asked for you". */
  title: ReactNode
  /** A count beside the title ("Call today  10"), in the same quiet ink. */
  count?: number
  /** "View all" by default when `to` is given. */
  actionLabel?: string
  to?: To
  /** Anything else on the right: a segmented control, a menu. */
  actions?: ReactNode
  className?: string
}

export function CardHeader({ title, count, actionLabel, to, actions, className }: CardHeaderProps) {
  return (
    <header className={cn('mb-4 flex min-h-6 items-center justify-between gap-3', className)}>
      <div className="flex items-baseline gap-2">
        <SectionLabel>{title}</SectionLabel>
        {count !== undefined ? (
          <span className="text-micro tabular text-ink-hint">{count}</span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {to !== undefined ? (
          <Link
            to={to}
            className="group inline-flex items-center gap-0.5 rounded-sm text-caption text-ink-soft transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-focus"
          >
            {actionLabel ?? 'View all'}
            <ChevronRight
              className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        ) : null}
      </div>
    </header>
  )
}

/** A full-bleed hairline between sections of one card. */
export function CardDivider({ className }: { className?: string }) {
  return <hr className={cn('-mx-5 my-4 border-0 border-t border-hairline-soft', className)} />
}

export function CardFooter({ className, ...props }: ComponentProps<'footer'>) {
  return (
    <footer
      className={cn(
        '-mx-5 -mb-5 mt-4 flex items-center justify-between gap-3 rounded-b-lg border-t border-hairline-soft bg-canvas-top/60 px-5 py-3 text-caption text-ink-soft',
        className,
      )}
      {...props}
    />
  )
}
