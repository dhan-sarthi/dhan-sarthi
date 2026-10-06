import { Check, Copy, Phone, StickyNote } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { CopilotButton } from '../../features/copilot/index.tsx'
import { cn } from '../../lib/cn.ts'
import { formatDate, formatLastActive, formatMonth } from '../../lib/format.ts'
import { duration, ease } from '../../lib/motion.ts'
import {
  Avatar,
  Button,
  Card,
  HealthDot,
  IconButton,
  SegmentBadge,
  Skeleton,
  StrengthBadge,
  toast,
} from '../../ui/index.ts'
import { plural, type CustomerFile } from './customer-file.ts'
import { Dot } from './parts.tsx'
import { ProseInr, ShortInr } from './figures.tsx'
import { midSentence } from './prose.ts'

/**
 * The top of the file: who this is, how strong the relationship is and why, and the three things
 * an RM does from here. Log a call is the primary action: it is what the page is for after the
 * phone goes down.
 *
 * It is kept short because it sits above every tab: on a desk the actions share the name's row
 * (Add note folds to its icon below 1440), so the tab's own content starts in the top half of the
 * window. Where the row is too narrow for both (a tablet, a phone, 200% zoom) the actions drop
 * under the name instead of covering it, and on a phone Brief me folds to its icon as Add note
 * does. Once the header scrolls away, a 56px bar takes its place under the top bar with the name
 * and the two actions an RM reaches for mid-file, so nobody scrolls back up to log a call.
 *
 * `data-customer-header` marks it for the copilot panel, which starts below whatever part of the
 * header reaches into its column, the compact bar included.
 */
export function CustomerHeader({
  customer,
  onLogCall,
  onAddNote,
}: {
  customer: CustomerFile
  onLogCall: () => void
  onAddNote: () => void
}) {
  const { profile, strength } = customer
  const row = useRef<HTMLDivElement>(null)
  const compact = useScrolledPast(row)
  return (
    <header data-customer-header="" className="@container/header mb-3.5">
      {/* The name block asks for 28rem before the actions: below that the actions wrap under it. */}
      <div ref={row} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_28rem] items-start gap-3.5">
          <Avatar name={profile.name} initials={profile.initials} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-display text-ink">{profile.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-label-plain text-ink-soft">
              <span>
                Age <span className="tabular">{profile.age}</span>
              </span>
              <Dot />
              <span>{profile.city}</span>
              <Dot />
              <SegmentBadge segment={customer.segment} />
              <Dot />
              <span>{profile.riskProfile} risk profile</span>
              <Dot />
              <CifLabel cif={profile.cif} />
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-faint">
              <span>Relationship</span>
              <StrengthBadge strength={strength} />
              <Dot />
              <span className="text-ink-soft">{strength.reason}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CopilotButton
            cif={profile.cif}
            label="Brief me"
            mode="brief"
            className="@max-lg/header:w-control @max-lg/header:px-0"
            labelClassName="@max-lg/header:sr-only"
          />
          <Button
            icon={<StickyNote aria-hidden />}
            onClick={onAddNote}
            className="hidden min-[90rem]:inline-flex"
          >
            Add note
          </Button>
          <IconButton
            label="Add note"
            variant="secondary"
            icon={<StickyNote aria-hidden />}
            onClick={onAddNote}
            className="min-[90rem]:hidden"
          />
          <Button variant="primary" icon={<Phone aria-hidden />} onClick={onLogCall}>
            Log a call
          </Button>
        </div>
      </div>
      <AnimatePresence>
        {compact ? (
          <CompactBar
            key="compact"
            customer={customer}
            onLogCall={onLogCall}
            onTop={() => {
              const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
              window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
            }}
          />
        ) : null}
      </AnimatePresence>
    </header>
  )
}

/**
 * True once the element has scrolled up under the top bar. An observer rather than a scroll
 * listener: it fires twice per crossing, not on every pixel.
 */
function useScrolledPast(ref: RefObject<HTMLElement | null>): boolean {
  const [past, setPast] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const topbar =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--spacing-topbar'),
      ) || 56
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        // Out of view *above* the top bar, not below the fold.
        setPast(!entry.isIntersecting && entry.boundingClientRect.top < topbar)
      },
      { rootMargin: `-${topbar}px 0px 0px 0px`, threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return past
}

