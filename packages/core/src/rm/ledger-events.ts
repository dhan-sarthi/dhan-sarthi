/**
 * Journey events read off the ledger: the things that happened to a customer's money that no
 * plan, decision or call recorded.
 *
 * Six of them, each found from transaction fields and narration grammar alone, never from who
 * the customer is:
 *
 * - **Salary change** — the salary credits in a month moved more than 15% from the level before,
 *   and the new level held the month after (or is the latest month). A one-month bonus is not a
 *   change of salary, and reporting it as one would put a rise and a cut on the timeline for a
 *   single payslip.
 * - **Mandate returned** — the bank's return charge on a NACH, ACH or ECS presentation. Matched
 *   on the start of the narration, so the GST line levied on the same charge is not a second
 *   return. Where the instalment was then paid by hand, the event says when.
 * - **Deposit matured** — a credit whose narration names a term deposit's maturity or closure.
 * - **Loan closed** — a run of mandate instalments that stopped: the next one fell due and never
 *   came, while the statement carried on. A ledger that simply ends is not a closed loan.
 * - **Large inflow / outflow** — a month whose money in (or out) was more than twice the median
 *   month, self-transfers excluded. Measured by the month rather than the line, because a single
 *   debit larger than a whole normal month is too rare to say anything, while a month at twice
 *   the usual is exactly the hospital bill or the windfall an RM should ask about. The largest
 *   line in that month is named.
 *
 * The narration forms are the ones `packages/fixtures/src/narration.ts` writes from the rails'
 * documented grammars, so a real statement in the same grammar is read the same way.
 */
import { addDays, addMonths, daysBetween, daysInMonth, fromYmd, monthKey, ymd } from '../dates.ts'
import { seriesKey } from '../recurring.ts'
import type { Transaction } from '../types.ts'
import { monthLabel, rupees, rupeesTitle, shortDate } from './format.ts'
import { cmp, median, round1 } from './util.ts'

export type LedgerEventType =
  | 'salary_change'
  | 'mandate_returned'
  | 'deposit_matured'
  | 'loan_closed'
  | 'large_inflow'
  | 'large_outflow'

/** A journey event with `kind: 'ledger'`, plus which ledger event it is. */
export interface LedgerEvent {
  id: string
  /** YYYY-MM-DD, simulated. */
  at: string
  kind: 'ledger'
  source: 'ledger'
  type: LedgerEventType
  title: string
  detail: string | null
  diff: null
  verdict: null
  ruleId: null
  amount: number | null
}

export interface LedgerEventOptions {
  /** Months back from `asOf` to report events for. Detection reads further back where it must. */
  months?: number | undefined
}

/** A salary that moved more than this, as a fraction, is a changed salary. */
export const SALARY_CHANGE = 0.15
/** A month whose flow in one direction is above this multiple of the median month is large. */
export const LARGE_FLOW_MULTIPLE = 2
/** Days past an instalment's due date before its absence means the loan has closed. */
const CLOSURE_GRACE_DAYS = 10
/** Days after a returned mandate within which a hand-paid instalment is read as its settlement. */
const SETTLEMENT_WINDOW_DAYS = 30

const RETURN = /^(?:NACH|ACH|ECS)[\s/-]*(?:(?:DR|DEBIT)[\s/-]*)?(?:RETURN|RTN)\b/i
const MATURITY =
  /\b(?:FD|TD|RD|TERM DEPOSIT|FIXED DEPOSIT|RECURRING DEPOSIT|DEPOSIT)\b.*\b(?:MATUR\w*|CLOS\w*|PROCEEDS|PRE-?MAT\w*|REDEEM\w*)\b|\bMATURITY\b/i

/** Words a statement prints in capitals that stay that way when a name is title-cased. */
const ACRONYMS: ReadonlySet<string> = new Set([
  'IDBI',
  'HDFC',
  'ICICI',
  'SBI',
  'LIC',
  'PMJJBY',
  'PMSBY',
  'NPS',
  'PPF',
  'EMI',
  'CRA',
  'EPFO',
  'AMC',
  'MF',
])

