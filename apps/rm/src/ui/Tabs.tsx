import { Tabs as TabsPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { NavLink, type To } from 'react-router'
import { cn } from '../lib/cn.ts'

/*
 * Two tab styles. `Tabs` is an underline strip for switching panes inside a page (Radix, so
 * arrow keys move between tabs). `LinkTabs` is the same look over router links, for tabs that
 * are addresses: a customer's Journey tab can be bookmarked and sent to a colleague.
 */

export const Tabs = TabsPrimitive.Root

const listClass = 'flex items-end gap-5 border-b border-hairline'
const triggerClass = cn(
  'relative -mb-px inline-flex h-10 items-center gap-1.5 border-b-2 border-transparent text-label text-ink-soft transition-colors',
  'hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus',
)
const activeClass = 'border-brand text-ink'

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn(listClass, className)} {...props} />
}

export function TabsTrigger({
  className,
  count,
  children,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger> & { count?: number }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        triggerClass,
        'data-[state=active]:border-brand data-[state=active]:text-ink',
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined ? <TabCount>{count}</TabCount> : null}
    </TabsPrimitive.Trigger>
  )
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('pt-6 outline-none', className)} {...props} />
}

function TabCount({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-xs bg-ground-deep px-1 text-caption tabular text-ink-soft">
      {children}
    </span>
  )
}

export interface LinkTab {
  to: To
  label: ReactNode
  count?: number
  /** Match the path exactly: the index tab must not light up under every child. */
  end?: boolean
}

export function LinkTabs({
  tabs,
  className,
  label,
}: {
  tabs: readonly LinkTab[]
  className?: string
  label: string
}) {
  return (
    <nav aria-label={label} className={cn(listClass, className)}>
      {tabs.map((tab, i) => (
        <NavLink
          key={i}
          to={tab.to}
          end={tab.end ?? false}
          className={({ isActive }) => cn(triggerClass, isActive && activeClass)}
        >
          {tab.label}
          {tab.count !== undefined ? <TabCount>{tab.count}</TabCount> : null}
        </NavLink>
      ))}
    </nav>
  )
}
