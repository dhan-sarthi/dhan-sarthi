/**
 * Holdings — what you own, grouped by what kind of thing it is.
 *
 * This is `dashboard-holdings-tab` and `Money` › Accounts in one pane, which is what
 * `06-EXISTING-APP-MAP.md` §6 asks for: the reference wins on holdings presentation, and nothing
 * in the reference covers debt, protection or the account block, so both halves stay.
 *
 * The top half is the reference's `HoldingGroupCard`, once per kind: a tile and a name, a
 * two-column figure row, and a strip welded to the card's bottom edge when something about the
 * group needs attention. Its chevron leads to a detail list the source never filmed, so instead
 * the card opens in place — no invented destination, and the rows are two taps closer.
 *
 * The bottom half is unchanged in job from `Money` › Accounts: the account rows with the detail
 * the aggregate throws away, what you owe, the cover in force, and the position tiles.
 *
 * ## Two boundaries worth stating, because every figure on the pane depends on them
 *
 * **A deposit held at IDBI is an account, not a holding.** It comes off API 394 with a maturity
 * date and a rate, it is already in `snapshot.balances.deposits`, and `routes/holdings.ts` says
 * outright that recording it here as well "would count it twice in every net-worth figure". So
 * the group cards are the *declared* block and nothing else — which is exactly what
 * `snapshot.holdings.total` sums, so the hero on Overview, these cards and the Analytics tab all
 * reconcile against one number. IDBI's own deposits are in the account list below, where the bank
 * put them and where their rate and maturity are shown, and the note under the group cards says
 * which list is which.
 *
 * **There is no Demat group.** The reference has one; this app has no demat feed and no equity
 * positions, so drawing an empty card for it would be worse than not drawing it.
 *
 * ## What the parity pass added
 *
 * The pane used to open straight into a group card, so nothing led it. The reference's Holdings
 * frames are only ever shown under the legacy dashboard header
 * (`05-dashboard-home-alt-header.md`), and that header is the missing piece: a figure with its
 * gain, then a **horizontally scrolling strip of product tiles** — one per product on the shelf,
 * showing its value and its gain, or a call to action where the customer holds none of it. The
 * strip is the best thing in that frame because it shows the *gap* in a portfolio, not only what
 * is in it. Then the reference's blue `Linked A/c Balance … View All Bank A/c ›` bar, which is
 * the one band on this pane that belongs to the accounts below rather than to the holdings above.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  ChartColumn,
  Landmark,
  Link2,
  Pencil,
  PiggyBank,
  Plus,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import type { Account, Snapshot } from '@dhan/contracts'
import {
  Amount,
  Button,
  Card,
  Eyebrow,
  Leader,
  Pill,
  Skeleton,
  TextLink,
  Tile,
} from '../../components/ui.tsx'
import { StatusBand } from '../../components/StatusBand.tsx'
import { Sparkline } from '../../components/charts/index.ts'
import type { MonthPoint } from '../../components/charts/index.ts'
import { inr, longDate, monthYear } from '../../lib/money.ts'
import { CardHead, Columns, Empty, ProductTiles, Strip } from './parts.tsx'
import type { ProductTile } from './parts.tsx'
import { GROUP_CATALOGUE } from './portfolio.ts'
import type { Group, GroupId, Portfolio, Position } from './portfolio.ts'
import type { PortfolioState } from './usePortfolio.ts'

/* Shared strings for the small text, carried over from `Money` › Accounts. */
const META = 'm-0 text-[13px] text-ink-soft'
const NOTE = 'm-0 text-xs leading-[1.5] text-ink-soft'

const GLYPH: Record<GroupId, ReactNode> = {
  funds: <ChartColumn size={22} strokeWidth={1.9} />,
  deposits: <Landmark size={22} strokeWidth={1.9} />,
  retirement: <PiggyBank size={22} strokeWidth={1.9} />,
  cover: <ShieldCheck size={22} strokeWidth={1.9} />,
}

