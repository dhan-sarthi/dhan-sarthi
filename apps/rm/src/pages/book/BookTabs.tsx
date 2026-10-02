import type { BookTab } from '@dhan/contracts'
import { Fragment, useRef, type KeyboardEvent } from 'react'
import { cn } from '../../lib/cn.ts'
import { formatCount } from '../../lib/format.ts'
import type { SegmentTab } from '../../ui/index.ts'
import { SEGMENT_TABS, WORK_TABS } from './rows.ts'

/**
 * The strip over the book, in two groups with a hairline between them: who the customer is (All,
 * Priority, Affluent, Mass) and what there is to do (At risk, Idle cash, Asked for you). Each tab
 * is as wide as its words, with its count right after the label ("Priority 7"), so a label and
 * its number read as one thing.
 *
 * One tablist, not two: the arrow keys walk the whole strip and exactly one tab is selected, so
 * a keyboard user always has a way in. The kit's `SegmentTabs` draws equal-width cells with the
 * count pushed to the far edge and no grouping; this is the shape the book needs.
 */
export function BookTabs({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: readonly SegmentTab<BookTab>[]
  value: BookTab
  onChange: (id: BookTab) => void
  label: string
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const ordered = [...SEGMENT_TABS, ...WORK_TABS]
    .map((id) => tabs.find((t) => t.id === id))
    .filter((t): t is SegmentTab<BookTab> => t !== undefined)

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = ordered.length - 1
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (next === null) return
    event.preventDefault()
    const tab = ordered[next]
    if (!tab) return
    onChange(tab.id)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        // Measured against its own width: beside the rail the tabs tighten before they scroll.
        '@container flex items-center overflow-x-auto rounded-lg border border-hairline bg-surface p-1 @3xl:gap-0.5',
        className,
      )}
    >
      {ordered.map((tab, index) => {
        const selected = tab.id === value
        const firstOfWork = tab.id === WORK_TABS[0] && index > 0
        return (
          <Fragment key={tab.id}>
            {firstOfWork ? (
              <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-hairline @3xl:mx-2" />
            ) : null}
            <button
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
                'flex shrink-0 items-baseline gap-1 rounded-md px-1.5 py-1.5 text-label whitespace-nowrap transition-colors duration-150 @3xl:gap-1.5 @3xl:px-3',
                'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus',
                selected
                  ? 'bg-brand-wash text-ink ring-1 ring-brand/25 ring-inset'
                  : 'text-ink-soft hover:bg-row-hover hover:text-ink',
              )}
            >
              {tab.label}
              <span className={cn('tabular', selected ? 'text-brand-deep' : 'text-ink-hint')}>
                {formatCount(tab.count)}
              </span>
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}
