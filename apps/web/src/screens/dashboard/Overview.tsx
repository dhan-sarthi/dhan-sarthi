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
 *   them. `Plan` is this app's goal surface and it has a tab of its own. The row in that slot is
 *   the nearest thing this data has: the holdings recorded with a value but no cost, which is
 *   why the hero above cannot quote a gain on all of it.
 * - The **carousel page dots** under their promo banner. They page a two-slide carousel of which
 *   only one slide is ever shown in the footage; there is no second slide here to page.
 *
 * ## What the parity pass on this pane changed
 *
 * The rows. Theirs carry a status chip under the title and one or two *labelled* figures on the
 * right (`Bought : ₹3.5K` over `Sold : ₹8.4K`); ours carried a grey sentence and a bare amount,
 * which is the same skeleton at half the density. Every chip below is a verdict the snapshot
 * already holds — a spending trend, a mandate that has gone quiet — and not one of them is a
 * word invented to fill the slot. Their two allocation cards are both here now, drawn as
 * `AllocationRow`: theirs are the same picture twice because both are demo data, ours are the
 * money by product and the money by asset class, which are two different pictures.
 */
import type { ReactNode } from 'react'
import {
  Blocks,
  CalendarClock,
  ChartPie,
  Plus,
  Receipt,
  Repeat,
  Tag,
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
import type { Slice } from '../../components/charts/index.ts'
import { inr } from '../../lib/money.ts'
import { AllocationRow, Empty, Figures, PromoCard, RowCard, StatBox } from './parts.tsx'
import type { Portfolio } from './portfolio.ts'
import type { PortfolioState } from './usePortfolio.ts'
import { Art } from '../../components/Art.tsx'

export function Overview({
  snapshot,
  accounts,
  held,
  onEditHoldings,
  onLinkAccounts,
  onOpenSpending,
  onOpenCommitments,
  onOpenAnalytics,
}: {
  snapshot: Snapshot
  accounts: readonly Account[]
  held: PortfolioState
  onEditHoldings: () => void
  onLinkAccounts: () => void
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

      {/* Their `External Investments` banner sits between the stat cards and the tab row, and
          it advertises an import of holdings held somewhere else. This app has no CAS pull, so
          the banner points at the thing it *can* do: consented account linking, which is the
          same promise — count the money that is not held here — against an integration that
          exists. `LinkAccountsSheet` is the real job behind it. */}
      <PromoCard title="Money held elsewhere" onClick={onLinkAccounts}>
        Link accounts at other banks and every figure on this screen counts all of your money, not
        just the part IDBI can see.
      </PromoCard>

      {/* The reference's tinted content strip. `#F3F4FA` is `--ground-deep`, and -mx-4 escapes
          the scroller's gutter so the band runs edge to edge while the cards stay on it. */}
      <div className="-mx-4 bg-ground-deep px-4 pb-1 pt-3">
        <RowCard>
          <ListRow
            icon={<Receipt size={22} strokeWidth={1.9} />}
            title="Spending"
            sub={<Trend snapshot={snapshot} />}
            value={
              <Figures
                rows={[{ label: monthLabel(snapshot), value: inr(spendingFigure(snapshot)) }]}
              />
            }
            onClick={onOpenSpending}
          />
        </RowCard>

        <RowCard>
          <ListRow
            icon={<Repeat size={22} strokeWidth={1.9} />}
            title="Commitments"
            sub={<Mandates snapshot={snapshot} />}
            value={
              snapshot.commitments.total > 0 ? (
                <Figures
                  rows={[
                    { label: 'A month', value: inr(snapshot.commitments.total) },
                    { label: 'A year', value: inr(annualCommitted(snapshot)) },
                  ]}
                />
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
                  <Figures
                    rule
                    rows={[{ label: 'Total', value: p.sipCount }, { value: inr(p.sipMonthly) }]}
                  />
                ) : undefined
              }
            />
          </RowCard>
        ) : null}

        {/* Their fourth row is `Untagged Investments` — holdings the app could not attach to a
            goal. Nothing here tags a holding to anything, so the slot takes the gap this data
            actually has: rows carrying a value with no cost beside them, which is the reason the
            hero's gain covers only part of the total. It appears only when there are some. */}
        {p !== null && p.unpriced > 0 ? (
          <RowCard>
            <ListRow
              icon={<Tag size={22} strokeWidth={1.9} />}
              title="Recorded without a cost"
              sub={<Pill tone="warn">Outside the gain</Pill>}
              value={
                <Figures
                  rows={[{ label: p.unpriced === 1 ? 'Entry' : 'Entries', value: p.unpriced }]}
                />
              }
              onClick={onEditHoldings}
            />
          </RowCard>
        ) : null}

        {/* Their `Product Allocation`. Theirs and ours differ in what they can say: theirs splits
            Mutual Fund from Deposit across a book it imported, ours splits the declared block by
            the kind of thing each row is. Cover is not in it — a sum assured is not capital. */}
        {p !== null && p.byGroup.length > 1 ? (
          <AllocationRow
            icon={<Blocks size={20} strokeWidth={2} />}
            title="Product allocation"
            slices={p.byGroup}
          />
        ) : null}

        <AllocationRow
          icon={<ChartPie size={20} strokeWidth={2} />}
          title="Asset allocation"
          slices={
            p !== null && p.byAssetClass.length > 0 ? p.byAssetClass : snapshotClasses(snapshot)
          }
          /* The snapshot only splits Equity from Debt, so a portfolio holding anything else
             sums to less than its own total. Passing the total makes that a visible grey
             remainder rather than two figures quietly rescaled to 100%. */
          total={p !== null && p.byAssetClass.length > 0 ? undefined : snapshot.holdings.total}
          link={
            <TextLink size="sm" flush onClick={onOpenAnalytics}>
              See the full breakdown
            </TextLink>
          }
        />
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- Row status */

/*
 * The chip under a row title.
 *
 * Every SmartWealth Overview row carries one — `In Process`, `Needs attention`, `On Track` — and
 * it is what makes their list scannable rather than four sentences in a column. The rule here is
 * that a chip must be a verdict the snapshot already holds. `discretionary.trend` is one the
 * engine computes over eleven months of statement; whether a detected series is still `active` is
 * another. Neither is a word chosen to fill the slot, which is the only reason they are chips.
 */
function Trend({ snapshot }: { snapshot: Snapshot }): ReactNode {
  const { trend, trendPct } = snapshot.discretionary
  const move = Math.abs(Math.round(trendPct))
  /* Two or three words, like theirs. A chip that wraps to three lines pushes the row past 68px
     and the column of chips stops being a thing the eye can run down, which is the whole job. */
  if (trend === 'rising' && move > 0) {
    return (
      <Pill tone="warn">
        <TrendingUp size={12} strokeWidth={2.8} />
        Up {move}%
      </Pill>
    )
  }
  if (trend === 'falling' && move > 0) {
    return (
      <Pill tone="ok">
        <TrendingDown size={12} strokeWidth={2.8} />
        Down {move}%
      </Pill>
    )
  }
  return <Pill>Steady</Pill>
}

function Mandates({ snapshot }: { snapshot: Snapshot }): ReactNode {
  const all = snapshot.commitments.series
  if (all.length === 0) return <>Nothing here reads as a mandate</>
  const quiet = all.filter((one) => !one.active).length
  if (quiet === 0) return <Pill tone="ok">All {all.length} live</Pill>
  /* "Gone quiet" and not "cancelled": the ledger stopped showing the charge, which is evidence
     about the statement and not a decision anybody told us about. */
  return (
    <Pill tone="warn">
      {quiet} of {all.length} quiet
    </Pill>
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
      {/* The reference puts an illustration in this card beside the figure, and it is most of why
          the card reads as designed rather than as a number in a box. Ours is `items-end` so the
          mark sits on the same baseline as the total instead of floating beside its label. */}
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15px] font-medium text-ink-soft">What you hold</div>
          <div className="mb-1 mt-2">
            <Amount value={portfolio.total} size="xl" />
          </div>
        </div>
        <Art name="hero-holdings" className="-mb-1 -mr-1" />
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

/**
 * The label on the spending row's figure. Their rows prefix every number with what it is —
 * `Bought :`, `Total :` — and the two things this figure can be are not the same claim: a median
 * over twelve months, or what has been seen so far in a statement too short to take one from.
 */
function monthLabel(snapshot: Snapshot): string {
  return snapshot.discretionary.monthly > 0 ? 'A normal month' : 'Seen so far'
}

/** What the detected mandates cost over a year. Summed from the series, not the month times 12. */
function annualCommitted(snapshot: Snapshot): number {
  return Math.round(snapshot.commitments.series.reduce((sum, one) => sum + one.annualCost, 0))
}

/** The account line on the savings stat card: the bank's own mask, or how many there are. */
function savingsMeta(accounts: readonly Account[]): string | undefined {
  const liquid = accounts.filter((a) => a.accountType === 'Savings' || a.accountType === 'Current')
  if (liquid.length === 0) return undefined
  if (liquid.length === 1) return liquid[0]?.accountNumberMasked.slice(-8)
  return `${liquid.length} accounts`
}
