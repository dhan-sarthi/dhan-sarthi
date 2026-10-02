import type { GoalHealth, RmInsights, Segment } from '@dhan/contracts'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '../../lib/cn.ts'
import { formatCount } from '../../lib/format.ts'
import { ALLOCATION_PARTS, Card, HEALTH, Money, SectionLabel } from '../../ui/index.ts'
import { shareLabel, sharePct, sum } from './derive.ts'

/*
 * What the book is made of, as at the as-of date: where the money sits by asset class, how it
 * divides by segment, and how the customers' plans stand. One surface, three panels, so the
 * three read as one answer ("what is this book?") rather than three cards competing. Every
 * figure here is as at the as-of date, and the header says so once, in the API's words.
 *
 * Asset class is drawn as ranked bars, not a donut: three parts compared precisely in a narrow
 * column, in the same three colours as the allocation bar on every row of the book, so deposits
 * and cash are the same ochre here as they are beside each customer.
 */
export function Composition({ insights }: { insights: RmInsights }) {
  return (
    <Card padded={false} className="overflow-hidden" aria-labelledby="insights-composition">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline-soft px-5 py-4">
        <SectionLabel id="insights-composition">What the book is made of</SectionLabel>
        <p className="text-caption text-ink-faint">{insights.basis.asOfLabel}</p>
      </header>
      {/* Three across from 1280; below that, two and goal health under them, because a panel
          narrower than ~300px wraps every caption onto a second line. */}
      <div className="grid grid-cols-1 gap-px bg-hairline-soft md:grid-cols-2 xl:grid-cols-3">
        <AssetClassPanel insights={insights} />
        <SegmentPanel insights={insights} />
        <GoalHealthPanel insights={insights} className="md:col-span-2 xl:col-span-1" />
      </div>
    </Card>
  )
}

function Panel({
  id,
  title,
  className,
  children,
}: {
  id: string
  title: string
  className?: string | undefined
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className={cn('flex min-w-0 flex-col bg-surface p-5', className)}>
      <SectionLabel id={id} as="h3">
        {title}
      </SectionLabel>
      {children}
    </section>
  )
}

/** The panel's one figure and what it is, figure first. */
function Headline({ figure, children }: { figure: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-4 mb-5">
      <p className="text-display text-ink">{figure}</p>
      <p className="mt-1 text-label font-normal text-ink-soft">{children}</p>
    </div>
  )
}

/** A thin track and its fill. The fill keeps a sliver at tiny shares so a non-zero part shows. */
function Bar({ pct, fill }: { pct: number; fill: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ground-deep">
      <div
        className={cn('h-full rounded-full', fill)}
        style={{ width: pct > 0 ? `max(${Math.min(100, pct)}%, 3px)` : 0 }}
      />
    </div>
  )
}

/* ---------------------------------------------------------------- Asset class */

/** The allocation colours by the API's asset-class id; anything unknown falls back to grey. */
const ASSET_FILL: Record<string, string> = Object.fromEntries(
  ALLOCATION_PARTS.map((p) => [p.key, p.fill]),
)

/**
 * The `cash` class is every balance at any bank, fixed deposits included: a customer's two FDs
 * sit in it. A banker reads "cash" as idle money, so "53% cash" would overstate what is idle in
 * a book full of deposits. The page names the class for what it holds.
 */
const ASSET_LABEL: Record<string, string> = { cash: 'Deposits & cash' }

function assetLabel(part: { id: string; label: string }): string {
  return ASSET_LABEL[part.id] ?? part.label
}

/** "Deposits & cash" → "deposits and cash", for the middle of a sentence. */
function inProse(label: string): string {
  return label.replace(/\s*&\s*/g, ' and ').toLowerCase()
}

