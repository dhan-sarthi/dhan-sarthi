/**
 * Analytics — the portfolio broken down, on the charts built in step 1.
 *
 * The shape is `dashboard-analytics-tab`: collapsible sections, `Overall` open, the rest closed
 * with their value and share on the header row. Inside it, the three card types the analytics
 * video shows — a legend beside a donut, a stack of independent bars, and a three-column
 * exposure table with a tinted header band.
 *
 * Nothing here draws a chart of its own. `AllocationCard`, `BarList` and the donut come from
 * `components/charts/`, which already holds the positional colour rule, the "a series that does
 * not fill its whole leaves a hole" rule, and the three states the source never showed.
 *
 * The source's sub-tab chips (`Overall MF Analytics` · `Equity MF` · `Debt MF`) are not built:
 * they are the *same* feature filmed in an older build, and the dashboard tab this pane belongs
 * to uses sections for it. One device, not two.
 *
 * ## What the reference analyses that this data cannot
 *
 * Four of the reference's five analytics cards need data that does not exist anywhere in this
 * app, and the honest thing is to name them rather than fill them:
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
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Layers } from 'lucide-react'
import type { Snapshot } from '@dhan/contracts'
import { Button, Card, TextLink } from '../../components/ui.tsx'
import { AllocationCard, BarList, collapse, pct } from '../../components/charts/index.ts'
import type { Slice } from '../../components/charts/index.ts'
import { approx, inr } from '../../lib/money.ts'
import { CardHead, Empty, ExposureTable, Section } from './parts.tsx'
import type { ExposureRow } from './parts.tsx'
import type { Portfolio, Position } from './portfolio.ts'
import type { PortfolioState } from './usePortfolio.ts'

/** How many rows the exposure table shows before `View all`. The reference's own Top 5. */
const TOP = 5

export function Analytics({
  snapshot,
  held,
  onEditHoldings,
}: {
  snapshot: Snapshot
  held: PortfolioState
  onEditHoldings: () => void
}): ReactNode {
  const [open, setOpen] = useState<string | null>('Overall')
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

  if (p === null || p.total <= 0) {
    return (
      <div className="mt-3">
        <Empty
          title="Nothing to analyse yet"
          action={
            <Button size="sm" onClick={onEditHoldings}>
              Add what you own
            </Button>
          }
        >
          Every chart on this tab is a share of what you hold, and IDBI publishes no holdings feed.
          Record a fund, a deposit or a policy and the breakdown appears.
        </Empty>
      </div>
    )
  }

  const classes = classSections(p)
  const toggle = (id: string) => setOpen((current) => (current === id ? null : id))

  return (
    <div className="mt-3">
      <Section title="Overall" open={open === 'Overall'} onToggle={() => toggle('Overall')}>
        <AllocationCard
          title="Asset allocation"
          slices={p.byAssetClass}
          empty="Nothing recorded carries an asset class."
        />

        <AllocationCard title="Where it sits" slices={p.byGroup} empty="Nothing recorded yet." />

        <Exposure portfolio={p} />
      </Section>

      {classes.map((section) => (
        <Section
          key={section.label}
          title={section.label}
          figure={`${approx(section.value)} (${pct(section.value / p.total)})`}
          open={open === section.label}
          onToggle={() => toggle(section.label)}
        >
          <Card>
            <CardHead
              icon={<Layers size={22} strokeWidth={1.9} />}
              title={`What the ${section.label.toLowerCase()} is`}
              note={`${section.rows.length} ${section.rows.length === 1 ? 'holding' : 'holdings'} · share of this class`}
            />
            <div className="my-3.5 border-t border-solid border-hairline-mint" />
            <BarList rows={collapse(section.rows, 5)} total={section.value} />
          </Card>
        </Section>
      ))}

      {/* The reference draws four more cards than this data can carry. Saying which, once, is
          better than four cards of invented numbers — and it is the same contract the
          DataSourceRibbon holds everywhere else in the app. */}
      <Card>
        <h2>What is not here</h2>
        <p className="m-0 mt-1.5 text-sm leading-relaxed text-ink-mid">
          A market-cap and sector split, and a look-through to the individual securities inside each
          fund, need every scheme&rsquo;s portfolio disclosure — and debt characteristics like yield
          to maturity and modified duration need its factsheet. IDBI publishes neither, and nothing
          in {snapshot.quality.transactions} statement lines can stand in for them. The table above
          is your own largest positions, which is the part of that picture this data really does
          support.
        </p>
      </Card>
    </div>
  )
}

/* ---------------------------------------------------------------- Exposure */

/*
 * The reference's `Securities Exposure (Top 5)` card, over the holdings themselves.
 *
 * Its `View all` opens a screen the video never shows, so it opens the rest of the table in
 * place instead — there is no full list to route to, and inventing a destination for a link is
 * how a demo grows a dead end.
 */
function Exposure({ portfolio }: { portfolio: Portfolio }): ReactNode {
  const [all, setAll] = useState(false)
  const shown = all ? portfolio.largest : portfolio.largest.slice(0, TOP)
  const rows: ExposureRow[] = shown.map((position: Position) => ({
    name: position.name,
    type: position.assetClass,
    weight: pct(position.value / portfolio.total),
  }))

  return (
    <Card>
      <CardHead
        icon={<Layers size={22} strokeWidth={1.9} />}
        title={all ? 'Your positions' : `Largest positions (Top ${TOP})`}
        note={`${inr(portfolio.total)} across ${portfolio.largest.length} ${
          portfolio.largest.length === 1 ? 'holding' : 'holdings'
        }`}
      />
      <div className="my-3.5 border-t border-solid border-hairline-mint" />
      <ExposureTable
        caption="Your holdings by share of the portfolio"
        columns={['Name', 'Type', 'Weight(%)']}
        rows={rows}
      />
      {portfolio.largest.length > TOP ? (
        <div className="-mb-1.5 mt-1">
          <TextLink size="sm" flush ariaExpanded={all} onClick={() => setAll((v) => !v)}>
            {all ? `Show the top ${TOP}` : `View all ${portfolio.largest.length} positions`}
          </TextLink>
        </div>
      ) : null}
    </Card>
  )
}

/* ---------------------------------------------------------------- Sections */

interface ClassSection {
  label: string
  value: number
  rows: Slice[]
}

/**
 * One collapsed section per asset class that has anything in it, in the order the ramp hands out
 * colours — the same order the donut above them runs, so a section and its slice agree.
 */
function classSections(portfolio: Portfolio): ClassSection[] {
  return portfolio.byAssetClass.map((slice) => ({
    label: slice.label,
    value: slice.value,
    rows: portfolio.largest
      .filter((position) => position.assetClass === slice.label)
      .map((position) => ({ label: position.name, value: position.value })),
  }))
}
