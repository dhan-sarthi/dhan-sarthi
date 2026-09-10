/**
 * A bottom sheet.
 *
 * Every editing surface in the app opens as one: the profile, adding a holding, linking
 * accounts held elsewhere. A sheet rather than a route because none of them is a place you
 * navigate *to* — you open them, change one thing, and come back to the number that changed.
 * Losing your place on Today to edit a figure is the kind of thing that makes an app feel like
 * a form.
 *
 * It closes on the scrim, on Escape and on the button. The closing animation runs before unmount,
 * which is the only reason `closing` exists: React removing the node immediately would make every
 * dismissal look like a crash.
 *
 * **Focus.** This said "it holds focus while open" for a long time and did not. It looked for the
 * first field inside and focused that — but every sheet in the app loads its content over the
 * wire, so on the tick it ran there was nothing inside but skeletons and a disabled footer
 * button, `querySelector` matched the disabled button, and `.focus()` on a disabled element does
 * nothing. The effect never ran again, so a keyboard user who opened a sheet was left standing
 * behind the scrim with thirteen live controls still on their Tab path.
 *
 * So: the panel itself takes focus, which cannot fail on an empty sheet; Tab cycles inside it;
 * and the control that opened the sheet gets focus back when it closes.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './ui.tsx'

/** Everything a Tab can land on. Disabled controls are out; `tabIndex` is checked separately. */
const FOCUSABLE =
  'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]'

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
  /*
   * `open` is the caller's and `lingering` is ours; between them they are the closing animation.
   *
   * Mounted is derived rather than stored, so opening is instant and needs no state write at
   * all. Closing keeps the node alive until the timer clears `lingering`, which is the only
   * reason any of this exists: React removing the sheet the moment `open` went false would
   * make every dismissal, including a successful save, look like a crash.
   */
  const [lingering, setLingering] = useState(false)
  const mounted = open || lingering
  const closing = !open && lingering
  const panel = useRef<HTMLDivElement>(null)

  /** Where focus came from, so it can go back there. */
  const returnTo = useRef<HTMLElement | null>(null)

  /*
   * Dismissing tells the caller and lets the effect below run the animation, rather than doing
   * both here. One path out means the scrim, Escape, the button and a successful save all
   * close the same way.
   *
   * The callback is read through a ref, so `dismiss` is stable for the life of the sheet. Every
   * caller passes an inline `onClose`, so a dependency on it re-ran the key handler's effect on
   * every render of the shell — which, once focus management works, is a caret yanked back to
   * the first field whenever a toast fires while somebody is typing.
   */
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  const dismiss = useCallback(() => closeRef.current(), [])

  useEffect(() => {
    if (open) {
      // Marked as lingering while open too, so that when `open` next goes false the node is
      // already known to need an exit rather than vanishing on the same tick.
      const id = requestAnimationFrame(() => setLingering(true))
      return () => cancelAnimationFrame(id)
    }
    // Matches `ds-sheet-out`. A shorter wait clips the animation; a longer one feels stuck.
    const t = setTimeout(() => setLingering(false), 200)
    return () => clearTimeout(t)
  }, [open])

  /*
   * Focus goes in on open and comes back out on close.
   *
   * The panel takes it, not a child. A sheet's content arrives over the wire and the first frame
   * is skeletons, so there is often nothing inside worth focusing yet — and a target that only
   * works once the data lands is a target that does not work.
   */
  useEffect(() => {
    if (!open) return
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus({ preventScroll: true })
    return () => {
      const back = returnTo.current
      returnTo.current = null
      // Skipped when the sheet's own action moved focus somewhere deliberate — signing out of
      // the session, say, which unmounts the button this would otherwise reach for.
      if (back?.isConnected === true) back.focus({ preventScroll: true })
    }
  }, [open])

  useEffect(() => {
    if (!mounted) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        dismiss()
        return
      }
      if (e.key !== 'Tab') return
      const root = panel.current
      if (!root) return
      /*
       * Tab cycles inside the panel.
       *
       * `aria-modal` tells a screen reader to stay in here; it does nothing at all to the Tab
       * order, so without this the sheet is modal to assistive technology and transparent to a
       * keyboard. Recomputed on each press rather than cached because a sheet's fields appear
       * as its content loads and disappear as it switches between reading and adding.
       */
      const stops = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.tabIndex >= 0 && el.getClientRects().length > 0,
      )
      const first = stops[0] ?? root
      const last = stops[stops.length - 1] ?? root
      const here = document.activeElement
      const escaped = !(here instanceof Node) || !root.contains(here)
      if (e.shiftKey ? here === first || escaped : here === last || escaped) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus({ preventScroll: true })
      }
    }
    document.addEventListener('keydown', onKey)
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
      {/* `tabIndex={-1}` makes the panel a focus target without putting it on the Tab path, and
          no ring on it: it is where focus is parked on the way in, not something a user tabbed
          to. Every control inside keeps its own. */}
      <div
        ref={panel}
        tabIndex={-1}
        className="ds-sheet outline-none"
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
          <IconButton label="Close" size="sm" onClick={dismiss}>
            <X size={17} strokeWidth={2.4} />
          </IconButton>
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
