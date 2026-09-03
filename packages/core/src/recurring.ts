/**
 * Recurring-series detection: which charges repeat, how often, and how much they really cost.
 *
 * This must **infer** periodicity from dates and amounts. `Transaction.isRecurring` exists in
 * the fixtures because the generator knows the truth, and production has no such field — a
 * detector that read it would be demonstrating a capability the real IDBI feed cannot provide.
 * The useful consequence is that the fixtures are a labelled dataset, so the detector can be
 * scored against ground truth in a test rather than eyeballed.
 *
 * One honest limit, stated here because it changes the product. Cleo advertise finding
 * *"recurring charges for a service you forgot about"*. Bank data cannot know you forgot: there
 * is no usage signal in a statement, only the debit. So we do not claim it. What we do instead
 * is enumerate every live mandate with its true annual cost and **ask** — which is a better
 * conversation anyway, and the answer is worth remembering. What we *can* detect without asking
 * is a price that stepped up while nobody was looking, and that one is genuinely valuable.
 */
import { categorize } from './categorize.ts'
import { addDays, daysBetween, monthKey } from './dates.ts'
import type { SpendCategory, Transaction, TxnMode } from './types.ts'

export type Cadence = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annual' | 'irregular'

export type SeriesKind =
  | 'income'
  | 'rent'
  | 'emi'
  | 'sip'
  | 'insurance'
  | 'subscription'
  | 'bill'
  | 'transfer'
  /** School fees, supporting parents. Not optional in practice, and never a leak to cut. */
  | 'obligation'
  | 'unknown'

export interface PriceChange {
  on: string
  from: number
  to: number
}

export interface Series {
  /** Stable identity for the series: the narration with reference numbers stripped. */
  key: string
  merchant: string | null
  category: SpendCategory
  kind: SeriesKind
  mode: TxnMode
  cadence: Cadence
  /** Median days between charges. */
  intervalDays: number
  /** Day of month, where the series keeps to one. Null for weekly or erratic series. */
  dayOfMonth: number | null
  occurrences: number
  firstSeen: string
  lastSeen: string
  /** Most recent charge amount. */
  amount: number
  /** Normalised to a month, so a ₹5,988 annual charge is comparable to a ₹499 monthly one. */
  monthlyCost: number
  /** Twelve times the above. The number that changes minds — nobody feels ₹1,499 a month. */
  annualCost: number
  /** Coefficient of variation on the amount. Near zero is a subscription; higher is a bill. */
  amountVariation: number
  /** Fixed amount, same day, every month. What makes something cancellable rather than owed. */
  fixed: boolean
  /** Charged within roughly one cadence of `asOf`. */
  active: boolean
  /** Detected without asking anyone. A step up in a fixed price is a real finding. */
  priceChanges: PriceChange[]
  /**
   * Why this counts as a commitment rather than a shopping habit. Recorded because it is the
   * sentence that has to survive a customer asking "what do you mean I have a recurring charge
   * at Dominos?" — and because if no reason fits, it is not a commitment.
   */
  reason: 'mandate' | 'fixed-monthly' | 'utility' | 'regular-obligation' | 'income'
  txnIds: string[]
}

/**
 * A merchant someone uses often, which is a different thing from a commitment.
 *
 * Sixty-seven Swiggy orders a year is a habit: variable amounts, no mandate, no fixed day, and
 * entirely within the customer's control. Reporting it as "recurring" would be wrong and would
 * read as broken. Reporting it at all is still valuable — it is where a spending cap goes.
 */
export interface Habit {
  key: string
  merchant: string | null
  category: SpendCategory
  occurrences: number
  firstSeen: string
  lastSeen: string
  /** Typical ticket. The median, so one big order does not distort it. */
  typicalAmount: number
  /** What it costs a month on average across the window. */
  monthlyAverage: number
  annualTotal: number
  /** Times per month. Thirty ₹40 chai payments is the insight, not the ₹40. */
  timesPerMonth: number
  txnIds: string[]
}

const MONTH_NAMES = 'JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC'

/**
 * The parts of a narration that change every time the same thing happens.
 *
 * These are stripped **before** the narration is split, and that ordering is the whole point.
 * A NACH mandate line ends `-07-09-2026`, and splitting on the hyphen first turns the date into
 * three parts of which `07` and `09` survive every length filter — so the same EMI produces a
 * different key every month and the single most regular debit in the ledger forms no series at
 * all. The failure is silent: nothing errors, the customer simply has no commitments.
 */
