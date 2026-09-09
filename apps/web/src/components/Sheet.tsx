/**
 * A bottom sheet.
 *
 * Every editing surface in the app opens as one: the profile, adding a holding, linking
 * accounts held elsewhere. A sheet rather than a route because none of them is a place you
 * navigate *to* — you open them, change one thing, and come back to the number that changed.
 * Losing your place on Today to edit a figure is the kind of thing that makes an app feel like
 * a form.
 *
 * It closes on the scrim, on Escape and on the button, and it holds focus while open. The
 * closing animation runs before unmount, which is the only reason `closing` exists: React
 * removing the node immediately would make every dismissal look like a crash.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useRipple } from '../lib/motion.ts'

export function Sheet({
  title,
  sub,
  open,
  onClose,
  children,
  footer,
}: {
  title: string
  sub?: string
  open: boolean
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}): ReactNode {
  const [closing, setClosing] = useState(false)
  const [mounted, setMounted] = useState(open)
  const panel = useRef<HTMLDivElement>(null)
  const ripple = useRipple()

  /*
   * Dismissing tells the caller and lets the effect above run the animation, rather than doing
   * both here. One path out means the scrim, Escape, the button and a successful save all
   * close the same way.
   */
  const dismiss = useCallback(() => onClose(), [onClose])

  /*
   * `open` is the caller's, `mounted` is ours, and the gap between them is the closing
   * animation.
   *
   * Both directions matter. Opening mounts immediately. Closing has to be driven from here as
   * well, because a sheet that saved successfully closes itself from the outside — the caller
   * sets `open` to false — and if only `dismiss` unmounted, that sheet would sit there after a
   * save looking like the save had failed.
   */
  useEffect(() => {
    if (open) {
      setClosing(false)
      setMounted(true)
      return
    }
    if (!mounted) return
    setClosing(true)
    const t = setTimeout(() => {
      setClosing(false)
      setMounted(false)
    }, 200)
    return () => clearTimeout(t)
  }, [open, mounted])

  useEffect(() => {
    if (!mounted) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') dismiss()
    }
    document.addEventListener('keydown', onKey)
    // The first focusable inside, so a keyboard lands in the sheet rather than behind it.
    const first = panel.current?.querySelector<HTMLElement>(
      'input,select,textarea,button:not([data-close])',
    )
    first?.focus({ preventScroll: true })
    return () => document.removeEventListener('keydown', onKey)
  }, [mounted, dismiss])

  if (!mounted) return null

  return (
    <>
      <div
        className="ds-scrim"
        data-closing={closing ? 'true' : undefined}
        onClick={dismiss}
        aria-hidden="true"
      />
      <div
        ref={panel}
        className="ds-sheet"
        data-closing={closing ? 'true' : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* The grabber. Not draggable, but it is the universal sign that this can be dismissed. */}
        <div className="flex justify-center pb-1 pt-2.5">
          <span className="h-1 w-9 rounded-pill bg-hairline" />
        </div>

        <header className="flex flex-none items-start justify-between gap-3 px-4 pb-2 pt-1">
          <div className="min-w-0">
            <h2 className="m-0 text-[20px] font-semibold leading-tight text-ink">{title}</h2>
            {sub ? <p className="mb-0 mt-1 text-[13px] leading-snug text-ink-soft">{sub}</p> : null}
          </div>
          <button
            type="button"
            data-close
            aria-label="Close"
            onPointerDown={ripple}
            onClick={dismiss}
            className="ds-press grid h-9 w-9 flex-none place-items-center rounded-pill border-0 bg-ground-deep text-ink-mid"
          >
            <X size={17} strokeWidth={2.4} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {children}
        </div>

        {footer ? (
          <div className="flex-none border-t border-solid border-hairline-mint bg-surface p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </div>
    </>
  )
}
