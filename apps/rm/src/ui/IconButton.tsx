import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/cn.ts'
import { Tooltip } from './Tooltip.tsx'

const iconButtonVariants = cva(
  [
    'relative inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-feedback',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
    'disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none',
    // Under a finger the button keeps its size and gains a 44px hit area around it.
    'pointer-coarse:hit-target',
  ],
  {
    variants: {
      variant: {
        ghost: 'text-ink-soft hover:bg-ghost-hover hover:text-ink active:bg-ghost-press',
        secondary:
          'border border-hairline bg-surface text-ink-soft hover:bg-row-hover hover:text-ink shadow-raised',
        inverse: 'text-on-ink-muted hover:bg-on-ink/10 hover:text-on-ink',
      },
      size: {
        sm: 'size-control-sm [&_svg]:size-3.5',
        md: 'size-control [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'ghost', size: 'md' },
  },
)

export interface IconButtonProps
  extends Omit<ComponentProps<'button'>, 'children'>, VariantProps<typeof iconButtonVariants> {
  /** Required: it is the accessible name and the tooltip. An icon alone names nothing. */
  label: string
  icon: ReactNode
  /** Off for buttons whose meaning is obvious in place, such as a dialog's close. */
  tooltip?: boolean
}

export function IconButton({
  label,
  icon,
  variant,
  size,
  tooltip = true,
  className,
  type,
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type={type ?? 'button'}
      aria-label={label}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    >
      {icon}
    </button>
  )
  return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button
}