const VARIABLE: readonly RegExp[] = [
  // Dates the rails print into the line: `07-09-2026` on a mandate, `05-04-26` on an NFS
  // withdrawal, `2026-09-07` wherever a system writes ISO.
  /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g,
  /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g,
  // The pay period on a salary credit and the billing month on a charge: `SALARY AUG 2026`.
  new RegExp(String.raw`\b(?:${MONTH_NAMES})[A-Z]*[ -]\d{2,4}\b`, 'g'),
  // A card system's own reference: `Ref#O2S96OJ4SZUMI8`.
  /\bREF#?[A-Z0-9]{6,}\b/g,
  // Bank, branch and terminal codes, masked PANs, UTRs: anything long that mixes letters and
  // digits. Applied on word boundaries rather than on split parts, because `POS
  // 4XXXXXXXXXXX7412 DMART INDORE` carries no delimiter at all.
  /\b(?=[A-Z0-9]*\d)[A-Z0-9]{6,}\b/g,
  // Reference numbers standing on their own.
  /\b\d{3,}\b/g,
]

/**
 * Strip the variable part of a narration so repeats collapse onto one key.
 *
 * `UPI/DR/800412179072/SWIGGY/ICIC/swiggy.rzp@icici/ORDER` and the same line next Tuesday are
 * the same merchant; the retrieval reference is what stops a naive group-by from finding a
 * series at all.
 */
export function seriesKey(narration: string): string {
  let text = narration.toUpperCase()
  for (const pattern of VARIABLE) text = text.replace(pattern, ' ')

  return text
    .split(/[/-]/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 0)
    .join('/')
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

function cadenceFor(intervalDays: number): Cadence {
  if (intervalDays >= 5 && intervalDays <= 9) return 'weekly'
  if (intervalDays >= 12 && intervalDays <= 18) return 'fortnightly'
  if (intervalDays >= 25 && intervalDays <= 35) return 'monthly'
  if (intervalDays >= 80 && intervalDays <= 100) return 'quarterly'
  if (intervalDays >= 350 && intervalDays <= 380) return 'annual'
  return 'irregular'
}

const PER_MONTH: Record<Cadence, number> = {
  weekly: 52 / 12,
  fortnightly: 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  annual: 1 / 12,
  irregular: 1,
}

/**
 * A step change in an otherwise fixed price.
 *
 * Deliberately strict: a run of at least two charges at one amount, then at least two at
 * another, and a move of more than 5%. Anything looser turns an electricity bill into a
 * catalogue of "price changes" and the insight becomes noise.
 */
function detectPriceChanges(entries: { date: string; amount: number }[]): PriceChange[] {
  const out: PriceChange[] = []
  let runAmount = entries[0]?.amount ?? 0
  let runLength = 0

  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i]
    if (!e) continue

    if (e.amount === runAmount) {
      runLength += 1
      continue
    }

    const next = entries[i + 1]
    const settles = next?.amount === e.amount
    const moved = runAmount > 0 && Math.abs(e.amount - runAmount) / runAmount > 0.05

    if (runLength >= 2 && settles && moved) {
      out.push({ on: e.date, from: runAmount, to: e.amount })
    }

    runAmount = e.amount
    runLength = 1
  }

  return out
}

function classify(
  key: string,
  mode: TxnMode,
  category: SpendCategory,
  isCredit: boolean,
  fixed: boolean,
): SeriesKind {
  const k = ` ${key} `
  if (isCredit) return 'income'
  // `CreditCard Payment XX 1184` is the bank's own spelling, one word. A card bill classified
  // as a subscription would show up on the Money tab beside Netflix, which is both wrong and
  // the kind of wrong a customer notices immediately.
  if (/\bEMI\b|LOAN|CREDIT ?CARD/.test(k)) return 'emi'
  if (/\bSIP\b|MUTUAL FUND|SYSTEMATIC|CLEARING/.test(k)) return 'sip'
  // A NACH line names the creditor and nothing else — no "EMI", no "SIP", no scheme. So once
  // the key has been checked, the only thing left to key on is what enrichment already decided
  // this was. Without these two, every mandate in the ledger is filed as a subscription.
  if (category === 'Investment') return 'sip'
  if (category === 'Loan EMI') return 'emi'
  if (/\bRENT\b/.test(k)) return 'rent'
  if (category === 'Insurance' || /PREMIUM/.test(k)) return 'insurance'
  if (category === 'Rent & bills') return 'bill'
  if (category === 'Education') return 'obligation'
  // A fixed monthly transfer to family is an obligation; an irregular one is just a transfer.
  if (category === 'Transfers') return fixed ? 'obligation' : 'transfer'
  if (mode === 'SI' || fixed) return 'subscription'
  return 'unknown'
}

