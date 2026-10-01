import { cva, type VariantProps } from 'class-variance-authority'
import { LoaderCircle } from 'lucide-react'
import { Slot } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/cn.ts'

/**
 * One button vocabulary for the whole console.
 *
 * `primary` is the IDBI green and is spent on the one action a view exists for (Sign in, Log a
 * call). `secondary` is the everyday control: white, hairline, ink label. `ghost` sits in
 * toolbars and table headers. `danger` only ever confirms something that cannot be taken back.
 */
export const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap select-none',
    'font-medium transition-[background-color,border-color,color,box-shadow] duration-150 ease-out',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
    'disabled:pointer-events-none disabled:opacity-45',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-brand text-on-brand hover:bg-brand-deep active:bg-brand-deep shadow-raised',
        secondary:
          'border border-hairline bg-surface text-ink hover:border-ink-hint/40 hover:bg-row-hover active:bg-ground-deep shadow-raised',
        ghost: 'text-ink-soft hover:bg-ink/5 hover:text-ink active:bg-ink/8',
        danger: 'bg-danger text-on-brand hover:bg-danger/90 active:bg-danger shadow-raised',
        link: 'h-auto px-0 text-brand underline-offset-4 hover:underline',
        inverse: 'bg-on-ink text-ink hover:bg-surface active:bg-ground-deep',
      },
      size: {
        sm: 'h-control-sm rounded-sm px-2.5 text-caption [&_svg]:size-3.5',
        md: 'h-control rounded-md px-3.5 text-label [&_svg]:size-4',
        lg: 'h-control-lg rounded-md px-5 text-heading [&_svg]:size-4.5',
      },
      block: { true: 'w-full' },
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0' }],
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render the child element (a router Link, say) with the button's styles. */
  asChild?: boolean
  /** Keeps the label and shows progress beside it; the button is disabled while true. */
  loading?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
}

export function Button({
  className,
  variant,
  size,
  block,
  asChild = false,
  loading = false,
  icon,
  iconRight,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, block }), className)
  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    )
  }
  return (
    <button
      type={type ?? 'button'}
      className={classes}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </button>
  )
}
