import type { RmInsights, SignalSeverity } from '@dhan/contracts'
import { ChevronDown, ShieldCheck } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import { cn } from '../../lib/cn.ts'
import { formatCount } from '../../lib/format.ts'
import { Card, CardHeader, EmptyState, SEVERITY, SeverityChip } from '../../ui/index.ts'
import { sharePct, sum } from './derive.ts'

/*
 * Two ranked-bar cards: what the engine is flagging across the book, and what Uday refused.
 *
 * Bars are HTML, not a chart library: each is a label, a thin track and a count, so the count is
 * always printed rather than hidden in a hover. The longest bar sets the scale for the whole
 * card, collapsed groups included, so opening one never rescales the bars already showing.
 */

interface RankedRow {
  id: string
  label: string
  count: number
  fill: string
  /** Where the row opens, when it is a filter on another page. */
  to?: string
  /** The row's name for a screen reader when it is a link. */
  linkLabel?: string
}

function RankedBars({
  rows,
  max,
  label,
  labelWidth = '11rem',
  id,
}: {
  rows: readonly RankedRow[]
  max: number
  label: string
  /** The widest a label may take before it wraps; sized so the card's longest label does not. */
  labelWidth?: string
  id?: string
}) {
  const grid = 'grid items-center gap-x-3 py-1'
  const columns = { gridTemplateColumns: `minmax(7rem,${labelWidth}) minmax(0,1fr) 2rem` }
  return (
    <ul className="grid gap-1" aria-label={label} id={id}>
      {rows.map((row) => {
        const body = (
          <>
            <span className="text-label text-ink">{row.label}</span>
            <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-ground-deep">
              <span
                className={cn('block h-full rounded-full', row.fill)}
                style={{ width: `max(${Math.min(100, sharePct(row.count, max))}%, 3px)` }}
              />
            </span>
            <span className="text-right text-label text-ink tabular">{formatCount(row.count)}</span>
          </>
        )
        return (
          <li key={row.id}>
            {row.to ? (
              <Link
                to={row.to}
                aria-label={row.linkLabel}
                className={cn(
                  grid,
                  '-mx-2 rounded-md px-2 transition-colors duration-150 hover:bg-row-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus',
                )}
                style={columns}
              >
                {body}
              </Link>
            ) : (
              <div className={grid} style={columns}>
                {body}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/* ---------------------------------------------------------------- Signals */

const SEVERITY_ORDER: readonly SignalSeverity[] = ['urgent', 'important', 'opportunity']

/**
 * The bar takes the severity's colour: red for act now, amber for worth a look, and a quiet
 * green-grey for worth knowing, the same family as the severity chips, so the eye goes to the
 * few that need a call before the many that can wait.
 */
const SEVERITY_FILL: Record<SignalSeverity, string> = {
  urgent: 'bg-danger',
  important: 'bg-streak',
  opportunity: 'bg-budget',
}

/**
 * Worth knowing (subscriptions, habit costs, price rises) is the least actionable group and
 * usually the largest, so it starts folded: its total is shown, its rows are one click away.
 */
const FOLDED: ReadonlySet<SignalSeverity> = new Set(['opportunity'])

/**
 * Grouped by severity, ranked by count inside each group. Ranked by count alone, the two kinds
 * that need a call this week would sit at the bottom under thirty idle-cash nudges.
 */
export function SignalsByKind({ insights }: { insights: RmInsights }) {
  const { signals } = insights
  const total = sum(signals.map((s) => s.count))
  const max = Math.max(0, ...signals.map((s) => s.count))
  const groups = SEVERITY_ORDER.map((severity) => ({
    severity,
    rows: signals
      .filter((s) => s.severity === severity)
      .sort((a, b) => b.count - a.count)
      .map((s) => ({ id: s.kind, label: s.label, count: s.count, fill: SEVERITY_FILL[severity] })),
  })).filter((g) => g.rows.length > 0)

  return (
    <Card aria-labelledby="insights-signals" className="h-full">
      <CardHeader
        title={<span id="insights-signals">Signals by kind</span>}
        {...(total > 0 ? { count: total } : {})}
      />
      {groups.length === 0 ? (
        <EmptyState
          title="No signals across the book"
          body="When the engine spots idle cash, a maturing deposit or a missed repayment, it is counted here by kind."
        />
      ) : (
        <div className="grid gap-4">
          {groups.map((group) => (
            <SignalGroup
              key={group.severity}
              severity={group.severity}
              rows={group.rows}
              max={max}
              // Folding is only worth it when another group is open above it.
              foldable={FOLDED.has(group.severity) && groups.length > 1}
            />
          ))}
        </div>
      )}
    </Card>
  )
}

function SignalGroup({
  severity,
  rows,
  max,
  foldable,
}: {
  severity: SignalSeverity
  rows: readonly RankedRow[]
  max: number
  foldable: boolean
}) {
  const [open, setOpen] = useState(!foldable)
  const listId = useId()
  const count = sum(rows.map((r) => r.count))
  const name = SEVERITY[severity].label
  return (
    <section aria-label={`${name}: ${rows.length} kinds`} className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <SeverityChip severity={severity} />
        <span className="text-caption text-ink-faint tabular">{formatCount(count)}</span>
        {foldable ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((v) => !v)}
            className="ml-auto inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-caption text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
          >
            {open ? 'Hide' : `Show ${rows.length} kinds`}
            <ChevronDown
              aria-hidden
              className={cn('size-3.5 transition-transform duration-150', open && 'rotate-180')}
            />
          </button>
        ) : null}
      </div>
      {open ? (
        <RankedBars rows={rows} max={max} label={`${name} signals by kind`} id={listId} />
      ) : (
        // Folded, the kinds are still named, so the RM knows what is behind the button.
        <p id={listId} className="text-caption font-normal text-ink-faint">
          {rows.map((r) => r.label).join(', ')}
        </p>
      )}
    </section>
  )
}

/* ---------------------------------------------------------------- Refusals */

/**
 * Every BLOCKED verdict across the book, counted by the rule that gave it. One series, so one
 * colour. Each rule opens the advice record filtered to it, where every refusal is held with the
 * words the customer heard.
 */
export function RefusalsByRule({ insights }: { insights: RmInsights }) {
  const rows = insights.refusalsByRule
  const total = sum(rows.map((r) => r.count))
  const max = Math.max(0, ...rows.map((r) => r.count))

  return (
    <Card aria-labelledby="insights-refusals" className="flex h-full flex-col">
      <CardHeader
        title={<span id="insights-refusals">Refusals by rule</span>}
        {...(total > 0 ? { count: total } : {})}
        to="/record"
        actionLabel="Advice record"
      />
      {rows.length === 0 ? (
        <div className="flex flex-1 items-center">
          <EmptyState
            icon={<ShieldCheck />}
            title="No refusals recorded"
            body="When Uday turns down a product that is wrong for a customer, the rule that stopped it is counted here."
          />
        </div>
      ) : (
        <>
          <p className="mb-3 text-label font-normal text-ink-soft">
            <span className="text-ink tabular">{formatCount(total)}</span> product
            {total === 1 ? '' : 's'} Uday turned down, each recorded with the rule that stopped it.
            Choose a rule to read them.
          </p>
          <RankedBars
            rows={rows.map((r) => ({
              id: r.ruleId,
              label: r.label,
              count: r.count,
              fill: 'bg-chart-1',
              to: `/record?rule=${encodeURIComponent(r.ruleId)}`,
              linkLabel: `${r.label}: ${formatCount(r.count)} refusal${r.count === 1 ? '' : 's'}. Open them in the advice record.`,
            }))}
            max={max}
            // "Cover bundled with investment", the longest rule name, on one line.
            labelWidth="13.5rem"
            label="Refusals by rule"
          />
        </>
      )}
    </Card>
  )
}
