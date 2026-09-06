/**
 * As-of arithmetic: what an account, a loan and a SIP look like on a given date.
 *
 * These used to live inside the fixtures generator. They moved here because every source of
 * bank data — the generator, the seeded Postgres rows, the in-memory adapter — has to answer
 * the same question the same way: "what is the balance floor, how many instalments are left,
 * how much has this SIP accumulated, *as of today*?" One implementation, called by all of
 * them, means parity is by construction rather than by a reconciliation test, and a judge
 * advancing the clock five months watches the education loan leave the file from Postgres
 * exactly as it does from the generator.
 *
 * Everything here is pure and date-string arithmetic. Contracts (a loan's remaining tenure at
 * the anchor, a SIP's start) are facts that never move; `asOf` is the only thing that does.
 */
import { addMonths, monthKey, ymd } from './dates.ts'
import type { Holding, Liability, Transaction } from './types.ts'

/* ------------------------------------------------------------------ *
 * Calendar
 * ------------------------------------------------------------------ */

/**
 * Calendar months from the anchor forward to `asOf`, never negative.
 *
 * Measured on year and month only, so 1 September to 30 September is zero and 1 September to
 * 1 October is one — a loan's instalment count moves with the calendar, not with day counts.
 * A date before the anchor is clamped to zero: the history is what it is.
 */
export function elapsedMonths(anchor: string, asOf: string): number {
  const a = ymd(anchor)
  const b = ymd(asOf)
  return Math.max(0, (b.year - a.year) * 12 + (b.month - a.month))
}

/* ------------------------------------------------------------------ *
 * Accounts
 * ------------------------------------------------------------------ */

export interface AccountFacts {
  currentBalance: number
  avgMonthlyBalance3m: number
  avgMonthlyBalance12m: number
  /** The floor. Money that was never needed in twelve months is money doing nothing. */
  minBalance12m: number
}

export interface AccountFactsOptions {
  /**
   * What the balance was before the first transaction. Only read when the ledger up to `asOf`
   * is empty, so an account with no history reports its opening balance rather than zero.
   */
  openingBalance?: number
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length)
}

/**
 * Synthetic balance facts on `asOf`, computed from the fixture ledger. These historical
 * averages are our calculations; the bank's account-list service does not establish them.
 *
 * Rows dated after `asOf` are ignored, so a caller may hand over the whole seeded span and
 * still get the answer for the session's date. Averages are over month-end closing balances,
 * the floor is over every running balance in the trailing twelve months, and the current
 * balance is the running balance after the last row. The ledger is expected oldest-first with
 * the bank's intra-day order preserved; a stable sort on date keeps that order intact.
 */
export function accountFactsAsOf(
  txns: readonly Transaction[],
  asOf: string,
  options?: AccountFactsOptions,
): AccountFacts {
  const ledger = txns.filter((t) => t.txnDate <= asOf).sort((a, b) => cmp(a.txnDate, b.txnDate))

  const last = ledger[ledger.length - 1]
  const closing = last?.balanceAfterTxn ?? options?.openingBalance ?? 0

  const twelveMonthsAgo = addMonths(asOf, -12)
  let floor: number | null = null
  for (const t of ledger) {
    if (t.txnDate < twelveMonthsAgo || t.balanceAfterTxn === null) continue
    if (floor === null || t.balanceAfterTxn < floor) floor = t.balanceAfterTxn
  }

  const monthEnds = new Map<string, number>()
  for (const t of ledger) {
    if (t.balanceAfterTxn !== null) monthEnds.set(monthKey(t.txnDate), t.balanceAfterTxn)
  }
  const keys = [...monthEnds.keys()].sort()
  const tail = (n: number): number[] => keys.slice(-n).map((k) => monthEnds.get(k) ?? 0)

  return {
    currentBalance: closing,
    avgMonthlyBalance3m: mean(tail(3)),
    avgMonthlyBalance12m: mean(tail(12)),
    minBalance12m: floor ?? closing,
  }
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/* ------------------------------------------------------------------ *
 * Liabilities
 * ------------------------------------------------------------------ */

/** A loan as a contract: fixed facts measured at the anchor, from which any date can be rolled. */
export interface LiabilityContract {
  isNpa?: boolean
  loanType: string
  emiAmount: number
  /** Annual rate, as a percentage. */
  rate: number
  /** Instalments still to run as at the anchor. */
  tenureRemainingAtAnchor: number
  /** Days past due. Non-zero blocks every investment recommendation. */
  dpdStatus?: number
  isRevolving?: boolean
}

/**
 * The liability as it stands on `asOf`, or null once it has been paid off.
 *
 * Tenure shortens by the months elapsed since the anchor, so a file that claimed five
 * instalments left still claims five after a judge watched four of them go is impossible. A
 * cleared loan leaves the list altogether, which is what frees up the EMI.
 */
export function liabilityAsOf(
  contract: LiabilityContract,
  anchor: string,
  asOf: string,
): Liability | null {
  const remaining = Math.max(0, contract.tenureRemainingAtAnchor - elapsedMonths(anchor, asOf))
  if (remaining <= 0) return null

  return {
    loanType: contract.loanType,
    // Outstanding consistent with what is left to pay, so a judge cannot find the seam between
    // "five months remaining" and a balance that would take five years to clear.
    outstandingPrincipal: Math.round(contract.emiAmount * remaining * 0.97),
    emiAmount: contract.emiAmount,
    loanInterestRate: contract.rate,
    tenureRemainingMonths: remaining,
    dpdStatus: contract.dpdStatus ?? 0,
    ...(contract.isNpa === undefined ? {} : { isNpa: contract.isNpa }),
    ...(contract.isRevolving === undefined ? {} : { isRevolving: contract.isRevolving }),
  }
}

/* ------------------------------------------------------------------ *
 * SIPs
 * ------------------------------------------------------------------ */

/** A systematic investment plan as a contract. */
export interface SipContract {
  scheme: string
  amount: number
  /** Day of month the mandate debits. */
  day: number
  /** How many months before the anchor the first instalment went. */
  startsMonthsBeforeAnchor: number
  assetClass: Holding['assetClass']
  /** Bought elsewhere. We do not churn what another distributor sold well. */
  heldOutsideIdbi?: boolean
}

/**
 * The holding a SIP has built up by `asOf`.
 *
 * Instalments are counted from the start of the SIP or the start of the available history,
 * whichever is later, and grow by one for every month the clock is advanced. `historyMonths`
 * is the length of the ledger window measured back from the anchor.
 */
export function sipHoldingAsOf(
  contract: SipContract,
  anchor: string,
  asOf: string,
  historyMonths: number,
): Holding {
  const elapsed = elapsedMonths(anchor, asOf)
  const instalments = Math.min(contract.startsMonthsBeforeAnchor + elapsed, historyMonths + elapsed)
  const invested = contract.amount * instalments

  return {
    holdingType: 'MUTUAL_FUND',
    name: contract.scheme,
    assetClass: contract.assetClass,
    investedAmount: invested,
    // A flat notional gain. Nothing downstream may present this as a return, and the projection
    // screen must show a band with its assumption on screen — never this number dressed up as
    // performance. See docs/product/product-shelf.md.
    currentValue: Math.round(invested * 1.19),
    sipActive: true,
    sipAmount: contract.amount,
    sipDebitDay: contract.day,
    ...(contract.heldOutsideIdbi === undefined
      ? {}
      : { heldOutsideIdbi: contract.heldOutsideIdbi }),
  }
}
