import { useRef, type KeyboardEvent } from 'react'
import { cn } from '../lib/cn.ts'
import { formatCount } from '../lib/format.ts'

export interface SegmentTab<Id extends string> {
  id: Id
  label: string
  count: number
}

export interface SegmentTabsProps<Id extends string> {
  tabs: readonly SegmentTab<Id>[]
  value: Id
  onChange: (id: Id) => void
  label: string
  className?: string
}

/**
 * The strip over the book: each tab a label and its count ("At risk 9"), the selected one tinted.
 * The counts are the point: the RM sees how the book divides before choosing a slice of it.
 * Arrow keys move along the strip, as in any tab list.
 */
export function SegmentTabs<Id extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: SegmentTabsProps<Id>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (delta === 0) return
    event.preventDefault()
    const next = (index + delta + tabs.length) % tabs.length
    const tab = tabs[next]
    if (!tab) return
    onChange(tab.id)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'flex overflow-x-auto rounded-lg border border-hairline bg-surface p-1',
        className,
      )}
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === value
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[index] = el
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              'flex min-w-fit flex-1 items-center justify-between gap-4 rounded-md px-3 py-2 text-left transition-colors duration-150',
              'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus',
              selected
                ? 'bg-brand-wash text-ink ring-1 ring-brand/25 ring-inset'
                : 'text-ink-soft hover:bg-row-hover hover:text-ink',
            )}
          >
            <span className="text-label whitespace-nowrap">{tab.label}</span>
            <span
              className={cn('text-label tabular', selected ? 'text-brand-deep' : 'text-ink-hint')}
            >
              {formatCount(tab.count)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
