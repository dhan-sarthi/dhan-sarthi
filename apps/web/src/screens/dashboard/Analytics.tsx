/**
 * Analytics — the portfolio broken down, on the charts built in step 1.
 *
 * Rebuilt from the nine `14-analytics` frames rather than from the three specs written about
 * them. The specs are right about the copy and wrong about nothing; what they cannot carry is
 * that the source's analytics screen is **two devices stacked**, and reading only the words gets
 * one of them.
 *
 * ## The two devices, and which job each has here
 *
 * The same screen was filmed twice, in two builds:
 *
 * - `14-analytics` (9 frames) drives it with a **filter chip row** — `Overall MF Analytics` ·
 *   `Equity MF` · `Debt MF` — with a one-line summary card under it (`Debt Holdings  ₹1.7L
 *   (40%)`) and then a flat stack of chart cards.
 * - `06-dashboard/04-dashboard-analytics-tab` (3 frames) drives it with an **accordion**, whose
 *   collapsed sections are named `Equity MF ₹17.5L (60.48%)` and `Debt MF ₹8.3L (30.48%)` —
 *   the same three scopes, spelled as bands instead of chips.
 *
 * The first pass built only the accordion and wrote the chips off as an older build. That was
 * the wrong call: they are not two builds of one control, they are one control and one *other*
 * control, and the source happens to use each for the other's job in a different cut. So both
 * are here, with the jobs split the way they only can be:
 *
 * - **Chips choose the money.** `Overall` and one chip per asset class actually held. That is
 *   the reference's own chip set — `Equity MF`, `Debt MF` — over the classes this app has.
 * - **Bands choose the analysis.** Allocation · Largest positions · What this cannot show, one
 *   open at a time, so the two closed bands sit flush against each other exactly as the
 *   reference's collapsed `Equity MF` / `Debt MF` rows do. An accordion whose sections are all
 *   open is a heading list; the rhythm in the frames comes from most of them being shut.
 *
 * Between them sits the third thing the frames have and the specs bury in a table row: the
 * **summary card**, a single 59px line with the scope's name on the left and its value and share
 * on the right. It is what tells you the chip did something.
 *
 * ## What the reference analyses that this data cannot
 *
 * Four of the reference's cards need data that does not exist anywhere in this app, and the
 * honest thing is to name them rather than fill them. They are listed on screen, under the last
 * band, and the list is scope-aware — the Debt scope names the debt gaps, the Equity scope names
 * the equity ones — because "we cannot show you a market-cap split" is a sentence about equity
 * and printing it under a PPF account is noise.
 *
 * - **Market Cap Distribution** (Large / Mid / Small) — needs each fund's portfolio disclosure.
 * - **Sector Allocation** — same, one level deeper.
 * - **Securities Exposure** — a *look-through* to the individual shares and bonds held inside
 *   each fund. What replaces it is the customer's own largest positions, which is the same
 *   table of the same shape over data that actually exists.
 * - **Characteristics** (portfolio YTM, average maturity, modified duration) — needs a debt
 *   fund's factsheet.
 *
 * `Asset Allocation` is the one that survives intact, because `assetClass` is on every holding.
 */
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ChartPie, Layers, ListTree, Network, Wallet } from 'lucide-react'
import type { Snapshot } from '@dhan/contracts'
import { Button, Card, TextLink } from '../../components/ui.tsx'
import { AllocationCard, BarList, collapse, pct } from '../../components/charts/index.ts'
import type { Slice } from '../../components/charts/index.ts'
import { useRipple } from '../../lib/motion.ts'
import { approx, inr } from '../../lib/money.ts'
import { CardHead, Empty, ExposureTable, Section } from './parts.tsx'
import type { ExposureRow } from './parts.tsx'
import type { Portfolio, Position } from './portfolio.ts'
import type { PortfolioState } from './usePortfolio.ts'

/** How many rows the exposure table shows before `View all`. The reference's own Top 5. */
const TOP = 5

/** The band that is open when a scope is first shown. One at a time — see the header comment. */
const FIRST_BAND = 'Allocation'

/* ---------------------------------------------------------------- Chips */

