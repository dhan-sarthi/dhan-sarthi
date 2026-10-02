/**
 * One customer as the RM desk sees them: the engine's whole reading of the file at the RM
 * clock, built without a session and without writing a row.
 *
 * The chain is the app's own — scope by consent, `derive`, `suggestGoal`, `buildRoadmap`,
 * `findInsights`, `buildDailyPlan` — over the same 24-month file the customer's `/view` reads at
 * the same date, so the console and the app cannot disagree about a customer on the anchor.
 * What it deliberately does not do is what `AdvisoryService.view` does around that chain: store
 * the snapshot, cut a roadmap version, or read a session's goal and caps. Those are the
 * customer's record, and an RM looking at a customer must leave no mark on it. The goal is the
 * engine's own ladder for the same reason: a goal the customer typed lives on their session,
 * and the console reads no session.
 *
 * Everything on top of the chain is a definition from `@dhan/core`'s `rm` module, over this one
 * state: segment, wallet share, goal health, signals, the month-end balance series per account,
 * ledger events, the next thirty days. Pure: the service that calls it owns the I/O and the memo.
 */
import {
  allBalances,
  balanceChangePct,
  buildDailyPlan,
  buildRoadmap,
  counterpartyOf,
  derive,
  findInsights,
  goalHealth,
  idbiProducts,
  ledgerEvents,
  monthlyBalanceSeries,
  netWorth,
  relationshipValue,
  segmentOf,
  suggestGoal,
  toSignals,
  upcomingEvents,
  walletSharePct,
  withIdbi,
} from '@dhan/core'
import type {
  Account,
  BalancePoint,
  CustomerFile,
  DailyPlan,
  Goal,
  GoalHealth,
  Insight,
  LedgerAccount,
  Liability,
  LedgerEvent,
  NetWorth,
  Roadmap,
  Segment,
  Signal,
  Snapshot,
  Transaction,
  UpcomingItem,
} from '@dhan/core'
import { addDays } from '@dhan/core'
import type { Consent, ConsentScope, IsoDate, ProvenanceMap } from '@dhan/contracts'
import { HISTORY_WINDOW_MONTHS } from '../advisory.service.ts'
import { scopeFile } from '../consent-scope.ts'
import type { ShelfProduct } from '../../ports/index.ts'
import { productGaps } from './product-gaps.ts'
import type { ProductGap } from './product-gaps.ts'

/** The reason a console-built roadmap carries. It is never stored, so it is never a version. */
export const RM_VIEW_REASON = 'Read by the RM desk; not a version of the customer’s plan.'

/** "Since you were away" opens a week back for a session; the desk uses the same window. */
const LAST_SEEN_OFFSET_DAYS = -6

/**
 * Above this rate a loan is expensive, and outranks every investment.
 *
 * Passed to `derive` explicitly rather than left to its default, so the per-loan flag on the
 * customer page and the engine's `debt.hasHighInterest` are one number by construction. It is the
 * engine's own default; a test holds the console's snapshot equal to the app's, so a change to
 * that default fails a test instead of opening a gap between the two.
 */
export const HIGH_INTEREST_PCT = 24

/** Months of balance history the console charts. */
export const BALANCE_SERIES_MONTHS = 12
/** The next thirty days, for Today's "Coming up". */
export const UPCOMING_DAYS = 30

export interface CustomerState {
  cif: string
  /** The RM clock: the data anchor. */
  asOf: IsoDate
  /** The file as consent allows it, the one every figure below is derived from. */
  file: CustomerFile
  consent: Consent
  /** The blocks consent covers. Empty when the consent is not active. */
  granted: ReadonlySet<ConsentScope>
  provenance: ProvenanceMap
  snapshot: Snapshot
  goal: Goal
  roadmap: Roadmap
  plan: DailyPlan
  /** The engine's insights, ranked, `human_handoff` included as the engine emits it. */
  insights: Insight[]
  /** The same insights re-voiced for the RM, `human_handoff` dropped. */
  signals: Signal[]
  horizonYears: number

