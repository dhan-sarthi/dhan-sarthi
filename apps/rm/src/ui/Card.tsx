import { ChevronRight } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Link, type To } from 'react-router'
import { cn } from '../lib/cn.ts'
import { SectionLabel } from './SectionLabel.tsx'

/**
 * A white surface on the cream ground, separated by a hairline rather than a shadow. Cards hold
 * one answer each ("who do I call", "what is coming up"); they never nest.
 *
 * The muted greys, and what each is for. They sit close together (ink-soft to ink-faint is
 * 1.16:1), so the rule decides, not the eye:
 *
 * - `text-ink-soft`, secondary: supporting copy, a subtitle, a card footer, a figure's label.
 * - `text-ink-faint`, tertiary: meta and captions (a date, a count, a basis line, "12
 *   month-ends…"), column headers, a legend.
 * - `text-ink-hint`: placeholders, icons and disabled controls only, never text the RM has to
 *   read. It passes 4.5:1 on the white surface alone; on any tint (a selected row, a wash, the
 *   cream) text takes ink-faint, which holds on every surface the console paints.
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
          <span className="text-micro tabular text-ink-faint">{count}</span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {to !== undefined ? (
          <Link
            to={to}
            className="group relative inline-flex items-center gap-0.5 rounded-sm text-caption text-ink-soft transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-focus pointer-coarse:hit-target"
          >
            {actionLabel ?? 'View all'}
            <ChevronRight
              className="size-3.5 transition-transform duration-feedback group-hover:translate-x-0.5"
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

/**
 * The strip at the foot of a card: what a figure is based on, a source, an action. `label` (the
 * default) is the caption role at its own weight, for a footer that names something; `note` is
 * the 400-weight caption, for a sentence. `size="sm"` is for a card padded `p-4` rather than
 * the default `p-5`, so the strip still runs edge to edge.
 */
export function CardFooter({
  className,
  variant = 'label',
  size = 'md',
  ...props
}: ComponentProps<'footer'> & { variant?: 'label' | 'note'; size?: 'sm' | 'md' }) {
  return (
    <footer
      className={cn(
        'mt-4 flex items-center justify-between gap-3 rounded-b-lg border-t border-hairline-soft bg-footer-wash text-ink-soft',
        size === 'sm' ? '-mx-4 -mb-4 px-4 py-2.5' : '-mx-5 -mb-5 px-5 py-3',
        variant === 'note' ? 'text-caption-plain' : 'text-caption',
        className,
      )}
      {...props}
    />
  )
}
