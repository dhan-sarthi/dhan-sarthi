/**
 * Statements the app can actually produce, and the arithmetic behind the tenure picker.
 *
 * ## What shipped, and what did not
 *
 * `spec/screens/13-reports/02-reports-home.md` offers three: Capital Gain / Loss, Transactions
 * and Holding Statement. Two of them are real here.
 *
 * - **Transactions** — real. The ledger is twenty-four months of statement lines with a
 *   narration, a category, a mode and a running balance, read through `listTransactions`, and it
 *   is the same data the whole app derives from. A statement of it is a genuine artefact.
 * - **Holdings** — real, but only as of today. `getHoldings` returns a current position with an
 *   invested figure and a current value; there is no history behind it, so the source's
 *   as-of-date sheet has nothing to pick from. It ships with the date fixed and says why.
 * - **Capital gain / loss** — **not shipped.** It needs per-unit acquisition lots, acquisition
 *   dates, a NAV series and redemption records to split short-term from long-term and apply
 *   indexation. This app holds one `investedAmount` and one `currentValue` per holding and has
 *   no redemptions at all. What it could compute is unrealised appreciation, which is not a
 *   capital gain, is not what the tax return wants, and would be wrong in the one place it
 *   matters. It stays on the reports list, greyed, with that sentence — which is more useful
 *   than a silent omission and more honest than a fabricated statement.
 *
 * ## Two demo-data bugs from the source, deliberately not reproduced
 *
 * `03-report-capital-gain-config.md` shows both financial-year radios reading `(2022 -  2023)`.
 * Only one of them can be right, so the years here are computed from the session's as-of date.
 * And `06-report-success-dialog.md` shows a dialog naming `Email@gmail.com` over a form naming
 * `utkasrsh123@gmail.com` — two unbound demo strings. This app names no address at all, because
 * it holds none: see `DELIVERY` below.
 */
import type { HoldingRecordResponse, Transaction } from '@dhan/contracts'

export type ReportKind = 'transactions' | 'holdings'
export type Tenure = 'current-fy' | 'previous-fy' | 'custom'

export interface DateRange {
  from: string
  to: string
}

/* ---------------------------------------------------------------- Tenure */

/**
 * The Indian financial year an ISO date falls in, or one `back` from it.
 *
 * 1 April to 31 March, labelled the way a statement labels it — `2025-26`, not `2025 - 2026`.
 * Computed rather than written down: the source's form has the same string on both radios and
 * the spec flags it as a bug rather than a format to copy.
 */
export function financialYear(iso: string, back = 0): DateRange & { label: string } {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  const start = (month >= 4 ? year : year - 1) - back
  const end = start + 1
  return {
    label: `${start}-${String(end).slice(2)}`,
    from: `${start}-04-01`,
    to: `${end}-03-31`,
  }
}

/** The range a tenure asks for, before anything is clipped to what the ledger holds. */
export function rangeFor(tenure: Tenure, asOf: string, custom: DateRange): DateRange {
  if (tenure === 'current-fy') return financialYear(asOf)
  if (tenure === 'previous-fy') return financialYear(asOf, 1)
  return custom
}

export interface Coverage {
  /** What the report will actually cover, after clipping. Null when the ledger holds none of it. */
  range: DateRange | null
  /** The ledger stops short of the requested range at one end or both. */
  clipped: boolean
  /** `from` is after `to`. The one validation the form can fail on. */
  inverted: boolean
}

/**
 * What the ledger can honestly answer for a requested range.
 *
 * The reference has no empty state, no validation and no error path anywhere in 998 seconds of
 * footage, and a report screen is where their absence shows: "Current Financial Year" on a
 * twenty-four-month ledger is a partial year for most of its life, and a custom range can miss
 * it entirely. Saying so before the file is generated is the whole difference between a
 * statement and a blank spreadsheet.
 */
export function coverage(requested: DateRange, horizon: DateRange): Coverage {
  if (requested.from > requested.to) return { range: null, clipped: false, inverted: true }
  const from = requested.from < horizon.from ? horizon.from : requested.from
  const to = requested.to > horizon.to ? horizon.to : requested.to
  if (from > to) return { range: null, clipped: true, inverted: false }
  return {
    range: { from, to },
    clipped: from !== requested.from || to !== requested.to,
    inverted: false,
  }
}

/* ---------------------------------------------------------------- Delivery */

/**
 * How a report can leave the app.
 *
 * The source offers `Receive on email` and `Download on your phone`, and its helper line names a
 * registered address. This app has no address to name: there is no `email` field on the customer
 * in `packages/contracts/src/domain.ts`, IDBI's twenty-four operations carry none, and the
 * declared profile does not ask for one. Shipping the radio and quietly doing nothing, or
 * inventing an address the way the source's own dialog does, are both worse than saying it.
 *
 * So the option stays on the form, disabled, with the reason. The structure is the reference's;
 * the honesty is not.
 */
export const DELIVERY_UNAVAILABLE =
  'The bank sends no email address and this app never asks for one, so there is nowhere to send it.'

/* ---------------------------------------------------------------- CSV */