function CompactBar({
  customer,
  onLogCall,
  onTop,
}: {
  customer: CustomerFile
  onLogCall: () => void
  onTop: () => void
}) {
  const { profile } = customer
  return (
    <m.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: duration.state, ease: ease.out } }}
      exit={{ opacity: 0, y: -8, transition: { duration: duration.feedback, ease: ease.in } }}
      // Its left edge and gutters follow the shell's: the full sidebar, the icon rail, or none.
      className="fixed top-topbar right-0 left-0 z-10 border-b border-hairline bg-ground/95 shadow-raised backdrop-blur-sm tablet:left-sidebar-rail laptop:left-sidebar"
    >
      <div className="mx-auto flex h-14 w-full max-w-content items-center justify-between gap-3 px-4 tablet:gap-4 tablet:px-6 laptop:px-8">
        <button
          type="button"
          onClick={onTop}
          className="flex min-w-0 items-center gap-2.5 rounded-md text-left focus-visible:outline-2 focus-visible:outline-focus"
          aria-label={`${profile.name}: back to the top of the file`}
        >
          <Avatar name={profile.name} initials={profile.initials} size="sm" />
          <span className="truncate text-heading text-ink">{profile.name}</span>
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2 text-caption text-ink-faint max-tablet:hidden">
          <SegmentBadge segment={customer.segment} />
          <span className="hidden truncate tabular min-[80rem]:inline">{profile.cif}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CopilotButton
            cif={profile.cif}
            label="Brief me"
            mode="brief"
            className="max-tablet:w-control max-tablet:px-0"
            labelClassName="max-tablet:sr-only"
          />
          <Button variant="primary" icon={<Phone aria-hidden />} onClick={onLogCall}>
            Log a call
          </Button>
        </div>
      </div>
    </m.div>
  )
}

/** The CIF in tabular figures with a copy button: RMs paste it into the core banking screen. */
function CifLabel({ cif }: { cif: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(cif)
      setCopied(true)
      toast.success('CIF copied')
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard access can be refused (an insecure origin, a browser setting); the CIF is
      // still on screen to select by hand, so say so rather than fail silently.
      toast('Copy was blocked by the browser', { description: 'Select the CIF to copy it.' })
    }
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-ink-faint">CIF</span>
      <span className="tabular text-ink select-all">{cif}</span>
      <IconButton
        label={copied ? 'Copied' : 'Copy CIF'}
        size="sm"
        icon={copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        onClick={() => void copy()}
        className="size-6 [&_svg]:size-3"
      />
    </span>
  )
}

/* ---------------------------------------------------------------- Highlights */

/**
 * The strip's grid, keyed to the strip's own width rather than the window's (the sidebar and the
 * rail take different room at each width): five across from 48rem, three over two from 32rem, and
 * two a row below that. The goal's cell gets more room in the single row: its name is the one
 * hint that runs long.
 */
const HIGHLIGHT_GRID =
  'grid grid-cols-2 @lg/strip:grid-cols-6 @3xl/strip:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.35fr)_minmax(0,1fr)]'

/**
 * Each cell's span and rules for the three arrangements. The hairlines sit on the cells, not on
 * the grid, so a cell that starts a row has no rule at its left and the second row has one above.
 */
const HIGHLIGHT_CELL = [
  '@lg/strip:col-span-2 @3xl/strip:col-span-1',
  'border-l @lg/strip:col-span-2 @3xl/strip:col-span-1',
  'border-t @lg/strip:col-span-2 @lg/strip:border-t-0 @lg/strip:border-l @3xl/strip:col-span-1',
  'border-t border-l @lg/strip:col-span-3 @lg/strip:border-l-0 @3xl/strip:col-span-1 @3xl/strip:border-t-0 @3xl/strip:border-l',
  'col-span-2 border-t @lg/strip:col-span-3 @lg/strip:border-l @3xl/strip:col-span-1 @3xl/strip:border-t-0',
] as const

