import { CalendarDays, CircleHelp, Menu, Search, WifiOff } from 'lucide-react'
import { useMe } from '../api/queries.ts'
import { formatDate } from '../lib/format.ts'
import { MEDIA, useMediaQuery } from '../lib/media.ts'
import {
  Chip,
  describeError,
  IconButton,
  Kbd,
  modKey,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SectionLabel,
  Skeleton,
  Tooltip,
} from '../ui/index.ts'

/**
 * Search on the left, the RM clock on the right. The as-of date is the book's anchor, not
 * today's date: every figure on the console is as at that day, and the chip says so on every
 * page. Each chip's explanation opens on hover, on focus and on a tap.
 *
 * Narrow, the bar gives way in order: the search box shrinks first (its hint truncates), then
 * the chips shorten ("Demo", the date behind its calendar icon), and Help always stays. Below a
 * tablet the navigation is a drawer, opened from the menu button at the bar's left.
 */
export function TopBar({
  onSearch,
  onMenu,
  menuOpen = false,
}: {
  onSearch: () => void
  /** Given, the bar starts with the button that opens the navigation drawer. */
  onMenu?: () => void
  menuOpen?: boolean
}) {
  const me = useMe()
  // Narrow, the as-of chip is only its calendar icon, so its explanation carries the date.
  const wide = useMediaQuery(MEDIA.tablet)

  return (
    <header className="sticky top-0 z-20 flex h-topbar items-center gap-2 border-b border-hairline bg-ground px-4 tablet:gap-4 tablet:px-6 laptop:px-8">
      {onMenu ? (
        <IconButton
          label="Open navigation"
          icon={<Menu aria-hidden />}
          tooltip={false}
          onClick={onMenu}
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          className="-ml-1.5"
        />
      ) : null}
      <button
        type="button"
        onClick={onSearch}
        className="group flex h-control w-full min-w-0 max-w-md items-center gap-2.5 rounded-md border border-hairline bg-surface px-3 text-left text-label-plain text-ink-hint shadow-raised transition-colors hover:border-hover-edge focus-visible:outline-2 focus-visible:outline-focus"
      >
        <Search aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Search customers or jump to a page</span>
        <span className="flex items-center gap-0.5 pointer-coarse:hidden" aria-hidden>
          <Kbd>{modKey()}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {me.data ? (
          <>
            {me.data.demo ? (
              <Tooltip
                openOnTap
                content="Every customer on this console is synthetic. No real customer data is shown."
              >
                <span
                  tabIndex={0}
                  className="rounded-sm focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <Chip tone="outline" size="md">
                    <span className="tablet:hidden">Demo</span>
                    <span className="hidden tablet:inline">Demo data</span>
                  </Chip>
                </span>
              </Tooltip>
            ) : null}
            <Tooltip
              openOnTap
              content={
                wide
                  ? 'The book is shown as at this date. Every figure is measured to it.'
                  : `The book is shown as at ${formatDate(me.data.asOf)}. Every figure is measured to it.`
              }
            >
              <span
                tabIndex={0}
                className="rounded-sm focus-visible:outline-2 focus-visible:outline-focus"
              >
                <Chip
                  tone="neutral"
                  size="md"
                  icon={<CalendarDays aria-hidden />}
                  className="text-ink max-tablet:gap-0"
                >
                  <span className="sr-only tablet:not-sr-only">
                    As of {formatDate(me.data.asOf)}
                  </span>
                </Chip>
              </span>
            </Tooltip>
          </>
        ) : me.isPending ? (
          <Skeleton className="h-6 w-16 tablet:w-36" />
        ) : (
          <Tooltip openOnTap content={describeError(me.error)}>
            <span
              tabIndex={0}
              className="rounded-sm focus-visible:outline-2 focus-visible:outline-focus"
            >
              <Chip tone="danger" size="md" icon={<WifiOff aria-hidden />}>
                <span className="sr-only tablet:not-sr-only">Server not reachable</span>
              </Chip>
            </span>
          </Tooltip>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <IconButton label="Help" icon={<CircleHelp aria-hidden />} tooltip={false} />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1.5rem)]">
            <SectionLabel as="p" className="mb-3">
              Shortcuts
            </SectionLabel>
            <dl className="grid gap-2 text-label">
              {[
                ['Search the book', [modKey(), 'K']],
                ['Move along a list', ['↑', '↓']],
                ['Open the selected row', ['Enter']],
                ['Close a preview or dialog', ['Esc']],
              ].map(([label, keysList]) => (
                <div key={label as string} className="flex items-center justify-between gap-3">
                  <dt className="text-label-plain text-ink-soft">{label as string}</dt>
                  <dd className="flex gap-1">
                    {(keysList as string[]).map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
            <hr className="my-4 border-hairline-soft" />
            <p className="text-caption-plain text-ink-soft">
              Figures are balances and holdings across every bank the customer has linked, as at the
              date in the top bar. Uday never decides suitability: every verdict on the console is
              the rules&rsquo; own.
            </p>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  )
}
