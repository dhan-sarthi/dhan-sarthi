import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/cn.ts'

/**
 * A small label with a fill that means something. The tones are the app's surface fills:
 * `brand` and `success` are good news, `streak` is worth a look, `budget` is information,
 * `danger` is the one that needs a person, `ink` is emphasis, `neutral` is a plain tag.
 * Colour is never the only signal: a chip always says its word.
 */
export const chipVariants = cva(
  'inline-flex max-w-full items-center gap-1 rounded-sm whitespace-nowrap [&_svg]:shrink-0',
  {
    variants: {
      tone: {
        brand: 'bg-brand-soft text-brand-deep',
        ink: 'bg-ink text-on-ink',
        success: 'bg-success text-ink',
        streak: 'bg-streak-soft text-streak-ink',
        budget: 'bg-budget/45 text-ink',
        danger: 'bg-danger-soft text-danger',
        neutral: 'bg-ground-deep text-ink-soft',
        outline: 'border border-hairline bg-surface text-ink-soft',
      },
      size: {
        sm: 'h-5 px-1.5 text-caption [&_svg]:size-3',
        md: 'h-6 px-2 text-label [&_svg]:size-3.5',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'sm' },
  },
)

export type ChipTone = NonNullable<VariantProps<typeof chipVariants>['tone']>

export interface ChipProps extends ComponentProps<'span'>, VariantProps<typeof chipVariants> {
  icon?: ReactNode
}

export function Chip({ tone, size, icon, className, children, ...props }: ChipProps) {
  return (
    <span className={cn(chipVariants({ tone, size }), className)} {...props}>
      {icon}
      <span className="truncate">{children}</span>
    </span>
  )
}
