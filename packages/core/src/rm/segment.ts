/**
 * What a customer is worth to the relationship, and how much of it sits with IDBI.
 *
 * The spec's Definitions table is the authority for every number here:
 *
 * - **Relationship value** is "assets we can see": every balance at any bank, through the ledger
 *   and Account Aggregator, plus holdings. That is `netWorth(...).assets` exactly, so the
 *   customer's own Grow tab and the RM's book can never disagree on what a customer holds.
 * - **With IDBI** is the balances of accounts whose institution is IDBI, and **wallet share** is
 *   that over all balances. Both sides count the same account types `derive` counts into
 *   `balances.total` (savings, current, FD, RD), so the share can never exceed 100%: PPF and NPS
 *   are holdings, not balances, on either side of the division.
 * - **Segment** is a band on relationship value.
 */
import { netWorth } from '../networth.ts'
import type { NetWorthFacts } from '../networth.ts'
import { round1 } from './util.ts'

export type Segment = 'priority' | 'affluent' | 'mass'

/** ₹10 lakh: below this a customer is Mass. */
export const AFFLUENT_FROM = 10_00_000
/** ₹50 lakh: at or above this a customer is Priority. */
export const PRIORITY_FROM = 50_00_000

/** Assets we can see. Structural, so the wire `Snapshot` passes without a cast. */
export function relationshipValue(snapshot: NetWorthFacts): number {
  return netWorth(snapshot).assets
}

export function segmentOf(value: number): Segment {
  if (value >= PRIORITY_FROM) return 'priority'
  if (value >= AFFLUENT_FROM) return 'affluent'
  return 'mass'
}

/** An account as wallet share reads it. Absent `institution` means IDBI, as on `Account`. */
export interface BalanceAccount {
  accountType: string
  currentBalance: number
  institution?: { isHome: boolean } | undefined
}

/** The account types `derive` sums into `balances.total`. */
const BALANCE_TYPES: ReadonlySet<string> = new Set(['Savings', 'Current', 'FD', 'RD'])

export function isBalanceAccount(account: { accountType: string }): boolean {
  return BALANCE_TYPES.has(account.accountType)
}

export function isIdbi(account: { institution?: { isHome: boolean } | undefined }): boolean {
  return account.institution?.isHome ?? true
}

/** Every balance, at any bank. Equal to `snapshot.balances.total` over the same accounts. */
export function allBalances(accounts: readonly BalanceAccount[]): number {
  return accounts.filter(isBalanceAccount).reduce((sum, a) => sum + a.currentBalance, 0)
}

/** Balances held at IDBI. */
export function withIdbi(accounts: readonly BalanceAccount[]): number {
  return accounts
    .filter((a) => isBalanceAccount(a) && isIdbi(a))
    .reduce((sum, a) => sum + a.currentBalance, 0)
}

/**
 * With IDBI over all balances, as a percentage to one decimal.
 *
 * Null where there are no balances at all: a share of nothing is not 0%, and reporting it as
 * 0% would flag a customer for attrition on a division by zero.
 */
export function walletSharePct(idbiBalances: number, totalBalances: number): number | null {
  if (totalBalances <= 0) return null
  return round1((Math.max(0, idbiBalances) / totalBalances) * 100)
}

/* ------------------------------------------------------------------ *
 * IDBI products held
 * ------------------------------------------------------------------ */

export interface ProductFacts {
  accounts: readonly {
    accountType: string
    institution?: { isHome: boolean } | undefined
  }[]
  holdings: readonly HeldProduct[]
  policies?: readonly HeldProduct[] | undefined
  /** `lender` is on the console's liability rows; core's `Liability` does not carry one. */
  liabilities?:
    | readonly {
        loanType: string
        lender?: string | undefined
        isRevolving?: boolean | undefined
      }[]
    | undefined
}

export interface HeldProduct {
  holdingType: string
  name: string
  heldOutsideIdbi?: boolean | undefined
  custodian?: string | undefined
}

const ACCOUNT_PRODUCT: Readonly<Record<string, string>> = {
  Savings: 'Savings account',
  Current: 'Current account',
  FD: 'Fixed deposit',
  RD: 'Recurring deposit',
  PPF: 'PPF',
  NPS: 'NPS',
}

const HOLDING_PRODUCT: Readonly<Record<string, string>> = {
  MUTUAL_FUND: 'Mutual fund',
  FD: 'Fixed deposit',
  RD: 'Recurring deposit',
  NPS: 'NPS',
  PPF: 'PPF',
  EQUITY: 'Equity',
  EPF: 'EPF',
}

/**
 * Held through IDBI: a named custodian has to be IDBI; otherwise anything not marked as bought
 * elsewhere. That mirrors `Account.institution`, where absent means IDBI, and it is the reading
 * `heldOutsideIdbi` was written for — the flag marks the exceptions.
 */
function heldAtIdbi(h: HeldProduct): boolean {
  if (h.custodian !== undefined) return /\bIDBI\b/i.test(h.custodian)
  return h.heldOutsideIdbi !== true
}

function policyProduct(name: string): string {
  if (/TERM|LIFE|PMJJBY/i.test(name)) return 'Life cover'
  if (/HEALTH|MEDICLAIM/i.test(name)) return 'Health cover'
  if (/ACCIDENT|PMSBY/i.test(name)) return 'Accident cover'
  return 'Insurance'
}

/**
 * The distinct IDBI products a customer holds, by the name an RM would say.
 *
 * Distinct products rather than accounts: two savings accounts are one relationship with the
 * bank's savings book, and counting them twice would rate a customer "strong" on paperwork.
 */
export function idbiProducts(facts: ProductFacts): string[] {
  const out = new Set<string>()
  for (const a of facts.accounts) {
    const label = ACCOUNT_PRODUCT[a.accountType]
    if (label !== undefined && isIdbi(a)) out.add(label)
  }
  for (const h of facts.holdings) {
    const label = HOLDING_PRODUCT[h.holdingType]
    if (label !== undefined && heldAtIdbi(h)) out.add(label)
  }
  for (const p of facts.policies ?? []) {
    if (heldAtIdbi(p)) out.add(policyProduct(p.name))
  }
  for (const l of facts.liabilities ?? []) {
    if (l.lender === undefined || !/\bIDBI\b/i.test(l.lender)) continue
    out.add(l.isRevolving === true ? 'Credit card' : l.loanType)
  }
  return [...out]
}
