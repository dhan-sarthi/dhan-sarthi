/**
 * Balance history: month-end balances per account, from the ledger, for twelve months.
 *
 * **Balances only.** Holdings and debt are flat before the anchor in the generator (SIP holdings
 * and loans clamp `elapsedMonths` at zero, and everything else is a static field), so a
 * twelve-month net-worth line would be balances moving over a flat floor and would read as
 * growth that never happened. Balances move with the ledger, so they are the honest series, and
 * the screens say "balances" beside it.
 *
 * Each account is read on its own through `accountFactsAsOf`. A customer's accounts are separate
 * ledgers with separate running balances; one merged stream would read the last row's
 * `balanceAfterTxn`, from whichever bank posted last, as the customer's total.
 */
import { accountFactsAsOf } from '../asof.ts'
import { addMonths, daysInMonth, fromYmd, monthKey, ymd } from '../dates.ts'
import type { Transaction } from '../types.ts'
import { dateLabel, monthLabel } from './format.ts'
import { isBalanceAccount, isIdbi } from './segment.ts'
import { round1 } from './util.ts'

export interface BalancePoint {
  /** 'YYYY-MM'. */
  month: string
  total: number
  withIdbi: number
}

export interface LedgerAccount {
  accountType: string
  institution?: { isHome: boolean } | undefined
  /**
   * Before this date the account did not exist, so it holds nothing. Read only for an account
   * with rows; a declared figure is held flat (see `monthlyBalanceSeries`).
   */
  accountOpeningDate?: string | undefined
  /** This account's own rows, oldest first. Rows after the as-of date are ignored. */
  transactions: readonly Transaction[]
  /**
   * The balance before the first row. For an account with no ledger at all, such as a term
   * deposit the feed declares rather than streams, it is the balance throughout.
   */
  openingBalance?: number | undefined
}

/** The last calendar day of the month `iso` falls in. */
function monthEnd(iso: string): string {
  const { year, month } = ymd(iso)
  return fromYmd(year, month, daysInMonth(year, month))
}

/**
 * Twelve points by default, oldest first: the close of each of the last complete months.
 *
 * Complete months only, so the as-of month counts only when the clock stands on its last day.
 * The anchor is the 1st, which is payday for most of the book, and a final point taken on the
 * as-of date itself sat a whole salary above every month-end before it: Karan's balances read
 * +17% over three months, and his IDBI balance +139%, while the month-ends had both slipping.
 * A payday drawn as growth is the same mistake as a flat line drawn as growth. Month-end to
 * month-end compares like with like, and the as-of balance is shown beside the chart instead.
 *
 * An account with no rows is a declared figure, a term deposit the feed states rather than
 * streams, and it is held flat across the whole window, opening date or not. Stepped in on its
 * opening date it was growth no ledger line paid for: Meher's ₹12 lakh deposit, opened in
 * January and funded from outside the statement, read as a ₹12.6 lakh month against ₹57,560 of
 * movement, and lifted the whole book's line with it. Held flat, every month's change is the net
 * of the month's rows and nothing else, and the deposit still counts at its declared balance in
 * every point, as it does in the balances shown beside the chart.
 */
export function monthlyBalanceSeries(
  accounts: readonly LedgerAccount[],
  asOf: string,
  months = 12,
): BalancePoint[] {
  const dates = monthEnds(asOf, months)
  const balanceAccounts = accounts.filter(isBalanceAccount)
  return dates.map((on) => {
    let total = 0
    let idbi = 0
    for (const account of balanceAccounts) {
      const declared = account.transactions.length === 0
      if (!declared && account.accountOpeningDate !== undefined && account.accountOpeningDate > on)
        continue
      const balance = accountFactsAsOf(
        account.transactions,
        on,
        account.openingBalance === undefined ? {} : { openingBalance: account.openingBalance },
      ).currentBalance
      total += balance
      if (isIdbi(account)) idbi += balance
    }
    return { month: monthKey(on), total: Math.round(total), withIdbi: Math.round(idbi) }
  })
}

/**
 * The month-ends a series at `asOf` is read on, oldest first: the last `months` complete months.
 * The as-of month counts only when the clock stands on its last day.
 */
export function monthEnds(asOf: string, months = 12): string[] {
  const { year, month } = ymd(asOf)
  const thisMonth = fromYmd(year, month, 1)
  const lastClosed = asOf === monthEnd(asOf) ? thisMonth : addMonths(thisMonth, -1)
  const dates: string[] = []
  for (let back = months - 1; back >= 0; back -= 1) {
    dates.push(monthEnd(addMonths(lastClosed, -back)))
  }
  return dates
}

/** Which date a figure is read at, and the words for it. The wire's `FigureBasis`. */
export interface FigureBasis {
  asOf: string
  asOfLabel: string
  seriesFrom: string
  seriesTo: string
  lastMonthEnd: string
  seriesLabel: string
  lastMonthEndLabel: string
}

/**
 * The console's one scheme, in words: headline figures as at `asOf`, charts and the changes
 * read off them at the last `months` month-ends. Every page labels a figure with these strings,
 * so "With IDBI" as at the 1st and the August month-end beside it never read as one number
 * that changed its mind.
 */
export function figureBasis(asOf: string, months = 12): FigureBasis {
  const ends = monthEnds(asOf, months)
  const first = ends[0] ?? asOf
  const last = ends[ends.length - 1] ?? asOf
  const count = ends.length
  return {
    asOf,
    asOfLabel: `As at ${dateLabel(asOf)}`,
    seriesFrom: monthKey(first),
    seriesTo: monthKey(last),
    lastMonthEnd: last,
    seriesLabel: `${count} month-ends, ${monthLabel(first)} to ${monthLabel(last)}`,
    lastMonthEndLabel: `Month-end, ${dateLabel(last)}`,
  }
}

/**
 * The change over the last `months` points, as a percentage to one decimal.
 *
 * Null where the series is too short to look that far back, or where the earlier figure is zero
 * or negative: a change from nothing has no percentage, and inventing one would put an infinite
 * growth rate on a newly opened account.
 */
export function balanceChangePct(
  series: readonly BalancePoint[],
  months = 3,
  field: 'total' | 'withIdbi' = 'total',
): number | null {
  const last = series[series.length - 1]
  const base = series[series.length - 1 - months]
  if (last === undefined || base === undefined || months <= 0) return null
  if (base[field] <= 0) return null
  return round1(((last[field] - base[field]) / base[field]) * 100)
}
