import type { BookRow, FigureBasis, Handoff, Signal } from '@dhan/contracts'
import { ArrowRight, Check, MessageCircle, Phone, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useToday } from '../../api/queries.ts'
import { cn } from '../../lib/cn.ts'
import {
  formatCount,
  formatDate,
  formatInr,
  formatLastActive,
  formatMonth,
  formatPct,
} from '../../lib/format.ts'
import {
  AllocationBar,
  AreaChart,
  Button,
  DeltaPill,
  HealthDot,
  IconButton,
  Kbd,
  Money,
  PropertyList,
  SectionLabel,
  SegmentBadge,
  SeverityChip,
  SideRail,
  StrengthBadge,
} from '../../ui/index.ts'
import { LogCall } from '../today/LogCall.tsx'
import { SEGMENT_TINT } from './columns.tsx'
import { ASKED_FOR_YOU } from './rows.ts'
import { SeriesKey } from './SeriesKey.tsx'
import { SeverityMark } from './SeverityMark.tsx'

/** Month-ends in the "last three months" change: May, Jun, Jul and Aug for an August book. */
const WINDOW_POINTS = 4

/**
 * The right rail a row opens: enough of the customer to decide whether to call or open the file,
 * drawn entirely from the book row the list already holds.
 *
 * It deliberately does not fetch the customer. Opening a file writes a "viewed" entry to the
 * access log, and a preview that followed the arrow keys down the book would write one per
 * keystroke, for customers the RM only glanced past. "Open profile" is the open, and is logged;
 * "Log call" writes the call to the journey without leaving the list.
 */
