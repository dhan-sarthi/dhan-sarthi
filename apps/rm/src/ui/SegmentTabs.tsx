import { Fragment, useRef, type KeyboardEvent } from 'react'
import { cn } from '../lib/cn.ts'
import { formatCount } from '../lib/format.ts'

export interface SegmentTab<Id extends string> {
  id: Id
  label: string
  count: number
  /**
   * Tabs that belong together ("who the customer is", "what there is to do"). A hairline is drawn
   * wherever the group changes, in the order the tabs are given.
   */
  group?: string
}

export interface SegmentTabsProps<Id extends string> {
  tabs: readonly SegmentTab<Id>[]
  value: Id
  onChange: (id: Id) => void
  label: string
  /**
   * `fill`: equal cells across the strip, the count at each cell's far edge. `fit`: each tab as
   * wide as its words with its count right after the label ("Priority 7"), tightening before it
   * scrolls when the strip is narrow (beside a rail, say).
   */
  layout?: 'fill' | 'fit'
  className?: string
}

/**
 * A strip of tabs that each say how many they hold ("At risk 9"), the selected one tinted. The
 * counts are the point: the RM sees how a list divides before choosing a slice of it. One tablist
 * however many groups it has, so the arrow keys (and Home, End) walk the whole strip and exactly
 * one tab is selected.
 */
export function SegmentTabs<Id extends string>({
  tabs,
  value,
  onChange,
  label,
  layout = 'fill',
  className,
}: SegmentTabsProps<Id>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const fit = layout === 'fit'

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1
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
        // Measured against its own width: beside the rail the tabs tighten before they scroll.
        fit && '@container items-center @3xl:gap-0.5',
        className,
      )}
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === value
        const previous = tabs[index - 1]
        const newGroup = previous !== undefined && previous.group !== tab.group
        return (
          <Fragment key={tab.id}>
            {newGroup ? (
              <span
                aria-hidden
                className={cn(
                  'h-5 w-px shrink-0 self-center bg-hairline',
                  fit ? 'mx-1 @3xl:mx-2' : 'mx-1',
                )}
              />
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
                'rounded-md text-left text-label whitespace-nowrap transition-colors duration-feedback',
                fit
                  ? 'flex shrink-0 items-baseline gap-1 px-1.5 py-1.5 @3xl:gap-1.5 @3xl:px-3 pointer-coarse:py-3'
                  : 'flex min-w-fit flex-1 items-center justify-between gap-4 px-3 py-2 pointer-coarse:py-3',
                'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus',
                selected
                  ? 'bg-brand-wash text-ink ring-1 ring-selected-edge ring-inset'
                  : 'text-ink-soft hover:bg-row-hover hover:text-ink',
              )}
            >
              {tab.label}
              {/* ink-faint, not ink-hint: the count sits on the hover tint too. */}
              <span className={cn('tabular', selected ? 'text-brand-deep' : 'text-ink-faint')}>
                {formatCount(tab.count)}
              </span>
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}