export function Holdings({
  snapshot,
  accounts,
  held,
  balanceMonths = [],
  onEditHoldings,
  onLinkAccounts,
}: {
  snapshot: Snapshot
  accounts: readonly Account[]
  held: PortfolioState
  /**
   * The statement account's closing balance, a month at a time (`useBalanceMonths`).
   *
   * Empty until it has been read, and empty for good if it could not be — the savings card is
   * complete without it and simply draws no line.
   */
  balanceMonths?: readonly MonthPoint[] | undefined
  onEditHoldings: () => void
  onLinkAccounts: () => void
}): ReactNode {
  const { balances, holdings, debt, protection } = snapshot
  const p = held.portfolio
  /** See the note where this is used: one savings account, or the line is not drawn at all. */
  const savings = accounts.filter((a) => a.accountType === 'Savings')
  const statementAccount = savings.length === 1 ? savings[0]?.accountNumberMasked : undefined

  return (
    <>
      <Eyebrow>What you hold</Eyebrow>

      {held.loading ? (
        <Card>
          <span className="sr-only">Reading what you hold</span>
          <Skeleton h={40} w="60%" className="mb-3" />
          <Skeleton h={13} className="mb-2" />
          <Skeleton h={22} w="45%" />
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
          {held.error} Your accounts, your borrowing and your cover are below — those come from the
          bank and are unaffected.
        </Empty>
      ) : p === null || p.groups.length === 0 ? (
        <Empty
          title="Nothing recorded yet"
          action={
            <Button size="sm" onClick={onEditHoldings}>
              <Plus size={16} strokeWidth={2.6} />
              Add what you own
            </Button>
          }
        >
          IDBI has no record of your funds, your deposits elsewhere, your NPS or your insurance.
          Without them we cannot tell whether you already hold what we are about to suggest.
        </Empty>
      ) : (
        <>
          {/* The reference's hero figure and its gain, above the product strip. */}
          <Summary portfolio={p} />
          <ProductTiles tiles={tilesOf(p)} cta={{ label: 'Add one', onClick: onEditHoldings }} />
          {p.groups.map((group) => (
            <GroupCard key={group.id} group={group} onEditHoldings={onEditHoldings} />
          ))}
          {/* Which block these came from, said once. The bank's own deposits are in the account
              list below with their rate and maturity, and the two lists have different
              provenance even where they name the same product. */}
          <p className={`${NOTE} mb-3.5`}>
            Your own record — IDBI publishes no holdings feed. Deposits the bank itself holds are
            under Your accounts.
          </p>
          <div className="mb-3">
            <Button tone="secondary" size="sm" full onClick={onEditHoldings}>
              <Pencil size={15} strokeWidth={2.5} />
              Change what you own
            </Button>
          </div>
        </>
      )}

      {/* ------------------------------------------------ Accounts */}
      <Eyebrow>Your accounts</Eyebrow>
      {/* Their `Linked A/c Balance ₹9.85L · View All Bank A/c ›` band. Ours totals the accounts
          the app can actually see, which is what "linked" means here. */}
      {accounts.length > 0 ? (
        <Strip
          label={
            accounts.length === 1 ? 'Linked account balance' : `${accounts.length} linked accounts`
          }
          value={inr(accounts.reduce((sum, a) => sum + a.currentBalance, 0))}
          action={
            <TextLink size="sm" onClick={onLinkAccounts}>
              Link another
            </TextLink>
          }
        />
      ) : null}
      {accounts.map((a) => (
        <AccountCard
          key={a.accountNumberMasked}
          account={a}
          /*
           * The line goes on the account the statement is *of*, and on no other.
           *
           * `/transactions` is one stream with one running `balanceAfterTxn` on it, so the series
           * belongs to exactly one account — and there is nothing on a line saying which. Where
           * the customer has a single savings account that question has one answer; where they
           * have two it has none the app can prove, and drawing one account's balance under the
           * other one's figure is the worst thing this card could do. So: one savings account or
           * no chart.
           */
          months={a.accountNumberMasked === statementAccount ? balanceMonths : []}
        />
      ))}

      {accounts.length === 0 ? (
        <>
          <Card>
            <div className="flex items-start justify-between">
              <p className={META}>Savings account</p>
              <Pill>Savings</Pill>
            </div>
            <div className="mt-2">
              <Amount value={balances.savings} size="lg" paise />
            </div>
            {/* The same reading as the card above, from the snapshot's own two figures rather
                than the account's, because on this branch there is no account row to read them
                off. The claim needs whole months behind it: with `idleMonths` at 0 it read
                "never fell below ₹56,780 in 0 months", which asserts a floor over no period at
                all, and `BalanceLine` keeps that condition on the caption. */}
            <BalanceLine
              points={balanceMonths}
              floor={balances.idleFloor}
              months={balances.idleMonths}
            />
          </Card>

          {balances.deposits > 0 ? (
            <Card>
              <div className="flex items-start justify-between">
                <p className={META}>Deposits</p>
                <Pill>FD · RD</Pill>
              </div>
              <div className="mt-2">
                <Amount value={balances.deposits} size="lg" />
              </div>
            </Card>
          ) : null}
        </>
      ) : null}

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15.5px] font-bold text-ink">Accounts at other banks</div>
            <p className={`${META} mt-[3px]`}>
              The plan then works from all your money, not just the part held here.
            </p>
          </div>
          <Link2 size={19} strokeWidth={2.2} className="mt-0.5 flex-none text-accent-text" />
        </div>
        <div className="mt-3.5">
          <Button tone="secondary" size="sm" full onClick={onLinkAccounts}>
            Link an account
          </Button>
        </div>
      </Card>

      {/* ------------------------------------------------ Debt */}
      {debt.total > 0 ? (
        <>
          <Eyebrow>What you owe</Eyebrow>
          <Card {...(debt.hasHighInterest ? ({ tint: 'clay' } as const) : {})}>
            <div className="flex justify-between gap-2.5">
              <div className="flex-1">
                <div className="text-[15.5px] font-bold text-ink">Loans and cards</div>
                {/* Terms come from 391 and 433, and IDBI holds them for one loan account out
                    of five. "₹0/month at up to 0%" on a ₹6 lakh balance is not a fact about the
                    loan, it is the absence of one. */}
                <p className={`${META} mt-[3px]`}>
                  {[
                    debt.monthlyOutgo > 0 ? `${inr(debt.monthlyOutgo)}/month` : null,
                    debt.highestRate > 0 ? `up to ${debt.highestRate}%` : null,
                  ]
                    .filter((part) => part !== null)
                    .join(' at ') || 'The bank sends no rate or instalment for these'}
                </p>
              </div>
              <Amount value={debt.total} size="md" />
            </div>
            {debt.endingSoon ? (
              <p className={`${NOTE} mt-2.5`}>
                Your {debt.endingSoon.loanType.toLowerCase()} ends in {debt.endingSoon.monthsLeft}{' '}
                {debt.endingSoon.monthsLeft === 1 ? 'month' : 'months'}, freeing{' '}
                {inr(debt.endingSoon.emiAmount)} a month.
              </p>
            ) : null}
            {debt.missedRepayment ? (
              <p className="m-0 mt-2.5 text-[13.5px] text-danger">
                A repayment is past due. Every investment recommendation is blocked until it clears.
              </p>
            ) : null}
          </Card>
        </>
      ) : null}

      {/* ------------------------------------------------ Protection */}
      <Eyebrow>Protection</Eyebrow>
      <Card {...(protection.gap > 0 ? ({ tint: 'clay' } as const) : {})}>
        <div className="flex justify-between gap-2.5">
          <div className="flex-1">
            <div className="text-[15.5px] font-bold text-ink">Life cover in force</div>
            {/* With nobody depending on the income there is no requirement to quote, and
                "0 dependents · indicative need ₹0" reads as a calculation that failed rather
                than as the right answer. */}
            <p className={`${META} mt-[3px]`}>
              {protection.dependents === 0
                ? 'Nobody on record depends on your income'
                : `${protection.dependents} ${protection.dependents === 1 ? 'dependent' : 'dependents'} · indicative need ${inr(protection.lifeCoverNeeded)}`}
            </p>
          </div>
          <Amount value={protection.lifeCoverInForce} size="md" />
        </div>
        {protection.gap > 0 ? (
          <p className={`${NOTE} mt-2.5`}>
            {inr(protection.gap)} short of what your dependents would need — before any investment.
          </p>
        ) : null}
      </Card>

      {/* ------------------------------------------------ Position */}
      <Eyebrow>Position</Eyebrow>
      <Card tint="sage">
        <div className="grid grid-cols-2 gap-2.5">
          <Tile label="Reachable savings" value={balances.total} />
          <Tile label="Invested" value={holdings.total} />
          <Tile label="Owed" value={debt.total} />
          <Tile label="Net" value={balances.total + holdings.total - debt.total} />
        </div>
      </Card>
    </>
  )
}

