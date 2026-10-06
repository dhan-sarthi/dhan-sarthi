import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useState, type ComponentProps, type ReactNode } from 'react'
import { cn } from '../lib/cn.ts'

/**
 * A modal, for the few tasks that need protected focus: a reason before a reveal, a confirmation.
 * Everything else opens inline or in the side rail, so the RM keeps the page they were on.
 *
 * Focus goes back where it came from when the dialog closes, however it was opened: a page that
 * opens one from a plain `onClick` (no `DialogTrigger`) gets the same return as one that does.
 * The dialog never grows past the window: it scrolls inside, and its footer stays on screen, so
 * the action it exists for can always be reached, at 200% zoom and on a phone.
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

/**
 * Whatever had focus when a modal opened, so it can be given focus back. Read during the render
 * that mounts the modal, before the modal's own autofocus moves anything.
 */
export function useOpenerFocus(): HTMLElement | null {
  const [opener] = useState<HTMLElement | null>(() => {
    if (typeof document === 'undefined') return null
    const active = document.activeElement
    return active instanceof HTMLElement && active !== document.body ? active : null
  })
  return opener
}

/**
 * `onCloseAutoFocus` for a modal: focus returns to `opener` unless something else has already
 * taken it on purpose (the page under a palette that navigated, say). Radix alone returns focus
 * only to a `DialogTrigger`, and drops it on `<body>` otherwise.
 */
export function restoreFocus(event: Event, opener: HTMLElement | null, content: Element | null) {
  event.preventDefault()
  const active = document.activeElement
  const lost = active === null || active === document.body || (content?.contains(active) ?? false)
  if (lost && opener?.isConnected) opener.focus({ preventScroll: true })
}

export interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  showClose?: boolean
  /** `sm` for a confirmation, `md` for a short form, `lg` for the command palette. */
  width?: 'sm' | 'md' | 'lg'
}

const WIDTH = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl' } as const

export function DialogContent(props: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      {/*
       * The overlay is also the frame that places the dialog: 18% down the window when it fits,
       * higher when it does not, never closer than 1rem to an edge, and the dialog scrolls inside
       * past that height. Content inside the overlay is Radix's own pattern for a scrollable
       * overlay, and it keeps both the overlay's and the dialog's exit animations.
       */}
      <DialogOverlay className="flex flex-col items-center p-4">
        <span aria-hidden className="block h-[calc(18dvh-1rem)] min-h-0 shrink" />
        <OpenDialogContent {...props} />
      </DialogOverlay>
    </DialogPrimitive.Portal>
  )
}

/** Mounted with each open, so it reads the opener before the dialog takes focus. */
function OpenDialogContent({
  className,
  children,
  showClose = true,
  width = 'md',
  onCloseAutoFocus,
  ...props
}: DialogContentProps) {
  const opener = useOpenerFocus()
  return (
    <DialogPrimitive.Content
      className={cn(
        'animate-pop dialog-scroll relative grid max-h-full w-full shrink-0 gap-4 overflow-y-auto overscroll-contain rounded-xl border border-hairline bg-surface p-6 text-ink shadow-overlay outline-none',
        WIDTH[width],
        className,
      )}
      onCloseAutoFocus={(event) => {
        onCloseAutoFocus?.(event)
        if (!event.defaultPrevented) {
          restoreFocus(event, opener, event.currentTarget as Element | null)
        }
      }}
      {...props}
    >
      {children}
      {showClose ? (
        <DialogPrimitive.Close
          className="absolute top-4 right-4 inline-flex size-control-sm items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-ghost-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus pointer-coarse:hit-target"
          aria-label="Close"
        >
          <X className="size-4" aria-hidden />
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
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

/**
 * The dialog's actions, primary last. Sticky at the bottom of the dialog's scroll, so when the
 * form is taller than the window the buttons stay on screen and the fields scroll under them.
 */
export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'dialog-footer sticky bottom-0 z-[1] -mx-6 -mb-6 flex flex-wrap items-center justify-end gap-2 bg-surface px-6 pt-2 pb-6',
        className,
      )}
      {...props}
    />
  )
}