/*
 * CSV, and the reason it is not called Excel.
 *
 * The source's helper line says "in excel format." — the only statement of output format
 * anywhere in the video, with no picker beside it. This writes RFC 4180 CSV, which Excel opens
 * natively, and the screen says CSV rather than borrowing a word for a format it does not write.
 *
 * The leading-character guard is not decoration. A narration beginning `=`, `+`, `-` or `@` is a
 * formula the moment a spreadsheet opens the file, and bank statements carry merchant strings
 * nobody sanitised. Prefixing an apostrophe is the standard fix and costs a character in a cell
 * a human reads as text anyway.
 */
const RISKY_LEAD = /^[=+\-@\t\r]/

export function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const raw = typeof value === 'number' ? String(value) : value
  const guarded = RISKY_LEAD.test(raw) ? `'${raw}` : raw
  return /["\n\r,]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

/** Rows to a CSV document. CRLF, because that is what RFC 4180 says and what Excel expects. */
export function csv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return rows.map((row) => row.map(cell).join(',')).join('\r\n')
}

export interface ReportMeta {
  customerName: string
  /**
   * The snapshot the figures were read off.
   *
   * A bank statement carries an account number; this file is not one, and stamping a masked
   * account on it would imply it came from the core banking system. What identifies it here is
   * the snapshot — the same id the advice record chains against — so a file and a decision taken
   * the same day can be tied together.
   */
  snapshotId: string
  /** The session's as-of date — the date the statement is true on, not the wall clock. */
  asOf: string
  /** Where the underlying data came from, stamped on the file rather than left to be assumed. */
  source: string
}

/*
 * Every file opens with a provenance block.
 *
 * A statement that does not say what it is, who it is for, what window it covers and where the
 * numbers came from is a spreadsheet somebody found. Four lines is cheap and it is the difference
 * between an artefact a reviewer can file and one they have to ask about.
 */
function header(title: string, meta: ReportMeta, range: DateRange | null): string[][] {
  return [
    [title],
    ['Customer', meta.customerName],
    ['Snapshot', meta.snapshotId],
    range ? ['Period', `${range.from} to ${range.to}`] : ['As on', meta.asOf],
    ['Statement date', meta.asOf],
    ['Source', meta.source],
    [],
  ]
}

export function transactionsCsv(
  items: readonly Transaction[],
  range: DateRange,
  meta: ReportMeta,
): string {
  const rows: (string | number | null | undefined)[][] = [
    ...header('Transaction statement', meta, range),
    [
      'Date',
      'Value date',
      'Narration',
      'Merchant',
      'Category',
      'Type',
      'Mode',
      'Amount',
      'Balance',
      'Recurring',
    ],
    ...items.map((t) => [
      t.txnDate,
      t.valueDate,
      t.narration,
      t.merchantName ?? '',
      t.spendCategory,
      t.txnType,
      t.txnMode,
      t.txnAmount,
      t.balanceAfterTxn,
      t.isRecurring ? 'Yes' : 'No',
    ]),
    [],
    ['Lines', items.length],
    ['Credits', items.filter((t) => t.txnType === 'CREDIT').reduce((s, t) => s + t.txnAmount, 0)],
    ['Debits', items.filter((t) => t.txnType === 'DEBIT').reduce((s, t) => s + t.txnAmount, 0)],
  ]
  return csv(rows)
}

/**
 * The holdings statement.
 *
 * Invested and current value are both shown and the difference is labelled `Change in value`
 * rather than `Gain` — it is unrealised, it is not a taxable event, and calling it a gain is
 * exactly the elision that makes the capital-gain report impossible to write honestly.
 *
 * Policies are listed separately and carry no value column, because cover is not capital and
 * summing a sum assured into a portfolio total is a category error.
 */
export function holdingsCsv(
  holdings: readonly HoldingRecordResponse[],
  policies: readonly HoldingRecordResponse[],
  meta: ReportMeta,
): string {
  const invested = holdings.reduce((s, h) => s + h.investedAmount, 0)
  const current = holdings.reduce((s, h) => s + h.currentValue, 0)
  const rows: (string | number | null | undefined)[][] = [
    ...header('Holding statement', meta, null),
    [
      'Name',
      'Type',
      'Asset class',
      'Invested',
      'Current value',
      'Change in value',
      'SIP',
      'Held at',
    ],
    ...holdings.map((h) => [
      h.name,
      h.holdingType,
      h.assetClass,
      h.investedAmount,
      h.currentValue,
      h.currentValue - h.investedAmount,
      h.sipActive ? (h.sipAmount ?? 'Active') : 'No',
      h.heldOutsideIdbi === true ? 'Elsewhere' : 'IDBI',
    ]),
    [],
    ['Total invested', invested],
    ['Total current value', current],
    ['Change in value (unrealised, not a capital gain)', current - invested],
  ]
  if (policies.length > 0) {
    rows.push(
      [],
      ['Protection in force'],
      ['Name', 'Type', 'Premium', 'Held at'],
      ...policies.map((p) => [
        p.name,
        p.holdingType,
        p.sipAmount ?? '',
        p.heldOutsideIdbi === true ? 'Elsewhere' : 'IDBI',
      ]),
    )
  }
  return csv(rows)
}

/** `transactions-2025-04-01-to-2026-03-31.csv`. Sorts by name, which a downloads folder needs. */
export function fileName(kind: ReportKind, range: DateRange | null, asOf: string): string {
  const stem = kind === 'transactions' ? 'transaction-statement' : 'holding-statement'
  const window = range ? `${range.from}-to-${range.to}` : `as-on-${asOf}`
  return `${stem}-${window}.csv`
}