  netWorth: NetWorth
  relationshipValue: number
  withIdbi: number
  /** Every balance at any bank: what wallet share divides by. */
  balances: number
  walletSharePct: number | null
  segment: Segment
  health: GoalHealth
  /** Month-end balances, oldest first: the last twelve complete months at the RM clock. */
  balanceSeries: BalancePoint[]
  balanceChange3mPct: number | null
  /** One entry per account, its own rows only: what the series above was read from. */
  ledgers: LedgerAccount[]
  ledgerEvents: LedgerEvent[]
  upcoming: UpcomingItem[]
  /** Distinct IDBI products held, by the name an RM would say. */
  idbiProducts: string[]
  gaps: ProductGap[]
  /** The shelf the plan was gated over, so a re-run of the gate reads the same products. */
  shelf: readonly ShelfProduct[]
  /** Who collects each loan in `file.liabilities`, by position; null where the statement is silent. */
  lenders: (string | null)[]
}

/** Rupees to the paisa: sums of balances carry floating-point dust that no statement prints. */
export function paise(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Who a loan is with, read off the statement: the counterparty on its latest instalment.
 *
 * `Liability` carries no lender (the bank's loan enquiry names the product, not the creditor),
 * but every instalment is a mandate line naming who collects it. Matched on the amount, the
 * same way the engine matches an EMI to its series. A card payment names no creditor, so a
 * card's lender stays null rather than guessed.
 */
export function lenderOf(file: CustomerFile, loan: Liability): string | null {
  for (let i = file.transactions.length - 1; i >= 0; i -= 1) {
    const t = file.transactions[i]
    if (t === undefined || t.txnType !== 'DEBIT' || t.spendCategory !== 'Loan EMI') continue
    if (Math.abs(t.txnAmount - loan.emiAmount) >= 1) continue
    const name = counterpartyOf(t.narration)
    if (name !== null) return name
  }
  return null
}

export interface CustomerStateInput {
  cif: string
  asOf: IsoDate
  /** The unscoped file `loadCustomerFile` answered, 24 months to the RM clock. */
  file: CustomerFile
  provenance: ProvenanceMap
  consent: Consent
  shelf: readonly ShelfProduct[]
}

/** The window the file must be loaded with: the app's, so both read the same months. */
export const STATE_WINDOW_MONTHS = HISTORY_WINDOW_MONTHS

/**
 * The account an unstamped line belongs to: the first IDBI savings or current account.
 *
 * A single-bank ledger stamps nothing, and every line on it is the primary account's. Where the
 * file is aggregated each satellite's lines carry its own number, so only the home account's
 * lines can arrive unstamped.
 */
function primaryAccount(accounts: readonly Account[]): string | null {
  const home = accounts.find(
    (a) =>
      (a.accountType === 'Savings' || a.accountType === 'Current') &&
      (a.institution?.isHome ?? true),
  )
  return (home ?? accounts[0])?.accountNumberMasked ?? null
}

/**
 * The balance before an account's first line, read back off that line: its running balance
 * less its own movement. Where the account has no lines at all it is what the file declares,
 * a deposit's principal or an untouched account's balance, which never moved.
 */
function openingOf(account: Account, rows: readonly Transaction[]): number {
  const first = rows[0]
  if (first === undefined || first.balanceAfterTxn === null) return account.currentBalance
  const movement = first.txnType === 'CREDIT' ? first.txnAmount : -first.txnAmount
  return Math.round((first.balanceAfterTxn - movement) * 100) / 100
}

/** Each account with its own rows, oldest first. One merged stream has no running balance. */
export function ledgersOf(file: CustomerFile): LedgerAccount[] {
  const primary = primaryAccount(file.accounts)
  const rows = new Map<string, Transaction[]>()
  for (const t of file.transactions) {
    const key = t.accountNumberMasked ?? primary
    if (key === null) continue
    const list = rows.get(key)
    if (list) list.push(t)
    else rows.set(key, [t])
  }
  return file.accounts.map((a): LedgerAccount => {
    const own = rows.get(a.accountNumberMasked) ?? []
    return {
      accountType: a.accountType,
      institution: a.institution,
      accountOpeningDate: a.accountOpeningDate,
      transactions: own,
      openingBalance: openingOf(a, own),
    }
  })
}

export function customerState(input: CustomerStateInput): CustomerState {
  const { asOf, consent, shelf } = input
  // The bank's artefact decides what the desk may read, exactly as it decides what the engine
  // may: a consent that is not active grants nothing, and `scopeFile` keeps only the identity
  // fields `derive` cannot do without.
  const granted: ReadonlySet<ConsentScope> =
    consent.status === 'ACTIVE' ? new Set(consent.scopes) : new Set()
  const file = scopeFile(input.file, granted)

  const snapshot = derive(file, asOf, { highInterestThreshold: HIGH_INTEREST_PCT })
  const goal = suggestGoal(snapshot, asOf, null)
  const roadmap = buildRoadmap(snapshot, goal, shelf, asOf, {
    version: 0,
    reasonForChange: RM_VIEW_REASON,
  })
  const horizonYears = Math.max(5, 60 - snapshot.customer.age)
  const plan = buildDailyPlan(snapshot, roadmap, file.transactions, shelf, asOf, {
    lastSeen: addDays(asOf, LAST_SEEN_OFFSET_DAYS),
    caps: [],
    spendLimit: null,
    horizonYears,
  })
  const insights = findInsights(snapshot)

  const raw = netWorth(snapshot)
  const worth = {
    assets: paise(raw.assets),
    liabilities: paise(raw.liabilities),
    net: paise(raw.net),
    allocation: {
      cash: paise(raw.allocation.cash),
      equity: paise(raw.allocation.equity),
      fixed: paise(raw.allocation.fixed),
    },
  }
  const balances = paise(allBalances(file.accounts))
  const idbi = paise(withIdbi(file.accounts))
  const value = paise(relationshipValue(snapshot))
  const lenders = file.liabilities.map((l) => lenderOf(file, l))
  const ledgers = ledgersOf(file)
  const balanceSeries = monthlyBalanceSeries(ledgers, asOf, BALANCE_SERIES_MONTHS)

  return {
    cif: input.cif,
    asOf,
    file,
    consent,
    granted,
    provenance: input.provenance,
    snapshot,
    goal,
    roadmap,
    plan,
    insights,
    signals: toSignals(insights),
    horizonYears,
    netWorth: worth,
    relationshipValue: value,
    withIdbi: idbi,
    balances,
    walletSharePct: walletSharePct(idbi, balances),
    segment: segmentOf(value),
    health: goalHealth(roadmap, insights),
    balanceSeries,
    balanceChange3mPct: balanceChangePct(balanceSeries, 3),
    ledgers,
    ledgerEvents: ledgerEvents(file.transactions, asOf),
    upcoming: upcomingEvents(
      { cif: input.cif, name: file.customer.custName },
      {
        snapshot,
        accounts: file.accounts,
        holdings: file.holdings,
        liabilities: file.liabilities,
        policies: file.policies,
      },
      asOf,
      UPCOMING_DAYS,
    ),
    // A loan counts as an IDBI product only when its instalments name IDBI as the collector.
    idbiProducts: idbiProducts({
      accounts: file.accounts,
      holdings: file.holdings,
      policies: file.policies,
      liabilities: file.liabilities.map((l, i) => ({ ...l, lender: lenders[i] ?? undefined })),
    }),
    gaps: productGaps({
      snapshot,
      insights,
      holdings: file.holdings,
      policies: file.policies,
      shelf,
      horizonYears,
    }),
    shelf,
    lenders,
  }
}
