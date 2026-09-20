export interface MonthlyByCategory {
  /** Months of statement the division used. At least 1, so a fresh account cannot divide by zero. */
  months: number
  /** Each category's running total divided down to a normal month, order preserved. */
  perMonth: ReadonlyArray<readonly [string, number]>
  /** The largest per-month figure, floored at 1 so a bar can always be a fraction of it. */
  largest: number
}

/**
 * Spending by category, per month rather than per ledger.
 *
 * `byCategory` on the snapshot is a running total over the whole statement, not a monthly
 * figure — Shopping comes back as ₹93,234 against a ₹22,070 monthly envelope, which is not a
 * number anyone can act on and is not comparable to the cap beside it. Dividing by the months
 * of history is what makes the bar and the envelope the same kind of number.
 *
 * `Math.max(1, ...[])` is `1`, which is the right answer for an empty ledger and is the reason
 * the floor is not written as a conditional.
 */
export function monthlyByCategory(
  byCategory: ReadonlyArray<readonly [string, number]>,
  monthsOfHistory: number,
): MonthlyByCategory {
  const months = Math.max(1, monthsOfHistory)
  const perMonth = byCategory.map(([name, total]) => [name, total / months] as const)
  return { months, perMonth, largest: Math.max(1, ...perMonth.map(([, v]) => v)) }
}