function AssetClassPanel({ insights }: { insights: RmInsights }) {
  const parts = [...insights.allocation.byAssetClass].sort((a, b) => b.value - a.value)
  const total = sum(parts.map((p) => p.value))
  const largest = parts[0]
  return (
    <Panel id="insights-asset-class" title="By asset class">
      {/* The page header already carries the total; the panel leads with what it is made of. */}
      {largest && total > 0 ? (
        <Headline figure={shareLabel(sharePct(largest.value, total))}>
          of the value is in {inProse(assetLabel(largest))}:{' '}
          <Money value={largest.value} short="auto" className="text-ink" />
        </Headline>
      ) : (
        <Headline figure={<Money value={0} short />}>in balances and holdings</Headline>
      )}
      {total === 0 ? (
        <p className="text-label font-normal text-ink-soft">
          No balances or holdings in the book yet.
        </p>
      ) : (
        <ul className="grid gap-4" aria-label="Relationship value by asset class">
          {parts.map((part) => {
            const pct = sharePct(part.value, total)
            const fill = ASSET_FILL[part.id] ?? 'bg-chart-neutral-400'
            return (
              <li key={part.id} className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-label">
                  <span className="inline-flex min-w-0 items-center gap-2 text-ink">
                    <span aria-hidden className={cn('size-2 shrink-0 rounded-full', fill)} />
                    <span className="truncate">{assetLabel(part)}</span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <Money value={part.value} short className="text-ink" />
                    <span className="w-10 text-right text-ink-faint tabular">
                      {shareLabel(pct)}
                    </span>
                  </span>
                </div>
                <Bar pct={pct} fill={fill} />
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

/* ---------------------------------------------------------------- Segment */

const SEGMENT_ORDER: readonly Segment[] = ['priority', 'affluent', 'mass']

/**
 * Segments are ordered by value band, so they take an ordinal ramp of the green: darkest for
 * Priority, lightest for Mass. The three steps pass the ramp checks (one hue, even lightness
 * steps, the light end clear of the white surface).
 */
const SEGMENT_FILL: Record<Segment, string> = {
  priority: 'bg-chart-seq-550',
  affluent: 'bg-chart-seq-400',
  mass: 'bg-chart-seq-300',
}

/**
 * The book split by segment twice, once by customers and once by value, in two bars over the
 * same three colours. The shift between them is the point: a few Priority customers usually hold
 * most of the money, and that is where the RM's hours go.
 */
function SegmentPanel({ insights }: { insights: RmInsights }) {
  const rows = [...insights.allocation.bySegment].sort(
    (a, b) => SEGMENT_ORDER.indexOf(a.id) - SEGMENT_ORDER.indexOf(b.id),
  )
  const value = sum(rows.map((r) => r.value))
  const customers = sum(rows.map((r) => r.customers))
  const top = [...rows].sort((a, b) => b.value - a.value)[0]
  const plural = (n: number): string => `${formatCount(n)} customer${n === 1 ? '' : 's'}`

  return (
    <Panel id="insights-segment" title="By segment">
      {top && value > 0 ? (
        <Headline figure={shareLabel(sharePct(top.value, value))}>
          of the value sits with {formatCount(top.customers)} {top.label} customer
          {top.customers === 1 ? '' : 's'}, who {top.customers === 1 ? 'is' : 'are'}{' '}
          {shareLabel(sharePct(top.customers, customers))} of the book
        </Headline>
      ) : (
        <Headline figure={formatCount(customers)}>customers in the book</Headline>
      )}
      <div className="mb-5 grid grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5">
        <span className="text-caption text-ink-faint">Customers</span>
        <StackedBar
          label={rows.map((r) => `${r.label} ${plural(r.customers)}`).join(', ')}
          parts={rows.map((r) => ({ id: r.id, value: r.customers, fill: SEGMENT_FILL[r.id] }))}
        />
        <span className="text-caption text-ink-faint">Value</span>
        <StackedBar
          label={rows.map((r) => `${r.label} ${shareLabel(sharePct(r.value, value))}`).join(', ')}
          parts={rows.map((r) => ({ id: r.id, value: r.value, fill: SEGMENT_FILL[r.id] }))}
        />
      </div>
      <ul className="grid gap-3" aria-label="Customers and value by segment">
        {rows.map((row) => (
          <li key={row.id} className="flex items-start justify-between gap-3">
            <span className="grid min-w-0 gap-0.5">
              <span className="inline-flex items-center gap-1.5 text-label text-ink">
                <span
                  aria-hidden
                  className={cn('size-2 shrink-0 rounded-[2px]', SEGMENT_FILL[row.id])}
                />
                {row.label}
              </span>
              <span className="pl-3.5 text-caption font-normal text-ink-faint">
                {plural(row.customers)} · {shareLabel(sharePct(row.customers, customers))}
              </span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2 text-label">
              <Money value={row.value} short className="text-ink" />
              <span className="w-10 text-right text-ink-faint tabular">
                {shareLabel(sharePct(row.value, value))}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/** Part to whole in one bar, a 2px surface gap between the parts so neighbours never merge. */
function StackedBar({
  parts,
  label,
}: {
  parts: readonly { id: string; value: number; fill: string }[]
  label: string
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-ground-deep"
    >
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <span
            key={p.id}
            className={cn('h-full first:rounded-l-full last:rounded-r-full', p.fill)}
            style={{ flexGrow: p.value, flexBasis: 0, minWidth: 3 }}
          />
        ))}
    </div>
  )
}

/* ---------------------------------------------------------------- Goal health */

const HEALTH_ORDER: readonly GoalHealth[] = ['on_track', 'at_risk', 'off_track']

/** What each word means, in the spec's terms, so the RM can say it to a customer. */
const HEALTH_MEANING: Record<GoalHealth, string> = {
  on_track: 'Plan funded, no shortfall',
  at_risk: 'A shortfall, or an urgent signal',
  off_track: 'Plan cannot reach the goal yet',
}

/**
 * The bar is calm on purpose: green for the plans that are funded and two greys for the rest,
 * so the panel reads as work to do rather than an alarm. Red is kept for the one word that
 * needs it, the off-track label. Shapes still tell the three apart in greyscale: a dot, a ring
 * and a square, as everywhere else on the console.
 */
const HEALTH_FILL: Record<GoalHealth, string> = {
  on_track: 'bg-brand',
  at_risk: 'bg-chart-neutral-300',
  off_track: 'bg-chart-neutral-400',
}

const HEALTH_SWATCH: Record<GoalHealth, string> = {
  on_track: 'rounded-full bg-brand',
  at_risk: 'rounded-full border-2 border-chart-neutral-400',
  off_track: 'rounded-[2px] bg-chart-neutral-400',
}

/**
 * Book's "At risk" tab holds every plan that is not on track, and sorted by goal health, worst
 * first, the off-track ones lead it. There is no off-track-only view to link to, so the link
 * says what it opens.
 */
const BOOK_NOT_ON_TRACK = '/book?tab=at_risk&sort=goal'

function GoalHealthPanel({ insights, className }: { insights: RmInsights; className?: string }) {
  const counts = insights.goalHealth
  const total = counts.on_track + counts.at_risk + counts.off_track

  return (
    <Panel id="insights-goal-health" title="Goal health" className={className}>
      <GoalHeadline counts={counts} total={total} />
      {total > 0 ? (
        <>
          <div className="mb-5">
            <StackedBar
              label={HEALTH_ORDER.map((h) => `${HEALTH[h].label} ${formatCount(counts[h])}`).join(
                ', ',
              )}
              parts={HEALTH_ORDER.map((h) => ({ id: h, value: counts[h], fill: HEALTH_FILL[h] }))}
            />
          </div>
          <ul className="grid gap-3" aria-label="Customers by goal health">
            {HEALTH_ORDER.map((h) => (
              <li key={h} className="flex items-start justify-between gap-3">
                <span className="grid min-w-0 gap-0.5">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 text-label',
                      h === 'off_track' ? 'text-danger' : 'text-ink',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn('inline-block size-2 shrink-0', HEALTH_SWATCH[h])}
                    />
                    {HEALTH[h].label}
                  </span>
                  <span className="pl-3.5 text-caption font-normal text-ink-faint">
                    {HEALTH_MEANING[h]}
                  </span>
                </span>
                {/* "9 of 38" is how Today counts plans on track; the list says the same. */}
                <span className="shrink-0 text-label text-ink tabular">
                  {formatCount(counts[h])}
                  <span className="text-ink-faint"> of {formatCount(total)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Panel>
  )
}

/**
 * The panel leads with what the RM can do about it. Off-track plans first, with the three
 * levers that bring one back (for a plan blocked by a debt that never clears, a bigger monthly
 * amount is the one that works), then at-risk plans, and only when every plan is funded the
 * plain count.
 */
function GoalHeadline({ counts, total }: { counts: Record<GoalHealth, number>; total: number }) {
  if (total === 0) return <Headline figure="—">No customer has a plan yet</Headline>
  if (counts.off_track > 0) {
    return (
      <>
        <Headline figure={formatCount(counts.off_track)}>
          off track. Each needs a bigger monthly amount, a later date or a smaller target.
        </Headline>
        <BookLink />
      </>
    )
  }
  if (counts.at_risk > 0) {
    return (
      <>
        <Headline figure={formatCount(counts.at_risk)}>
          at risk: a shortfall, or an urgent signal to clear first.
        </Headline>
        <BookLink />
      </>
    )
  }
  return (
    <Headline figure={`${formatCount(counts.on_track)} of ${formatCount(total)}`}>
      on track. Every plan is funded.
    </Headline>
  )
}

function BookLink() {
  return (
    <Link
      to={BOOK_NOT_ON_TRACK}
      className="group -mt-2 mb-5 inline-flex items-center gap-0.5 self-start rounded-sm text-label text-brand transition-colors hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      Open them in Book, off track first
      <ChevronRight
        aria-hidden
        className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
      />
    </Link>
  )
}
