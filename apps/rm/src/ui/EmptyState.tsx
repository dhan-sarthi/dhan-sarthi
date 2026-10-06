import type { ReactNode } from 'react'
import { cn } from '../lib/cn.ts'

export interface EmptyStateProps {
  icon?: ReactNode
  /** What is true, plainly: "Nobody has asked for you". */
  title: ReactNode
  /** What it means or what fills it: "When a customer taps Talk to your RM, they appear here." */
  body?: ReactNode
  action?: ReactNode
  /** `inline` inside a card, `page` for a whole view. */
  size?: 'inline' | 'page'
  /**
   * The title's element. A `page` state is the page, so its title is the page's `h1` (the 404,
   * a file outside the book); under a page's own header pass `h2`. Inline, it is a `p`.
   */
  titleAs?: 'h1' | 'h2' | 'h3' | 'p'
  className?: string
}

/**
 * An empty list that teaches: it says why it is empty and what will fill it, so "nothing here"
 * reads as good news ("You're all caught up") rather than a broken page.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  size = 'inline',
  titleAs,
  className,
}: EmptyStateProps) {
  const Title = titleAs ?? (size === 'page' ? 'h1' : 'p')
  return (
    <div
      className={cn(
        'mx-auto flex max-w-sm flex-col items-center text-center',
        size === 'page' ? 'gap-3 py-20' : 'gap-2 py-8',
        className,
      )}
    >
      {icon ? (
        <div
          aria-hidden
          className={cn(
            'mb-1 inline-flex items-center justify-center rounded-full bg-brand-wash text-brand',
            size === 'page' ? 'size-12 [&_svg]:size-5' : 'size-9 [&_svg]:size-4',
          )}
        >
          {icon}
        </div>
      ) : null}
      <Title className={cn('text-ink', size === 'page' ? 'text-title' : 'text-heading')}>
        {title}
      </Title>
      {body ? <p className="text-label-plain text-ink-soft">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
