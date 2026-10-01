import { LogOut } from 'lucide-react'
import { NavLink } from 'react-router'
import { useBook, useSignOut } from '../api/queries.ts'
import type { RmSession } from '../api/session.ts'
import { cn } from '../lib/cn.ts'
import { Avatar, IconButton } from '../ui/index.ts'
import { Brand } from './Brand.tsx'
import { NAV } from './nav.ts'

export function Sidebar({ session }: { session: RmSession }) {
  const book = useBook()
  const signOut = useSignOut()
  const openHandoffs = book.data?.totals.openHandoffs ?? 0

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-sidebar flex-col border-r border-hairline bg-ground">
      <div className="flex h-topbar items-center px-5">
        <Brand />
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pt-3">
        <ul className="grid gap-0.5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-label transition-colors duration-150',
                    'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus',
                    isActive
                      ? 'bg-surface text-ink shadow-raised ring-1 ring-hairline'
                      : 'text-ink-soft hover:bg-ink/5 hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      aria-hidden
                      className={cn(
                        'size-4 shrink-0',
                        isActive ? 'text-brand' : 'text-ink-hint group-hover:text-ink-soft',
                      )}
                    />
                    <span className="flex-1">{label}</span>
                    {to === '/' && openHandoffs > 0 ? (
                      <span
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-caption tabular text-on-brand"
                        aria-label={`${openHandoffs} open request${openHandoffs === 1 ? '' : 's'} to talk to you`}
                      >
                        {openHandoffs}
                      </span>
                    ) : null}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-hairline p-3">
        <div className="flex items-start gap-2.5 rounded-md px-2 py-1.5">
          <Avatar
            name={session.rm.name}
            initials={session.rm.initials}
            size="sm"
            tone="brand"
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-label text-ink">{session.rm.name}</p>
            <p className="text-caption font-normal text-pretty text-ink-faint">{session.rm.desk}</p>
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
    </aside>
  )
}
