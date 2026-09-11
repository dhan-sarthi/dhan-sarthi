/**
 * The portfolio, as the three dashboard panes need to read it.
 *
 * A plain `.ts` with no JSX and no runtime imports, for the reason `charts/series.ts` gives for
 * being one: the parts of this that can be wrong in a way nobody notices are all arithmetic — a
 * gain quoted over rows that have no cost, a sum assured added to a portfolio total, a group's
 * share taken against the wrong whole. Those are in `portfolio.test.ts`; the fetch that feeds
 * them is in `usePortfolio.ts` and the `.tsx` files are then only markup.
 *
 * `View` carries four numbers about what a customer owns — `snapshot.holdings.total`, `.equity`,
 * `.debt` and `.sipMonthly` — and a dashboard cannot be built from four numbers. The rows are
 * behind `GET /api/v1/holdings`, so this file fetches them once for the whole surface and turns
 * them into the shapes a group card, a donut and a table each want.
 *
 * ## What is in here and what is not
 *
 * The holdings block is **the app's own record**, not a bank feed: IDBI publishes no mutual
 * fund, deposit book, NPS or insurance endpoint, and a consented Account Aggregator pull returns
 * other banks' deposit accounts rather than a portfolio. `routes/holdings.ts` says so at length.
 * Two consequences run through every screen built on this file.
 *
 * - **A term deposit held at IDBI is not a holding.** It arrives as an account on 394 and is
 *   already in `view.accounts` and in `snapshot.balances.deposits`. Counting it here as well
 *   would double it in every figure on the surface, so the groups below are the declared block
 *   and nothing else — which is also what `snapshot.holdings.total` sums, so the hero, the group
 *   cards and the analytics all reconcile against one total. IDBI's own deposits stay in the
 *   account list further down the Holdings pane, where the bank put them.
 * - **`currentValue` is what the customer typed**, not a live NAV. There is no price feed in
 *   this app, so nothing here may say "market value". `gain` is only offered where an invested
 *   amount was actually recorded beside the value; `unpriced` counts the rows where it was not,
 *   and the group card says so rather than showing a gain computed against a zero.
 *
 * SmartWealth's Holdings tab also carries a **Demat** group and its analytics do a look-through
 * into the securities *inside* each fund. Neither exists here — there is no demat feed and no
 * portfolio disclosure — so neither is drawn. The nearest honest thing, and what the exposure
 * table shows instead, is the customer's own largest positions.
 */
import type { Holding, HoldingsResponse } from '@dhan/contracts'
import type { Slice } from '../../components/charts/index.ts'

/**
 * Reads the declared holdings block. Injected, the way `TransactionSource` is: the offline tier
 * answers from the ledger it generated rather than from a socket that is not there.
 */
export type HoldingsSource = () => Promise<HoldingsResponse>

/* ---------------------------------------------------------------- Model */

/** The four kinds of thing a customer can record, in the order a portfolio is read in. */
export type GroupId = 'funds' | 'deposits' | 'retirement' | 'cover'

const GROUP_OF: Record<Holding['holdingType'], GroupId> = {
  MUTUAL_FUND: 'funds',
  FD: 'deposits',
  RD: 'deposits',
  PPF: 'retirement',
  NPS: 'retirement',
  INSURANCE: 'cover',
}

export interface Position {
  id: string
  name: string
  group: GroupId
  assetClass: Holding['assetClass']
  /** `currentValue`, as recorded. For a policy this is the cover, not capital. */
  value: number
  /** Null where no invested amount was recorded — which is most of them, and is not a zero. */
  invested: number | null
  /** 0 where no mandate is running. */
  sipMonthly: number
  sipDay: number | null
  maturity: string | null
  rate: number | null
  /** Bought somewhere else. IDBI did not sell it and we do not churn it. */
  external: boolean
}

export interface Group {
  id: GroupId
  label: string
  /** Capital, or cover. A policy's sum assured is not a value you can add to a portfolio. */
  kind: 'capital' | 'cover'
  positions: Position[]
  value: number
  /** Sum of the recorded invested amounts, or null where not one row carries one. */
  invested: number | null
  gain: number | null
  gainPct: number | null
  /** Rows with a value but no invested amount, so their share of the gain is unknown. */
  unpriced: number
  sipMonthly: number
}

export interface Portfolio {
  groups: Group[]
  positions: Position[]
  /** Capital only. Cover is counted in `coverInForce`, never added to this. */
  total: number
  invested: number | null
  gain: number | null
  gainPct: number | null
  unpriced: number
  sipMonthly: number
  sipCount: number
  coverInForce: number
  /** Equity / Debt / Hybrid / Gold, by value. Ready for a donut or a segmented bar. */
  byAssetClass: Slice[]
  /** Funds / Deposits / PPF & NPS, by value. Cover is excluded — it is not capital. */
  byGroup: Slice[]
  /** Largest positions first, for the exposure table. */
  largest: Position[]
}

/**
 * Every kind of holding this app knows about, present or not.
 *
 * Exported because the Holdings pane's product strip draws the *shelf*, not the portfolio: the
 * reference's carousel has a tile for a product the customer holds none of, carrying a call to
 * action where the figure would be (`05-dashboard-home-alt-header.md` — the one real empty state
 * in the source footage). A screen cannot show the gap in a portfolio from the groups that exist.
 */
