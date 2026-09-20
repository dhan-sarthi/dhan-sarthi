/**
 * The savings pot, and the five hacks that fill it.
 *
 * Cleo's Save is the only part of their product that moves money, and the reason it works is
 * that none of the five rules asks the customer to decide anything twice. A round-up is decided
 * once and then happens four hundred times; a weekly ₹500 is decided once and then happens
 * fifty-two times. That is the whole mechanism, and it is why this file contains no notion of a
 * customer approving a deposit.
 *
 * The one engineering constraint that shapes everything below: **`accrue` is called on every
 * read.** There is no scheduler and no cron in this product — the simulated clock only moves when
 * a reviewer moves it, so the pot has to catch up lazily, inside whatever request noticed that
 * the day had changed. That is only safe if running it twice over the same range produces the
 * same deposits, so every id here is derived from the thing that caused it — a transaction id, a
 * Monday's date — and never from a counter or a clock. Get that wrong and the demo puts a
 * customer's money aside twice for the same coffee, on screen, in front of the room.
 *
 * Money is whole rupees at construction, as everywhere else. Dates are 'YYYY-MM-DD' strings
 * compared lexically; a Date object here would put a Monday deposit on a Sunday for anyone west
 * of Greenwich.
 */
import { categorize } from './categorize.ts'
import { addDays, daysBetween, parse, toIso } from './dates.ts'
import type { Transaction } from './types.ts'

