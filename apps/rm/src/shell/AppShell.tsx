import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import type { RmSession } from '../api/session.ts'
import { preloadWhenIdle } from './pages.ts'
import { recordCustomerOpen } from './recent.ts'
import { SearchPalette, useSearch } from './Search.tsx'
import { Sidebar } from './Sidebar.tsx'
import { TopBar } from './TopBar.tsx'

/**
 * Sidebar, top bar, and the page. Content is capped at 1440 so a table on a wide monitor stays
 * scannable instead of stretching its columns apart; the gutters are generous because the
 * density lives inside the cards, not between them.
 */
export function AppShell({ session }: { session: RmSession }) {
  const search = useSearch()
  useRecordCustomerOpens(session.rm.rmId)
  // Today is on screen; fetch every other page's code while the RM reads it.
  useEffect(() => preloadWhenIdle(), [])
  return (
    <div className="min-h-screen bg-ground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-label focus:shadow-popover"
      >
        Skip to content
      </a>
      <Sidebar session={session} />
      <div className="pl-sidebar">
        <TopBar onSearch={() => search.setOpen(true)} />
        <main id="main" className="mx-auto w-full max-w-content px-8 pt-8 pb-16">
          <Outlet />
        </main>
      </div>
      <SearchPalette open={search.open} onOpenChange={search.setOpen} />
    </div>
  )
}

/** Every customer file opened, from any page, becomes the top of Cmd-K's recent list. */
function useRecordCustomerOpens(rmId: string) {
  const { pathname } = useLocation()
  useEffect(() => {
    const match = /^\/customers\/([^/]+)/.exec(pathname)
    if (!match?.[1]) return
    try {
      recordCustomerOpen(rmId, decodeURIComponent(match[1]))
    } catch {
      // A malformed address (a stray %) opens no file, so there is nothing to remember.
    }
  }, [pathname, rmId])
}
