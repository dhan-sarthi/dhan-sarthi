import { web } from '@dhan/design'
import { useSyncExternalStore } from 'react'

/**
 * The shell's breakpoints as media queries, in rem as the theme writes them
 * (`scripts/tokens-css.mjs`), so CSS (`tablet:`, `laptop:`) and script switch at the same width
 * even when the RM has raised the browser's font size.
 */
const rem = (px: number): string => `${px / 16}rem`
export const MEDIA = {
  /** The icon rail and up: below it, the navigation is a drawer. */
  tablet: `(min-width: ${rem(web.breakpoint.tablet)})`,
  /** The full sidebar, and the Book's preview as a column beside the list. */
  laptop: `(min-width: ${rem(web.breakpoint.laptop)})`,
  coarse: '(pointer: coarse)',
} as const

type Subscribe = (onChange: () => void) => () => void

/** One subscriber per query, so a re-render never unsubscribes and subscribes again. */
const subscribers = new Map<string, Subscribe>()

function subscribeTo(query: string): Subscribe {
  let fn = subscribers.get(query)
  if (!fn) {
    fn = (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    }
    subscribers.set(query, fn)
  }
  return fn
}

/** True while the media query matches; re-renders when it flips. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribeTo(query),
    () => window.matchMedia(query).matches,
    () => false,
  )
}
