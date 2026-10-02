/**
 * Coming up: the dated events in the next thirty days that an RM can get ahead of.
 *
 * Built only from facts the customer's file already carries: a deposit's maturity date, a loan's
 * remaining instalments, a SIP's debit day, a policy's start date. Nothing is forecast. Where a
 * date cannot be read off the file (an EMI whose debit day is unknown), the month end is used
 * and the label still names the month's last instalment, never a day it cannot see.
 */
import { addDays, addMonths, daysInMonth, fromYmd, ymd } from '../dates.ts'
import { rupeesTitle } from './format.ts'
import { cmp } from './util.ts'

export type UpcomingKind = 'deposit_maturing' | 'emi_ending' | 'sip_date' | 'policy_renewal'

export interface UpcomingItem {
  cif: string
  name: string
  kind: UpcomingKind
  /** Simulated date, YYYY-MM-DD. */
  date: string
  label: string
  amount: number | null
}

export interface UpcomingLoan {
  loanType: string
  emiAmount: number
  tenureRemainingMonths: number
  isRevolving?: boolean | undefined
  /** Day of month the EMI debits, where the caller knows it. */
  debitDay?: number | undefined
}

export interface UpcomingFacts {
  /**
   * The snapshot's own dated facts. Read where the per-item lists below are not supplied, so a
   * caller holding only the snapshot still gets the deposit and the loan the engine found.
   */
  snapshot?:
    | {
        balances: {
          maturingSoon: { accountType: string; amount: number; maturityDate: string } | null
        }
        debt: { endingSoon: { loanType: string; emiAmount: number; monthsLeft: number } | null }
        commitments?:
          | { series: readonly { kind: string; amount: number; dayOfMonth: number | null }[] }
          | undefined
      }
    | undefined
  accounts?:
    | readonly { accountType: string; currentBalance: number; maturityDate?: string | undefined }[]
    | undefined
  holdings?:
    | readonly {
        name: string
        /** A SIP is a fund's; a monthly PPF or NPS contribution is named as a contribution. */
        holdingType?: string | undefined
        sipActive: boolean
        sipAmount?: number | undefined
        sipDebitDay?: number | undefined
      }[]
    | undefined
  liabilities?: readonly UpcomingLoan[] | undefined
  policies?:
    | readonly {
        name: string
        annualPremium?: number | undefined
        purchasedOn?: string | undefined
      }[]
    | undefined
}

const KIND_ORDER: Readonly<Record<UpcomingKind, number>> = {
  deposit_maturing: 0,
  emi_ending: 1,
  policy_renewal: 2,
  sip_date: 3,
}

/** Day `day` of the month `iso` falls in, clamped so the 31st is the 30th in September. */
function onDay(iso: string, day: number): string {
  const { year, month } = ymd(iso)
  return fromYmd(year, month, Math.min(Math.max(day, 1), daysInMonth(year, month)))
}

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

function firstOfMonth(iso: string): string {
  const { year, month } = ymd(iso)
  return fromYmd(year, month, 1)
}

const DEPOSIT_NAME: Readonly<Record<string, string>> = { FD: 'FD', RD: 'RD' }