export const GROUP_CATALOGUE: readonly { id: GroupId; label: string; kind: Group['kind'] }[] = [
  { id: 'funds', label: 'Mutual funds', kind: 'capital' },
  { id: 'deposits', label: 'Deposits', kind: 'capital' },
  { id: 'retirement', label: 'PPF and NPS', kind: 'capital' },
  { id: 'cover', label: 'Insurance', kind: 'cover' },
]

/** The order the ramp hands colours out in. Positional, so this is an order, not a meaning. */
const CLASSES: readonly Holding['assetClass'][] = ['Equity', 'Debt', 'Hybrid', 'Gold']

const money = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0)

/**
 * One recorded thing, as a position.
 *
 * **A policy is read differently, and it has to be.** `Holding` has one pair of money fields and
 * a term policy uses them the other way round: `investedAmount` carries the *sum assured* and
 * `currentValue` is zero, because pure cover has no surrender value. That is not a quirk of the
 * fixtures — `derive.ts` sums `investedAmount` over the policies to get `lifeCoverInForce`, so it
 * is the contract. Read naively, a ₹1 crore term plan renders as a holding worth ₹0 that has lost
 * ₹1 crore. So a cover position takes the sum assured as its figure and carries **no cost at
 * all**: there is no gain on an insurance policy, and the absence is the honest answer rather
 * than a missing one.
 */
function positionOf(h: Holding, id: string, cover: boolean): Position {
  const invested = money(h.investedAmount)
  return {
    id,
    name: h.name,
    group: cover ? 'cover' : GROUP_OF[h.holdingType],
    assetClass: h.assetClass,
    value: cover ? invested || money(h.currentValue) : money(h.currentValue),
    invested: cover || invested <= 0 ? null : invested,
    sipMonthly: h.sipActive ? money(h.sipAmount ?? 0) : 0,
    sipDay: h.sipDebitDay ?? null,
    maturity: h.maturityDate ?? null,
    rate: h.interestRate ?? null,
    external: h.heldOutsideIdbi === true,
  }
}

function groupOf(id: GroupId, label: string, kind: Group['kind'], rows: Position[]): Group {
  const value = rows.reduce((n, p) => n + p.value, 0)
  const priced = kind === 'cover' ? [] : rows.filter((p) => p.invested !== null)
  const invested = priced.length > 0 ? priced.reduce((n, p) => n + (p.invested ?? 0), 0) : null
  /* A gain is only quotable over the rows that carry a cost. Comparing the whole group's value
     against the invested amount of half of it is the arithmetic that makes a flat portfolio look
     like it doubled. */
  const pricedValue = priced.reduce((n, p) => n + p.value, 0)
  const gain = invested === null ? null : pricedValue - invested
  return {
    id,
    label,
    kind,
    positions: rows,
    value,
    invested,
    gain,
    gainPct: gain === null || invested === null || invested <= 0 ? null : (gain / invested) * 100,
    /* Cover is never unpriced. It has no price, which is a different thing, and prompting for
       one would ask the customer to enter a number that does not exist. */
    unpriced: kind === 'cover' ? 0 : rows.filter((p) => p.invested === null).length,
    sipMonthly: rows.reduce((n, p) => n + p.sipMonthly, 0),
  }
}

/**
 * Build the whole model from one holdings response.
 *
 * Policies arrive in their own array because suitability reads cover differently from capital,
 * and that separation is kept all the way to the screen: the cover group is drawn beside the
 * others but its figure never enters `total`.
 */
export function portfolioOf(held: HoldingsResponse): Portfolio {
  /* The block's own id, prefixed by which array it came from: `holdings` and `policies` are two
     id spaces and a React key has to be unique across the merged list. */
  const positions = [
    ...held.holdings.map((h) => positionOf(h, `h:${h.holdingId}`, false)),
    ...held.policies.map((h) => positionOf(h, `p:${h.holdingId}`, true)),
  ]

  const groups = GROUP_CATALOGUE.map((g) =>
    groupOf(
      g.id,
      g.label,
      g.kind,
      positions.filter((p) => p.group === g.id),
    ),
  ).filter((g) => g.positions.length > 0)

  const capital = positions.filter((p) => p.group !== 'cover')
  const total = capital.reduce((n, p) => n + p.value, 0)
  const priced = capital.filter((p) => p.invested !== null)
  const invested = priced.length > 0 ? priced.reduce((n, p) => n + (p.invested ?? 0), 0) : null
  const gain = invested === null ? null : priced.reduce((n, p) => n + p.value, 0) - invested

  const byAssetClass: Slice[] = CLASSES.map((c) => ({
    label: c,
    value: capital.filter((p) => p.assetClass === c).reduce((n, p) => n + p.value, 0),
  })).filter((s) => s.value > 0)

  const byGroup: Slice[] = groups
    .filter((g) => g.kind === 'capital' && g.value > 0)
    .map((g) => ({ label: g.label, value: g.value }))

  return {
    groups,
    positions,
    total,
    invested,
    gain,
    gainPct: gain === null || invested === null || invested <= 0 ? null : (gain / invested) * 100,
    unpriced: capital.filter((p) => p.invested === null).length,
    sipMonthly: capital.reduce((n, p) => n + p.sipMonthly, 0),
    sipCount: capital.filter((p) => p.sipMonthly > 0).length,
    coverInForce: positions.filter((p) => p.group === 'cover').reduce((n, p) => n + p.value, 0),
    byAssetClass,
    byGroup,
    largest: [...capital].sort((a, b) => b.value - a.value),
  }
}
