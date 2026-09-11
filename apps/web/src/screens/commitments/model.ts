/**
 * A detected recurring debit, as this screen has to talk about it.
 *
 * ## The thing this file exists to keep straight
 *
 * SmartWealth's Systematic Calendar lists SIPs *the app itself placed*. It knows the folio, the
 * scheme, the instalment count and the end date, because it sold them; and its `Pause` button
 * sends a real instruction to a real registrar.
 *
 * This app has none of that. There is no order history, no folio, no mandate registry — there is
 * a bank statement, and `packages/core/src/recurring.ts` reading a pattern out of it. That is
 * better data in one direction (it finds the rent, the EMI, the gym and the school fees, not just
 * what one distributor sold) and strictly worse in the other: **we can observe a mandate and we
 * cannot touch it.** A "Pause" button here would be a button that lies.
 *
 * So the status a row carries is split by where it came from, and the split is visible on screen:
 *
 * - `live` / `lapsed` are **observed**. The engine says whether a charge landed within roughly a
 *   cycle of today (`Series.active`); lapsed means the ledger has gone quiet, which is evidence
 *   and not a decision anybody made.
 * - `paused` / `stopped` are **declared** — the customer told this screen. Nothing was sent
 *   anywhere. They change the projection so the calendar and the month total answer "what would
 *   this look like without it", and they are labelled as notes everywhere they appear.
 *
 * And because the two can disagree, they are checked against each other: a commitment declared
 * stopped whose next debit turns up in the ledger anyway is a `conflict`, which is a genuinely
 * useful thing to be told and something the reference could not have found if it wanted to.
 */
import { addDays } from '@dhan/core'
import type { Series, Snapshot } from '@dhan/contracts'
import { prettyMerchant } from '../../lib/merchant.ts'
import { occurrences } from './calendar.ts'
import type { Schedule } from './calendar.ts'

/** Where a status came from matters more than what it says, so the type keeps both. */
export type CommitmentStatus = 'live' | 'lapsed' | 'paused' | 'stopped'

/**
 * What the customer told this screen.
 *
 * Held in the screen's own state and nowhere else. Not `localStorage`: `api/session.ts` is
 * explicit that the browser keeps a token and a cif and nothing about the customer, so that
 * "no customer data in the browser" is checkable in DevTools rather than promised in a slide.
 * A note that outlived a reload would have to break that, and the honest home for one is a row
 * on the session the way caps and decisions already are — which is an API change, not a screen.
 */
export interface Note {
  kind: 'paused' | 'stopped' | 'revised'
  /** The as-of date the note was made against. What a later debit gets compared to. */
  on: string
  /** Pause only: the date it resumes. */
  until: string | null
  /** Revised only: the figures the customer says now apply. */
  amount: number | null
  dayOfMonth: number | null
}

export interface Commitment {
  key: string
  series: Series
  note: Note | null
  status: CommitmentStatus
  /** Declared off, and then charged anyway. The ledger disagreeing with the note. */
  conflict: boolean
  /** The merchant, or the narration cleaned up enough to read. */
  name: string
  /** What one charge costs — the revised figure where the customer has given us one. */
  amount: number
  monthlyCost: number
  annualCost: number
  dayOfMonth: number | null
  schedule: Schedule
  /** The next date a charge is expected. Null once nothing more is projected. */
  nextDue: string | null
}

/** How each `kind` reads in a sentence. The engine's vocabulary is not a customer's. */
export const KIND_LABEL: Record<Series['kind'], string> = {
  income: 'Income',
  rent: 'Rent',
  emi: 'Loan repayment',
  sip: 'Investing',
  insurance: 'Insurance',
  subscription: 'Subscription',
  bill: 'Bill',
  transfer: 'Transfer',
  obligation: 'Family or fees',
  unknown: 'Repeating debit',
}

export const CADENCE_LABEL: Record<Series['cadence'], string> = {
  weekly: 'Every week',
  fortnightly: 'Every fortnight',
  monthly: 'Every month',
  quarterly: 'Every quarter',
  annual: 'Every year',
  irregular: 'Irregularly',
}

/**
 * Why the engine counted this as a commitment rather than as shopping.
 *
 * Straight out of `Series.reason`, which exists — its own comment says so — because it is the
 * sentence that has to survive a customer asking what you mean by a recurring charge.
 */
export const REASON_LABEL: Record<Series['reason'], string> = {
  mandate: 'a standing instruction the bank is executing — somebody signed a mandate',
  'fixed-monthly': 'the same amount leaves on the same day every month',
  utility: 'the amount moves but the timing does not, which is what a utility bill looks like',
  'regular-obligation': 'near-fixed, near-same-day, and not optional in practice',
  income: 'money arriving rather than leaving',
}

/**
 * How this particular debit is actually stopped, which is never in this app.
 *
 * `Series.mode` is the rail the money left on, and the rail decides who can cancel it. This is
 * the most useful thing the screen can say in place of a button it cannot honour.
 */
export function howToChange(mode: Series['mode']): string {
  switch (mode) {
    case 'ACH-D':
      return 'This is a NACH mandate. It is amended or cancelled with the company collecting it, or through IDBI net banking under Mandate Management — the debit keeps running until one of them acts.'
    case 'SI':
      return 'This is a standing instruction on your IDBI account. Change or cancel it in net banking, in GO Mobile+, or at the branch.'
    case 'UPI':
      return 'This looks like a UPI AutoPay mandate. It is paused and revoked inside the UPI app that approved it, under Mandates — not at the bank.'
    case 'CARD':
      return 'This is a recurring card charge. Cancel it with the merchant; a card block stops it too, and takes everything else on the card with it.'
    default:
      return 'This one leaves as an ordinary transfer, so nothing at the bank can stop it. It stops when you stop sending it.'
  }
}

