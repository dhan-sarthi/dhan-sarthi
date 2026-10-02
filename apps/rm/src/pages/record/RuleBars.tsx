import type { RuleCount } from '@dhan/contracts'
import { formatCount, formatPct } from '../../lib/format.ts'
import { RankedBars } from '../../ui/index.ts'
import { ruleName } from './advice.ts'

/*
 * Refusals by rule, as the kit's ranked bars, doubling as the ledger's filter.
 *
 * One measure, so one hue: every bar is the brand green until a rule is chosen, and then the
 * chosen one keeps it and the rest go to the context grey, so the eye follows the filter without
 * a legend. The count is printed rather than hidden in a hover, each row is a real button, and
 * the rule book's own sentence is one hover or focus away.
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
  return (
    <RankedBars
      label="Refusals by rule. Choose one to filter the ledger."
      // Never more than 45% of the list, so on a phone the bars keep their length to compare.
      labelWidth="min(13rem, 45%)"
      filter={{ selected, onSelect }}
      rows={rules.map((rule) => ({
        id: rule.ruleId,
        label: ruleName(rule.ruleId),
        count: rule.count,
        tooltip: (
          <>
            <span className="block text-chart-tooltip-text">
              {formatCount(rule.count)} of {formatCount(total)} refusals ·{' '}
              {formatPct(Math.round(total > 0 ? (rule.count / total) * 100 : 0))}
            </span>
            <span className="mt-1 block font-normal text-chart-tooltip-muted">{rule.label}</span>
          </>
        ),
      }))}
    />
  )
}
