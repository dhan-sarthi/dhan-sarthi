/**
 * The closing balance of the statement account, a month at a time.
 *
 * `charts/months.ts` is explicit that a cursor-paged list is the wrong input for a chart — twenty
 * lines newest-first draw one tall month and eleven empty ones — so the whole window has to be in
 * hand before `monthlyClose` sees it. This is that read: the same `TransactionSource` the Spending
 * pane already pages, asked for 200 at a time until the window is covered, once per snapshot.
 *
 * **Only when the pane that draws it is open.** Holdings is one of five panes and this is four
 * requests; `enabled` keeps them off the Dashboard's first paint and off the four panes that have
 * no use for them. `usePortfolio` is fetched eagerly because three panes want it — this one is
 * wanted by one.
 *
 * **A failure is silence, not a message.** Nothing else on Holdings depends on this; the savings
 * card draws its balance from the snapshot either way. An empty series simply means no chart,
 * which is the right outcome for an account whose statement could not be re-read — and it is the
 * same outcome `monthlyClose` already produces for a feed that sends no `balanceAfterTxn`.
 */
import { useEffect, useState } from 'react'
import type { Transaction } from '@dhan/contracts'
import { monthlyClose, windowKeys } from '../../components/charts/index.ts'
import type { MonthPoint } from '../../components/charts/index.ts'
import type { TransactionSource } from '../../lib/transactions.ts'

/** One page is 200 lines and two years of a busy account is about 1,400. The cap is a guard. */
const MAX_PAGES = 12
const PAGE = 200

/**
 * Twelve complete months plus the one running, which is thirteen points.
 *
 * `monthlyClose` drops the current month by default and for a *flow* that is right — twelve days
 * of spending drawn beside eleven whole months reads as a collapse. A *level* is the opposite
 * case: the current month's close is today's balance, which is the figure printed directly above
 * this chart, and leaving it out ended Priya's line on ₹55,152 under a ₹1,92,143 headline because
 * her salary lands on the as-of date. So it is drawn, and `Sparkline` marks it the way it marks
 * any unfinished month — dashed run-in, hollow dot — because it is still a month in progress.
 */
const MONTHS = 13

export function useBalanceMonths(
  source: TransactionSource,
  /** `view.meta.snapshotId`. Advancing the clock recuts it and the series comes back with it. */
  at: string,
  asOf: string,
  enabled: boolean,
): readonly MonthPoint[] {
  const [state, setState] = useState<{ at: string; points: readonly MonthPoint[] }>({
    at: '',
    points: [],
  })

  useEffect(() => {
    if (!enabled || state.at === at) return
    let live = true
    void (async () => {
      /*
       * Stop at the edge of the window rather than at the end of the ledger.
       *
       * `TransactionSource` takes a cursor, a limit and a category and no dates, so the window
       * cannot be asked for — but the feed is newest first, so once a page ends older than the
       * first month drawn, every page after it is older still. Rohan's ledger is two years and
       * 1,356 lines; the thirteen months this draws are the first seven hundred of them.
       */
      const start = `${windowKeys({ asOf, months: MONTHS, includeCurrent: true })[0] ?? ''}-01`
      const items: Transaction[] = []
      let cursor: string | null = null
      try {
        for (let page = 0; page < MAX_PAGES; page += 1) {
          const res = await source(cursor, PAGE, null)
          items.push(...res.items)
          cursor = res.nextCursor
          if (cursor === null) break
          if ((res.items[res.items.length - 1]?.txnDate ?? '') < start) break
        }
      } catch {
        // See the header: no chart is the right answer, and the card is complete without one.
        if (live) setState({ at, points: [] })
        return
      }
      if (live)
        setState({
          at,
          points: monthlyClose(items, { asOf, months: MONTHS, includeCurrent: true }).points,
        })
    })()
    return () => {
      live = false
    }
  }, [source, at, asOf, enabled, state.at])

  return state.at === at ? state.points : []
}