/* ---------------------------------------------------------------- Summary */

/*
 * What the whole declared block is worth, and how it has moved. The reference puts this at the
 * top of its navy hero as `▲ ₹3,04,500 (7.08%)`, above the product carousel.
 *
 * Not "market value". `currentValue` is what the customer typed and there is no price feed in
 * this app, so the label says whose number it is. The gain is only drawn where an invested amount
 * was recorded against something; where it was not, the line says how many rows are outside it
 * rather than quietly quoting a gain over half the portfolio.
 */
function Summary({ portfolio }: { portfolio: Portfolio }): ReactNode {
  const up = (portfolio.gain ?? 0) >= 0
  return (
    <div className="mb-3.5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-ink-mid">Recorded value</div>
        <div className="mt-1">
          <Amount value={portfolio.total} size="xl" />
        </div>
      </div>
      {portfolio.gain !== null ? (
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
      ) : (
        <span className="pb-1 text-[13px] text-ink-soft">No cost recorded</span>
      )}
    </div>
  )
}

/**
 * The shelf as tiles: every product this app knows about, with what the customer holds of it.
 *
 * A group with rows shows its value and its own second line — a gain where one can be quoted, the
 * count of entries where it cannot, and for insurance the word `Cover`, because a sum assured is
 * not a value that gained anything. A group with no rows shows **no figure at all** and carries
 * the call to action instead: that is the reference's `Deposits → Start Investing` tile, and it
 * is the one shape here that says something true by saying nothing.
 */
