/**
 * The console's own pages: who is signed in, the book, Today, one customer, and Insights.
 *
 * Each is assembled from three things and only these: the book's memoised customer states (what
 * the engine reads in each file at the RM clock), the activity behind them (read fresh, from the
 * activity service), and `@dhan/core`'s RM definitions over both. Nothing here derives a figure
 * of its own: a total is a sum of rows on the same page, a series is a sum of the same series on
 * each row, and the definitions table in docs/product/rm-console.md says what each one means.
 *
 * Reads only, except one: opening a customer writes a `viewed` entry to the access log with the
 * purpose the RM gave, because an open with no record of it is the thing the log exists to stop.
 */
import {
  allocationTotals,
  bookBalanceSeries,
  bookTotals,
  bookUpcoming,
  callQueue,
  goalHealthCounts,
  refusalsByRule,
  segmentBreakdown,
  signalsByKind,
  todayKpis,
} from '@dhan/core'
import type { QueueHandoff, SignalSeverity } from '@dhan/core'
import type {
  BookRow,
  BookTab,
  Customer360,
  RmBook,
  RmInsights,
  RmMe,
  RmToday,
} from '@dhan/contracts'
import type { RmAccessLog } from './access-log.ts'
import type { ActivityFacts, RmActivityService } from './activity.service.ts'
import { NO_ACTIVITY } from './activity.service.ts'
import type { RmBookScope } from './book-scope.ts'
import type { RmBookService } from './book.service.ts'
import type { RmCaller } from './caller.ts'
import type { RmCopilotService } from './copilot.service.ts'
import { paise } from './customer-state.ts'
import type { CustomerState } from './customer-state.ts'
import type { RmAuthService } from './rm-auth.service.ts'
import { bookRow, customer360 } from './views.ts'

/** "Call today" shows about ten. */
const QUEUE_LENGTH = 10
/** Today's "Uday refused": the latest five. */
const LATEST_REFUSALS = 5
/** Insights' movers: the five whose balances moved most over three months. */
const TOP_MOVERS = 5

const TAB_LABEL: Readonly<Record<BookTab, string>> = {
  all: 'All',
  priority: 'Priority',
  affluent: 'Affluent',
  mass: 'Mass',
  at_risk: 'At risk',
  idle_cash: 'Idle cash',
  asked_for_rm: 'Asked for RM',
}

/** Which rows each tab shows. The contract's comment on `BookTab` is the definition. */
const IN_TAB: Readonly<Record<BookTab, (row: BookRow, state: CustomerState) => boolean>> = {
  all: () => true,
  priority: (row) => row.segment === 'priority',
  affluent: (row) => row.segment === 'affluent',
  mass: (row) => row.segment === 'mass',
  at_risk: (row) => row.goal.health !== 'on_track',
  idle_cash: (_row, state) => state.signals.some((s) => s.kind === 'idle_cash'),
  asked_for_rm: (row) => row.openHandoff,
}

const SEVERITY_RANK: Readonly<Record<SignalSeverity, number>> = {
  urgent: 0,
  important: 1,
  opportunity: 2,
}

const ASSET_CLASS_LABEL = { cash: 'Cash', equity: 'Equity', fixed: 'Fixed income' } as const
const SEGMENT_LABEL = { priority: 'Priority', affluent: 'Affluent', mass: 'Mass' } as const

/** `YYYY-MM` of a date or a month key. */
const monthOf = (iso: string): string => iso.slice(0, 7)

export interface RmConsoleDeps {
  auth: RmAuthService
  scope: RmBookScope
  book: RmBookService
  activity: RmActivityService
  accessLog: RmAccessLog
  copilot: RmCopilotService
}

export class RmConsoleService {
  private readonly deps: RmConsoleDeps

  constructor(deps: RmConsoleDeps) {
    this.deps = deps
  }

  async me(rm: RmCaller): Promise<RmMe> {
    const [profile, book] = await Promise.all([
      this.deps.auth.profile(rm),
      this.deps.scope.book(rm),
    ])
    return { rm: profile, asOf: this.deps.book.asOf, bookSize: book.length, demo: true }
  }

