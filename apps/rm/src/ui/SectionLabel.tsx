import type { ComponentProps, ElementType } from 'react'
import { cn } from '../lib/cn.ts'

/**
 * The small, letter-spaced uppercase label that names a block: "CALL TODAY", "COMING UP". It
 * is the block's title, not a kicker above one, so it carries its own heading level.
 */
export function SectionLabel({
  as: Tag = 'h2',
  className,
  ...props
}: ComponentProps<'h2'> & { as?: ElementType }) {
  return (
    <Tag
      className={cn('text-micro tracking-micro text-ink-faint uppercase', className)}
      {...props}
    />
  )
}