/**
 * Statistics shared by both readings of a group of same-merchant transactions.
 */
interface GroupStats {
  sorted: Transaction[]
  intervalDays: number
  cadence: Cadence
  amountVariation: number
  daySpread: number
  dayMean: number
  monthsSpanned: number
}

function analyse(list: readonly Transaction[]): GroupStats | null {
  const sorted = [...list].sort((a, b) => (a.txnDate < b.txnDate ? -1 : 1))

  const intervals: number[] = []
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]
    const cur = sorted[i]
    if (prev && cur) intervals.push(daysBetween(prev.txnDate, cur.txnDate))
  }

  const amounts = sorted.map((t) => t.txnAmount)
  const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length
  const variance = amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length

  const days = sorted.map((t) => Number(t.txnDate.slice(-2)))
  const dayMean = days.reduce((s, d) => s + d, 0) / days.length

  const intervalDays = median(intervals)
  if (intervalDays <= 0) return null

  return {
    sorted,
    intervalDays,
    cadence: cadenceFor(intervalDays),
    amountVariation: mean === 0 ? 0 : Math.sqrt(variance) / mean,
    daySpread: Math.sqrt(days.reduce((s, d) => s + (d - dayMean) ** 2, 0) / days.length),
    dayMean,
    monthsSpanned: new Set(sorted.map((t) => monthKey(t.txnDate))).size,
  }
}

/**
 * Is this a commitment, or just a merchant somebody likes?
 *
 * The distinction is the whole point of this module. A commitment is money that leaves whether
 * the customer thinks about it or not — so it belongs in fixed outflow, it can be cancelled or
 * renegotiated, and it is safe to subtract before working out what is safe to spend. A habit is
 * discretionary by definition, and subtracting it would tell someone they have less freedom
 * than they do.
 *
 * Returns null where nothing qualifies, which is the common case.
 */
function commitmentReason(stats: GroupStats, isCredit: boolean): Series['reason'] | null {
  const last = stats.sorted[stats.sorted.length - 1]
  if (!last) return null

  if (isCredit) return 'income'

  // A charge the bank levies is not a commitment the customer entered into. The quarterly SMS
  // alert fee and its GST repeat as regularly as any mandate and would otherwise be reported
  // beside Netflix as something to cancel — which is both wrong and impossible.
  if (categorize(last).category === 'Fees & charges') return null

  // A standing instruction is definitionally a commitment — somebody signed a mandate.
  if (last.txnMode === 'ACH-D' || last.txnMode === 'SI') return 'mandate'

  if (stats.cadence !== 'monthly') return null

  // Same amount, same day, every month.
  if (stats.amountVariation < 0.02 && stats.daySpread < 3) return 'fixed-monthly'

  // A utility bill varies in amount but not in timing. That is exactly what distinguishes it
  // from shopping, which varies in both.
  const enriched = categorize(last)
  if (enriched.category === 'Rent & bills' && stats.daySpread < 6) return 'utility'

  // School fees, a family transfer: near-fixed, near-same-day, and not optional in practice.
  if (stats.amountVariation < 0.15 && stats.daySpread < 4) return 'regular-obligation'

  return null
}

function buildSeries(
  key: string,
  stats: GroupStats,
  reason: Series['reason'],
  asOf: string,
): Series | null {
  const { sorted, cadence, intervalDays, amountVariation, daySpread, dayMean } = stats
  const last = sorted[sorted.length - 1]
  const first = sorted[0]
  if (!last || !first) return null

  const enriched = categorize(last)
  const isCredit = last.txnType === 'CREDIT'
  const fixed = amountVariation < 0.02 && daySpread < 3 && cadence === 'monthly'
  const amount = last.txnAmount

  return {
    key,
    merchant: enriched.merchant,
    category: enriched.category,
    kind: classify(key, last.txnMode, enriched.category, isCredit, fixed),
    mode: last.txnMode,
    cadence,
    intervalDays: Math.round(intervalDays),
    dayOfMonth: daySpread < 3 && cadence === 'monthly' ? Math.round(dayMean) : null,
    occurrences: sorted.length,
    firstSeen: first.txnDate,
    lastSeen: last.txnDate,
    amount,
    monthlyCost: Math.round(amount * PER_MONTH[cadence]),
    annualCost: Math.round(amount * PER_MONTH[cadence] * 12),
    amountVariation: Number(amountVariation.toFixed(3)),
    fixed,
    // Allow one missed cycle before calling a mandate dead: a charge can land late, and
    // declaring a live subscription cancelled is a worse error than the reverse.
    active: last.txnDate >= addDays(asOf, -Math.round(intervalDays * 2 + 5)),
    // Looked for on every series rather than only on the near-fixed ones. `detectPriceChanges`
    // already demands two charges at one amount, two at another and a move above 5%, which a
    // metered bill never produces — and the variation gate used to be tuned so finely that a
    // Netflix step from ₹499 to ₹649 fell the wrong side of it and went undetected.
    priceChanges: detectPriceChanges(sorted.map((t) => ({ date: t.txnDate, amount: t.txnAmount }))),
    reason,
    txnIds: sorted.map((t) => t.txnId),
  }
}

