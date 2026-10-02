import type { RuleCount } from '@dhan/contracts'
import { cn } from '../../lib/cn.ts'
import { formatCount, formatPct } from '../../lib/format.ts'
import { Tooltip } from '../../ui/index.ts'
import { ruleName } from './advice.ts'

/*
 * Refusals by rule, as a ranked list of thin bars that doubles as the ledger's filter.
 *
 * One measure, so one hue: every bar is the brand green until a rule is chosen, and then the
 * chosen one keeps it and the rest go grey, so the eye follows the filter without a legend.
 * Bars are HTML rather than a chart library's: the label wraps instead of being cut at an axis
 * width, the count is printed rather than hidden in a hover, and each row is a real button.
 * The longest bar sets the scale; the rule book's own sentence is one hover or focus away.
 */
export function RuleBars({
  rules,
  total,
  selected,
  onSelect,
}: {
  rules: readonly RuleCount[]
  total: number
  selected: string | null
  onSelect: (ruleId: string | null) => void
}) {
  const max = Math.max(1, ...rules.map((r) => r.count))
  return (
    <ul className="grid gap-0.5" aria-label="Refusals by rule. Choose one to filter the ledger.">
      {rules.map((rule) => {
        const active = selected === rule.ruleId
        const dimmed = selected !== null && !active
        const share = total > 0 ? (rule.count / total) * 100 : 0
        return (
          <li key={rule.ruleId}>
            <Tooltip
              side="left"
              content={
                <>
                  <span className="block text-chart-tooltip-text">
                    {formatCount(rule.count)} of {formatCount(total)} refusals ·{' '}
                    {formatPct(Math.round(share))}
                  </span>
                  <span className="mt-1 block font-normal text-chart-tooltip-muted">
                    {rule.label}
                  </span>
                </>
              }
            >
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(active ? null : rule.ruleId)}
                className={cn(
                  'grid w-full grid-cols-[minmax(9rem,13rem)_minmax(0,1fr)_2.25rem] items-center gap-x-4 rounded-md px-2 py-1.5 text-left transition-colors duration-150',
                  'hover:bg-row-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus',
                  active && 'bg-brand-wash hover:bg-brand-wash',
                )}
              >
                <span
                  className={cn(
                    'text-label transition-colors',
                    dimmed ? 'text-ink-faint' : 'text-ink',
                  )}
                >
                  {ruleName(rule.ruleId)}
                </span>
                <span aria-hidden className="relative h-2">
                  <span
                    className={cn(
                      'absolute inset-y-0 left-0 rounded-r-[4px] transition-colors duration-200',
                      dimmed ? 'bg-chart-neutral-300' : 'bg-brand',
                    )}
                    style={{ width: `max(${(rule.count / max) * 100}%, 4px)` }}
                  />
                </span>
                <span
                  className={cn(
                    'text-right text-label tabular',
                    dimmed ? 'text-ink-faint' : 'text-ink',
                  )}
                >
                  {formatCount(rule.count)}
                </span>
              </button>
            </Tooltip>
          </li>
        )
      })}
    </ul>
  )
}