/** Joining words stay lower case inside a name: "LIC of India", not "LIC Of India". */
const SMALL: ReadonlySet<string> = new Set(['OF', 'AND', 'THE', 'FOR'])

function titleCase(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w, i) => {
      const upper = w.toUpperCase()
      if (ACRONYMS.has(upper)) return upper
      if (i > 0 && SMALL.has(upper)) return w.toLowerCase()
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    })
    .join(' ')
}

/** Who the money went to or came from, read off the rail's own grammar. Null where it says none. */
export function counterpartyOf(narration: string): string | null {
  const patterns: readonly RegExp[] = [
    /^UPI\/(?:DR|CR)\/\d+\/([^/]+)\//,
    /^IMPS\/P2A\/\d+\/([^/]+)\//,
    /^NEFT\/DR\/([^/]+)\//,
    /^NEFT\/[A-Z0-9]+\/([^/]+)\//,
    /^ACH-DR-(.+?)-[A-Z0-9]{10,}-/,
    /^ACH\/D\/([^/]+)\//,
    /^(?:POS|ECOM) \S+ (.+)$/,
  ]
  for (const p of patterns) {
    const name = p.exec(narration)?.[1]
    if (name === undefined) continue
    return name.trim().toUpperCase() === 'SELF' ? 'own account' : titleCase(name)
  }
  return null
}

function event(
  type: LedgerEventType,
  key: string,
  at: string,
  title: string,
  detail: string | null,
  amount: number | null,
): LedgerEvent {
  return {
    id: `ledger:${type}:${key}`,
    at,
    kind: 'ledger',
    source: 'ledger',
    type,
    title,
    detail,
    diff: null,
    verdict: null,
    ruleId: null,
    amount,
  }
}

const sortByDate = (txns: readonly Transaction[]): Transaction[] =>
  [...txns].sort((a, b) => cmp(a.txnDate, b.txnDate))

/* ------------------------------------------------------------------ *
 * Salary
 * ------------------------------------------------------------------ */

