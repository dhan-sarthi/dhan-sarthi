import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/cn.ts'

/**
 * A modal, for the few tasks that need protected focus: a reason before a reveal, a confirmation.
 * Everything else opens inline or in the side rail, so the RM keeps the page they were on.
 */
export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogOverlay({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn('animate-overlay fixed inset-0 z-50 bg-overlay', className)}
      {...props}
    />
  )
}

export interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  showClose?: boolean
  /** `sm` for a confirmation, `md` for a short form, `lg` for the command palette. */
  width?: 'sm' | 'md' | 'lg'
}

const WIDTH = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl' } as const

export function DialogContent({
  className,
  children,
  showClose = true,
  width = 'md',
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          'animate-pop fixed top-[18vh] left-1/2 z-50 grid w-[calc(100%-2rem)] -translate-x-1/2 gap-4 rounded-xl border border-hairline bg-surface p-6 text-ink shadow-overlay outline-none',
          WIDTH[width],
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            className="absolute top-4 right-4 inline-flex size-control-sm items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({
  title,
  description,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid gap-1 pr-8', className)}>
      <DialogPrimitive.Title className="text-title text-ink">{title}</DialogPrimitive.Title>
      {description ? (
        <DialogPrimitive.Description className="text-body text-ink-soft">
          {description}
        </DialogPrimitive.Description>
      ) : (
        <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
      )}
    </div>
  )
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center justify-end gap-2 pt-2', className)} {...props} />
}