function tilesOf(portfolio: Portfolio): ProductTile[] {
  return GROUP_CATALOGUE.map((entry): ProductTile => {
    const held = portfolio.groups.find((g) => g.id === entry.id)
    if (held === undefined) return { id: entry.id, label: entry.label, value: null }
    const note =
      held.kind === 'cover'
        ? 'Cover in force'
        : held.gain !== null && held.gainPct !== null
          ? `${held.gain >= 0 ? '+' : '−'}${inr(Math.abs(held.gain))} (${Math.abs(
              held.gainPct,
            ).toFixed(1)}%)`
          : `${held.positions.length} ${held.positions.length === 1 ? 'entry' : 'entries'}`
    return { id: entry.id, label: entry.label, value: held.value, note }
  })
}

/* ---------------------------------------------------------------- Group */

/*
 * One kind of holding: the figures, and the rows behind them.
 *
 * The right-hand column of the figure row is the reference's, and it varies the same way theirs
 * does — `Gain` where an invested amount was recorded against every row, `Invested` where the
 * gain cannot be quoted. Where *no* row carries a cost the column is dropped rather than filled
 * with a zero, because "gain ₹0" on a fund somebody bought last year is a claim, not a blank.
 *
 * A policy's figure is cover, never capital, so the group's own `kind` decides the label. Adding
 * a ₹50 lakh term cover to a portfolio total is the single worst arithmetic this pane could do.
 */
function GroupCard({
  group,
  onEditHoldings,
}: {
  group: Group
  onEditHoldings: () => void
}): ReactNode {
  const [open, setOpen] = useState(false)
  const cover = group.kind === 'cover'
  const id = `group-${group.id}`

  return (
    <Card>
      <CardHead
        icon={GLYPH[group.id]}
        title={group.label}
        note={`${group.positions.length} ${group.positions.length === 1 ? 'entry' : 'entries'}${
          group.sipMonthly > 0 ? ` · ${inr(group.sipMonthly)} a month going in` : ''
        }`}
        disclose={{
          open,
          onToggle: () => setOpen((v) => !v),
          label: `${open ? 'Hide' : 'Show'} what is in ${group.label}`,
        }}
      />

      <div className="my-3.5 border-t border-solid border-hairline-mint" />

      <Columns
        left={{
          label: cover ? 'Cover in force' : 'Value',
          value: <Amount value={group.value} size="md" />,
        }}
        right={
          cover || group.invested === null
            ? null
            : group.gain !== null && group.gainPct !== null
              ? {
                  label: group.gain === 0 ? 'Against invested' : 'Gain',
                  value: <Gain amount={group.gain} pct={group.gainPct} />,
                }
              : { label: 'Invested', value: <Amount value={group.invested} size="md" /> }
        }
      />

      {/* `inert` rather than only clipped, so the rows of a closed group are out of the
          accessibility tree that `aria-expanded={false}` on the control already says they are. */}
      <div
        id={id}
        inert={!open}
        className="grid transition-[grid-template-rows] duration-[260ms] ease-[cubic-bezier(0.22,0.8,0.3,1)]"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="mt-1 divide-y divide-solid divide-hairline-mint">
            {group.positions.map((position) => (
              <PositionRow key={position.id} position={position} cover={cover} />
            ))}
          </div>
        </div>
      </div>

      {/* The reference's welded banner, and its one real analogue here. Theirs reconciles
          imported holdings it could not map; ours names the rows whose cost was never entered,
          which is why the group above cannot quote a gain on all of it. */}
      {!cover && group.unpriced > 0 ? (
        <StatusBand
          tone="warn"
          label={`${group.unpriced} ${
            group.unpriced === 1 ? 'entry has' : 'entries have'
          } no invested amount recorded,`}
          action={{ label: 'Add it', onClick: onEditHoldings }}
        >
          so {group.unpriced === 1 ? 'it is' : 'they are'} outside the gain.
        </StatusBand>
      ) : null}
    </Card>
  )
}

