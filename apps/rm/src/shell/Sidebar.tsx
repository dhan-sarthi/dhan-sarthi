import { LogOut, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useRef, type ReactNode } from 'react'
import { matchPath, NavLink, useLocation } from 'react-router'
import { useOpenHandoffCount, useSignOut } from '../api/queries.ts'
import type { RmSession } from '../api/session.ts'
import { cn } from '../lib/cn.ts'
import { Avatar, IconButton, restoreFocus, Tooltip, useOpenerFocus } from '../ui/index.ts'
import { Brand } from './Brand.tsx'
import { NAV } from './nav.ts'

/**
 * The navigation, in the shell's three widths (`layout.ts`):
 *
 * - `full` (a laptop and up): the 232px sidebar with labels, as the console was designed.
 * - `rail` (a tablet): a 56px column of icons, each named in a tooltip with its one-line hint, so
 *   the page keeps the room it needs.
 * - the drawer (a phone, or a laptop at 200% zoom): `NavDrawer`, the full sidebar sliding in over
 *   the page from a menu button in the top bar.
 */
export function Sidebar({ session, compact = false }: { session: RmSession; compact?: boolean }) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 flex flex-col border-r border-hairline bg-ground',
        compact ? 'w-sidebar-rail' : 'w-sidebar',
      )}
    >
      <SidebarBody session={session} compact={compact} />
    </aside>
  )
}

/** The full sidebar as a drawer over the page, for the narrowest widths. */
export function NavDrawer({
  session,
  open,
  onOpenChange,
}: {
  session: RmSession
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* The drawer inside its overlay, so its exit animation runs (see `ui/Dialog.tsx`). */}
        <DialogPrimitive.Overlay className="animate-overlay fixed inset-0 z-40 bg-overlay">
          <DrawerContent session={session} onClose={() => onOpenChange(false)} />
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function DrawerContent({ session, onClose }: { session: RmSession; onClose: () => void }) {
  const opener = useOpenerFocus()
  const ref = useRef<HTMLDivElement>(null)
  return (
    <DialogPrimitive.Content
      ref={ref}
      aria-describedby={undefined}
      onCloseAutoFocus={(event) => restoreFocus(event, opener, ref.current)}
      className="animate-drawer fixed inset-y-0 left-0 z-50 flex w-[min(var(--spacing-sidebar),85vw)] flex-col border-r border-hairline bg-ground shadow-overlay outline-none"
    >
      <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
      <SidebarBody
        session={session}
        onNavigate={onClose}
        close={
          <DialogPrimitive.Close asChild>
            <IconButton label="Close navigation" icon={<X aria-hidden />} tooltip={false} />
          </DialogPrimitive.Close>
        }
      />
    </DialogPrimitive.Content>
  )
}

function SidebarBody({
  session,
  compact = false,
  onNavigate,
  close,
}: {
  session: RmSession
  compact?: boolean
  onNavigate?: () => void
  close?: ReactNode
}) {
  const signOut = useSignOut()
  const openHandoffs = useOpenHandoffCount()
  const { pathname } = useLocation()

  return (
    <>
      <div
        className={cn(
          'flex h-topbar shrink-0 items-center',
          compact ? 'justify-center' : 'justify-between px-5',
        )}
      >
        <Brand compact={compact} />
        {close}
      </div>

      <nav
        aria-label="Main"
        className={cn('flex-1 overflow-y-auto pt-3', compact ? 'px-2' : 'px-3')}
      >
        <ul className="grid gap-0.5">
          {NAV.map(({ to, label, hint, icon: Icon }) => {
            const badge = to === '/' && openHandoffs > 0 ? openHandoffs : null
            // Worked out here rather than through NavLink's className function: on the rail the
            // link is a tooltip's trigger, and the trigger's merged className would drop a function.
            const isActive = matchPath({ path: to, end: to === '/' }, pathname) !== null
            const link = (
              <NavLink
                to={to}
                end={to === '/'}
                onClick={onNavigate}
                className={cn(
                  'group relative flex items-center rounded-md text-label transition-colors duration-feedback',
                  compact
                    ? 'size-10 justify-center pointer-coarse:size-11'
                    : 'h-9 gap-2.5 px-2.5 pointer-coarse:h-11',
                  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus',
                  isActive
                    ? 'bg-surface text-ink shadow-raised ring-1 ring-hairline'
                    : 'text-ink-soft hover:bg-ghost-hover hover:text-ink',
                )}
              >
                <>
                  <Icon
                    aria-hidden
                    className={cn(
                      'size-4 shrink-0',
                      isActive ? 'text-brand' : 'text-ink-hint group-hover:text-ink-soft',
                    )}
                  />
                  <span className={cn('flex-1', compact && 'sr-only')}>{label}</span>
                  {badge !== null ? (
                    <span
                      className={cn(
                        'inline-flex items-center justify-center rounded-full bg-brand text-caption tabular text-on-brand',
                        compact
                          ? 'absolute top-0.5 right-0.5 h-4 min-w-4 px-1'
                          : 'h-5 min-w-5 px-1.5',
                      )}
                    >
                      <span aria-hidden>{badge}</span>
                      <span className="sr-only">
                        , {badge} open request{badge === 1 ? '' : 's'} to talk to you
                      </span>
                    </span>
                  ) : null}
                </>
              </NavLink>
            )
            return (
              <li key={to} className={cn(compact && 'flex justify-center')}>
                {compact ? (
                  <Tooltip
                    side="right"
                    content={
                      <>
                        <span className="block text-chart-tooltip-text">{label}</span>
                        <span className="block text-caption-plain text-chart-tooltip-muted">
                          {hint}
                        </span>
                      </>
                    }
                  >
                    {link}
                  </Tooltip>
                ) : (
                  link
                )}
              </li>
            )
          })}
        </ul>
      </nav>

      <div className={cn('border-t border-hairline', compact ? 'p-2' : 'p-3')}>
        <div
          className={cn(
            'flex rounded-md',
            compact ? 'flex-col items-center gap-2 py-1.5' : 'items-start gap-2.5 px-2 py-1.5',
          )}
        >
          <Avatar
            name={session.rm.name}
            initials={session.rm.initials}
            size="sm"
            tone="brand"
            className={cn(!compact && 'mt-0.5')}
          />
          <div className={cn('min-w-0 flex-1 leading-tight', compact && 'sr-only')}>
            <p className="truncate text-label text-ink">{session.rm.name}</p>
            <p className="text-caption-plain text-pretty text-ink-faint">{session.rm.desk}</p>
          </div>
          <IconButton
            label="Sign out"
            icon={<LogOut aria-hidden />}
            size="sm"
            onClick={() => signOut.mutate()}
            disabled={signOut.isPending}
          />
        </div>
      </div>
    </>
  )
}