/**
 * Five facts in one strip, one hairline apart: what the customer is worth to the bank, what they
 * are worth, what is left each month, where the goal stands, and when they were last seen. Every
 * figure is as at the as-of date; the strip says so once, for a screen reader and on hover.
 *
 * Under Relationship value, the part of it held with IDBI in rupees, as the Book's row and
 * preview say it, at 100% too. It is not a percentage: the wallet share is a share of balances
 * (With IDBI over every bank's), not of the relationship value above it, and the line under the
 * name already gives it with that qualifier ("82% of balances with IDBI").
 */
export function Highlights({ customer }: { customer: CustomerFile }) {
  const { highlights, money, goal, uday, asOf, basis } = customer
  const surplus = highlights.monthlySurplus

  return (
    <Card padded={false} className="@container/strip mb-4">
      <dl className={HIGHLIGHT_GRID} aria-label={`Highlights, ${midSentence(basis.asOfLabel)}`}>
        <Cell
          index={0}
          label="Relationship value"
          value={<ShortInr value={highlights.relationshipValue} />}
          hint={
            money.walletSharePct !== null ? (
              <>
                <ShortInr value={money.withIdbi} /> with IDBI
              </>
            ) : (
              'No balances at any bank'
            )
          }
          title={basis.asOfLabel}
        />
        <Cell
          index={1}
          label="Net worth"
          value={
            <ShortInr
              value={highlights.netWorth}
              className={highlights.netWorth < 0 ? 'text-danger' : 'text-ink'}
            />
          }
          hint={
            money.netWorth.liabilities > 0 ? (
              <>
                After <ProseInr value={money.netWorth.liabilities} /> of debt
              </>
            ) : (
              'No debt on record'
            )
          }
          title={basis.asOfLabel}
        />
        <Cell
          index={2}
          label="Monthly surplus"
          value={<ProseInr value={surplus} className={surplus < 0 ? 'text-danger' : 'text-ink'} />}
          hint={surplus < 0 ? 'Spends more than comes in' : 'A month, after spending'}
        />
        <Cell
          index={3}
          label="Goal"
          value={<HealthDot health={goal.health} className="text-heading" />}
          hint={`${goal.label}, ${formatMonth(goal.targetDate)}`}
        />
        <Cell
          index={4}
          label="Last active"
          value={
            highlights.lastActivityAt ? (
              <span title={formatDate(highlights.lastActivityAt)}>
                {formatLastActive(highlights.lastActivityAt, asOf)}
              </span>
            ) : (
              <span className="text-ink-soft">No activity yet</span>
            )
          }
          hint={
            uday.calls > 0
              ? `${plural(uday.calls, 'Uday call')}${
                  uday.lastCallAt ? `, last ${formatDate(uday.lastCallAt)}` : ''
                }`
              : 'No Uday calls yet'
          }
        />
      </dl>
    </Card>
  )
}

/**
 * One fact. The figure never truncates (the grid gives it the room, and a phrase such as "17 days
 * ago" wraps between words before it would be cut); only the hint under it may, after two lines.
 */
function Cell({
  index,
  label,
  value,
  hint,
  title,
}: {
  index: number
  label: string
  value: ReactNode
  hint: ReactNode
  title?: string
}) {
  return (
    <div
      className={cn('min-w-0 border-hairline-soft px-4 py-3', HIGHLIGHT_CELL[index])}
      title={title}
    >
      <dt className="text-caption text-ink-faint">{label}</dt>
      <dd className="mt-1 text-title text-pretty text-ink">{value}</dd>
      <dd className="line-clamp-2 text-caption-plain text-ink-soft">{hint}</dd>
    </div>
  )
}

/* ---------------------------------------------------------------- Skeleton */

export function HeaderSkeleton() {
  return (
    <>
      <header className="mb-3.5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_28rem] items-start gap-3.5">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="grid min-w-0 flex-1 gap-2 pt-1">
            <Skeleton className="h-7 w-64 max-w-full" />
            <Skeleton className="h-4 w-96 max-w-full" />
            <Skeleton className="h-3.5 w-80 max-w-full" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-control w-24 rounded-md" />
          <Skeleton className="h-control w-9 rounded-md" />
          <Skeleton className="h-control w-28 rounded-md" />
        </div>
      </header>
      <Card padded={false} className="@container/strip mb-4">
        <div className={HIGHLIGHT_GRID}>
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className={cn('grid gap-2 border-hairline-soft px-4 py-3', HIGHLIGHT_CELL[i])}
            >
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