const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`

/* ------------------------------------------------------------------ *
 * The hacks
 * ------------------------------------------------------------------ */

export type SaveHackId = 'roundups' | 'set_forget' | 'smart_save' | 'swear_jar' | 'payday_saver'

/** Screen order, and the order every list of hacks is printed in. Not alphabetical, on purpose. */
export const SAVE_HACK_IDS: readonly SaveHackId[] = [
  'roundups',
  'set_forget',
  'smart_save',
  'swear_jar',
  'payday_saver',
]

export type SmartSaveLevel = 'gentle' | 'normal' | 'tough'

/**
 * Multipliers on the recommended weekly amount.
 *
 * `tough` is 1.1 and not 1.5 because the recommended figure is already the whole of what the
 * roadmap believes is deployable. A "tough" setting that put aside half as much again would be
 * setting the customer up to move the money back out on the 25th, and a savings product whose
 * deposits get reversed teaches the opposite of the lesson.
 */
export const SMART_SAVE_FACTOR: Record<SmartSaveLevel, number> = {
  gentle: 0.6,
  normal: 1,
  tough: 1.1,
}

export interface SaveHacks {
  /** Every purchase rounded up to the next ₹10. */
  roundups: { enabled: boolean; toNearest: number }
  /** A fixed amount, once a week. */
  setForget: { enabled: boolean; weekly: number }
  /** The engine picks the amount from the spending data. */
  smartSave: { enabled: boolean; level: SmartSaveLevel }
  /** A fixed amount every time they spend at one merchant. */
  swearJar: { enabled: boolean; merchant: string | null; perSpend: number }
  /** A percentage of every salary credit. */
  paydaySaver: { enabled: boolean; percent: number }
}

/**
 * Everything off, with a configuration already in it.
 *
 * The defaults are not zeroes. A hack the customer has never touched still has to be able to say
 * what it *would* do on its card, and "₹0 a week" is not a pitch. These are the figures the
 * screen offers first and the customer edits.
 */
export const NO_SAVE_HACKS: SaveHacks = {
  roundups: { enabled: false, toNearest: 10 },
  setForget: { enabled: false, weekly: 500 },
  smartSave: { enabled: false, level: 'normal' },
  swearJar: { enabled: false, merchant: null, perSpend: 50 },
  paydaySaver: { enabled: false, percent: 5 },
}

export type SaveDepositSource = SaveHackId | 'manual'

export interface SaveDeposit {
  id: string
  /** The simulated date it landed. */
  atSim: string
  amount: number
  source: SaveDepositSource
  /** One short line the Activity list prints under the amount. */
  note: string
}

export interface SaveState {
  hacks: SaveHacks
  deposits: SaveDeposit[]
  /** The last simulated date the hacks were accrued up to. Null before the first accrual. */
  accruedTo: string | null
}

export const EMPTY_SAVE_STATE: SaveState = { hacks: NO_SAVE_HACKS, deposits: [], accruedTo: null }

/**
 * The deposit id, built from what caused the deposit.
 *
 * Exported because the id scheme is the idempotency guarantee and a caller inserting a manual
 * deposit has to be inside it rather than beside it. `key` is whatever uniquely names the cause:
 * a transaction id for a round-up, a Monday's date for a weekly rule, and for a manual deposit
 * the idempotency key the request already carries — not the date, because a customer may
 * genuinely add to their goal twice in one afternoon.
 */
export function idFor(source: SaveDepositSource, key: string): string {
  return `${source}:${key}`
}

/* ------------------------------------------------------------------ *
 * Reading a row back
 * ------------------------------------------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function booleanOr(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === 'string' && v !== '' ? v : fallback
}

function levelOr(v: unknown, fallback: SmartSaveLevel): SmartSaveLevel {
  return v === 'gentle' || v === 'normal' || v === 'tough' ? v : fallback
}

function sourceOr(v: unknown, fallback: SaveDepositSource): SaveDepositSource {
  if (v === 'manual') return 'manual'
  for (const id of SAVE_HACK_IDS) if (id === v) return id
  return fallback
}

/**
 * A date, or null.
 *
 * The shape check is not enough on its own: `2026-02-31` passes a regular expression and then
 * every helper in `dates.ts` silently answers about the 3rd of March. Round-tripping it through
 * the same `parse` everything else uses is the only check that catches that, and a jsonb column
 * written by an older build is exactly where such a string comes from.
 */
function isoDateOr(v: unknown, fallback: string | null): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return fallback
  try {
    return toIso(parse(v)) === v ? v : fallback
  } catch {
    return fallback
  }
}

function defaultNote(source: SaveDepositSource): string {
  switch (source) {
    case 'roundups':
      return 'Round-up'
    case 'set_forget':
      return 'Your weekly set and forget'
    case 'smart_save':
      return 'Smart Save'
    case 'swear_jar':
      return 'Swear jar'
    case 'payday_saver':
      return 'A slice of your salary'
    case 'manual':
      return 'Added to your goal'
  }
}

function normaliseHacks(raw: unknown): SaveHacks {
  const row = isRecord(raw) ? raw : {}
  const roundups = isRecord(row['roundups']) ? row['roundups'] : {}
  const setForget = isRecord(row['setForget']) ? row['setForget'] : {}
  const smartSave = isRecord(row['smartSave']) ? row['smartSave'] : {}
  const swearJar = isRecord(row['swearJar']) ? row['swearJar'] : {}
  const paydaySaver = isRecord(row['paydaySaver']) ? row['paydaySaver'] : {}
  const merchant = swearJar['merchant']

  return {
    roundups: {
      enabled: booleanOr(roundups['enabled'], NO_SAVE_HACKS.roundups.enabled),
      toNearest: Math.max(
        1,
        Math.round(numberOr(roundups['toNearest'], NO_SAVE_HACKS.roundups.toNearest)),
      ),
    },
    setForget: {
      enabled: booleanOr(setForget['enabled'], NO_SAVE_HACKS.setForget.enabled),
      weekly: Math.max(
        0,
        Math.round(numberOr(setForget['weekly'], NO_SAVE_HACKS.setForget.weekly)),
      ),
    },
    smartSave: {
      enabled: booleanOr(smartSave['enabled'], NO_SAVE_HACKS.smartSave.enabled),
      level: levelOr(smartSave['level'], NO_SAVE_HACKS.smartSave.level),
    },
    swearJar: {
      enabled: booleanOr(swearJar['enabled'], NO_SAVE_HACKS.swearJar.enabled),
      merchant: typeof merchant === 'string' && merchant !== '' ? merchant : null,
      perSpend: Math.max(
        0,
        Math.round(numberOr(swearJar['perSpend'], NO_SAVE_HACKS.swearJar.perSpend)),
      ),
    },
    paydaySaver: {
      enabled: booleanOr(paydaySaver['enabled'], NO_SAVE_HACKS.paydaySaver.enabled),
      percent: Math.max(0, numberOr(paydaySaver['percent'], NO_SAVE_HACKS.paydaySaver.percent)),
    },
  }
}

function normaliseDeposits(raw: unknown): SaveDeposit[] {
  if (!Array.isArray(raw)) return []
  const out: SaveDeposit[] = []

  for (const item of raw) {
    if (!isRecord(item)) continue
    // Id, date and amount are the three a deposit cannot be repaired without: there is no
    // defensible guess at when money landed or how much of it there was, and a row missing
    // either would corrupt the interest calculation rather than merely look odd. A missing note
    // or an unrecognised source is cosmetic, so those are filled in.
    const id = stringOr(item['id'], '')
    const atSim = isoDateOr(item['atSim'], null)
    const amount = numberOr(item['amount'], Number.NaN)
    if (id === '' || atSim === null || !Number.isFinite(amount)) continue

    const source = sourceOr(item['source'], 'manual')
    out.push({
      id,
      atSim,
      amount: Math.round(amount),
      source,
      note: stringOr(item['note'], defaultNote(source)),
    })
  }

  return out
}

/**
 * Fills in anything a row written before the column existed is missing. Never throws.
 *
 * The migration defaults the column to `'{}'` rather than to a full object, deliberately: this
 * function is the one place that knows what an empty pot is, and a default written into SQL as
 * well would be a second place, free to disagree after the next change here.
 */
export function normaliseSaveState(raw: unknown): SaveState {
  const row = isRecord(raw) ? raw : {}
  return {
    hacks: normaliseHacks(row['hacks']),
    deposits: normaliseDeposits(row['deposits']),
    accruedTo: isoDateOr(row['accruedTo'], null),
  }
}

/* ------------------------------------------------------------------ *
 * What the hacks put aside
 * ------------------------------------------------------------------ */

/**
 * Weeks in a month, for turning a monthly surplus into a weekly one.
 *
 * 4.345 rather than 4: a year is 52.18 weeks and 12 months, and using 4 would size every weekly
 * rule 8.6% high — which reads as nothing on a card and is a month's deposits a year in a pot
 * whose whole point is that it never needs topping back up.
 */
const WEEKS_PER_MONTH = 4.345

/**
 * What the engine thinks they can put aside each week.
 *
 * Rounded to the nearest ₹50 so Smart Save's "Normal" is a figure a person would choose, and
 * floored at 0 because a customer who spends more than they earn has nothing to put aside and an
 * app that proposed a number anyway would be the only thing in the room lying to them.
 */
export function recommendedWeeklySave(deployableMonthly: number): number {
  const weekly = Math.max(0, deployableMonthly) / WEEKS_PER_MONTH
  return Math.round(weekly / 50) * 50
}

export interface AccrualWindow {
  /** Exclusive. Normally the last date already accrued. */
  from: string
  /** Inclusive. Normally the session's simulated today. */
  to: string
  recommendedWeekly: number
}

/*
 * Same window convention as `challenge.ts`, and for the same reason: exclusive lower, inclusive
 * upper. Here it is load-bearing rather than merely consistent — `accruedTo` is the last date
 * already paid for, so an inclusive lower bound would pay for it a second time on the next read,
 * every read, for as long as the clock stands still.
 */
function inWindow(date: string, after: string, through: string): boolean {
  return date > after && date <= through
}

function isSpend(t: Transaction): boolean {
  return t.txnType === 'DEBIT' && t.isSelfTransfer !== true
}

/**
 * Every Monday in the range.
 *
 * A weekly rule needs a fixed day of the week or it is not reproducible over a range: counting
 * "every seventh day from `from`" gives a different answer depending on which day the reviewer
 * last opened the app, and the same week would be paid for twice across two reads. Monday
 * because a week starts on one, and the Activity list should not have the deposit wander.
 */
function mondaysIn(from: string, to: string): string[] {
  const out: string[] = []
  const span = daysBetween(from, to)
  for (let i = 1; i <= span; i += 1) {
    const day = addDays(from, i)
    if (parse(day).getUTCDay() === 1) out.push(day)
  }
  return out
}

/** A percentage as a person writes it: `5`, `2.5`, never `2.50`. */
function pct(n: number): string {
  return String(Number(n.toFixed(2)))
}

/**
 * Every deposit the enabled hacks would generate over the range, whether or not it is new.
 *
 * One engine behind both `accrue` and `projectHacks`, so the figure on a hack's card and the
 * money that actually lands in the pot cannot disagree — which they did the obvious way round,
 * with two implementations of "round up to the next ₹10" that differed on exact multiples.
 */
function generate(
  hacks: SaveHacks,
  txns: readonly Transaction[],
  opts: AccrualWindow,
): SaveDeposit[] {
  const { from, to, recommendedWeekly } = opts
  const out: SaveDeposit[] = []

  if (hacks.roundups.enabled) {
    const step = Math.max(1, Math.round(hacks.roundups.toNearest))
    for (const t of txns) {
      if (!isSpend(t) || !inWindow(t.txnDate, from, to)) continue
      // Nothing on an exact multiple. Charging ₹10 on a payment of exactly ₹250 is not a
      // round-up, it is a levy, and a customer checking the arithmetic would not recognise it.
      const up = Math.round(Math.ceil(t.txnAmount / step) * step - t.txnAmount)
      if (up <= 0) continue
      const merchant = categorize(t).merchant
      out.push({
        id: idFor('roundups', t.txnId),
        atSim: t.txnDate,
        amount: up,
        source: 'roundups',
        note: `Round-up on ${merchant ?? inr(t.txnAmount)}`,
      })
    }
  }

  if (hacks.setForget.enabled) {
    const weekly = Math.max(0, Math.round(hacks.setForget.weekly))
    if (weekly > 0) {
      for (const monday of mondaysIn(from, to)) {
        out.push({
          id: idFor('set_forget', monday),
          atSim: monday,
          amount: weekly,
          source: 'set_forget',
          note: 'Your weekly set and forget',
        })
      }
    }
  }

  if (hacks.smartSave.enabled) {
    const weekly = Math.round(
      Math.max(0, recommendedWeekly) * SMART_SAVE_FACTOR[hacks.smartSave.level],
    )
    if (weekly > 0) {
      for (const monday of mondaysIn(from, to)) {
        out.push({
          id: idFor('smart_save', monday),
          atSim: monday,
          amount: weekly,
          source: 'smart_save',
          note: `Smart Save, a ${hacks.smartSave.level} week`,
        })
      }
    }
  }

  const jar = hacks.swearJar
  if (jar.enabled && jar.merchant !== null) {
    const merchant = jar.merchant
    const perSpend = Math.max(0, Math.round(jar.perSpend))
    if (perSpend > 0) {
      for (const t of txns) {
        if (!isSpend(t) || !inWindow(t.txnDate, from, to)) continue
        // The derived merchant, never `merchantName` off the statement: the customer chose this
        // name from a list this package produced, so it has to be matched by the same function
        // that produced it or a jar set over Swiggy quietly never fires.
        if (categorize(t).merchant !== merchant) continue
        out.push({
          id: idFor('swear_jar', t.txnId),
          atSim: t.txnDate,
          amount: perSpend,
          source: 'swear_jar',
          note: `Swear jar — ${merchant}`,
        })
      }
    }
  }

  if (hacks.paydaySaver.enabled) {
    const percent = Math.max(0, hacks.paydaySaver.percent)
    if (percent > 0) {
      for (const t of txns) {
        if (t.txnType !== 'CREDIT' || !inWindow(t.txnDate, from, to)) continue
        if (categorize(t).category !== 'Income') continue
        const amount = Math.round((t.txnAmount * percent) / 100)
        if (amount <= 0) continue
        out.push({
          id: idFor('payday_saver', t.txnId),
          atSim: t.txnDate,
          amount,
          source: 'payday_saver',
          note: `${pct(percent)}% of your salary`,
        })
      }
    }
  }

  // A total order, not merely a date order. Two hacks can land on the same Monday and two
  // round-ups on the same day, and "deterministic" has to mean the same array, not the same set.
  return out.sort((a, b) =>
    a.atSim < b.atSim ? -1 : a.atSim > b.atSim ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )
}

function summaryNote(
  hacks: SaveHacks,
  id: SaveHackId,
  rows: readonly SaveDeposit[],
  recommendedWeekly: number,
): string {
  switch (id) {
    case 'roundups':
      return `${rows.length} round-ups to the nearest ${inr(hacks.roundups.toNearest)}`
    case 'set_forget':
      return `${inr(hacks.setForget.weekly)} a week`
    case 'smart_save':
      return `${inr(recommendedWeekly * SMART_SAVE_FACTOR[hacks.smartSave.level])} a week, ${hacks.smartSave.level}`
    case 'swear_jar':
      return hacks.swearJar.merchant === null
        ? 'Choose a merchant to charge yourself for'
        : `${inr(hacks.swearJar.perSpend)} each time, ${rows.length} at ${hacks.swearJar.merchant}`
    case 'payday_saver':
      return `${pct(hacks.paydaySaver.percent)}% of ${rows.length} salary credit${rows.length === 1 ? '' : 's'}`
  }
}

function isEnabled(hacks: SaveHacks, id: SaveHackId): boolean {
  switch (id) {
    case 'roundups':
      return hacks.roundups.enabled
    case 'set_forget':
      return hacks.setForget.enabled
    case 'smart_save':
      return hacks.smartSave.enabled
    case 'swear_jar':
      return hacks.swearJar.enabled
    case 'payday_saver':
      return hacks.paydaySaver.enabled
  }
}

/**
 * What each enabled hack would have put aside over the window. Nothing is stored.
 *
 * An enabled hack with nothing to show still gets a row, at zero — the card list is five rows
 * whatever the data says, and a missing row would read as a missing hack.
 *
 * A caller that needs the counterfactual for a hack that is currently **off** — the "or would
 * have" figure the card prints under the pitch — passes the same configurations with `enabled`
 * set true. This function is pure and touches nothing, so that costs a second pass over the
 * ledger and nothing else, and it keeps the two questions apart: what is happening, and what
 * would happen.
 */
export function projectHacks(
  hacks: SaveHacks,
  txns: readonly Transaction[],
  opts: AccrualWindow,
): { id: SaveHackId; amount: number; note: string }[] {
  const generated = generate(hacks, txns, opts)

  return SAVE_HACK_IDS.filter((id) => isEnabled(hacks, id)).map((id) => {
    const rows = generated.filter((d) => d.source === id)
    return {
      id,
      amount: rows.reduce((sum, d) => sum + d.amount, 0),
      note: summaryNote(hacks, id, rows, opts.recommendedWeekly),
    }
  })
}

/**
 * The deposits the enabled hacks generate between `from` (exclusive) and `to` (inclusive).
 *
 * Deterministic and idempotent over a date range, which is what lets `SaveService` call it on
 * every read: round-ups and the swear jar are per-transaction, set and forget and smart save land
 * on each Monday in the range, and payday saver lands on each salary credit. Every id is built
 * from the cause, so a re-run over the same range produces the same ids.
 *
 * `accruedTo` moving with the range is the first defence against paying twice, and the filter
 * against the ids already in the pot is the second. Two are warranted: the first fails the moment
 * anything calls this with a range it has already covered — a replayed idempotent request, a
 * reviewer winding the clock back — and the failure is money appearing out of nowhere in a demo.
 */
export function accrue(
  state: SaveState,
  txns: readonly Transaction[],
  opts: AccrualWindow,
): SaveDeposit[] {
  const already = new Set(state.deposits.map((d) => d.id))
  return generate(state.hacks, txns, opts).filter((d) => !already.has(d.id))
}

/* ------------------------------------------------------------------ *
 * What the pot is worth
 * ------------------------------------------------------------------ */

/** IDBI's savings rate: 2.70% under ₹5 lakh, 3.00% at or above it. */
export function savingsRatePct(balance: number): number {
  return balance < 5_00_000 ? 2.7 : 3.0
}

export function potTotal(deposits: readonly SaveDeposit[]): number {
  return Math.round(deposits.reduce((sum, d) => sum + d.amount, 0))
}

/**
 * Simple daily accrual on each deposit from the day it landed to `asOf`.
 *
 * The slab is read off the pot as it stands today rather than re-derived for each day the balance
 * crossed ₹5 lakh, and that is a simplification worth naming: a pot that crossed the slab last
 * month is credited the higher rate on the months before it did. The error is a few rupees on a
 * figure the screen shows as "interest earned so far", and the alternative is a day-by-day
 * balance reconstruction whose extra precision nobody could check. What must not happen is the
 * figure being presented as a statement of interest actually credited — it is an accrual, and the
 * bank credits quarterly.
 */
export function interestEarned(deposits: readonly SaveDeposit[], asOf: string): number {
  const ratePct = savingsRatePct(potTotal(deposits))
  let earned = 0

  for (const d of deposits) {
    const held = daysBetween(d.atSim, asOf)
    if (held <= 0) continue
    earned += (d.amount * ratePct * held) / (100 * 365)
  }

  return Math.round(earned)
}
