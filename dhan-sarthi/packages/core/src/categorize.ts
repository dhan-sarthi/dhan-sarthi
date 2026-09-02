/**
 * Transaction enrichment: a raw narration in, a merchant and a category out.
 *
 * Why this exists when IDBI's statement API already carries `spendCategory`: because a bank's
 * own categorisation is exactly what Cleo built a company on top of. Their words — *"even modern
 * banks that categorize your spending can't answer the questions that really matter"*. And more
 * practically, we cannot rely on a field whose quality we have not seen; the sandbox may return
 * it blank, or coarse, or wrong.
 *
 * So the rule is: **derive the category, and treat the bank's own as a second opinion.**
 * `disagreements()` exists to report the gap rather than hide it.
 */
import { KEYWORDS, MERCHANTS } from './merchants.ts'
import type { SpendCategory, Transaction } from './types.ts'

export interface Enriched {
  txnId: string
  /** The merchant a human would name, or null where nothing recognised it. */
  merchant: string | null
  category: SpendCategory
  /**
   * How much weight downstream may put on this. `low` means the fallback fired, and an insight
   * built on a `low` categorisation should not be shown to a customer as a fact.
   */
  confidence: 'high' | 'medium' | 'low'
  method: 'mandate' | 'merchant' | 'keyword' | 'bank' | 'fallback'
}

/**
 * Uppercase, collapse the separators banks use interchangeably, and pad.
 *
 * The padding is what makes word-boundary matching possible, and that is not a nicety: matching
 * on bare substrings classified `IMPS/P2A/PARENTS` as a housing bill, because "PARENTS"
 * contains "RENT". Twenty-three transactions a year, silently in the wrong category, and the
 * only reason it surfaced is that `disagreements()` compares against the bank's own label.
 */
function normalise(text: string): string {
  return ` ${text.toUpperCase().replace(/[/\-_|.,]+/g, ' ').replace(/\s+/g, ' ').trim()} `
}

/** Match on whole words only. Tokens go through the same normalisation as the haystack. */
function contains(haystack: string, token: string): boolean {
  return haystack.includes(normalise(token))
}

/**
 * A mandate is worth detecting before anything else. `ACH-D` and `SI` mean a standing
 * instruction, which is a commitment rather than a choice — and the difference decides whether
 * the daily plan may count the money as discretionary.
 */
function isMandate(t: Transaction): boolean {
  return t.txnMode === 'ACH-D' || t.txnMode === 'SI'
}

export function categorize(t: Transaction): Enriched {
  const haystack = normalise(t.narration)

  // Income first: a credit carrying a payroll marker is the anchor for the entire month, and
  // misfiling it as a transfer breaks every derived number at once.
  if (t.txnType === 'CREDIT') {
    const salary = /\b(SALARY|PAYROLL|WAGES|SAL CR)\b/.test(haystack)
    if (salary || t.isSalaryCredit) {
      return { txnId: t.txnId, merchant: null, category: 'Income', confidence: 'high', method: 'keyword' }
    }
  }

  for (const rule of MERCHANTS) {
    for (const token of rule.match) {
      if (!contains(haystack, token)) continue
      return {
        txnId: t.txnId,
        merchant: rule.merchant,
        category: rule.category,
        confidence: isMandate(t) ? 'high' : 'high',
        method: isMandate(t) ? 'mandate' : 'merchant',
      }
    }
  }

  for (const rule of KEYWORDS) {
    for (const token of rule.match) {
      if (!contains(haystack, token)) continue
      return {
        txnId: t.txnId,
        merchant: null,
        category: rule.category,
        confidence: 'medium',
        method: 'keyword',
      }
    }
  }

  // Nothing recognised it. Fall back to what the bank said, and mark it so — a number built on
  // guesses has to be able to say how many of them there were.
  return {
    txnId: t.txnId,
    merchant: null,
    category: t.spendCategory,
    confidence: 'low',
    method: t.spendCategory ? 'bank' : 'fallback',
  }
}

export function enrich(txns: readonly Transaction[]): Map<string, Enriched> {
  const out = new Map<string, Enriched>()
  for (const t of txns) out.set(t.txnId, categorize(t))
  return out
}

export interface Coverage {
  total: number
  /** Recognised by merchant or mandate. The number that matters. */
  identified: number
  byKeyword: number
  fellBack: number
  /** Fraction resolved without falling back to the bank's own label. */
  rate: number
  /** Rupee-weighted, which is the honest measure: one big unknown outweighs fifty small ones. */
  rateByValue: number
}

/**
 * How much of a ledger we can actually explain.
 *
 * Worth measuring rather than assuming. Cleo's whole product rests on this step, and if we can
 * only name 60% of a customer's spending then "where your money went" is a claim we cannot make.
 */
export function coverage(txns: readonly Transaction[]): Coverage {
  let identified = 0
  let byKeyword = 0
  let fellBack = 0
  let value = 0
  let identifiedValue = 0

  for (const t of txns) {
    const e = categorize(t)
    value += t.txnAmount
    if (e.method === 'merchant' || e.method === 'mandate') {
      identified += 1
      identifiedValue += t.txnAmount
    } else if (e.method === 'keyword') {
      byKeyword += 1
      identifiedValue += t.txnAmount
    } else {
      fellBack += 1
    }
  }

  const total = txns.length
  return {
    total,
    identified,
    byKeyword,
    fellBack,
    rate: total === 0 ? 0 : (identified + byKeyword) / total,
    rateByValue: value === 0 ? 0 : identifiedValue / value,
  }
}

/** Where our category and the bank's disagree. Reported, not hidden. */
export function disagreements(
  txns: readonly Transaction[],
): { txnId: string; narration: string; ours: SpendCategory; bank: SpendCategory }[] {
  const out: { txnId: string; narration: string; ours: SpendCategory; bank: SpendCategory }[] = []
  for (const t of txns) {
    const e = categorize(t)
    if (e.method === 'bank' || e.method === 'fallback') continue
    if (e.category !== t.spendCategory) {
      out.push({ txnId: t.txnId, narration: t.narration, ours: e.category, bank: t.spendCategory })
    }
  }
  return out
}