  /** The caller's customers with their activity, one pass, for every page that lists the book. */
  private async loadBook(
    rm: RmCaller,
  ): Promise<{ states: CustomerState[]; facts: Map<string, ActivityFacts> }> {
    const cifs = await this.deps.scope.book(rm)
    const [states, facts] = await Promise.all([
      this.deps.book.states(cifs),
      this.deps.activity.facts(cifs),
    ])
    return { states, facts }
  }

  async book(rm: RmCaller): Promise<RmBook> {
    const { states, facts } = await this.loadBook(rm)
    const pairs = states
      .map((state) => ({ state, row: bookRow(state, facts.get(state.cif) ?? NO_ACTIVITY) }))
      // Largest relationship first, then by name: the order a desk reads a book in, and stable.
      .sort(
        (a, b) =>
          b.row.relationshipValue - a.row.relationshipValue ||
          (a.row.name < b.row.name ? -1 : a.row.name > b.row.name ? 1 : 0),
      )
    const rows = pairs.map((p) => p.row)
    const totals = bookTotals(rows)
    return {
      asOf: this.deps.book.asOf,
      rows,
      totals: {
        customers: totals.customers,
        relationshipValue: paise(totals.relationshipValue),
        withIdbi: paise(totals.withIdbi),
        sipMonthly: paise(totals.sipMonthly),
        openHandoffs: rows.filter((r) => r.openHandoff).length,
      },
      segments: (Object.keys(TAB_LABEL) as BookTab[]).map((id) => ({
        id,
        label: TAB_LABEL[id],
        count: pairs.filter((p) => IN_TAB[id](p.row, p.state)).length,
      })),
    }
  }

  async today(rm: RmCaller): Promise<RmToday> {
    const { states, facts } = await this.loadBook(rm)
    const cifs = states.map((s) => s.cif)
    const [handoffs, refusals] = await Promise.all([
      this.deps.activity.handoffs(cifs),
      this.deps.activity.refusalItems(cifs),
    ])
    const rows = states.map((s) => bookRow(s, facts.get(s.cif) ?? NO_ACTIVITY))
    const open = handoffs.filter((h) => h.status === 'open')
    const queueHandoffs: QueueHandoff[] = open.map((h) => ({
      id: h.id,
      cif: h.cif,
      name: h.name,
      requestedOn: h.requestedOn,
      waitingDays: h.waitingDays,
      status: h.status,
    }))

    return {
      asOf: this.deps.book.asOf,
      kpis: todayKpis({ rows, openHandoffWaits: open.map((h) => h.waitingDays) }).map((k) =>
        k.unit === 'inr'
          ? { ...k, value: paise(k.value), delta: k.delta === null ? null : paise(k.delta) }
          : k,
      ),
      queue: callQueue(
        states.map((s) => ({
          cif: s.cif,
          name: s.file.customer.custName,
          segment: s.segment,
          insights: s.insights,
        })),
        queueHandoffs,
        { limit: QUEUE_LENGTH },
      ),
      handoffs,
      refusals: refusals.slice(0, LATEST_REFUSALS),
      upcoming: bookUpcoming(states.map((s) => s.upcoming)),
    }
  }

  /** The caller must already have been checked against the book (`scope.assertInBook`). */
  async customer(rm: RmCaller, cif: string, purpose: string): Promise<Customer360> {
    const [state, facts, profile] = await Promise.all([
      this.deps.book.state(cif),
      this.deps.activity.facts([cif]),
      this.deps.auth.profile(rm),
    ])
    const view = customer360({
      state,
      facts: facts.get(cif) ?? NO_ACTIVITY,
      assignedRm: profile,
      prompts: this.deps.copilot.prompts(state),
    })
    // After the file is assembled, so the log records an open that showed the RM something.
    await this.deps.accessLog.record(rm, cif, 'viewed', purpose)
    return view
  }

