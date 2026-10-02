import type { RmInsights, SignalSeverity } from '@dhan/contracts'
import { ShieldCheck } from 'lucide-react'
import { cn } from '../../lib/cn.ts'
import { formatCount } from '../../lib/format.ts'
import { Card, CardHeader, EmptyState, SEVERITY, SeverityChip } from '../../ui/index.ts'
import { sharePct, sum } from './derive.ts'

/*
 * Two ranked-bar cards: what the engine is flagging across the book, and what Uday refused.
 *
 * Bars are HTML, not a chart library: each is a label, a thin track and a count, so the label
 * wraps instead of being cut off at an axis width, and the count is always printed rather than
 * hidden in a hover. The longest bar sets the scale for the whole card.
 */

interface RankedRow {
  id: string
  label: string
  count: number
  fill: string
}

function RankedBars({
  rows,
  max,
  label,
}: {
  rows: readonly RankedRow[]
  max: number
  label: string
}) {
  return (
    <ul className="grid gap-1" aria-label={label}>
      {rows.map((row) => (
        <li
          key={row.id}
          className="grid grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)_2rem] items-center gap-x-3 py-1"
        >
          <span className="text-label text-ink">{row.label}</span>
          <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-ground-deep">
            <span
              className={cn('block h-full rounded-full', row.fill)}
              style={{ width: `max(${Math.min(100, sharePct(row.count, max))}%, 3px)` }}
            />
          </span>
          <span className="text-right text-label text-ink tabular">{formatCount(row.count)}</span>
        </li>
      ))}
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
            <section
              key={group.severity}
              aria-label={`${SEVERITY[group.severity].label}: ${group.rows.length} kinds`}
              className="grid gap-1.5"
            >
              <div className="flex items-center gap-2">
                <SeverityChip severity={group.severity} />
                <span className="text-caption text-ink-faint tabular">
                  {formatCount(sum(group.rows.map((r) => r.count)))}
                </span>
              </div>
              <RankedBars
                rows={group.rows}
                max={max}
                label={`${SEVERITY[group.severity].label} signals by kind`}
              />
            </section>
          ))}
        </div>
      )}
    </Card>
  )
}

/* ---------------------------------------------------------------- Refusals */

/**
 * Every BLOCKED verdict across the book, counted by the rule that gave it. One series, so one
 * colour; the advice record holds each refusal with the words the customer heard.
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
          </p>
          <RankedBars
            rows={rows.map((r) => ({
              id: r.ruleId,
              label: r.label,
              count: r.count,
              fill: 'bg-chart-1',
            }))}
            max={max}
            label="Refusals by rule"
          />
        </>
      )}
    </Card>
  )
}
