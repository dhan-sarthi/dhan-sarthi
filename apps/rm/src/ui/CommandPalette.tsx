import { Command } from 'cmdk'
import { CornerDownLeft, Search } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn.ts'
import { restoreFocus, useOpenerFocus } from './Dialog.tsx'
import { Kbd } from './Kbd.tsx'

export interface CommandItemDef {
  id: string
  label: string
  /** Quiet text on the right: "Affluent · Pune", "Page". */
  hint?: string
  icon?: ReactNode
  /** Extra words that should find this item: a CIF, a city. Used only when the palette filters. */
  keywords?: string[]
  /** A run of the label to draw bold, as [start, end): the part the query matched. */
  highlight?: readonly [number, number] | null
  onSelect: () => void
}

export interface CommandGroupDef {
  heading: string
  items: readonly CommandItemDef[]
  /**
   * What one item of the group is, for the result count a screen reader hears ("3 customers,
   * 1 page"). Left out, the count names the heading instead ("3 in Recent").
   */
  noun?: { one: string; many: string }
}

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: readonly CommandGroupDef[]
  placeholder?: string
  /** True while the book is still loading: the palette says so instead of "no results". */
  loading?: boolean
  /**
   * The text in the search box. Pass it with `onQueryChange` and the palette stops filtering:
   * the caller ranks the groups itself and the palette shows them in the order given.
   */
  query?: string
  onQueryChange?: (query: string) => void
  /** What an empty result says. */
  emptyText?: string
}

/**
 * Cmd-K (Ctrl-K elsewhere): find a customer by name, CIF or city, or jump to a page. Left to
 * itself it filters with cmdk's fuzzy match over the label and keywords; given `query` and
 * `onQueryChange`, it shows the caller's ranked groups as they are (the console's search does
 * this, see `lib/search.ts`). Selection closes the palette.
 *
 * For a screen reader the highlighted result is always the input's active descendant, from the
 * first render and after every query, and a polite status says how many results there are, so
 * Enter never picks a row nobody heard. Focus returns to wherever it was when the palette opened,
 * unless the pick moved it on purpose (to the page it opened).
 */
export function CommandPalette({ open, onOpenChange, ...props }: CommandPaletteProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* The palette inside its overlay, so the exit animations run (see `Dialog.tsx`). */}
        <DialogPrimitive.Overlay className="animate-overlay fixed inset-0 z-50 bg-overlay">
          <OpenPalette onOpenChange={onOpenChange} {...props} />
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** The value cmdk gives an item: the label for its own filter, the id to keep it unique. */
const itemValue = (item: CommandItemDef): string => `${item.label} ${item.id}`

/** "3 customers, 1 page": the result count, merged by noun, in the groups' order. */
export function resultSummary(groups: readonly CommandGroupDef[]): string {
  const parts = new Map<string, number>()
  const words = new Map<string, { one: string; many: string } | null>()
  for (const group of groups) {
    if (group.items.length === 0) continue
    const key = group.noun ? group.noun.many : group.heading
    parts.set(key, (parts.get(key) ?? 0) + group.items.length)
    words.set(key, group.noun ?? null)
  }
  return [...parts]
    .map(([key, n]) => {
      const noun = words.get(key)
      return noun ? `${n} ${n === 1 ? noun.one : noun.many}` : `${n} in ${key}`
    })
    .join(', ')
}

