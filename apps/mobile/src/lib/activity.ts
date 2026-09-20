// Deposits, gathered into the days they landed on.
//
// Grouped by the *simulated* date rather than by wall-clock: the whole app runs on the
// session's own calendar, and a deposit accrued on the 14th belongs under the 14th however
// long ago the device thinks that was. The dates are `YYYY-MM-DD` strings end to end, which
// is the reason a lexical comparison is a chronological one here and nothing has to be
// parsed to sort it.
//
// Out of the Grow tab's render body because it is the only part of that activity list that
// can be wrong in a way a screenshot would not show: a day out of order, or a day's deposits
// split across two headings.

/** Only the field the grouping turns on, so any deposit-shaped row can be grouped. */
export interface Dated {
  /** The simulated date the money landed, `YYYY-MM-DD`. */
  atSim: string
}

/** Newest day first; within a day, the order the server sent. */
export function groupByDay<T extends Dated>(
  deposits: readonly T[],
): Array<{
  date: string
  items: T[]
}> {
  const byDate = new Map<string, T[]>()
  for (const d of deposits) {
    const list = byDate.get(d.atSim) ?? []
    list.push(d)
    byDate.set(d.atSim, list)
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({ date, items }))
}