/** Same idea, three words, for a row. */
export function railLabel(mode: Series['mode']): string {
  switch (mode) {
    case 'ACH-D':
      return 'NACH mandate'
    case 'SI':
      return 'Standing instruction'
    case 'UPI':
      return 'UPI AutoPay'
    case 'CARD':
      return 'Card on file'
    default:
      return 'Manual transfer'
  }
}

function scheduleFor(
  s: Series,
  note: Note | null,
  name: string,
  status: CommitmentStatus,
): Schedule {
  const amount = note?.amount ?? s.amount
  const dayOfMonth = note?.dayOfMonth ?? s.dayOfMonth
  return {
    key: s.key,
    label: name,
    amount,
    cadence: s.cadence,
    intervalDays: s.intervalDays,
    dayOfMonth,
    firstSeen: s.firstSeen,
    lastSeen: s.lastSeen,
    /*
     * A stop truncates and a pause makes a hole. The date used is the note's, not today's, so
     * the calendar reads back the same after the simulated clock moves.
     *
     * A series the engine calls inactive truncates too, at its own last charge: its history is
     * real and belongs on the calendar, and a projection past a mandate that has already gone
     * quiet is a debit nobody expects, drawn in the colour that means "this has not arrived".
     */
    until: note?.kind === 'stopped' ? note.on : status === 'lapsed' ? addDays(s.lastSeen, 1) : null,
    skip: note?.kind === 'paused' && note.until !== null ? { from: note.on, to: note.until } : null,
  }
}

function statusOf(s: Series, note: Note | null, asOf: string): CommitmentStatus {
  if (note?.kind === 'stopped') return 'stopped'
  if (note?.kind === 'paused' && (note.until === null || asOf < note.until)) return 'paused'
  return s.active ? 'live' : 'lapsed'
}

export function toCommitment(s: Series, note: Note | null, asOf: string): Commitment {
  const name = s.merchant ?? prettyMerchant(s.key)
  const status = statusOf(s, note, asOf)
  const schedule = scheduleFor(s, note, name, status)
  /*
   * Strictly after the last charge, and never behind today: "next expected" is the next one that
   * has not happened, and a date already in the ledger is not it.
   */
  const from = addDays(s.lastSeen, 1) > asOf ? addDays(s.lastSeen, 1) : asOf
  /* A year and a day out: far enough to answer the question for an annual premium too. */
  const ahead = occurrences(schedule, from, addDays(from, 366))
  const perMonth = schedule.amount === 0 ? 0 : (s.monthlyCost / s.amount) * schedule.amount

  return {
    key: s.key,
    series: s,
    note,
    status,
    /*
     * The note said it was off; the ledger shows a charge after the note was made.
     *
     * Bounded above by `asOf` as well: a `lastSeen` in the future is not a charge that has
     * happened, and calling one a contradiction would put a red band on a row for a debit
     * nobody has been asked to explain yet.
     */
    conflict:
      note !== null && note.kind !== 'revised' && s.lastSeen > note.on && s.lastSeen <= asOf,
    name,
    amount: schedule.amount,
    monthlyCost: Math.round(perMonth),
    annualCost: Math.round(perMonth * 12),
    dayOfMonth: schedule.dayOfMonth,
    schedule,
    nextDue: ahead[0] ?? null,
  }
}

/**
 * The commitments, in the order somebody would want to see them.
 *
 * Income is dropped: a salary credit is a series and is not a commitment, and a screen about what
 * leaves your account should not open with money arriving. Everything else stays, including the
 * lapsed ones — "this stopped charging in July" is the single most useful row on the screen and
 * hiding it would be the reference's mistake, which was to show only what it sold.
 */
export function toCommitments(snapshot: Snapshot, notes: ReadonlyMap<string, Note>): Commitment[] {
  return snapshot.commitments.series
    .filter((s) => s.kind !== 'income')
    .map((s) => toCommitment(s, notes.get(s.key) ?? null, snapshot.asOf))
    .sort((a, b) => b.monthlyCost - a.monthlyCost)
}

export interface StatusCopy {
  label: string
  /** Where it came from, said out loud. */
  note: string
  band: string
  pill: 'plain' | 'warn' | 'bad' | 'ok'
}

/**
 * The four status treatments, on IDBI tokens.
 *
 * `03-PALETTE-MAP.md` sends On Track to `legend-chip`/`good`, In Process and Paused to
 * `accent-soft`/`accent-text`, and Needs Attention to `danger-soft`/`danger`. Lapsed is the
 * fourth and has no row in that table because the reference has no such state: it is neutral
 * `ground-deep`, deliberately quieter than the other three, because it is an observation rather
 * than something anybody chose.
 */
export const STATUS: Record<CommitmentStatus, StatusCopy> = {
  live: {
    label: 'Live',
    note: 'charging on schedule',
    band: 'bg-legend-chip text-brand-deep',
    pill: 'plain',
  },
  lapsed: {
    label: 'Gone quiet',
    note: 'nothing has been charged for two cycles',
    band: 'bg-ground-deep text-ink-mid',
    pill: 'plain',
  },
  paused: {
    label: 'Paused',
    note: 'your note — the bank has not been told',
    band: 'bg-accent-soft text-accent-text',
    pill: 'warn',
  },
  stopped: {
    label: 'Stopped',
    note: 'your note — the bank has not been told',
    band: 'bg-danger-soft text-danger',
    pill: 'bad',
  },
}