/** Every event for one customer between `asOf` and `days` later, both ends included. */
export function upcomingEvents(
  customer: { cif: string; name: string },
  facts: UpcomingFacts,
  asOf: string,
  days = 30,
): UpcomingItem[] {
  const end = addDays(asOf, days)
  const inWindow = (date: string): boolean => date >= asOf && date <= end
  const out: UpcomingItem[] = []
  const push = (kind: UpcomingKind, date: string, label: string, amount: number | null): void => {
    out.push({ cif: customer.cif, name: customer.name, kind, date, label, amount })
  }

  /* Deposits ---------------------------------------------------------- */

  if (facts.accounts !== undefined) {
    for (const a of facts.accounts) {
      const kind = DEPOSIT_NAME[a.accountType]
      if (kind === undefined || a.maturityDate === undefined || !inWindow(a.maturityDate)) continue
      push(
        'deposit_maturing',
        a.maturityDate,
        `${rupeesTitle(a.currentBalance)} ${kind} matures`,
        a.currentBalance,
      )
    }
  } else {
    const d = facts.snapshot?.balances.maturingSoon
    if (d && inWindow(d.maturityDate)) {
      const kind = DEPOSIT_NAME[d.accountType] ?? 'Deposit'
      push('deposit_maturing', d.maturityDate, `${rupeesTitle(d.amount)} ${kind} matures`, d.amount)
    }
  }

  /* Loans ending ------------------------------------------------------- */

  // The final instalment falls in the month `remaining - 1` after the as-of month: the as-of
  // month's own instalment is still counted in `tenureRemainingMonths`, which moves by calendar
  // month, as `liabilityAsOf` does.
  const series = facts.snapshot?.commitments?.series ?? []
  const emiDay = (emi: number): number | null =>
    series.find((s) => s.kind === 'emi' && Math.abs(s.amount - emi) < 1 && s.dayOfMonth !== null)
      ?.dayOfMonth ?? null

  const ending = facts.snapshot?.debt.endingSoon ?? null
  const loans: readonly UpcomingLoan[] =
    facts.liabilities ??
    (ending === null
      ? []
      : [
          {
            loanType: ending.loanType,
            emiAmount: ending.emiAmount,
            tenureRemainingMonths: ending.monthsLeft,
          },
        ])
  for (const l of loans) {
    if (l.isRevolving === true || l.tenureRemainingMonths < 1) continue
    const finalMonth = addMonths(firstOfMonth(asOf), l.tenureRemainingMonths - 1)
    const day = l.debitDay ?? emiDay(l.emiAmount)
    const date = day === null ? onDay(finalMonth, 31) : onDay(finalMonth, day)
    if (!inWindow(date)) continue
    push(
      'emi_ending',
      date,
      `Last ${rupeesTitle(l.emiAmount)} EMI on the ${l.loanType.toLowerCase()}`,
      l.emiAmount,
    )
  }

  /* SIP dates ------------------------------------------------------------ */

  for (const h of facts.holdings ?? []) {
    if (!h.sipActive || h.sipDebitDay === undefined) continue
    for (let m = firstOfMonth(asOf); m <= end; m = addMonths(m, 1)) {
      const date = onDay(m, h.sipDebitDay)
      if (!inWindow(date)) continue
      const amount = h.sipAmount ?? null
      const what =
        h.holdingType === undefined || h.holdingType === 'MUTUAL_FUND' ? 'SIP' : 'contribution'
      push(
        'sip_date',
        date,
        `${amount === null ? capitalise(what) : `${rupeesTitle(amount)} ${what}`} ${what === 'SIP' ? 'into' : 'to'} ${h.name}`,
        amount,
      )
    }
  }

  /* Policy renewals ------------------------------------------------------ */

  // A policy renews on the anniversary of the day it started. Without a start date there is no
  // anniversary to read, and a guessed one would put a renewal on the desk that does not exist.
  for (const p of facts.policies ?? []) {
    if (p.purchasedOn === undefined) continue
    const start = ymd(p.purchasedOn)
    for (const year of [ymd(asOf).year, ymd(asOf).year + 1]) {
      const date = onDay(fromYmd(year, start.month, 1), start.day)
      if (!inWindow(date) || date <= p.purchasedOn) continue
      push('policy_renewal', date, `${p.name} renews`, p.annualPremium ?? null)
    }
  }

  return out.sort(
    (a, b) =>
      cmp(a.date, b.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || cmp(a.label, b.label),
  )
}

/** Every customer's events in one list, soonest first. */
export function bookUpcoming(lists: readonly (readonly UpcomingItem[])[]): UpcomingItem[] {
  return lists
    .flat()
    .sort(
      (a, b) =>
        cmp(a.date, b.date) ||
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        cmp(a.name, b.name) ||
        cmp(a.label, b.label),
    )
}
