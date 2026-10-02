/**
 * What the customer file's layout and its tabs share: the one read they all draw from, and the
 * words the API leaves to the screen (a holding type's name, a stage kind's icon).
 *
 * Every tab reads the same `useCustomer` query. Opening a file writes a "viewed" entry to the
 * access log, so the tabs must never ask again on their own: they read the layout's cached copy,
 * and switching from Overview to Money costs no request and logs nothing new.
 */
import type {
  ActionKind,
  Customer360,
  Customer360Account,
  Customer360Holding,
  UpcomingKind,
} from '@dhan/contracts'
import {
  CalendarClock,
  CreditCard,
  HandCoins,
  HeartPulse,
  Landmark,
  PauseCircle,
  Phone,
  PiggyBank,
  Repeat,
  Scissors,
  Shield,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useParams } from 'react-router'
import { useCustomer } from '../../api/queries.ts'

export function useCustomerFile() {
  const { cif = '' } = useParams()
  return { cif, query: useCustomer(cif) }
}

export type CustomerFile = Customer360

/** "Karan Deshpande" → "Karan". The RM speaks of a customer by first name, as on a call. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

/** "Karan" → "Karan's"; "Thomas" → "Thomas's", the way a desk writes it. */
export function possessive(name: string): string {
  return `${name}’s`
}

/** "1 bank", "4 banks". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/** The last four digits of an account number the API already masked: `XXXX…3308` → `3308`. */
export function lastFour(masked: string): string {
  const digits = masked.replace(/[^0-9]/g, '')
  return digits.slice(-4) || masked.slice(-4)
}

/**
 * A BCP-47 tag as words: `en-IN` → "English (India)". The browser knows every language name, so
 * the screen never carries a hand-written list that could fall behind the data.
 */
export function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames(['en-IN'], { type: 'language' }).of(tag) ?? tag
  } catch {
    return tag
  }
}

/* ---------------------------------------------------------------- Money groupings */

export interface BankGroup {
  institution: string
  isIdbi: boolean
  accounts: Customer360Account[]
  total: number
}

/** Accounts by bank: IDBI first (it is the RM's own), then the largest balance first. */
export function groupByBank(accounts: readonly Customer360Account[]): BankGroup[] {
  const groups = new Map<string, BankGroup>()
  for (const account of accounts) {
    const group = groups.get(account.institution) ?? {
      institution: account.institution,
      isIdbi: account.isIdbi,
      accounts: [],
      total: 0,
    }
    group.accounts.push(account)
    group.total += account.balance
    groups.set(account.institution, group)
  }
  return [...groups.values()].sort(
    (a, b) => Number(b.isIdbi) - Number(a.isIdbi) || b.total - a.total,
  )
}

type HoldingType = Customer360Holding['holdingType']

/** The names a desk uses, plural because each heads a group. */
export const HOLDING_TYPE_LABEL: Record<HoldingType, string> = {
  MUTUAL_FUND: 'Mutual funds',
  EQUITY: 'Shares',
  EPF: 'Provident fund',
  NPS: 'NPS',
  PPF: 'PPF',
  FD: 'Fixed deposits',
  RD: 'Recurring deposits',
  INSURANCE: 'Insurance savings',
}

export interface HoldingGroup {
  type: HoldingType
  label: string
  holdings: Customer360Holding[]
  invested: number
  current: number
  sipMonthly: number
}

/** Holdings by type, largest current value first; within a group, largest first too. */
export function groupHoldings(holdings: readonly Customer360Holding[]): HoldingGroup[] {
  const groups = new Map<HoldingType, HoldingGroup>()
  for (const holding of holdings) {
    const group = groups.get(holding.holdingType) ?? {
      type: holding.holdingType,
      label: HOLDING_TYPE_LABEL[holding.holdingType],
      holdings: [],
      invested: 0,
      current: 0,
      sipMonthly: 0,
    }
    group.holdings.push(holding)
    group.invested += holding.invested
    group.current += holding.current
    group.sipMonthly += holding.sipMonthly ?? 0
    groups.set(holding.holdingType, group)
  }
  for (const group of groups.values()) group.holdings.sort((a, b) => b.current - a.current)
  return [...groups.values()].sort((a, b) => b.current - a.current)
}

/**
 * Change on what was put in, as a percentage. Null where nothing was put in, or where the two
 * figures are the same by construction (a provident fund carried at cost): a flat "0%" there
 * would read as a fund that did nothing, which is not what the record says.
 */
export function gainPct(invested: number, current: number): number | null {
  if (invested <= 0 || current === invested) return null
  return Math.round(((current - invested) / invested) * 1000) / 10
}

/* ---------------------------------------------------------------- Icons */

export const ACTION_ICON: Record<ActionKind, LucideIcon> = {
  open_sweep_in: Landmark,
  start_ssp: PiggyBank,
  move_to_liquid_fund: Wallet,
  start_sip: TrendingUp,
  increase_sip: TrendingUp,
  pause_sip: PauseCircle,
  buy_term_cover: Shield,
  enrol_pmjjby: Shield,
  buy_health_cover: HeartPulse,
  pay_down_card: CreditCard,
  cancel_subscription: Repeat,
  set_category_cap: Scissors,
  talk_to_rm: Phone,
}

export const UPCOMING_ICON: Record<UpcomingKind, LucideIcon> = {
  deposit_maturing: Landmark,
  emi_ending: HandCoins,
  sip_date: CalendarClock,
  policy_renewal: Shield,
}

export const UPCOMING_LABEL: Record<UpcomingKind, string> = {
  deposit_maturing: 'Deposit matures',
  emi_ending: 'Last EMI',
  sip_date: 'SIP date',
  policy_renewal: 'Policy renewal',
}

export const STAGE_ICON: Record<CustomerFile['roadmap']['stages'][number]['kind'], LucideIcon> = {
  free_up: Scissors,
  get_cover: Shield,
  clear_debt: CreditCard,
  build_buffer: PiggyBank,
  grow: TrendingUp,
}
