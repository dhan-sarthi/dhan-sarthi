import { cn } from '../lib/cn.ts'
import { initialsOf, stableIndex } from '../lib/format.ts'

/*
 * Written out in full so Tailwind sees every class. The tint is chosen by a hash of the name,
 * never by anything about the customer: a colour that meant something would be a signal nobody
 * defined.
 */
const TINTS = [
  'bg-avatar-1-bg text-avatar-1-fg',
  'bg-avatar-2-bg text-avatar-2-fg',
  'bg-avatar-3-bg text-avatar-3-fg',
  'bg-avatar-4-bg text-avatar-4-fg',
  'bg-avatar-5-bg text-avatar-5-fg',
  'bg-avatar-6-bg text-avatar-6-fg',
] as const

const SIZE = {
  sm: 'size-7 text-micro',
  md: 'size-9 text-label font-semibold',
  lg: 'size-12 text-heading',
  xl: 'size-16 text-title',
} as const

export interface AvatarProps {
  name: string
  /** From the API where it sends them; derived from the name otherwise. */
  initials?: string
  size?: keyof typeof SIZE
  /** `brand` for the RM themself, so their own avatar never looks like a customer's. */
  tone?: 'tint' | 'brand'
  className?: string
}

export function Avatar({ name, initials, size = 'md', tone = 'tint', className }: AvatarProps) {
  const tint = tone === 'brand' ? 'bg-brand text-on-brand' : TINTS[stableIndex(name, TINTS.length)]
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-normal select-none',
        SIZE[size],
        tint,
        className,
      )}
    >
      {(initials ?? initialsOf(name)).slice(0, 2)}
    </span>
  )
}