/*
 * The reference's `FilterChipRow`: three pills, left-aligned at the screen gutter, 8px apart,
 * ~28px tall and fully rounded. Active is a solid accent fill with a white label; inactive is a
 * white fill with a 1px tinted border and an accent-tinted label.
 *
 * Translated rather than recoloured. The fill is `accent` with `text-on-accent`, which is the
 * app's action pair at 5.8:1; the inactive border is `hairline-mint` and its label is
 * `accent-text`, because `DESIGN.md` reserves raw `accent` for fills and 13.5px of it on white
 * would be 2.6:1. Height goes to 36px: 28 is comfortable with a mouse and is under every
 * touch-target floor there is, and this row is the only way to change what the pane is about.
 *
 * `aria-pressed` rather than `role="tablist"`. There is already a tab row directly above this
 * one — the dashboard's own `Overview · SmartJars · Holdings · Spending · Analytics` — and two
 * nested tablists is the kind of thing that reads fine on screen and is a maze in a screen
 * reader. These are filters on one pane, and that is what a pressed toggle says.
 */
function ChipRow({
  scopes,
  active,
  onPick,
}: {
  scopes: readonly { id: string; label: string }[]
  active: string
  onPick: (id: string) => void
}): ReactNode {
  const ripple = useRipple()
  if (scopes.length < 2) return null
  return (
    /* -mx-4 + px-4 so the row scrolls edge to edge while the first chip still lines up with the
       cards under it, and the last one clears the right gutter. Five classes plus Overall does
       not fit 430px, and a wrapped chip row loses the "one line of scopes" read. */
    <div
      role="group"
      aria-label="What this pane analyses"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
    >
      {scopes.map((scope) => {
        const on = scope.id === active
        return (
          <button
            key={scope.id}
            type="button"
            onPointerDown={ripple}
            onClick={() => onPick(scope.id)}
            aria-pressed={on}
            className={`ds-press h-9 flex-none whitespace-nowrap rounded-pill px-3.5 text-[13.5px] font-semibold ${
              on
                ? 'border-0 bg-accent text-on-accent'
                : 'border border-solid border-hairline-mint bg-surface text-accent-text'
            }`}
          >
            {scope.label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------- Summary */

/*
 * The reference's `SummaryRow`: one 59px line, label left, figure right, no chevron, no icon,
 * no divider inside it. `Equity Holdings — ₹3.5L (60%)`, where the amount is bold and the share
 * in brackets is lighter.
 *
 * Not a `Card`: `Card`'s 16px padding makes this 70px and the shape is a *row*, which is the
 * whole reason the reference gives it its own component rather than a heading. Everything else
 * about it is `Card`'s — same radius, same hairline, same surface.
 */
function SummaryRow({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="mb-3 flex min-h-[59px] items-center gap-3 rounded-md border border-solid border-hairline-mint bg-surface px-4 py-3">
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{label}</span>
      <span className="flex-none text-[15px] tabular-nums">
        <span className="font-bold text-ink">{value}</span>{' '}
        <span className="text-ink-soft">({note})</span>
      </span>
    </div>
  )
}

/* ---------------------------------------------------------------- Screen */

export function Analytics({
  snapshot,
  held,
  onEditHoldings,
}: {
  snapshot: Snapshot
  held: PortfolioState
  onEditHoldings: () => void
}): ReactNode {
  const [scope, setScope] = useState('Overall')
  const [band, setBand] = useState<string | null>(FIRST_BAND)
  const p = held.portfolio

  if (held.loading) {
    return (
      <div className="mt-3">
        <Card>
          <span className="sr-only">Reading what you hold</span>
          <p className="m-0 text-sm text-ink-soft">Reading what you hold…</p>
        </Card>
      </div>
    )
  }

  if (held.error !== null) {
    return (
      <div className="mt-3">
        <Empty
          title="What you hold could not be read"
          action={
            <Button tone="secondary" size="sm" onClick={held.reload}>
              Try again
            </Button>
          }
        >
          {held.error} Nothing on this tab can be drawn without it — every figure here is a share of
          what you own.
        </Empty>
      </div>
    )
  }

  /*
   * Two different empties, because "you have recorded nothing" and "what you have recorded is
   * cover" are different facts and the customer can tell.
   *
   * `total` is capital only — a sum assured is not a value you can take a share of — so a
   * customer holding two policies and nothing else has `total === 0` while the Holdings tab
   * beside this one draws their Insurance group. Saying "record a policy and the breakdown
   * appears" to somebody who has recorded two is the kind of thing that makes a reviewer stop
   * believing the rest of the screen.
   */
  if (p === null || p.total <= 0) {
    const coverOnly = p !== null && p.coverInForce > 0
    return (
      <div className="mt-3">
        <Empty
          title={coverOnly ? 'Cover is not a share of anything' : 'Nothing to analyse yet'}
          action={
            <Button size="sm" onClick={onEditHoldings}>
              Add what you own
            </Button>
          }
        >
          {coverOnly ? (
            <>
              Every chart on this tab is a share of what you hold, and {inr(p.coverInForce)} of
              cover is not capital — there is no portfolio to divide it into. It is on Holdings,
              under Protection. Record a fund or a deposit and the breakdown appears.
            </>
          ) : (
            <>
              Every chart on this tab is a share of what you hold, and IDBI publishes no holdings
              feed. Record a fund, a deposit or a policy and the breakdown appears.
            </>
          )}
        </Empty>
      </div>
    )
  }

  return (
    <Analysed
      portfolio={p}
      lines={snapshot.quality.transactions}
      scope={scope}
      band={band}
      onScope={(id) => {
        setScope(id)
        /* A new scope opens on its first band. Carrying `What this cannot show` across a chip
           press would land the customer on the apology for a class they just asked about. */
        setBand(FIRST_BAND)
      }}
      onBand={setBand}
    />
  )
}

/* ---------------------------------------------------------------- Scoped pane */

function Analysed({
  portfolio,
  lines,
  scope,
  band,
  onScope,
  onBand,
}: {
  portfolio: Portfolio
  lines: number
  scope: string
  band: string | null
  onScope: (id: string) => void
  onBand: (id: string | null) => void
}): ReactNode {
  /* One chip per asset class that has anything in it, in the order the ramp hands out colours —
     so a chip, its slice on the Overall donut and its section all agree on which green it is. */
  const scopes = useMemo(
    () => [
      { id: 'Overall', label: 'Overall' },
      ...portfolio.byAssetClass.map((s) => ({ id: s.label, label: s.label })),
    ],
    [portfolio],
  )
  const current = scopes.some((s) => s.id === scope) ? scope : 'Overall'
  const view = useMemo(() => viewOf(portfolio, current), [portfolio, current])

  const toggle = (id: string) => onBand(band === id ? null : id)
  const rows: ExposureRow[] = view.positions.map((position: Position) => ({
    name: position.name,
    type: position.assetClass,
    weight: pct(position.value / portfolio.total),
  }))

  return (
    <div className="mt-3">
      <ChipRow scopes={scopes} active={current} onPick={onScope} />

      <div className="mt-3">
        <SummaryRow label={view.summary} value={approx(view.value)} note={view.share} />
      </div>

      <Section
        title="Allocation"
        open={band === 'Allocation'}
        onToggle={() => toggle('Allocation')}
      >
        {/* A donut needs two slices to be a donut. `AllocationCard` draws a closed ring at 100%
            on purpose and that state is right where a chart is expected — but here it would be a
            second card, under a first card, saying the same 100% the summary row already said. A
            customer holding one PPF account gets the bar list and no picture of the number 100.
            Every frame in `14-analytics` has four slices; this case is ours, not theirs. */}
        {view.donuts
          .filter((donut) => donut.slices.length > 1)
          .map((donut) => (
            <AllocationCard
              key={donut.title}
              icon={donut.icon}
              title={donut.title}
              note={donut.note}
              slices={donut.slices}
              donutSize={donutSize(donut.slices.length)}
              empty={donut.empty}
            />
          ))}
        <Card>
          <CardHead
            icon={<Layers size={22} strokeWidth={1.9} />}
            title={view.barTitle}
            note={`${count(view.positions.length, 'holding')} · share of ${view.of}`}
          />
          <div className="my-3.5 border-t border-solid border-hairline-mint" />
          <BarList rows={collapse(view.bars, 5)} total={view.value} />
        </Card>
      </Section>

      <Section
        title="Exposure"
        figure={topLabel(view.positions.length)}
        open={band === 'Largest'}
        onToggle={() => toggle('Largest')}
      >
        <Exposure rows={rows} total={view.value} of={view.of} />
      </Section>

      <Section title="What this cannot show" open={band === 'Gaps'} onToggle={() => toggle('Gaps')}>
        <Card>
          {/* The glyph is the reference's own `Characteristics` org-chart mark, which is the
              card this one is standing in for: a look-through into a scheme is a hierarchy, and
              this is the card that says the hierarchy is not published. */}
          <CardHead
            icon={<Network size={22} strokeWidth={1.9} />}
            title="What is not here"
            note={`${words(view.gaps.length)} the reference draws that IDBI cannot`}
          />
          <div className="my-3.5 border-t border-solid border-hairline-mint" />
          <ul className="m-0 list-none p-0">
            {view.gaps.map((gap) => (
              <li
                key={gap.title}
                className="border-0 border-b border-solid border-hairline-mint py-3 first:pt-0 last:border-b-0 last:pb-0"
              >
                <span className="block text-[15px] font-semibold text-ink">{gap.title}</span>
                <span className="mt-0.5 block text-[13.5px] leading-relaxed text-ink-soft">
                  {gap.why}
                </span>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-3.5 text-[13.5px] leading-relaxed text-ink-mid">
            None of it is drawn from a placeholder. Nothing in {lines} statement lines can stand in
            for a scheme&rsquo;s portfolio disclosure, and what Exposure shows instead is your own
            positions — the part of that picture this data really does support.
          </p>
        </Card>
      </Section>
    </div>
  )
}

/* ---------------------------------------------------------------- Exposure */

/*
 * The reference's `Securities Exposure (Top 5)` card, over the holdings themselves.
 *
 * Its `View all` opens a screen the video never shows, so it opens the rest of the table in
 * place instead — there is no full list to route to, and inventing a destination for a link is
 * how a demo grows a dead end. The affordance itself is the reference's: a bare accent word at
 * the card's own content edge, no chevron, no underline, no rule above it.
 */
function Exposure({
  rows,
  total,
  of,
}: {
  rows: readonly ExposureRow[]
  total: number
  of: string
}): ReactNode {
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, TOP)

  /* The reference sets this title two-tone — `Securities Exposure` bold, ` (Top 5)` smaller and
     grey on the same baseline. `CardHead` takes one string, so the qualifier goes on its second
     line, where it can also say what the top five are five *of*. And it only says "top" when
     something is actually being held back: `(Top 5)` over a table of two rows is the source's
     placeholder speaking, not the data. */
  const note =
    rows.length > TOP && !all
      ? `Top ${TOP} of ${rows.length} · ${inr(total)} in ${of}`
      : `${inr(total)} across ${count(rows.length, 'holding')} in ${of}`

  return (
    <Card>
      <CardHead
        icon={<ListTree size={22} strokeWidth={1.9} />}
        title="Largest positions"
        note={note}
      />
      <div className="my-3.5 border-t border-solid border-hairline-mint" />
      <ExposureTable
        caption="Your holdings by share of the portfolio"
        columns={['Name', 'Type', 'Weight(%)']}
        rows={shown}
      />
      {rows.length > TOP ? (
        <div className="-mb-1.5 mt-1">
          <TextLink size="sm" flush ariaExpanded={all} onClick={() => setAll((v) => !v)}>
            {all ? `Show the top ${TOP}` : `View all ${rows.length} positions`}
          </TextLink>
        </div>
      ) : null}
    </Card>
  )
}

/* ---------------------------------------------------------------- Scopes */

interface Gap {
  title: string
  why: string
}

interface View {
  /** The summary row's label: `Debt holdings`. */
  summary: string
  /** What the cards are shares *of*, in a sentence: `your portfolio`, `the debt`. */
  of: string
  value: number
  share: string
  positions: Position[]
  donuts: {
    icon: ReactNode
    title: string
    note?: string | undefined
    slices: Slice[]
    empty: string
  }[]
  barTitle: string
  bars: Slice[]
  gaps: Gap[]
}

/* The gaps, by the scope they are a gap in. Equity's two are about looking *inside* a fund;
   Debt's are about a factsheet; the look-through applies to both and to Overall. */
const LOOK_THROUGH: Gap = {
  title: 'What each fund holds',
  why: 'A look-through to the individual shares and bonds inside a scheme needs its portfolio disclosure. IDBI publishes none, so Exposure lists your own positions instead.',
}
const EQUITY_GAPS: Gap[] = [
  {
    title: 'Market cap distribution',
    why: 'Large, mid and small cap shares of an equity holding are properties of the scheme, not of your record of it.',
  },
  {
    title: 'Sector allocation',
    why: 'The same disclosure, one level deeper — financials, energy, healthcare.',
  },
]
const DEBT_GAPS: Gap[] = [
  {
    title: 'Portfolio YTM and modified duration',
    why: 'Yield to maturity, average maturity and modified duration come off a debt scheme’s monthly factsheet. There is no factsheet feed here.',
  },
  {
    title: 'Instrument type and credit rating',
    why: 'Debenture, SOV, AA+ — the instrument and rating mix is inside the scheme, not in what you recorded.',
  },
]
const PRICE_GAP: Gap = {
  title: 'A live valuation',
  why: 'Every figure here is the value you recorded, not a NAV. There is no price feed in this app, so nothing on this pane says “market value”.',
}

function viewOf(portfolio: Portfolio, scope: string): View {
  if (scope === 'Overall') {
    return {
      summary: 'All holdings',
      of: 'your portfolio',
      value: portfolio.total,
      share: count(portfolio.largest.length, 'holding'),
      positions: portfolio.largest,
      donuts: [
        {
          icon: <ChartPie size={22} strokeWidth={1.9} />,
          title: 'Asset allocation',
          note: 'By what the money is invested in',
          slices: portfolio.byAssetClass,
          empty: 'Nothing recorded carries an asset class.',
        },
        {
          icon: <Wallet size={22} strokeWidth={1.9} />,
          title: 'Where it sits',
          note: 'By the kind of account holding it',
          slices: portfolio.byGroup,
          empty: 'Nothing recorded yet.',
        },
      ],
      barTitle: 'Every holding, by weight',
      bars: portfolio.largest.map((position) => ({
        label: position.name,
        value: position.value,
      })),
      gaps: [LOOK_THROUGH, ...EQUITY_GAPS.slice(0, 1), ...DEBT_GAPS.slice(0, 1), PRICE_GAP],
    }
  }

  const positions = portfolio.largest.filter((position) => position.assetClass === scope)
  const value = positions.reduce((n, position) => n + position.value, 0)
  const groups = new Map<string, number>()
  for (const position of positions) {
    const label = groupLabel(position)
    groups.set(label, (groups.get(label) ?? 0) + position.value)
  }
  const byGroup: Slice[] = [...groups].map(([label, v]) => ({ label, value: v }))
  const lower = scope.toLowerCase()

  return {
    summary: `${scope} holdings`,
    of: `the ${lower}`,
    value,
    share: pct(portfolio.total > 0 ? value / portfolio.total : 0),
    positions,
    /* One donut, not two: within a class the asset-class split is the class itself, so the only
       mix left to draw is which kind of account it sits in — and a one-slice donut is drawn
       rather than skipped, because `AllocationCard` has a closed-ring single-slice state and a
       card that vanishes when a customer holds one thing looks like a bug. */
    donuts: [
      {
        icon: <Wallet size={22} strokeWidth={1.9} />,
        title: `Where the ${lower} sits`,
        note: 'By the kind of account holding it',
        slices: byGroup,
        empty: `Nothing recorded is ${lower}.`,
      },
    ],
    barTitle: `What the ${lower} is`,
    bars: positions.map((position) => ({ label: position.name, value: position.value })),
    gaps: [
      LOOK_THROUGH,
      ...(scope === 'Equity' ? EQUITY_GAPS : []),
      ...(scope === 'Debt' ? DEBT_GAPS : []),
      PRICE_GAP,
    ],
  }
}

/* ---------------------------------------------------------------- Words */

const GROUP_LABELS: Record<Position['group'], string> = {
  funds: 'Mutual funds',
  deposits: 'Deposits',
  retirement: 'PPF and NPS',
  cover: 'Insurance',
}

function groupLabel(position: Position): string {
  return GROUP_LABELS[position.group]
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

const NUMBERS = ['Nothing', 'One thing', 'Two things', 'Three things', 'Four things']

/** `Four things …`. Small counts read as words in a caption; the list under it does the counting. */
function words(n: number): string {
  return NUMBERS[n] ?? `${n} things`
}

/** The figure on the collapsed `Largest positions` band. `Top 5 of 12`, or just the count. */
function topLabel(n: number): string {
  return n > TOP ? `Top ${TOP} of ${n}` : count(n, 'holding')
}

/**
 * The donut's outer diameter, from how many slices are in it.
 *
 * 138px is the measured chart and it is what the frames show — but every donut in those frames
 * has **four** legend rows beside it, and 138 is balanced against a 4×41px legend column. This
 * app's portfolios are smaller: a customer holding a PPF account and an NPS account gets a
 * two-row legend, and at 138 the ring stops being a chart beside a list and becomes a large
 * green disc with a caption. One holding is worse again — a closed ring at 100%, three times
 * the height of the single line explaining it.
 *
 * So the ring is sized to the legend it sits next to and tops out at the measured 138. The ratio,
 * the 3-o'clock start and the 2px gaps do not move; only the diameter does, which is exactly what
 * `DonutChart`'s `size` is for.
 */
function donutSize(slices: number): number {
  if (slices >= 4) return 138
  if (slices === 3) return 126
  if (slices === 2) return 112
  return 96
}
