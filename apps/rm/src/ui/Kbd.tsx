import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

/** A key cap: "⌘K", "Esc". The caption role, so the cap reads as text beside a label, not as a micro label. */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-hairline bg-surface px-1 font-sans text-caption text-ink-soft shadow-raised',
        className,
      )}
      {...props}
    />
  )
}

/** "⌘" on a Mac, "Ctrl" elsewhere: the palette opens with either. */
export function modKey(): string {
  if (typeof navigator === 'undefined') return 'Ctrl'
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl'
}
