import type { RmInsights, SignalSeverity } from '@dhan/contracts'
import { ChevronDown, ShieldCheck } from 'lucide-react'
import { useId, useState } from 'react'
import { cn } from '../../lib/cn.ts'
import { formatCount } from '../../lib/format.ts'
import {
  Card,
  CardHeader,
  EmptyState,
  RankedBars,
  SEVERITY,
  SeverityChip,
  type RankedBarRow,
} from '../../ui/index.ts'
import { sum } from './derive.ts'

/*
 * Two ranked-bar cards: what the engine is flagging across the book, and what Uday refused. Both
 * are the kit's `RankedBars`, the same row anatomy as the advice record's refusals by rule: a
 * label, a thin track and a count printed rather than hidden in a hover. The longest bar sets the
 * scale for the whole card, collapsed groups included, so opening one never rescales the bars
 * already showing.
 */

/* ---------------------------------------------------------------- Signals */

const SEVERITY_ORDER: readonly SignalSeverity[] = ['urgent', 'important', 'opportunity']

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
      // The bar takes the severity's own fill (`SEVERITY[level].fill`), the same family as the
      // chips, so the eye goes to the few that need a call before the many that can wait.
      .map((s) => ({ id: s.kind, label: s.label, count: s.count, fill: SEVERITY[severity].fill })),
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
  rows: readonly RankedBarRow[]
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
            className="relative ml-auto inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-caption text-ink-soft transition-colors hover:bg-ghost-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus pointer-coarse:hit-target"
          >
            {open ? 'Hide' : `Show ${rows.length} kinds`}
            <ChevronDown
              aria-hidden
              className={cn(
                'size-3.5 transition-transform duration-feedback',
                open && 'rotate-180',
              )}
            />
          </button>
        ) : null}
      </div>
      {open ? (
        <RankedBars rows={rows} max={max} label={`${name} signals by kind`} id={listId} />
      ) : (
        // Folded, the kinds are still named, so the RM knows what is behind the button.
        <p id={listId} className="text-caption-plain text-ink-faint">
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
          <p className="mb-3 text-label-plain text-ink-soft">
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
