/**
 * Overview — the pane the app opens on.
 *
 * Two things are true of this pane at once, and the order below is how they are reconciled.
 *
 * SmartWealth's `dashboard-home` opens on a portfolio: a dark hero carrying one enormous total,
 * two pastel stat cards, and a list of summary rows on a tinted strip. That is the shape being
 * adopted, and everything from `Where you stand` down is it.
 *
 * But `06-EXISTING-APP-MAP.md` §6 is explicit that the daily plan must not become a card on
 * somebody else's screen: *"demoted to a card on Dashboard › Overview, 'one action at a time'
 * stops being the shape of the app and becomes a widget."* So the plan is not below the
 * portfolio — the portfolio is below **it**. `Today` renders first and unchanged: the clock, the
 * safe-to-spend envelope, and exactly one action. This block is what you find under it, which is
 * the better argument for the plan than a tab of its own ever made — the number and the working
 * are one scroll apart rather than one tap.
 *
 * ## What the reference shows that this cannot
 *
 * - **Family Wealth** — the left stat card, an aggregated household figure with stacked member
 *   avatars. There is no household in this data; `dependents` is an integer on a profile. The
 *   slot takes the net position instead, which is a real number about the same person.
 * - **`Total Market Value`** — the hero's label. There is no price feed here, so nothing may
 *   claim a market value; the hero says what it is, which is what the customer recorded.
 * - **External Investments** promo banner — it advertises a CAS import that does not exist.
 * - **`Untagged Investments`** and the SmartJars row — no jars, and no tagging of holdings to
 *   them. `Plan` is this app's goal surface and it has a tab of its own.
 */