  async insights(rm: RmCaller): Promise<RmInsights> {
    const { states, facts } = await this.loadBook(rm)
    const cifs = states.map((s) => s.cif)
    const rows = states.map((s) => bookRow(s, facts.get(s.cif) ?? NO_ACTIVITY))
    const balances = bookBalanceSeries(rows)
    const months = balances.map((p) => p.month)
    const [activity, refusals] = await Promise.all([
      this.deps.activity.monthlyActivity(cifs, months),
      this.deps.activity.refusalItems(cifs),
    ])

    const flows = this.monthlyFlows(states, months)
    const allocation = allocationTotals(rows)
    const goals = goalHealthCounts(rows.map((r) => r.goal.health))
    const allSignals = states.flatMap((s) => s.signals)
    const worst = new Map<string, SignalSeverity>()
    for (const s of allSignals) {
      const seen = worst.get(s.kind)
      if (seen === undefined || SEVERITY_RANK[s.severity] < SEVERITY_RANK[seen]) {
        worst.set(s.kind, s.severity)
      }
    }

    return {
      asOf: this.deps.book.asOf,
      months,
      series: {
        bookBalance: balances.map((p) => p.total),
        withIdbi: balances.map((p) => p.withIdbi),
        inflow: flows.inflow,
        outflow: flows.outflow,
        sipBook: flows.invested,
        activity,
        // Counted off the same refusal items Today lists, by the month each was given in. Empty
        // until the book has a refusal, rather than a row of zeros that claims to have looked.
        refusals:
          refusals.length === 0
            ? []
            : months.map((m) => refusals.filter((r) => monthOf(r.at) === m).length),
      },
      allocation: {
        byAssetClass: (['cash', 'equity', 'fixed'] as const).map((id) => ({
          id,
          label: ASSET_CLASS_LABEL[id],
          value: paise(allocation[id]),
        })),
        bySegment: segmentBreakdown(rows).map((s) => ({
          id: s.segment,
          label: SEGMENT_LABEL[s.segment],
          value: paise(s.relationshipValue),
          customers: s.customers,
        })),
      },
      goalHealth: { on_track: goals.on_track, at_risk: goals.at_risk, off_track: goals.off_track },
      signals: signalsByKind(allSignals).map((k) => ({
        kind: k.kind,
        label: k.label,
        severity: worst.get(k.kind) ?? 'opportunity',
        count: k.count,
      })),
      refusalsByRule: refusalsByRule(refusals),
      topMovers: rows
        .filter((r): r is BookRow & { balanceChange3mPct: number } => r.balanceChange3mPct !== null)
        .sort(
          (a, b) =>
            Math.abs(b.balanceChange3mPct) - Math.abs(a.balanceChange3mPct) ||
            (a.cif < b.cif ? -1 : 1),
        )
        .slice(0, TOP_MOVERS)
        .map((r) => ({
          cif: r.cif,
          name: r.name,
          changePct: r.balanceChange3mPct,
          series: r.balanceSeries.map((p) => p.total),
        })),
    }
  }

  /**
   * Money in, money out and money invested across the book per month, off the statements.
   *
   * Self-transfers are left out on both sides: money moving between two of a customer's own
   * accounts was neither earned nor spent, and counting it would double every sweep. "Invested"
   * is the debits the statement files as investment — the SIP book as the ledger shows it each
   * month, which moves with the mandates, where holdings before the anchor do not.
   */
  private monthlyFlows(
    states: readonly CustomerState[],
    months: readonly string[],
  ): { inflow: number[]; outflow: number[]; invested: number[] } {
    const index = new Map(months.map((m, i) => [m, i]))
    const inflow = months.map(() => 0)
    const outflow = months.map(() => 0)
    const invested = months.map(() => 0)
    for (const s of states) {
      for (const t of s.file.transactions) {
        if (t.isSelfTransfer === true) continue
        const i = index.get(monthOf(t.txnDate))
        if (i === undefined) continue
        if (t.txnType === 'CREDIT') inflow[i] = (inflow[i] ?? 0) + t.txnAmount
        else {
          outflow[i] = (outflow[i] ?? 0) + t.txnAmount
          if (t.spendCategory === 'Investment') invested[i] = (invested[i] ?? 0) + t.txnAmount
        }
      }
    }
    const whole = (xs: number[]): number[] => xs.map((x) => Math.round(x))
    return { inflow: whole(inflow), outflow: whole(outflow), invested: whole(invested) }
  }
}