function group(txns: readonly Transaction[]): Map<string, Transaction[]> {
  const groups = new Map<string, Transaction[]>()
  for (const t of txns) {
    const key = seriesKey(t.narration)
    const list = groups.get(key)
    if (list) list.push(t)
    else groups.set(key, [t])
  }
  return groups
}

/**
 * Every recurring commitment in the ledger.
 *
 * `minOccurrences` is 3 on purpose. Two charges are a coincidence — somebody bought something
 * twice. Three at a regular interval is a pattern, and it is the smallest number that lets an
 * interval be checked for consistency rather than merely computed.
 */
export function detectRecurring(
  txns: readonly Transaction[],
  asOf: string,
  minOccurrences = 3,
): Series[] {
  const out: Series[] = []

  for (const [key, list] of group(txns)) {
    if (list.length < minOccurrences) continue

    const stats = analyse(list)
    if (!stats || stats.monthsSpanned < minOccurrences) continue

    const last = stats.sorted[stats.sorted.length - 1]
    if (!last) continue

    const reason = commitmentReason(stats, last.txnType === 'CREDIT')
    if (!reason) continue

    const series = buildSeries(key, stats, reason, asOf)
    if (series) out.push(series)
  }

  return out.sort((a, b) => b.monthlyCost - a.monthlyCost)
}

/**
 * Merchants the customer uses often but is not committed to.
 *
 * This is where a spending cap goes, and where Cleo's real finding lives: the damage is the
 * small repeat purchase, not the impulse buy. Sixty-seven ₹280 orders is ₹18,760 that nobody
 * remembers spending.
 */
export function detectHabits(
  txns: readonly Transaction[],
  asOf: string,
  minOccurrences = 6,
): Habit[] {
  const out: Habit[] = []

  for (const [key, list] of group(txns)) {
    if (list.length < minOccurrences) continue

    const stats = analyse(list)
    if (!stats) continue

    const last = stats.sorted[stats.sorted.length - 1]
    if (!last || last.txnType === 'CREDIT') continue
    if (commitmentReason(stats, false)) continue

    const first = stats.sorted[0]
    if (!first) continue

    const total = stats.sorted.reduce((s, t) => s + t.txnAmount, 0)
    const months = Math.max(1, stats.monthsSpanned)
    const enriched = categorize(last)

    out.push({
      key,
      merchant: enriched.merchant,
      category: enriched.category,
      occurrences: stats.sorted.length,
      firstSeen: first.txnDate,
      lastSeen: last.txnDate,
      typicalAmount: Math.round(median(stats.sorted.map((t) => t.txnAmount))),
      monthlyAverage: Math.round(total / months),
      annualTotal: Math.round((total / months) * 12),
      timesPerMonth: Number((stats.sorted.length / months).toFixed(1)),
      txnIds: stats.sorted.map((t) => t.txnId),
    })
  }

  void asOf
  return out.sort((a, b) => b.monthlyAverage - a.monthlyAverage)
}

/**
 * The live subscriptions, and what they actually cost a year.
 *
 * Not "the ones you forgot" — we cannot know that. This is the list to put in front of someone
 * and ask. The annual figure is the point: nobody cancels ₹1,499 a month, and quite a lot of
 * people cancel ₹17,988 a year.
 */
export function subscriptions(series: readonly Series[]): Series[] {
  return series.filter((s) => s.active && s.kind === 'subscription')
}

/** Everything that leaves every month whether the customer thinks about it or not. */
export function commitments(series: readonly Series[]): Series[] {
  const owed: ReadonlySet<SeriesKind> = new Set<SeriesKind>([
    'rent',
    'emi',
    'insurance',
    'bill',
    'transfer',
    'obligation',
  ])
  return series.filter((s) => s.active && owed.has(s.kind))
}
