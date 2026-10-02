import type { BookRow } from '@dhan/contracts'
import { ArrowRight, Check, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '../../lib/cn.ts'
import { formatAgo, formatCount, formatDate, formatMonth, formatPct } from '../../lib/format.ts'
import {
  AllocationBar,
  AreaChart,
  Avatar,
  Button,
  DeltaPill,
  HealthDot,
  Kbd,
  Money,
  PropertyList,
  SectionLabel,
  SegmentBadge,
  SeverityChip,
  SideRail,
  StrengthBadge,
} from '../../ui/index.ts'
import { SeriesKey } from './SeriesKey.tsx'

/**
 * The right rail a row opens: enough of the customer to decide whether to open the file, drawn
 * entirely from the book row the list already holds.
 *
 * It deliberately does not fetch the customer. Opening a file writes a "viewed" entry to the
 * access log, and a preview that followed the arrow keys down the book would write one per
 * keystroke, for customers the RM only glanced past. "Open profile" is the open, and is logged.
 */
export function Preview({
  row,
  asOf,
  onClose,
}: {
  row: BookRow
  asOf: string
  onClose: () => void
}) {
  const profile = `/customers/${encodeURIComponent(row.cif)}`
  const series = row.balanceSeries
  const first = series[0]
  const last = series[series.length - 1]
  const showIdbi = series.some((p) => p.withIdbi !== p.total)
  const more = row.signalCount - (row.topSignal ? 1 : 0)

  return (
    <SideRail
      label={`Preview of ${row.name}`}
      title={row.name}
      subtitle={`${row.age} · ${row.city} · ${row.employmentType}`}
      leading={<Avatar name={row.name} initials={row.initials} />}
      actions={
        <Button asChild size="sm" variant="primary">
          <Link to={profile}>
            Open profile
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      }
      onClose={onClose}
      stickyTop={72}
    >
      {row.openHandoff ? (
        <p className="flex items-center justify-between gap-3 rounded-md bg-streak-soft px-3 py-2 text-label text-streak-ink">
          <span>Asked for you from the app, and waiting on a call</span>
          <Link
            to="/"
            className="shrink-0 rounded-xs underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
          >
            On Today
          </Link>
        </p>
      ) : null}

      {/* The figure first: what the relationship is worth, and how much of it is with IDBI. */}
      <section aria-label="Relationship value">
        <div className="flex items-center justify-between gap-3">
          <p className="text-label text-ink-soft">Relationship value</p>
          <SegmentBadge segment={row.segment} />
        </div>
        <Money value={row.relationshipValue} className="mt-1 block text-display text-ink" />
        <p className="mt-1 text-label font-normal text-ink-faint">
          <Money value={row.withIdbi} short className="text-ink" /> with IDBI
          {row.walletSharePct !== null
            ? ` · ${formatPct(Math.round(row.walletSharePct))} of balances`
            : ''}
        </p>
      </section>

      <Section
        title="Balances"
        aside={
          row.balanceChange3mPct !== null ? (
            <span className="inline-flex items-center gap-1.5 text-caption text-ink-faint">
              <DeltaPill value={row.balanceChange3mPct} />
              in 3 months
            </span>
          ) : null
        }
      >
        {series.length > 1 && first && last ? (
          <>
            <p className="text-caption font-normal text-ink-faint">
              <Money value={last.total} short className="text-label text-ink" /> at the end of{' '}
              {formatMonth(last.month)}, at every bank
            </p>
            <AreaChart
              data={series.map((p) => ({ month: p.month, total: p.total, withIdbi: p.withIdbi }))}
              x="month"
              series={[
                { key: 'total', label: 'All banks' },
                ...(showIdbi
                  ? [{ key: 'withIdbi', label: 'With IDBI', role: 'comparison' as const }]
                  : []),
              ]}
              height={112}
              yAxis={false}
              className="mt-2 -mx-1"
              label={`${row.name}'s balances at each month-end, ${formatMonth(first.month)} to ${formatMonth(last.month)}`}
            />
            {showIdbi ? <SeriesKey /> : null}
          </>
        ) : (
          <p className="text-label font-normal text-ink-faint">
            Not enough month-ends on record to draw a year of balances.
          </p>
        )}
      </Section>

      <Section
        title="Allocation"
        aside={<span className="text-caption text-ink-faint">As at {formatDate(asOf)}</span>}
      >
        <AllocationBar allocation={row.allocation} legend size="regular" />
      </Section>

      <Section title="Goal">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-label text-ink">{row.goal.label}</p>
          <HealthDot health={row.goal.health} />
        </div>
        <p className="mt-0.5 text-caption font-normal text-ink-faint">
          <Money value={row.goal.targetAmount} short className="text-ink-soft" /> by{' '}
          {formatMonth(row.goal.targetDate)}
        </p>
      </Section>

      <Section
        title="Top signal"
        aside={
          more > 0 ? (
            <Link
              to={profile}
              className="rounded-xs text-caption text-ink-soft transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-focus"
            >
              {formatCount(more)} more in the file
            </Link>
          ) : null
        }
      >
        {row.topSignal ? (
          <div className="grid gap-1.5">
            <SeverityChip severity={row.topSignal.severity} className="justify-self-start" />
            <p className="text-heading text-ink">{row.topSignal.title}</p>
            <p className="text-label font-normal text-ink-soft">{row.topSignal.detail}</p>
            {row.topSignal.evidence.length > 0 ? (
              <ul className="mt-1 grid gap-1 text-caption font-normal text-ink-faint">
                {row.topSignal.evidence.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span
                      aria-hidden
                      className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-hint"
                    />
                    {line}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="text-label font-normal text-ink-faint">
            Nothing to act on. The engine has no signal for this customer as at{' '}
            {formatDate(asOf, { year: false })}.
          </p>
        )}
      </Section>

      <Section title="Relationship">
        <StrengthBadge strength={row.strength} />
        <p className="mt-1 text-caption font-normal text-ink-soft">{row.strength.reason}</p>
        {row.attrition.flagged ? (
          <p className="mt-2 text-caption font-normal text-danger">
            On attrition watch: {row.attrition.reasons.join(' · ')}
          </p>
        ) : null}
      </Section>

      <Section title="Products">
        <p className="text-caption font-normal text-ink-faint">Held with IDBI</p>
        {row.products.idbi.length > 0 ? (
          <ProductList items={row.products.idbi} held />
        ) : (
          <p className="mt-1 text-label font-normal text-ink-soft">Nothing yet</p>
        )}
        <p className="mt-3 text-caption font-normal text-ink-faint">Gaps the rules would allow</p>
        {row.products.gaps.length > 0 ? (
          <ProductList items={row.products.gaps} />
        ) : (
          <p className="mt-1 text-label font-normal text-ink-soft">
            None the rules would put to this customer today
          </p>
        )}
      </Section>

      <Section title="Details">
        <PropertyList
          items={[
            { label: 'Monthly income', value: <Money value={row.monthlyIncome} /> },
            { label: 'Monthly surplus', value: <Money value={row.monthlySurplus} /> },
            {
              label: 'SIPs a month',
              value:
                row.sipMonthly > 0 ? (
                  <Money value={row.sipMonthly} />
                ) : (
                  <span className="text-ink-faint">None running</span>
                ),
            },
            { label: 'Net worth', value: <Money value={row.netWorth} /> },
            { label: 'Risk profile', value: row.riskProfile },
            {
              label: 'Last activity',
              value: row.lastActivityAt ? (
                <span title={formatDate(row.lastActivityAt)}>
                  {formatAgo(row.lastActivityAt, asOf)}
                </span>
              ) : (
                <span className="text-ink-faint">None on record</span>
              ),
            },
            {
              label: 'Mis-sales prevented',
              value:
                row.refusals === 0 ? (
                  <span className="text-ink-faint">None</span>
                ) : (
                  <span className="tabular">{formatCount(row.refusals)}</span>
                ),
            },
            { label: 'CIF', value: <span className="tabular">{row.cif}</span> },
          ]}
        />
      </Section>

      <p className="flex items-center gap-1.5 border-t border-hairline-soft pt-4 text-caption font-normal text-ink-faint">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
        <span className="mr-2">move the preview</span>
        <Kbd>Enter</Kbd>
        <span>again to open the profile</span>
      </p>
    </SideRail>
  )
}

function Section({
  title,
  aside,
  children,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="border-t border-hairline-soft pt-4">
      <div className="mb-2.5 flex min-h-5 items-center justify-between gap-3">
        <SectionLabel as="h3">{title}</SectionLabel>
        {aside}
      </div>
      {children}
    </section>
  )
}

function ProductList({ items, held = false }: { items: readonly string[]; held?: boolean }) {
  return (
    <ul className="mt-1.5 grid gap-1.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-label font-normal text-ink">
          <span
            aria-hidden
            className={cn(
              'mt-px inline-flex size-4 shrink-0 items-center justify-center rounded-full [&_svg]:size-2.5',
              held ? 'bg-brand-soft text-brand-deep' : 'border border-hairline text-ink-faint',
            )}
          >
            {held ? <Check strokeWidth={3} /> : <Plus strokeWidth={3} />}
          </span>
          {item}
        </li>
      ))}
    </ul>
  )
}