import type { ReactNode } from 'react'
import {
  CalendarClock,
  ChartPie,
  Plus,
  Receipt,
  Repeat,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import type { Account, Snapshot } from '@dhan/contracts'
import {
  Amount,
  Button,
  Card,
  Eyebrow,
  ListRow,
  Pill,
  Skeleton,
  TextLink,
} from '../../components/ui.tsx'
import { LegendRow, SegmentedBar, collapse, pct, series } from '../../components/charts/index.ts'
import type { Slice } from '../../components/charts/index.ts'
import { inr } from '../../lib/money.ts'
import { Empty, RowCard, StatBox } from './parts.tsx'
import type { Portfolio } from './portfolio.ts'
import type { PortfolioState } from './usePortfolio.ts'

export function Overview({
  snapshot,
  accounts,
  held,
  onEditHoldings,
  onOpenSpending,
  onOpenCommitments,
  onOpenAnalytics,
}: {
  snapshot: Snapshot
  accounts: readonly Account[]
  held: PortfolioState
  onEditHoldings: () => void
  onOpenSpending: () => void
  onOpenCommitments: () => void
  onOpenAnalytics: () => void
}): ReactNode {
  const p = held.portfolio

  return (
    <>
      <Eyebrow>Where you stand</Eyebrow>

      {held.loading ? (
        <Card>
          <span className="sr-only">Reading what you hold</span>
          <Skeleton h={15} w="40%" className="mb-3" />
          <Skeleton h={34} w="62%" />
        </Card>
      ) : held.error !== null ? (
        <Empty
          title="What you hold could not be read"
          action={
            <Button tone="secondary" size="sm" onClick={held.reload}>
              Try again
            </Button>
          }
        >
          {held.error} The rest of this screen is computed from your statements and is unaffected.
        </Empty>
      ) : p === null || p.total <= 0 ? (
        /* `total` is capital, and cover is not capital — so a customer holding two policies and
           nothing else lands here while the Holdings tab draws their Insurance group. Telling
           them "no insurance" in that state contradicts the tab beside it. */
        <Empty
          title={
            p !== null && p.coverInForce > 0 ? 'Cover, and nothing else' : 'Nothing recorded yet'
          }
          action={
            <Button size="sm" onClick={onEditHoldings}>
              <Plus size={16} strokeWidth={2.6} />
              Add what you own
            </Button>
          }
        >
          {p !== null && p.coverInForce > 0 ? (
            <>
              {inr(p.coverInForce)} of cover is on your record and it is under Protection on
              Holdings — but cover is not capital, so there is nothing here to value. IDBI publishes
              no holdings feed either: funds, deposits elsewhere, NPS and PPF are yours to fill in.
            </>
          ) : (
            <>
              IDBI publishes no holdings feed — no funds, no deposit book, no NPS, no insurance — so
              this block is yours to fill in. Until it has something in it we are advising into a
              vacuum: suggesting an equity fund to somebody who already holds three.
            </>
          )}
        </Empty>
      ) : (
        <Hero portfolio={p} />
      )}

      <div className="mb-3 grid grid-cols-2 gap-2.5">
        <StatBox
          tone="sky"
          label="Savings"
          meta={savingsMeta(accounts)}
          value={snapshot.balances.savings}
          caption="Available balance"
        />
        <StatBox
          tone="sage"
          label="Net position"
          value={snapshot.balances.total + snapshot.holdings.total - snapshot.debt.total}
          caption={
            snapshot.debt.total > 0
              ? `after ${inr(snapshot.debt.total)} owed`
              : 'savings and investments'
          }
        />
      </div>

      {/* The reference's tinted content strip. `#F3F4FA` is `--ground-deep`, and -mx-4 escapes
          the scroller's gutter so the band runs edge to edge while the cards stay on it. */}
      <div className="-mx-4 bg-ground-deep px-4 pb-1 pt-3">
        <RowCard>
          <ListRow
            icon={<Receipt size={22} strokeWidth={1.9} />}
            title="Spending"
            sub={spendingSub(snapshot)}
            value={<Amount value={spendingFigure(snapshot)} size="sm" />}
            onClick={onOpenSpending}
          />
        </RowCard>

        <RowCard>
          <ListRow
            icon={<Repeat size={22} strokeWidth={1.9} />}
            title="Commitments"
            sub={
              snapshot.commitments.total > 0
                ? `${snapshot.commitments.series.length} ${
                    snapshot.commitments.series.length === 1 ? 'mandate' : 'mandates'
                  } found in the ledger`
                : 'Nothing here reads as a mandate'
            }
            value={
              snapshot.commitments.total > 0 ? (
                <Amount value={snapshot.commitments.total} size="sm" />
              ) : undefined
            }
            onClick={onOpenCommitments}
          />
        </RowCard>

        {p !== null && p.total > 0 ? (
          <RowCard>
            <ListRow
              icon={<CalendarClock size={22} strokeWidth={1.9} />}
              title="Monthly mandates"
              sub={p.sipCount > 0 ? 'Going in every month, on your record' : 'Nothing running'}
              value={
                p.sipCount > 0 ? (
                  <span className="flex items-center gap-2.5">
                    <span className="text-[13px] text-ink-soft">Total : {p.sipCount}</span>
                    <span aria-hidden="true" className="h-4 w-px bg-hairline-mint" />
                    <Amount value={p.sipMonthly} size="sm" />
                  </span>
                ) : undefined
              }
            />
          </RowCard>
        ) : null}

        <Allocation
          slices={
            p !== null && p.byAssetClass.length > 0 ? p.byAssetClass : snapshotClasses(snapshot)
          }
          /* The snapshot only splits Equity from Debt, so a portfolio holding anything else
             sums to less than its own total. Passing the total makes that a visible grey
             remainder rather than two figures quietly rescaled to 100%. */
          total={p !== null && p.byAssetClass.length > 0 ? undefined : snapshot.holdings.total}
          onOpenAnalytics={onOpenAnalytics}
        />
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- Hero */

/*
 * The reference's `Total Market Value` hero, and the one place this pane deliberately breaks its
 * silhouette.
 *
 * SmartWealth's is a navy slab, and `03-PALETTE-MAP.md` sends navy to `--tint-ink`. It is not
 * drawn that way here, because `DESIGN.md` allows one ink card per screen and on this pane that
 * card is already spoken for: `Today`'s single action is the ink slab, and the action is the
 * thing this app is *for*. A second dark card competing with it would be adopting the
 * reference's emphasis along with its layout. So the hero is white and leads with the biggest
 * number in the block, which is the other half of the same rule, and the colour on this pane is
 * carried by the two pastel stat cards under it — which is where the reference puts colour too.
 *
 * The label is not "Total Market Value". There is no price feed in this app; `currentValue` is
 * what the customer typed, and a screen that calls it a market value is claiming a quote it
 * never had.
 */
function Hero({ portfolio }: { portfolio: Portfolio }): ReactNode {
  const up = (portfolio.gain ?? 0) >= 0
  return (
    <Card>
      <div className="text-[15px] font-medium text-ink-soft">What you hold</div>
      <div className="mb-1 mt-2">
        <Amount value={portfolio.total} size="xl" />
      </div>
      {portfolio.gain !== null ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {/* A pill, not coloured text: `text-good` and `text-danger` on white are a hue apart
              and nothing else, and the glyph plus the word beside it mean colour is never the
              only thing carrying which way this went. */}
          <Pill tone={up ? 'ok' : 'bad'}>
            {up ? (
              <TrendingUp size={13} strokeWidth={2.6} />
            ) : (
              <TrendingDown size={13} strokeWidth={2.6} />
            )}
            {up ? '+' : '−'}
            {inr(Math.abs(portfolio.gain))}
            {portfolio.gainPct !== null ? ` (${Math.abs(portfolio.gainPct).toFixed(1)}%)` : ''}
          </Pill>
          <span className="text-[13px] text-ink-soft">
            {up ? 'above' : 'below'} {inr(portfolio.invested ?? 0)} put in
          </span>
        </div>
      ) : null}
      <p className="mb-0 mt-3 text-xs leading-relaxed text-ink-soft">
        {portfolio.unpriced > 0 && portfolio.gain !== null
          ? `Your own record — IDBI sends no holdings feed. ${portfolio.unpriced} of these carry no invested amount, so they are outside the gain.`
          : 'Your own record — IDBI sends no holdings feed, so these are the values you entered rather than a live price.'}
      </p>
    </Card>
  )
}

/* ---------------------------------------------------------------- Allocation */

/*
 * The reference's `Asset Allocation` summary row: a stacked bar and a legend, under a title.
 *
 * Only one of its two allocation rows is here. The other, `Product Allocation`, is the same
 * picture of the same money and it is drawn properly one tab across; two 140px blocks saying
 * nearly the same thing is the reference's density without its information. The link is the
 * thing the reference does not have — its rows go nowhere.
 */
function Allocation({
  slices,
  total,
  onOpenAnalytics,
}: {
  slices: readonly Slice[]
  total?: number | undefined
  onOpenAnalytics: () => void
}): ReactNode {
  if (slices.length === 0) return null
  const resolved = series(collapse(slices), total)
  if (resolved.empty) return null

  return (
    <Card>
      <div className="flex items-center gap-2">
        <ChartPie size={18} strokeWidth={2} className="flex-none text-brand-deep" />
        <h2 className="min-w-0 flex-1">Asset allocation</h2>
      </div>
      <SegmentedBar slices={slices} total={total} className="mt-3.5" />
      <div className="mt-1 divide-y divide-solid divide-hairline-mint">
        {resolved.portions.map((portion, i) => (
          <LegendRow
            key={`${i}-${portion.label}`}
            tone={portion.tone}
            label={portion.label}
            value={pct(portion.share)}
            note={inr(portion.value)}
          />
        ))}
      </div>
      <div className="-mb-1.5 mt-1">
        <TextLink size="sm" flush onClick={onOpenAnalytics}>
          See the full breakdown
        </TextLink>
      </div>
    </Card>
  )
}

/* ---------------------------------------------------------------- Figures */

/** Equity and Debt as the snapshot knows them. The fallback when the rows cannot be read. */
function snapshotClasses(snapshot: Snapshot): Slice[] {
  return [
    { label: 'Equity', value: snapshot.holdings.equity },
    { label: 'Debt', value: snapshot.holdings.debt },
  ].filter((s) => s.value > 0)
}

/** What the customer chose to spend, observed where a normal month cannot be computed yet. */
function spendingFigure(snapshot: Snapshot): number {
  if (snapshot.discretionary.monthly > 0) return snapshot.discretionary.monthly
  return Math.round(snapshot.discretionary.byCategory.reduce((sum, [, amount]) => sum + amount, 0))
}

/* Short enough to stay on one line of a 68px row. The pane it links to says the rest. */
function spendingSub(snapshot: Snapshot): string {
  return snapshot.discretionary.monthly > 0
    ? 'A normal month, median of twelve'
    : 'Seen so far — under a month of it'
}

/** The account line on the savings stat card: the bank's own mask, or how many there are. */
function savingsMeta(accounts: readonly Account[]): string | undefined {
  const liquid = accounts.filter((a) => a.accountType === 'Savings' || a.accountType === 'Current')
  if (liquid.length === 0) return undefined
  if (liquid.length === 1) return liquid[0]?.accountNumberMasked.slice(-8)
  return `${liquid.length} accounts`
}