function OpenPalette({
  onOpenChange,
  groups,
  placeholder = 'Search customers by name, CIF or city',
  loading = false,
  query,
  onQueryChange,
  emptyText = 'No customer or page matches that.',
}: Omit<CommandPaletteProps, 'open'>) {
  const controlled = onQueryChange !== undefined
  const opener = useOpenerFocus()
  const contentRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // The highlighted row is ours, not cmdk's: whenever the results change, the first one is
  // highlighted again, so after "Karan" the row under the cursor is the best match, not
  // whatever sat at that index before.
  const firstValue = groups.flatMap((g) => g.items).map(itemValue)[0] ?? ''
  const resultsKey = groups.map((g) => g.items.map((i) => i.id).join(',')).join('|')
  const [selected, setSelected] = useState(firstValue)
  const [shownKey, setShownKey] = useState(resultsKey)
  if (resultsKey !== shownKey) {
    setShownKey(resultsKey)
    setSelected(firstValue)
  }

  // cmdk names the active descendant one step behind (or not at all) when the results change
  // under a controlled value; keep the input pointing at the row that is actually selected.
  useEffect(() => {
    const input = inputRef.current
    const list = listRef.current
    if (!input || !list) return
    const sync = () => {
      const row = list.querySelector<HTMLElement>('[cmdk-item][aria-selected="true"]')
      const id = row?.id ?? ''
      if ((input.getAttribute('aria-activedescendant') ?? '') === id) return
      if (id) input.setAttribute('aria-activedescendant', id)
      else input.removeAttribute('aria-activedescendant')
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(list, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-selected'],
    })
    observer.observe(input, { attributes: true, attributeFilter: ['aria-activedescendant'] })
    return () => observer.disconnect()
  }, [])

  const total = groups.reduce((n, g) => n + g.items.length, 0)
  const status = loading
    ? 'Loading your book'
    : total === 0
      ? emptyText
      : `${resultSummary(groups)}. Use the arrow keys to move, Enter to open.`

  return (
    <DialogPrimitive.Content
      ref={contentRef}
      aria-describedby={undefined}
      onCloseAutoFocus={(event) => restoreFocus(event, opener, contentRef.current)}
      className="animate-pop fixed top-[14vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-hairline bg-surface shadow-overlay outline-none"
    >
      <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
      <Command
        loop
        shouldFilter={!controlled}
        value={selected}
        onValueChange={setSelected}
        className="flex flex-col"
        label="Search the console"
      >
        <div className="flex h-13 items-center gap-3 border-b border-hairline px-4">
          <Search aria-hidden className="size-4 shrink-0 text-ink-hint" />
          <Command.Input
            ref={inputRef}
            autoFocus
            {...(controlled ? { value: query ?? '', onValueChange: onQueryChange } : {})}
            placeholder={placeholder}
            className="h-full min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-hint"
          />
          <Kbd className="pointer-coarse:hidden">Esc</Kbd>
        </div>
        <p role="status" className="sr-only">
          {status}
        </p>
        <Command.List
          ref={listRef}
          className="max-h-[min(60dvh,420px)] scroll-py-2 overflow-y-auto overscroll-contain p-2"
        >
          {loading ? (
            <Command.Loading>
              <p className="px-3 py-6 text-center text-label-plain text-ink-soft">
                Loading your book…
              </p>
            </Command.Loading>
          ) : null}
          <Command.Empty className="px-3 py-8 text-center text-label-plain text-ink-soft">
            {emptyText}
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
                    value={itemValue(item)}
                    keywords={item.keywords ?? []}
                    onSelect={() => {
                      onOpenChange(false)
                      item.onSelect()
                    }}
                    className="group flex h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-label text-ink data-[selected=true]:bg-brand-wash pointer-coarse:h-11"
                  >
                    {item.icon ? (
                      <span className="inline-flex shrink-0 text-ink-soft [&_svg]:size-4">
                        {item.icon}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">
                      <Label text={item.label} highlight={item.highlight ?? null} />
                    </span>
                    {item.hint ? (
                      <span className="max-w-1/2 shrink-0 truncate text-caption-plain text-ink-faint">
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
  )
}

/** The label with the matched run in the full ink weight, so the RM sees why a row is listed. */
function Label({ text, highlight }: { text: string; highlight: readonly [number, number] | null }) {
  if (!highlight) return <>{text}</>
  const [start, end] = highlight
  if (start < 0 || end <= start || end > text.length) return <>{text}</>
  return (
    <>
      {text.slice(0, start)}
      <mark className="bg-transparent font-semibold text-ink">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
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