function salaryChanges(ledger: readonly Transaction[]): LedgerEvent[] {
  const byMonth = new Map<string, { total: number; first: string }>()
  for (const t of ledger) {
    if (t.txnType !== 'CREDIT' || !t.isSalaryCredit) continue
    const key = monthKey(t.txnDate)
    const seen = byMonth.get(key)
    byMonth.set(key, {
      total: (seen?.total ?? 0) + t.txnAmount,
      first: seen === undefined || t.txnDate < seen.first ? t.txnDate : seen.first,
    })
  }
  const months = [...byMonth.keys()].sort()
  const moved = (from: number, to: number): boolean =>
    from > 0 && Math.abs(to - from) / from > SALARY_CHANGE

  const out: LedgerEvent[] = []
  let level = byMonth.get(months[0] ?? '')?.total ?? 0
  for (let i = 1; i < months.length; i += 1) {
    const month = months[i]
    const now = month === undefined ? undefined : byMonth.get(month)
    if (month === undefined || now === undefined) continue
    if (!moved(level, now.total)) {
      level = now.total
      continue
    }
    const nextMonth = months[i + 1]
    const next = nextMonth === undefined ? undefined : byMonth.get(nextMonth)
    // A bonus: the next month went straight back. The level the change is measured from stays.
    if (next !== undefined && moved(now.total, next.total)) continue

    const pct = Math.round((Math.abs(now.total - level) / level) * 100)
    const up = now.total > level
    out.push(
      event(
        'salary_change',
        month,
        now.first,
        `Salary ${up ? 'up' : 'down'} ${pct}% to ${rupeesTitle(now.total)} a month`,
        `From ${rupees(level)} a month. First credited at the new level on ${shortDate(now.first)}.`,
        now.total,
      ),
    )
    level = now.total
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Mandates, deposits, loans
 * ------------------------------------------------------------------ */

/** An instalment paid by hand rather than by mandate: an EMI line on any other rail. */
const handPaidEmi = (t: Transaction): boolean =>
  t.txnType === 'DEBIT' &&
  t.spendCategory === 'Loan EMI' &&
  t.txnMode !== 'ACH-D' &&
  t.txnMode !== 'SI' &&
  !/^CreditCard Payment/i.test(t.narration)

function mandateReturns(ledger: readonly Transaction[]): LedgerEvent[] {
  const out: LedgerEvent[] = []
  for (const t of ledger) {
    if (t.txnType !== 'DEBIT' || !RETURN.test(t.narration)) continue
    const by = addDays(t.txnDate, SETTLEMENT_WINDOW_DAYS)
    const settled = ledger.find((s) => handPaidEmi(s) && s.txnDate > t.txnDate && s.txnDate <= by)
    if (settled === undefined) {
      out.push(
        event(
          'mandate_returned',
          t.txnId,
          t.txnDate,
          'Mandate returned unpaid',
          `${rupees(t.txnAmount)} return charge on ${shortDate(t.txnDate)}.`,
          t.txnAmount,
        ),
      )
      continue
    }
    const late = daysBetween(t.txnDate, settled.txnDate)
    out.push(
      event(
        'mandate_returned',
        t.txnId,
        t.txnDate,
        `${rupeesTitle(settled.txnAmount)} EMI mandate returned, paid ${late} days later`,
        `${rupees(t.txnAmount)} return charge on ${shortDate(t.txnDate)}; the instalment went by hand on ${shortDate(settled.txnDate)}.`,
        settled.txnAmount,
      ),
    )
  }
  return out
}

function depositMaturities(ledger: readonly Transaction[]): LedgerEvent[] {
  return ledger
    .filter((t) => t.txnType === 'CREDIT' && MATURITY.test(t.narration))
    .map((t) =>
      event(
        'deposit_matured',
        t.txnId,
        t.txnDate,
        `${rupeesTitle(t.txnAmount)} from a matured deposit`,
        `Credited on ${shortDate(t.txnDate)}.`,
        t.txnAmount,
      ),
    )
}

function loanClosures(ledger: readonly Transaction[]): LedgerEvent[] {
  const lastSeen = ledger[ledger.length - 1]?.txnDate
  if (lastSeen === undefined) return []

  const runs = new Map<string, Transaction[]>()
  for (const t of ledger) {
    if (t.txnType !== 'DEBIT' || t.spendCategory !== 'Loan EMI' || t.txnMode !== 'ACH-D') continue
    // `seriesKey` strips the presentation date a mandate line ends with, which is what lets one
    // loan's instalments collapse onto one key.
    const key = `${t.accountNumberMasked ?? ''}|${seriesKey(t.narration)}`
    runs.set(key, [...(runs.get(key) ?? []), t])
  }

  const out: LedgerEvent[] = []
  for (const run of runs.values()) {
    const last = run[run.length - 1]
    if (last === undefined || run.length < 3) continue
    const overdue = addDays(addMonths(last.txnDate, 1), CLOSURE_GRACE_DAYS)
    if (lastSeen <= overdue) continue
    // A returned or hand-paid instalment after the last mandate debit is a loan still running.
    const laterPayment = ledger.some(
      (t) =>
        t.txnDate > last.txnDate &&
        (RETURN.test(t.narration) ||
          (handPaidEmi(t) && Math.abs(t.txnAmount - last.txnAmount) < 1)),
    )
    if (laterPayment) continue

    const lender = counterpartyOf(last.narration)
    out.push(
      event(
        'loan_closed',
        last.txnId,
        last.txnDate,
        `${rupeesTitle(last.txnAmount)} a month freed — ${lender === null ? 'a loan' : `${lender} loan`} closed`,
        `Last instalment on ${shortDate(last.txnDate)}, after ${run.length} on this statement.`,
        last.txnAmount,
      ),
    )
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Large months
 * ------------------------------------------------------------------ */

function largeMonths(window: readonly Transaction[], asOf: string): LedgerEvent[] {
  // The as-of month is still running unless the clock stands on its last day, and a part-month
  // would pull the median down: it can be flagged, but it does not set what usual means.
  const { year, month } = ymd(asOf)
  const asOfMonth = monthKey(asOf)
  const asOfComplete = asOf === fromYmd(year, month, daysInMonth(year, month))
  const out: LedgerEvent[] = []
  for (const direction of ['CREDIT', 'DEBIT'] as const) {
    const byMonth = new Map<string, Transaction[]>()
    for (const t of window) {
      if (t.txnType !== direction || t.isSelfTransfer === true) continue
      const key = monthKey(t.txnDate)
      byMonth.set(key, [...(byMonth.get(key) ?? []), t])
    }
    const totals = new Map(
      [...byMonth].map(([m, txns]) => [m, txns.reduce((s, t) => s + t.txnAmount, 0)] as const),
    )
    const usual = median(
      [...totals].filter(([m]) => m < asOfMonth || asOfComplete).map(([, total]) => total),
    )
    if (usual <= 0) continue

    for (const [key, total] of [...totals].sort((a, b) => cmp(a[0], b[0]))) {
      if (total <= LARGE_FLOW_MULTIPLE * usual) continue
      const lines = byMonth.get(key) ?? []
      const largest = lines.reduce<Transaction | undefined>(
        (top, t) => (top === undefined || t.txnAmount > top.txnAmount ? t : top),
        undefined,
      )
      if (largest === undefined) continue
      const who = counterpartyOf(largest.narration)
      const inflow = direction === 'CREDIT'
      out.push(
        event(
          inflow ? 'large_inflow' : 'large_outflow',
          key,
          largest.txnDate,
          `${rupeesTitle(total)} ${inflow ? 'came in' : 'went out'} during ${monthLabel(key)}, ${round1(total / usual)}× a usual month`,
          `Largest: ${rupees(largest.txnAmount)}${who === null ? '' : `, ${inflow ? 'from' : 'to'} ${who}`}, on ${shortDate(largest.txnDate)}.`,
          Math.round(total),
        ),
      )
    }
  }
  return out
}

/* ------------------------------------------------------------------ *
 * All of them
 * ------------------------------------------------------------------ */

/**
 * Every ledger event in the last `months` calendar months to `asOf`, oldest first.
 *
 * The window is whole months, the as-of month included (October 2025 to September 2026 for an
 * as-of of 1 September 2026), so an event from the month still running is on the timeline the
 * day it happens. `transactions` is the customer's whole ledger across all accounts; rows after
 * `asOf` are ignored. Salary and loan detection read the full history up to `asOf`, because a
 * change is measured against what came before the window; only events inside the window are
 * returned.
 */
export function ledgerEvents(
  transactions: readonly Transaction[],
  asOf: string,
  options: LedgerEventOptions = {},
): LedgerEvent[] {
  const { year, month } = ymd(asOf)
  const from = addMonths(fromYmd(year, month, 1), -((options.months ?? 12) - 1))
  const ledger = sortByDate(transactions.filter((t) => t.txnDate <= asOf))
  const window = ledger.filter((t) => t.txnDate >= from)

  return [
    ...salaryChanges(ledger),
    ...mandateReturns(ledger),
    ...depositMaturities(window),
    ...loanClosures(ledger),
    ...largeMonths(window, asOf),
  ]
    .filter((e) => e.at >= from && e.at <= asOf)
    .sort((a, b) => cmp(a.at, b.at) || cmp(a.id, b.id))
}
