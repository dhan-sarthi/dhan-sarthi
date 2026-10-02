import { Popover as PopoverPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

/** Popovers are the one surface besides overlays allowed a shadow: they float above the page. */
export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverAnchor = PopoverPrimitive.Anchor
export const PopoverClose = PopoverPrimitive.Close

export function PopoverContent({
  className,
  align = 'start',
  sideOffset = 6,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          'animate-pop z-50 w-80 origin-(--radix-popover-content-transform-origin) rounded-lg border border-hairline bg-surface p-4 text-body text-ink shadow-popover outline-none',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export function PopoverTitle({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-heading text-ink', className)} {...props} />
}

export function PopoverDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-label-plain text-ink-soft', className)} {...props} />
}
