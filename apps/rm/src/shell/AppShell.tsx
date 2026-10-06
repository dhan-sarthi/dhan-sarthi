import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import type { RmSession } from '../api/session.ts'
import { MEDIA, useMediaQuery } from '../lib/media.ts'
import { preloadPagesWhenSettled } from './pages.ts'
import { recordCustomerOpen } from './recent.ts'
import { SearchPalette, useSearch } from './Search.tsx'
import { NavDrawer, Sidebar } from './Sidebar.tsx'
import { routeKey } from './title.ts'
import { TopBar } from './TopBar.tsx'

/**
 * How the shell lays out at the window's width: the full sidebar on a laptop and up (1100px and
 * wider), an icon rail on a tablet, a drawer below that. 1280–1600, the RM's desk, is `full`.
 */
export type ShellLayout = 'full' | 'rail' | 'drawer'

export function useShellLayout(): ShellLayout {
  const laptop = useMediaQuery(MEDIA.laptop)
  const tablet = useMediaQuery(MEDIA.tablet)
  return laptop ? 'full' : tablet ? 'rail' : 'drawer'
}

/**
 * Sidebar, top bar, and the page. Content is capped at 1440 so a table on a wide monitor stays
 * scannable instead of stretching its columns apart; the gutters are generous on a desk because
 * the density lives inside the cards, not between them, and tighten on a tablet and a phone so
 * the page keeps its room.
 */
export function AppShell({ session }: { session: RmSession }) {
  const search = useSearch()
  const layout = useShellLayout()
  const [drawer, setDrawer] = useState(false)
  // A drawer left open while the window widens has nothing to close it.
  if (drawer && layout !== 'drawer') setDrawer(false)
  useRecordCustomerOpens(session.rm.rmId)
  usePreloadPages()

  return (
    <div className="min-h-screen bg-ground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-label focus:shadow-popover"
      >
        Skip to content
      </a>
      {layout === 'drawer' ? (
        <NavDrawer session={session} open={drawer} onOpenChange={setDrawer} />
      ) : (
        <Sidebar session={session} compact={layout === 'rail'} />
      )}
      <div className="tablet:pl-sidebar-rail laptop:pl-sidebar">
        <TopBar
          onSearch={() => search.setOpen(true)}
          {...(layout === 'drawer' ? { onMenu: () => setDrawer(true), menuOpen: drawer } : {})}
        />
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-content px-4 pt-6 pb-16 outline-none tablet:px-6 laptop:px-8 laptop:pt-8"
        >
          <Outlet />
        </main>
      </div>
      <SearchPalette open={search.open} onOpenChange={search.setOpen} />
    </div>
  )
}

/**
 * The other pages' code, fetched once the first page has its data (`pages.ts`), the likeliest
 * next pages first.
 */
function usePreloadPages() {
  const client = useQueryClient()
  const { pathname } = useLocation()
  const [firstRoute] = useState(() => routeKey(pathname))
  useEffect(() => preloadPagesWhenSettled(client, firstRoute), [client, firstRoute])
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
