/**
 * Relationship strength and the attrition watch: how close a customer is to the bank, and
 * whether they are drifting away from it.
 *
 * Both are shown with their reasons, always. A "Low" badge an RM cannot interrogate is a badge
 * they learn to ignore; "Active 94 days ago · 1 IDBI product · 18% of balances with IDBI" is a
 * reason to pick up the phone.
 *
 * Every threshold is a named constant here rather than a literal in a condition, because they
 * are judgement calls the desk will want to tune, and a tuned number should move in one place.
 */
import type { BalancePoint } from './series.ts'
import { balanceChangePct } from './series.ts'
import { plural } from './format.ts'
import { daysSince } from './util.ts'

export interface Strength {
  level: 'high' | 'medium' | 'low'
  reason: string
}

export interface Attrition {
  flagged: boolean
  reasons: string[]
}

/** Active inside this many days scores fully; inside the second, half. */
export const ACTIVE_WITHIN_DAYS = 30
export const LAPSING_WITHIN_DAYS = 90
/** Distinct IDBI products for a full and a half score. */
export const DEEP_PRODUCTS = 3
export const SOME_PRODUCTS = 2
/** Wallet share for a full and a half score. */
export const HIGH_WALLET_SHARE_PCT = 60
export const SOME_WALLET_SHARE_PCT = 30

/** Attrition: IDBI balances down more than this over three months. */
export const ATTRITION_BALANCE_DROP_PCT = 15
/** Attrition: wallet share below this. */
export const ATTRITION_WALLET_SHARE_PCT = 30
/** Attrition: more than this many days without any activity. */
export const ATTRITION_QUIET_DAYS = 60

export interface StrengthInput {
  /** Any decision, call or session: a simulated date or a real instant. Null if none. */
  lastActivityAt: string | null
  /** Distinct IDBI products held; `idbiProducts(...).length`. */
  idbiProducts: number
  walletSharePct: number | null
  asOf: string
}

function activityText(days: number | null): string {
  if (days === null) return 'No activity on record'
  if (days === 0) return 'Active today'
  if (days === 1) return 'Active yesterday'
  return `Active ${days} days ago`
}

/**
 * High, Medium or Low from three facts scored 0–2 each: recency, depth, share.
 *
 * Summed rather than weakest-link: a customer who uses the app every week but keeps their
 * salary elsewhere is a medium relationship, not a weak one, and the reason says which leg is
 * short. Five or six is High, three or four Medium, anything less Low.
 */
export function relationshipStrength(input: StrengthInput): Strength {
  const days = daysSince(input.lastActivityAt, input.asOf)
  const recency =
    days === null ? 0 : days <= ACTIVE_WITHIN_DAYS ? 2 : days <= LAPSING_WITHIN_DAYS ? 1 : 0
  const depth =
    input.idbiProducts >= DEEP_PRODUCTS ? 2 : input.idbiProducts >= SOME_PRODUCTS ? 1 : 0
  const share = input.walletSharePct
  const shareScore =
    share === null ? 0 : share >= HIGH_WALLET_SHARE_PCT ? 2 : share >= SOME_WALLET_SHARE_PCT ? 1 : 0

  const score = recency + depth + shareScore
  const level = score >= 5 ? 'high' : score >= 3 ? 'medium' : 'low'
  const reason = [
    activityText(days),
    plural(input.idbiProducts, 'IDBI product'),
    share === null ? 'No balances on record' : `${Math.round(share)}% of balances with IDBI`,
  ].join(' · ')
  return { level, reason }
}

export interface AttritionInput {
  balanceSeries: readonly BalancePoint[]
  walletSharePct: number | null
  lastActivityAt: string | null
  /** A SIP the customer paused or stopped. How it is known is the caller's: a decision, a mandate. */
  sipPaused: boolean
  asOf: string
}

/**
 * Flagged only with reasons, and only for the four the spec names.
 *
 * A customer with no balances is not flagged for wallet share: a share of nothing is unknown,
 * not low. A series too short to look three months back says nothing about the IDBI balance
 * rather than guessing.
 */
export function attritionWatch(input: AttritionInput): Attrition {
  const reasons: string[] = []

  const change = balanceChangePct(input.balanceSeries, 3, 'withIdbi')
  if (change !== null && change < -ATTRITION_BALANCE_DROP_PCT) {
    reasons.push(`IDBI month-end balances down ${Math.round(Math.abs(change))}% in 3 months`)
  }

  const share = input.walletSharePct
  if (share !== null && share < ATTRITION_WALLET_SHARE_PCT) {
    reasons.push(`Only ${Math.round(share)}% of balances with IDBI`)
  }

  const days = daysSince(input.lastActivityAt, input.asOf)
  if (days === null) reasons.push('No activity on record')
  else if (days > ATTRITION_QUIET_DAYS) reasons.push(`No activity in ${days} days`)

  if (input.sipPaused) reasons.push('A SIP is paused')

  return { flagged: reasons.length > 0, reasons }
}
