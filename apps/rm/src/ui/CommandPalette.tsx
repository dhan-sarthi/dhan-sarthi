import { Command } from 'cmdk'
import { CornerDownLeft, Search } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, type ReactNode } from 'react'
import { cn } from '../lib/cn.ts'
import { Kbd } from './Kbd.tsx'

export interface CommandItemDef {
  id: string
  label: string
  /** Quiet text on the right: "Affluent · Pune", "Page". */
  hint?: string
  icon?: ReactNode
  /** Extra words that should find this item: a CIF, a city. */
  keywords?: string[]
  onSelect: () => void
}

export interface CommandGroupDef {
  heading: string
  items: readonly CommandItemDef[]
}

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: readonly CommandGroupDef[]
  placeholder?: string
  /** True while the book is still loading: the palette says so instead of "no results". */
  loading?: boolean
}

/**
 * Cmd-K (Ctrl-K elsewhere): find a customer by name, CIF or city, or jump to a page. Matching is
 * cmdk's fuzzy filter over the label and the keywords; selection closes the palette.
 */
export function CommandPalette({
  open,
  onOpenChange,
  groups,
  placeholder = 'Search customers by name, CIF or city',
  loading = false,
}: CommandPaletteProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="animate-overlay fixed inset-0 z-50 bg-overlay" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="animate-pop fixed top-[14vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-hairline bg-surface shadow-overlay outline-none"
        >
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
          <Command loop className="flex flex-col" label="Search the console">
            <div className="flex h-13 items-center gap-3 border-b border-hairline px-4">
              <Search aria-hidden className="size-4 shrink-0 text-ink-hint" />
              <Command.Input
                autoFocus
                placeholder={placeholder}
                className="h-full flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-hint"
              />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[min(60vh,420px)] scroll-py-2 overflow-y-auto p-2">
              {loading ? (
                <Command.Loading>
                  <p className="px-3 py-6 text-center text-label font-normal text-ink-soft">
                    Loading your book…
                  </p>
                </Command.Loading>
              ) : null}
              <Command.Empty className="px-3 py-8 text-center text-label font-normal text-ink-soft">
                No customer or page matches that.
              </Command.Empty>
              {groups.map((group) =>
                group.items.length === 0 ? null : (
                  <Command.Group
                    key={group.heading}
                    heading={group.heading}
                    className={cn(
                      '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1.5',
                      '[&_[cmdk-group-heading]]:text-micro [&_[cmdk-group-heading]]:tracking-micro [&_[cmdk-group-heading]]:text-ink-faint [&_[cmdk-group-heading]]:uppercase',
                    )}
                  >
                    {group.items.map((item) => (
                      <Command.Item
                        key={item.id}
                        value={`${item.label} ${item.id}`}
                        keywords={item.keywords ?? []}
                        onSelect={() => {
                          onOpenChange(false)
                          item.onSelect()
                        }}
                        className="group flex h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-label text-ink data-[selected=true]:bg-brand-wash"
                      >
                        {item.icon ? (
                          <span className="inline-flex shrink-0 text-ink-soft [&_svg]:size-4">
                            {item.icon}
                          </span>
                        ) : null}
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.hint ? (
                          <span className="shrink-0 text-caption font-normal text-ink-faint">
                            {item.hint}
                          </span>
                        ) : null}
                        <CornerDownLeft
                          aria-hidden
                          className="size-3.5 shrink-0 text-ink-hint opacity-0 group-data-[selected=true]:opacity-100"
                        />
                      </Command.Item>
                    ))}
                  </Command.Group>
                ),
              )}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** Binds Cmd-K / Ctrl-K, from anywhere, including inside a text field. */
export function useCommandShortcut(onToggle: () => void): void {
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onToggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onToggle])
}
