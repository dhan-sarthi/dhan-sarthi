/**
 * The window title: "Book · RM Desk", "Karan Deshpande · Money · RM Desk".
 *
 * Every route has a default, named from the address (`routeTitle`), set the moment the address
 * changes, so the title is right while the page's code and data are still on the way. A page that
 * knows better (the customer's name, the Book's count) overrides it with `useDocumentTitle`; the
 * override lasts while the page is mounted, and the default comes back when it goes. Browser tabs,
 * history and a screen reader's window list then tell two customer files apart.
 *
 * `index.html`'s "RM Desk · IDBI Bank" stays as the title before the app has started.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { NAV } from './nav.ts'

export const TITLE_SUFFIX = 'RM Desk'

/** "Book" → "Book · RM Desk"; parts that are missing are left out. */
export function formatTitle(...parts: readonly (string | null | undefined | false)[]): string {
  return [
    ...parts.filter((p): p is string => typeof p === 'string' && p !== ''),
    TITLE_SUFFIX,
  ].join(' · ')
}

/** The customer file's tabs, by their path segment, as the tab strip names them. */
export const CUSTOMER_TABS: Readonly<Record<string, string>> = {
  '': 'Overview',
  journey: 'Journey',
  money: 'Money',
  goals: 'Goals & plan',
  record: 'Advice record',
}

/**
 * The page part of a route's default title, from its address alone. A customer file's default is
 * "Customer file · <Tab>" until the page names the customer.
 */
export function routeTitle(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/'
  const nav = NAV.find((item) => item.to === path)
  if (nav) return nav.label
  if (path === '/login') return 'Sign in'
  if (path === '/kit') return 'Component kit'
  const customer = /^\/customers\/[^/]+(?:\/([^/]+))?$/.exec(path)
  if (customer) {
    const tab = CUSTOMER_TABS[customer[1] ?? '']
    return tab ? `Customer file · ${tab}` : 'Not found'
  }
  return 'Not found'
}

/**
 * Which page an address is, for deciding what counts as moving to another page: a customer
 * file's five tabs are one page, so switching tabs updates the title but is not announced.
 */
export function routeKey(pathname: string): string {
  const customer = /^\/customers\/([^/]+)/.exec(pathname)
  return customer ? `/customers/${customer[1]}` : pathname.replace(/\/+$/, '') || '/'
}

/* ---------------------------------------------------------------- Store */

let base = ''
const overrides: { title: string }[] = []
const listeners = new Set<() => void>()

function apply(): void {
  const top = overrides[overrides.length - 1]
  const title = formatTitle(top ? top.title : base)
  if (typeof document !== 'undefined' && document.title !== title) document.title = title
  for (const fn of listeners) fn()
}

/** The shell's default for the current address. */
export function setRouteTitle(title: string): void {
  if (base === title) return
  base = title
  apply()
}

/**
 * The page's own title, without the suffix ("Karan Deshpande · Money"), for as long as the page
 * is mounted. `null` (still loading, say) leaves the route's default in place.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title) return
    const entry = { title }
    overrides.push(entry)
    apply()
    return () => {
      const at = overrides.indexOf(entry)
      if (at >= 0) overrides.splice(at, 1)
      apply()
    }
  }, [title])
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

const snapshot = (): string => (typeof document === 'undefined' ? '' : document.title)

/** The title as it stands, re-rendering when a page changes it. */
export function useCurrentTitle(): string {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