export function Preview({
  row,
  basis,
  onClose,
  logging,
  onLogging,
  draft,
  onDraft,
  compact = false,
}: {
  row: BookRow
  basis: FigureBasis
  onClose: () => void
  /** The narrow laptop rail: Log call gives up its words so the name keeps its room. */
  compact?: boolean
  /** The log-a-call form is open for this customer. */
  logging: boolean
  onLogging: (open: boolean) => void
  /** What was typed for this customer before; kept by the page, per customer. */
  draft: string
  onDraft: (text: string) => void
}) {
  const asOf = basis.asOf
  const profile = `/customers/${encodeURIComponent(row.cif)}`

  return (
    <SideRail
      label={`Preview of ${row.name}`}
      title={<span title={row.name}>{row.name}</span>}
      subtitle={`${row.age} · ${row.city}`}
      actions={
        <>
          {compact ? (
            <IconButton
              variant="secondary"
              size="sm"
              label="Log a call"
              icon={<Phone aria-hidden />}
              onClick={() => onLogging(!logging)}
              aria-expanded={logging}
              aria-pressed={logging}
            />
          ) : (
            <Button
              size="sm"
              onClick={() => onLogging(!logging)}
              aria-expanded={logging}
              aria-pressed={logging}
            >
              <Phone aria-hidden />
              Log call
            </Button>
          )}
          <Button asChild size="sm" variant="primary">
            <Link to={profile}>
              Open profile
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </>
      }
      onClose={onClose}
      stickyTop={72}
    >
      {row.openHandoff || logging ? (
        <CallContext
          row={row}
          asOf={asOf}
          logging={logging}
          onLogging={onLogging}
          draft={draft}
          onDraft={onDraft}
        />
      ) : null}

      {/* The figure first, in the same short form as the row it opened from; the full figure
          sits under it for anyone checking against a statement. */}
      <section aria-label="Relationship value">
        <div className="flex items-center justify-between gap-3">
          <p className="text-label text-ink-soft">Relationship value</p>
          <SegmentBadge segment={row.segment} className={SEGMENT_TINT[row.segment]} />
        </div>
        <Money value={row.relationshipValue} short className="mt-1 block text-display text-ink" />
        <p className="mt-0.5 text-caption font-normal text-ink-hint">
          <span className="tabular">{formatInr(row.relationshipValue)}</span> · {basis.asOfLabel}
        </p>
        <p className="mt-1.5 text-label font-normal text-ink-faint">
          <Money value={row.withIdbi} short className="text-ink" /> with IDBI
          {row.walletSharePct !== null
            ? ` · ${formatPct(Math.round(row.walletSharePct))} of balances`
            : ''}
        </p>
      </section>

      <Balances row={row} basis={basis} />

      <Section title="Allocation" aside={<Aside>{basis.asOfLabel}</Aside>}>
        <AllocationBar allocation={row.allocation} legend size="regular" />
      </Section>

      <Section title="Goal">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-label text-ink">{row.goal.label}</p>
          <HealthDot health={row.goal.health} className="text-ink" />
        </div>
        <p className="mt-0.5 text-caption font-normal text-ink-faint">
          <Money value={row.goal.targetAmount} short className="text-ink-soft" /> by{' '}
          {formatMonth(row.goal.targetDate)}
          {row.goal.amountBasis === 'today' ? ', in today’s money' : ''}
        </p>
      </Section>

      <Signals row={row} asOf={asOf} />

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
          labelWidth="narrow"
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
            { label: 'Employment', value: row.employmentType },
            {
              label: 'Last active',
              value: row.lastActivityAt ? (
                <span title={formatDate(row.lastActivityAt)}>
                  {formatLastActive(row.lastActivityAt, asOf)}
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

      <p className="flex flex-wrap items-center gap-1.5 border-t border-hairline-soft pt-4 text-caption font-normal text-ink-faint">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
        <span className="mr-2">move the preview</span>
        <Kbd>Enter</Kbd>
        <span>again to open the profile</span>
      </p>
    </SideRail>
  )
}

interface CallContextProps {
  row: BookRow
  asOf: string
  logging: boolean
  onLogging: (open: boolean) => void
  draft: string
  onDraft: (text: string) => void
}

/**
 * The top of the rail when there is a call to make: the customer's request, if they made one,
 * with how long they have waited, and the log-a-call form under it.
 *
 * The waiting time and the request itself come from Today's list (the book row only says that
 * one is open), and only a row with a request reads it, so walking the book never asks for
 * Today; the list is cached, so the next request row reads it free. Until it has loaded the
 * banner says the request without the days, and a call logged meanwhile cannot also mark it.
 */
function CallContext(props: CallContextProps) {
  return props.row.openHandoff ? <WithRequest {...props} /> : <CallBody {...props} handoff={null} />
}

function WithRequest(props: CallContextProps) {
  const today = useToday()
  const handoff =
    today.data?.handoffs.find((h) => h.cif === props.row.cif && h.status === 'open') ?? null
  return <CallBody {...props} handoff={handoff} />
}

function CallBody({
  row,
  asOf,
  logging,
  onLogging,
  draft,
  onDraft,
  handoff,
}: CallContextProps & { handoff: Handoff | null }) {
  return (
    <div className="grid gap-3">
      {row.openHandoff ? (
        <div className="flex items-start gap-2.5 rounded-md bg-streak-soft px-3 py-2.5 text-streak-ink">
          <MessageCircle aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2.25} />
          <div className="min-w-0 flex-1">
            <p className="text-label">
              {ASKED_FOR_YOU}
              {handoff ? ` · ${waitingFor(handoff.waitingDays)}` : ''}
            </p>
            <p className="mt-0.5 text-caption font-normal">
              {handoff
                ? `Tapped Talk to your relationship manager on ${formatDate(handoff.requestedOn, { year: false })}: ${handoff.reason}`
                : 'Tapped Talk to your relationship manager, and is waiting on a call.'}
            </p>
          </div>
          <Link
            to="/"
            className="shrink-0 rounded-xs text-caption underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
          >
            On Today
          </Link>
        </div>
      ) : null}
      {logging ? (
        <div className="rounded-md border border-hairline p-3">
          <LogCall
            key={row.cif}
            cif={row.cif}
            name={row.name}
            asOf={asOf}
            handoff={handoff}
            draft={draft}
            onDraft={onDraft}
            onCancel={() => onLogging(false)}
            onSaved={() => onLogging(false)}
          />
        </div>
      ) : null}
    </div>
  )
}

function waitingFor(days: number): string {
  if (days <= 0) return 'asked today'
  return `waiting ${formatCount(days)} ${days === 1 ? 'day' : 'days'}`
}

/**
 * The year of month-end balances, with the change the chart actually draws (first point to last)
 * beside it. The three-month change, which the book sorts by, is said in words with its months,
 * so the pill and the line never measure different windows.
 */
function Balances({ row, basis }: { row: BookRow; basis: FigureBasis }) {
  const series = row.balanceSeries
  const first = series[0]
  const last = series[series.length - 1]
  const windowStart = series[Math.max(0, series.length - WINDOW_POINTS)]
  const showIdbi = series.some((p) => p.withIdbi !== p.total)
  const yearChange =
    first && last && first.total > 0 ? ((last.total - first.total) / first.total) * 100 : null
  const change3m = row.balanceChange3mPct

  return (
    <Section
      title="Balances"
      aside={
        yearChange !== null && first ? (
          <span className="inline-flex items-center gap-1.5 text-caption text-ink-faint">
            <DeltaPill value={Math.round(yearChange * 10) / 10} />
            since {formatMonth(first.month)}
          </span>
        ) : null
      }
    >
      {series.length > 1 && first && last ? (
        <>
          <p className="text-caption font-normal text-ink-faint">
            <Money value={last.total} short className="text-label text-ink" /> at every bank ·{' '}
            {basis.lastMonthEndLabel}
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
            label={`${row.name}'s balances, ${basis.seriesLabel}`}
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-caption font-normal text-ink-hint">{basis.seriesLabel}</p>
            {showIdbi ? <SeriesKey /> : null}
          </div>
          {change3m !== null && windowStart && series.length >= WINDOW_POINTS ? (
            <p className="mt-2 text-caption font-normal text-ink-soft">
              {change3m === 0
                ? 'Flat'
                : `${change3m > 0 ? 'Up' : 'Down'} ${formatPct(Math.abs(change3m))}`}{' '}
              over the last three months, {formatMonth(windowStart.month, { year: false })} to{' '}
              {formatMonth(last.month, { year: false })} month-end.
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-label font-normal text-ink-faint">
          Not enough month-ends on record to draw a year of balances.
        </p>
      )}
    </Section>
  )
}

/** Every signal the customer has, in the engine's order: the first in full, the rest in brief. */
function Signals({ row, asOf }: { row: BookRow; asOf: string }) {
  const [top, ...rest] = row.signals
  return (
    <Section
      title={row.signals.length > 1 ? `Signals · ${formatCount(row.signals.length)}` : 'Signal'}
    >
      {top ? (
        <div className="grid gap-4">
          <TopSignal signal={top} />
          {rest.length > 0 ? (
            <ul className="grid gap-3 border-t border-hairline-soft pt-3">
              {rest.map((signal) => (
                <li key={`${signal.kind}-${signal.title}`} className="flex gap-2.5">
                  <SeverityMark severity={signal.severity} className="mt-px" />
                  <div className="min-w-0">
                    <p className="text-label text-ink">{signal.title}</p>
                    <p className="mt-0.5 text-caption font-normal text-ink-faint">
                      {signal.detail}
                    </p>
                  </div>
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
  )
}

function TopSignal({ signal }: { signal: Signal }) {
  return (
    <div className="grid gap-1.5">
      <SeverityChip severity={signal.severity} className="justify-self-start" />
      <p className="text-heading text-ink">{signal.title}</p>
      <p className="text-label font-normal text-ink-soft">{signal.detail}</p>
      {signal.evidence.length > 0 ? (
        <ul className="mt-1 grid gap-1 text-caption font-normal text-ink-faint">
          {signal.evidence.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-hint" />
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
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

function Aside({ children }: { children: ReactNode }) {
  return <span className="text-caption text-ink-faint">{children}</span>
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