/**
 * A gain, with its sign carried by a word as well as a colour.
 *
 * Zero takes neither sign and neither colour. A deposit recorded at what was put into it has not
 * gained nothing *yet* — it has not gained, and "+₹0" in green is a small lie about that.
 */
function Gain({ amount, pct }: { amount: number; pct: number }): ReactNode {
  const flat = Math.round(amount) === 0
  return (
    <span
      className={`text-[17px] font-bold tabular-nums ${
        flat ? 'text-ink' : amount > 0 ? 'text-brand-deep' : 'text-danger'
      }`}
    >
      {flat
        ? 'Level'
        : `${amount > 0 ? '+' : '−'}${inr(Math.abs(amount))} (${Math.abs(pct).toFixed(1)}%)`}
    </span>
  )
}

function PositionRow({ position, cover }: { position: Position; cover: boolean }): ReactNode {
  const gain =
    position.invested !== null && position.invested > 0 ? position.value - position.invested : null

  return (
    <div className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold text-ink">{position.name}</div>
        <p className={`${META} mt-0.5`}>
          {[
            cover ? 'Cover' : position.assetClass,
            position.sipMonthly > 0
              ? `${inr(position.sipMonthly)} a month${position.sipDay !== null ? ` on day ${position.sipDay}` : ''}`
              : null,
            /* With the year. `dayMonth` is for a charge inside the month you are reading, and a
               maturity is years out — "matures 1 April" is a date nobody can act on, and the
               account card twelve rows below prints the year for exactly the same fact. */
            position.maturity !== null ? `matures ${longDate(position.maturity)}` : null,
            position.rate !== null ? `${position.rate}%` : null,
            position.external ? 'held elsewhere' : null,
          ]
            .filter((part) => part !== null)
            .join(' · ')}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <Amount value={position.value} size="sm" />
        {/* A policy has no cost line at all: pure cover has no surrender value and no gain, and
            "no cost recorded" beside a term plan would read as a field somebody forgot. */}
        {cover ? null : gain === null ? (
          <div className="mt-0.5 text-xs text-ink-soft">no cost recorded</div>
        ) : Math.round(gain) === 0 ? (
          <div className="mt-0.5 text-xs text-ink-soft">level with what went in</div>
        ) : (
          <div
            className={`mt-0.5 text-xs font-semibold tabular-nums ${
              gain > 0 ? 'text-brand-deep' : 'text-danger'
            }`}
          >
            {gain > 0 ? '+' : '−'}
            {inr(Math.abs(gain))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- One account */

const ACCOUNT_PILL: Record<Account['accountType'], string> = {
  Savings: 'Savings',
  Current: 'Current',
  FD: 'Fixed deposit',
  RD: 'Recurring deposit',
  PPF: 'PPF',
  NPS: 'NPS',
}

/**
 * One account, with the detail the aggregate threw away. Moved here from `Money` › Accounts
 * unchanged, because this pane is now where the account list lives.
 *
 * The spendable figure is the bank's own `EFFAVL`, not the balance less the lien: on a current
 * account IDBI withholds a minimum balance on top of the lien, so the two are different numbers
 * and the smaller one is the true one. Shown only when it differs from the balance, because
 * "₹56,780 · ₹56,780 available" is noise.
 */
/**
 * A year of the account, and the line it never went under.
 *
 * The snapshot has carried `idleFloor` and `idleMonths` since the beginning and the only place
 * they were ever said was a sentence — *"never fell below ₹1,41,663 in 11 months — that part has
 * not been needed once"* — on the branch of this screen that draws when the bank sends no
 * accounts at all, which is to say almost never. That sentence is the premise of the whole plan:
 * a buffer is being built out of money that has demonstrably sat still. It is worth more as the
 * picture it describes, so it is drawn, and the sentence is not repeated under it — the caption
 * names the dashed rule and stops.
 *
 * `monthlyClose`, not a monthly total: a balance is a level that persists between statements, so
 * a month with no lines keeps the previous close rather than dropping to zero. Same statistic
 * `derive.ts` reads for `idleFloor`, so the rule cannot fall outside its own series. Drawn from
 * zero — a bank balance's zero is the whole point of the reading, and a series cropped to its own
 * range would turn a steady year into a mountain.
 */
function BalanceLine({
  points,
  floor,
  months,
}: {
  points: readonly MonthPoint[]
  floor: number
  months: number
}): ReactNode {
  const first = points[0]
  const last = points[points.length - 1]
  /* Under half a year there is no trend to read and the rule has nothing to be a floor of. */
  if (points.length < 6 || first === undefined || last === undefined) return null

  return (
    <div className="mt-3.5">
      <Sparkline
        mark="line"
        points={points}
        rule={floor > 0 ? floor : null}
        height={60}
        label={`Closing balance each month from ${first.label} to ${last.label}, ending ${inr(
          last.value,
        )}${floor > 0 ? `, never below ${inr(floor)}` : ''}.`}
      />
      <div className="mt-1 flex items-baseline justify-between text-[11px] text-ink-soft">
        <span>{first.label}</span>
        <span>{last.label}</span>
      </div>
      {/* The sentence used to end "— that part has not been needed once", and the block of
          untouched money under the dashed rule is now that clause. What is left is the two facts
          a rule with no axis beside it cannot carry: which figure it is at, and over how long. */}
      {floor > 0 && months > 0 ? (
        <p className={`${NOTE} mt-2`}>
          Never below {inr(floor)} in {months === 1 ? 'a month' : `${months} months`}.
        </p>
      ) : null}
    </div>
  )
}

function AccountCard({
  account,
  months = [],
}: {
  account: Account
  months?: readonly MonthPoint[] | undefined
}): ReactNode {
  const withheld =
    account.effectiveAvailableBalance !== undefined &&
    account.effectiveAvailableBalance < account.currentBalance
      ? account.currentBalance - account.effectiveAvailableBalance
      : 0
  // Never more than what is actually withheld: a lien larger than the gap would mean the two
  // figures disagree, and the smaller one is the one the customer can go and verify.
  const lien = Math.min(withheld, account.lienAmount ?? 0)

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <p className={META}>
          {account.accountNumberMasked.slice(-8)}
          {account.branchIfsc ? ` · ${account.branchIfsc}` : ''}
        </p>
        <Pill>{ACCOUNT_PILL[account.accountType]}</Pill>
      </div>
      <div className="mt-2">
        <Amount value={account.currentBalance} size="lg" paise />
      </div>

      {withheld > 0 ? (
        <div className="mt-2.5">
          <Leader
            label="Yours to spend"
            value={inr(account.effectiveAvailableBalance ?? 0)}
            filled
          />
          {/* The lien is only part of it. On the current account IDBI withholds ₹2,000 of lien
              and a further ₹3,000 of minimum balance, so calling the whole ₹5,000 a lien would
              be wrong about a figure the customer could go and check. */}
          {lien > 0 ? <Leader label="Held by a lien" value={`−${inr(lien)}`} /> : null}
          {withheld - lien > 0.005 ? (
            <Leader
              label={lien > 0 ? 'Also held back' : 'Held back'}
              value={`−${inr(withheld - lien)}`}
            />
          ) : null}
        </div>
      ) : null}

      {/* `minBalance12m` is a twelve-month statistic, so the caption counts the complete months
          drawn and leaves the month still running out of it. */}
      <BalanceLine
        points={months}
        floor={account.minBalance12m ?? 0}
        months={months.filter((m) => !m.partial).length}
      />

      <p className={`${NOTE} mt-2.5`}>
        {account.maturityDate !== undefined
          ? `Matures ${longDate(account.maturityDate)}`
          : account.accountOpeningDate > '1970-01-01'
            ? `Open since ${monthYear(account.accountOpeningDate)}`
            : 'The bank sends no opening date for this one'}
        {account.interestRate !== undefined ? ` · ${account.interestRate}%` : ''}
      </p>
    </Card>
  )
}
