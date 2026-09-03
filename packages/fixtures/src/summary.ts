/**
 * Headline numbers, derived.
 *
 * This exists so the demo script can be written *from* the ledger instead of beside it. Run
 * `pnpm --filter @dhan/fixtures summary`, read the numbers, put those numbers in the script.
 * The prototype quoted an outflow the transactions did not support; this is the fix.
 *
 * Nothing here is advice, and none of it belongs in `@dhan/core` — these are descriptive
 * aggregates for humans writing a demo, not the derivation the product runs on.
 */
import { seriesKey } from '@dhan/core'
import type { CustomerFile, SpendCategory } from '@dhan/core'
import { addMonths, monthKey } from './calendar.ts'

export interface LedgerSummary {
  slug: string
  name: string
  months: number
  transactions: number
  /** Median monthly credit. Median, not mean, so one bonus does not distort it. */
  monthlyIncome: number
  monthlyOutflow: number
  monthlySurplus: number
  /** What is committed every month and cannot simply be stopped. */
  fixedCommitments: number
  /** What could plausibly move. The leak. */
  discretionary: number
  closingBalance: number
  /** The floor. Money that was never needed in twelve months. */
  idleFloor: number
  byCategory: [SpendCategory, number][]
  recurring: [string, number, number][]
}

const FIXED: ReadonlySet<SpendCategory> = new Set<SpendCategory>([
  'Rent & bills',
  'Loan EMI',
  'Insurance',
  'Education',
  'Transfers',
  // Bank charges are not spending anybody chose. Counting them as discretionary would report
  // a leak the customer cannot plug.
  'Fees & charges',
])

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return Math.round(sorted[mid] ?? 0)
  return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
}

export function summarise(file: CustomerFile, asOf: string, months: number): LedgerSummary {
  const txns = file.transactions
  const monthly = new Map<string, { in: number; out: number; fixed: number; disc: number }>()
  const byCategory = new Map<SpendCategory, number>()
  const recurring = new Map<string, { count: number; total: number }>()

  // Only the trailing twelve months describe how this customer lives now.
  const from = addMonths(asOf, -12)

  for (const t of txns) {
    const key = monthKey(t.txnDate)
    const bucket = monthly.get(key) ?? { in: 0, out: 0, fixed: 0, disc: 0 }
    if (t.txnType === 'CREDIT') {
      bucket.in += t.txnAmount
    } else {
      bucket.out += t.txnAmount
      if (FIXED.has(t.spendCategory) || t.spendCategory === 'Investment')
        bucket.fixed += t.txnAmount
      else bucket.disc += t.txnAmount
    }
    monthly.set(key, bucket)

    if (t.txnDate >= from && t.txnType === 'DEBIT') {
      byCategory.set(t.spendCategory, (byCategory.get(t.spendCategory) ?? 0) + t.txnAmount)
      if (t.isRecurring) {
        // Group by the same key the engine groups by, so this CLI and the recurring detector
        // cannot disagree about what counts as one mandate.
        const token = seriesKey(t.narration)
        const seen = recurring.get(token) ?? { count: 0, total: 0 }
        recurring.set(token, { count: seen.count + 1, total: seen.total + t.txnAmount })
      }
    }
  }

  // Drop the first and last month: both are partial and would drag every average down.
  const keys = [...monthly.keys()].sort().slice(1, -1)
  const rows = keys.map((k) => monthly.get(k)).filter((v) => v !== undefined)

  const balances = txns
    .filter((t) => t.txnDate >= from)
    .map((t) => t.balanceAfterTxn)
    .filter((b): b is number => b !== null)

  const last = txns[txns.length - 1]

  return {
    slug: file.customer.custId,
    name: file.customer.custName,
    months,
    transactions: txns.length,
    monthlyIncome: median(rows.map((r) => r.in)),
    monthlyOutflow: median(rows.map((r) => r.out)),
    monthlySurplus: median(rows.map((r) => r.in - r.out)),
    fixedCommitments: median(rows.map((r) => r.fixed)),
    discretionary: median(rows.map((r) => r.disc)),
    closingBalance: last?.balanceAfterTxn ?? 0,
    idleFloor: balances.length > 0 ? Math.min(...balances) : 0,
    byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
    recurring: [...recurring.entries()]
      .map(([token, v]): [string, number, number] => [token, v.count, v.total])
      .sort((a, b) => b[2] - a[2]),
  }
}

const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`

export function formatSummary(s: LedgerSummary): string {
  const lines = [
    `${s.name}  (${s.transactions} transactions over ${s.months} months)`,
    `  income        ${inr(s.monthlyIncome).padStart(12)}  /month (median)`,
    `  outflow       ${inr(s.monthlyOutflow).padStart(12)}  /month`,
    `    committed   ${inr(s.fixedCommitments).padStart(12)}  rent, EMI, transfers, investments`,
    `    discretion. ${inr(s.discretionary).padStart(12)}  the part that could move`,
    `  surplus       ${inr(s.monthlySurplus).padStart(12)}  /month`,
    `  balance now   ${inr(s.closingBalance).padStart(12)}`,
    `  idle floor    ${inr(s.idleFloor).padStart(12)}  never went below this in 12 months`,
    '  spend by category, last 12 months:',
    ...s.byCategory.map(([c, v]) => `    ${c.padEnd(16)} ${inr(v).padStart(12)}`),
    '  recurring mandates detected in the narrations:',
    ...s.recurring
      .slice(0, 10)
      .map(([m, n, v]) => `    ${m.padEnd(16)} ${String(n).padStart(3)}x  ${inr(v).padStart(10)}`),
  ]
  return lines.join('\n')
}
