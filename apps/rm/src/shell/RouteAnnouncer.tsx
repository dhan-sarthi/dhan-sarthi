import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { routeKey, routeTitle, setRouteTitle, useCurrentTitle } from './title.ts'

/** Long enough for a page to name itself (a customer's name arrives with the file). */
const ANNOUNCE_AFTER_MS = 400

/**
 * Says where the RM has landed. On every move to another page (not a tab switch inside a
 * customer file, and not the first load, which the browser announces itself) the new window
 * title is read out through a polite live region, once the page has had a moment to name itself.
 *
 * If the move left keyboard focus nowhere (a palette or the navigation drawer that closed behind
 * the new page, a page that replaced the control that had focus), focus goes to the top of the
 * new page's content, so the next Tab is inside it rather than back at "Skip to content". A link
 * that keeps focus (the sidebar's) keeps it.
 *
 * It also gives every address its default title (`title.ts`).
 */
export function RouteAnnouncer() {
  const { pathname } = useLocation()
  const key = routeKey(pathname)
  const title = useCurrentTitle()
  const [message, setMessage] = useState('')
  const announced = useRef<string | null>(null)

  useLayoutEffect(() => {
    setRouteTitle(routeTitle(pathname))
  }, [pathname])

  useEffect(() => {
    if (announced.current === null) {
      announced.current = key
      return
    }
    if (announced.current === key) return
    // A frame later, once a closing palette or drawer has let go of focus (its trap is lifted in
    // the same commit as the move).
    const place = requestAnimationFrame(() => {
      const active = document.activeElement
      if (active === null || active === document.body || active.closest('[role="dialog"]')) {
        document.getElementById('main')?.focus({ preventScroll: true })
      }
    })
    // Re-armed by every title change on the way, so it reads the page's own title, not the
    // default it replaced.
    let frame = 0
    const timer = window.setTimeout(() => {
      announced.current = key
      setMessage('')
      frame = requestAnimationFrame(() => setMessage(document.title))
    }, ANNOUNCE_AFTER_MS)
    return () => {
      cancelAnimationFrame(place)
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
  }, [key, title])

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  )
}
