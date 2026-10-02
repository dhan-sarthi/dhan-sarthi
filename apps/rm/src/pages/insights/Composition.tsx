import type { GoalHealth, RmInsights, Segment } from '@dhan/contracts'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { formatCount, formatDate, formatPct } from '../../lib/format.ts'
import { ALLOCATION_PARTS, Card, HEALTH, HealthDot, Money, SectionLabel } from '../../ui/index.ts'
import { round1, shareLabel, sharePct, sum } from './derive.ts'

/*
 * What the book is made of, as at the as-of date: where the money sits by asset class, how it
 * divides by segment, and how the customers' plans stand. One surface, three panels, so the
 * three read as one answer ("what is this book?") rather than three cards competing.
 *
 * Asset class is drawn as ranked bars, not a donut: three parts compared precisely in a narrow
 * column, in the same three colours as the allocation bar on every row of the book, so cash is
 * the same ochre here as it is beside each customer.
 */
export function Composition({ insights }: { insights: RmInsights }) {
  return (
    <Card padded={false} className="overflow-hidden" aria-label="What the book is made of">
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
      <SectionLabel id={id}>{title}</SectionLabel>
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

function AssetClassPanel({ insights }: { insights: RmInsights }) {
  const parts = [...insights.allocation.byAssetClass].sort((a, b) => b.value - a.value)
  const total = sum(parts.map((p) => p.value))
  const largest = parts[0]
  return (
    <Panel id="insights-asset-class" title="By asset class">
      {/* The page header already carries the total; the panel leads with what it is made of. */}
      {largest && total > 0 ? (
        <Headline figure={shareLabel(sharePct(largest.value, total))}>
          of the value is in {largest.label.toLowerCase()}, balances and holdings as at{' '}
          {formatDate(insights.asOf)}
        </Headline>
      ) : (
        <Headline figure={<Money value={0} short />}>
          balances and holdings as at {formatDate(insights.asOf)}
        </Headline>
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
                    <span className="truncate">{part.label}</span>
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
          of the value is with {plural(top.customers)} in {top.label},{' '}
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
  off_track: 'Plan cannot reach the goal',
}

const HEALTH_FILL: Record<GoalHealth, string> = {
  on_track: 'bg-brand',
  at_risk: 'bg-streak',
  off_track: 'bg-danger',
}

function GoalHealthPanel({ insights, className }: { insights: RmInsights; className?: string }) {
  const counts = insights.goalHealth
  const total = counts.on_track + counts.at_risk + counts.off_track
  const onTrackPct = total === 0 ? null : round1(sharePct(counts.on_track, total))

  return (
    <Panel id="insights-goal-health" title="Goal health" className={className}>
      {onTrackPct === null ? (
        <Headline figure="—">No customer has a plan yet</Headline>
      ) : (
        <Headline figure={formatPct(onTrackPct)}>
          on track, {formatCount(counts.on_track)} of {formatCount(total)} customers
        </Headline>
      )}
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
                  <HealthDot health={h} />
                  <span className="pl-3.5 text-caption font-normal text-ink-faint">
                    {HEALTH_MEANING[h]}
                  </span>
                </span>
                {/* Counts only: the headline carries the on-track share to the same decimal
                    Today shows, and a rounded share beside it would disagree with it. */}
                <span className={cn('shrink-0 text-label tabular', HEALTH[h].text)}>
                  {formatCount(counts[h])}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Panel>
  )
}
