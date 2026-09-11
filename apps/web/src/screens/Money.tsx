/**
 * Money — the 360° view. Boring on purpose.
 *
 * The product notes call this the "you know everything about me" proof, and that is the whole job.
 * It is also where every number on Today and Plan can be traced back to, which matters when a
 * judge decides to check one.
 *
 * The commitments tab carries the distinction the engine works hardest for: a *commitment* is
 * money that leaves whether you think about it or not, and a *habit* is money you choose to
 * spend. Sixty-seven Swiggy orders is not a subscription, and telling a customer it is would read
 * as broken.
 *
 * The statement comes from `/transactions`, a page at a time, newest first, and only as far as
 * the session's clock has reached. Everything else is read from the snapshot's facts, because
 * that is what crosses the wire.
 *
 * The account block that used to be this screen's third tab moved to the Dashboard's Holdings
 * pane in step 4, where the reference groups what you own — `06-EXISTING-APP-MAP.md` §6 puts it
 * there, and splitting "what you have" from "what you own" across two tabs was this app's
 * arrangement, not a decision anybody defended. What is left is the two halves of the ledger
 * story, and they are two halves of one Dashboard pane rather than two panes.
 */
import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { CategoryCap, SpendCategory, Snapshot, Transaction } from '@dhan/contracts'
import { ChevronRight } from 'lucide-react'
import { Amount, Bar, Button, Card, Eyebrow, Leader, Skeleton, Tile } from '../components/ui.tsx'
import { Screen } from '../components/Screen.tsx'
import { SpendGlyph } from '../components/SpendGlyph.tsx'
import type { ScreenChrome } from '../components/Screen.tsx'
import { TransactionSheet } from './TransactionSheet.tsx'
import { CapSheet } from './CapSheet.tsx'
import type { CapTarget } from './CapSheet.tsx'
import { dayMonth, inr, monthYear } from '../lib/money.ts'
import { isNamed, merchantOf, prettyMerchant } from '../lib/merchant.ts'
import { useTransactions } from '../lib/transactions.ts'
import { useRipple } from '../lib/motion.ts'
import type { TransactionSource } from '../lib/transactions.ts'

/** The two halves of the Dashboard's Spending pane. The switch between them is `Dashboard`'s. */
export type MoneyTab = 'spending' | 'commitments'

/* Shared strings for the small text on this screen (the retired `.meta` / `.note` classes). */
const META = 'm-0 text-[13px] text-ink-soft'
const NOTE = 'm-0 text-xs leading-[1.5] text-ink-soft'

export function Money({
  tab,
  chrome,
  lead,
  snapshot,
  source,
  asOf,
  onRefresh,
  caps,
  onSetCap,
  capsEnabled,
}: {
  /** Which half. Controlled by `Dashboard`, which draws the switch that changes it. */
  tab: MoneyTab
  /* The app bar, the ribbon and the sub-tab row, drawn once by `Dashboard` for all four panes. */
  chrome: ScreenChrome
  /**
   * Drawn at the top of the scroller, above whichever half is mounted.
   *
   * The Dashboard's switch between this month and the commitments goes here rather than in
   * `chrome.tabs`, which is already the four-cell screen-level row. Two levels of tab is the
   * reference's own arrangement on its analytics tab — a tab row with a filter row under it —
   * and a switch that scrolls with the content is the half of it that belongs to this pane.
   */
  lead?: ReactNode
  snapshot: Snapshot
  /** Pages of the statement, from the API or the offline ledger. */
  source: TransactionSource
  asOf: string
  /** Pull down at the top to re-read the view. */
  onRefresh: () => Promise<void>
  /** The limits already in force, from the session. */
  caps: readonly CategoryCap[]
  onSetCap: (category: string, monthlyLimit: number | null) => Promise<void>
  /** False on the offline tier, which has no session row to keep a cap on. */
  capsEnabled: boolean
}): ReactNode {
  /*
   * The open statement line lives up here rather than beside the list, and it has to.
   *
   * A sheet is `position: fixed`, and a fixed element inside a transformed ancestor positions
   * against that ancestor instead of the viewport. The scroll region runs the entrance stagger,
   * which is a transform, so a sheet mounted inside the list rendered its scrim over the page
   * and its panel nowhere. Every other sheet in the app is a sibling of the scroller for the
   * same reason.
   */
  const [line, setLine] = useState<Transaction | null>(null)
  const [cap, setCap] = useState<CapTarget | null>(null)
  const [capBusy, setCapBusy] = useState(false)

  return (
    <Screen
      {...chrome}
      onRefresh={onRefresh}
      after={
        <>
          <TransactionSheet txn={line} onClose={() => setLine(null)} />
          <CapSheet
            target={cap}
            busy={capBusy}
            onClose={() => setCap(null)}
            onSave={(category, monthlyLimit) => {
              setCapBusy(true)
              void onSetCap(category, monthlyLimit).finally(() => {
                setCapBusy(false)
                setCap(null)
              })
            }}
          />
        </>
      }
    >
      {lead}
      {tab === 'spending' ? (
        <Spending
          snapshot={snapshot}
          source={source}
          asOf={asOf}
          onOpenLine={setLine}
          caps={caps}
          onOpenCap={capsEnabled ? setCap : null}
        />
      ) : null}
      {tab === 'commitments' ? <Commitments snapshot={snapshot} /> : null}
    </Screen>
  )
}

/* ---------------------------------------------------------------- Spending */

function Spending({
  snapshot,
  source,
  asOf,
  onOpenLine,
  caps,
  onOpenCap,
}: {
  snapshot: Snapshot
  source: TransactionSource
  asOf: string
  /** Handed up to the screen, because the sheet cannot be mounted inside the scroller. */
  onOpenLine: (txn: Transaction) => void
  caps: readonly CategoryCap[]
  /** Null where a cap cannot be kept, which hides the control rather than disabling it. */
  onOpenCap: ((target: CapTarget) => void) | null
}): ReactNode {
  const ripple = useRipple()
  const cats = snapshot.discretionary.byCategory
  const max = cats[0]?.[1] ?? 1
  const observedSpend = Math.round(cats.reduce((sum, [, amount]) => sum + amount, 0))
  const months = snapshot.quality.monthsOfHistory

  return (
    <>
      {/*
        A normal month needs whole months. This card is a median of twelve of them, and over a
        statement twenty days long every figure in it is zero — which read "₹0 on everything you
        choose, out of ₹0 coming in" directly above a category list showing ₹8,659 a month. The
        observed window is what there is, so that is what gets shown.
      */}
      <div className="mt-3">
        {snapshot.discretionary.monthly > 0 ? (
          <Card tint="sage">
            <h2>A normal month</h2>
            <p className={META}>Median of twelve, so one Diwali does not distort it</p>
            <div className="mb-1 mt-3.5">
              <Amount value={snapshot.discretionary.monthly} size="xl" />
            </div>
            <p className={META}>
              on everything you choose, out of {inr(snapshot.income.monthly)} coming in
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Tile label="Committed each month" value={snapshot.commitments.total} />
              <Tile label="Left over" value={snapshot.surplus.monthly} />
            </div>
          </Card>
        ) : (
          <Card tint="sage">
            <h2>Not enough of a month yet</h2>
            <p className={`${META} mt-1.5`}>
              A normal month is a median of twelve; this statement is{' '}
              {snapshot.quality.monthsOfHistory <= 0
                ? 'under a month'
                : `${snapshot.quality.monthsOfHistory} ${snapshot.quality.monthsOfHistory === 1 ? 'month' : 'months'}`}
              . What follows is the window, not a typical month.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Tile label="Spent in the window" value={observedSpend} />
              {/* Not a Tile: that one prints a rupee sign, and twenty statement lines are not
                  ₹20. */}
              <div className="min-w-0 overflow-hidden rounded-sm bg-[color:var(--tile-b,var(--tint-clay))] p-3">
                <div className="text-[clamp(17px,6.2vw,22px)] font-bold leading-none tracking-tight tabular-nums text-ink">
                  {snapshot.quality.transactions}
                </div>
                <div className="mt-1 text-xs text-ink-soft">
                  {snapshot.quality.transactions === 1 ? 'line read' : 'lines read'}
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* The window is whatever the feed holds, which over IDBI's statement is twenty days. A
          heading that says twelve months over twenty days is the sort of thing a banker checks
          and then stops trusting the rest of the screen. */}
      <Eyebrow>
        Where it goes ·{' '}
        {snapshot.quality.monthsOfHistory >= 12
          ? 'last twelve months'
          : snapshot.quality.monthsOfHistory >= 1
            ? `last ${snapshot.quality.monthsOfHistory} ${snapshot.quality.monthsOfHistory === 1 ? 'month' : 'months'}`
            : 'the window on file'}
      </Eyebrow>
      <Card>
        {cats.map(([category, total]) => {
          const trend = snapshot.discretionary.categoryTrends.find((t) => t.category === category)
          const cap = caps.find((c) => c.category === category) ?? null
          /* Dividing by twelve is only a monthly rate when there are twelve months. Over a
             twenty-day statement it turned ₹1,03,910 into "₹8,659/mo", which is both twelve
             times too small and not a month. Below a year the observed total is shown as
             what it is. */
          const monthly = months >= 12
          const shown = monthly ? total / 12 : total
          const over = cap !== null && shown > cap.monthlyLimit

          const body = (
            <>
              <div className="flex items-center justify-between gap-2 text-[14.5px]">
                <span className="min-w-0 truncate font-semibold text-ink">
                  {category}
                  {trend ? (
                    <span
                      className={`ml-[7px] text-xs font-bold ${
                        trend.changePct > 0 ? 'text-danger' : 'text-good'
                      }`}
                    >
                      {trend.changePct > 0 ? '▲' : '▼'}
                      {Math.round(Math.abs(trend.changePct) * 100)}%
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-none items-center gap-1.5">
                  <span className="font-bold tabular-nums text-ink">
                    {inr(shown)}
                    <span className="font-medium text-ink-soft">{monthly ? '/mo' : ''}</span>
                  </span>
                  {onOpenCap !== null ? (
                    <ChevronRight size={15} strokeWidth={2.4} className="text-ink-faint" />
                  ) : null}
                </span>
              </div>
              <div className="mt-1.5">
                <Bar used={(total / max) * 100} />
              </div>
              {cap !== null ? (
                <p
                  className={`m-0 mt-1.5 text-xs font-semibold ${over ? 'text-danger' : 'text-brand'}`}
                >
                  {over
                    ? `Over your ${inr(cap.monthlyLimit)} limit`
                    : `Limit ${inr(cap.monthlyLimit)} a month`}
                </p>
              ) : null}
            </>
          )

          /* A row rather than a button where a cap cannot be kept, so the offline tier does not
             show a control that would do nothing. */
          return onOpenCap === null ? (
            <div key={category} className="py-[9px]">
              {body}
            </div>
          ) : (
            <button
              key={category}
              type="button"
              onPointerDown={ripple}
              onClick={() =>
                onOpenCap({
                  category,
                  spend: shown,
                  monthly,
                  current: cap?.monthlyLimit ?? null,
                })
              }
              className="ds-press block w-full border-0 bg-transparent px-0 py-[9px] text-left"
            >
              {body}
            </button>
          )
        })}
      </Card>

      {/* A habit needs a merchant, and a merchant needs a narration that names one. Over a feed
          that carries none the list is empty, and a heading plus an explanation over nothing
          reads as a section that failed rather than as an answer. */}
      {snapshot.discretionary.topHabits.length === 0 ? null : (
        <>
          <Eyebrow>Habits · not commitments</Eyebrow>
          <Card>
            <p className={`${NOTE} mb-3`}>
              Merchants you use often. Choices, not obligations — which is why they are the lever.
            </p>
            <div className="divide-y divide-solid divide-hairline-mint">
              {snapshot.discretionary.topHabits.map((h) => (
                <div className="flex items-center gap-3 py-[11px]" key={h.key}>
                  <span className="grid size-[34px] flex-none place-items-center rounded-pill bg-tint-sage text-xs font-bold text-brand-deep">
                    {(h.merchant ?? h.key)[0]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-[14.5px] font-bold text-ink">
                      {h.merchant ?? prettyMerchant(h.key)}
                    </b>
                    <span className="block text-xs text-ink-soft">
                      {h.timesPerMonth}× a month · typically {inr(h.typicalAmount)}
                    </span>
                  </span>
                  <span className="text-[14.5px] font-bold tabular-nums text-ink">
                    {inr(h.annualTotal)}/yr
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      <Eyebrow>Recent</Eyebrow>
      <Recent source={source} asOf={asOf} onOpenLine={onOpenLine} />
    </>
  )
}

/** The statement, a page at a time. Mounted only while the Spending tab is open. */
function Recent({
  source,
  asOf,
  onOpenLine,
}: {
  source: TransactionSource
  asOf: string
  onOpenLine: (txn: Transaction) => void
}): ReactNode {
  const [filter, setFilter] = useState<SpendCategory | null>(null)
  const txns = useTransactions(source, asOf, filter)
  const ripple = useRipple()
  const empty = txns.items.length === 0

  /*
   * The chips are the categories actually present, learned from the unfiltered list.
   *
   * Not `discretionary.byCategory`, which is the obvious source and the wrong one: it excludes
   * income and charges by design, so over this feed it offered a single chip reading
   * "Transfers" while the statement also held Income and Fees & charges. Learned rather than
   * derived per render because a filtered list only ever contains one category, and chips that
   * vanish the moment you use them are not a filter.
   */
  const [seen, setSeen] = useState<SpendCategory[]>([])
  useEffect(() => {
    if (filter !== null) return
    const next = [...new Set(txns.items.map((t) => t.spendCategory))].sort()
    queueMicrotask(() => setSeen((prev) => (next.length > prev.length ? next : prev)))
  }, [txns.items, filter])

  /*
   * How much of this statement names anybody.
   *
   * Measured rather than assumed, because it is a property of the feed and not of the app: a
   * generated ledger names almost every line, and IDBI's own sandbox names none of them — every
   * row arrives as `S1 TXN 20`. Twenty rows all reading "Money out" with no explanation looks
   * like something we failed to do, so when the statement is mostly nameless the list says so
   * once, at the top, and quotes the line it is talking about.
   */
  const nameless = txns.items.filter((t) => !isNamed(t)).length
  const mostlyNameless = txns.items.length >= 3 && nameless > txns.items.length / 2
  const sample = txns.items.find((t) => !isNamed(t))?.narration ?? ''

  return (
    <Card>
      {/* Filtering happens on the server, which is why this resets the list rather than hiding
          rows: a cursor issued under one category means nothing under another. */}
      {seen.length > 1 ? (
        <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {[null, ...seen].map((c) => (
            <button
              key={c ?? 'all'}
              type="button"
              aria-pressed={filter === c}
              onPointerDown={ripple}
              onClick={() => setFilter(c)}
              className={`ds-press h-9 flex-none rounded-pill px-3.5 text-[13px] font-semibold ${
                filter === c
                  ? 'border-0 bg-accent text-on-accent'
                  : 'border border-solid border-hairline bg-surface text-ink-mid'
              }`}
            >
              {c ?? 'All'}
            </button>
          ))}
        </div>
      ) : null}

      {txns.error ? (
        <p role="alert" className={`${NOTE} mb-2 text-danger`}>
          {txns.error}
        </p>
      ) : null}

      {empty && txns.loading ? (
        <div aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 py-[11px]">
              <Skeleton h={32} w={32} className="flex-none rounded-pill" />
              <div className="min-w-0 flex-1">
                <Skeleton h={13} w="52%" className="mb-1.5" />
                <Skeleton h={11} w="34%" />
              </div>
              <Skeleton h={13} w={62} />
            </div>
          ))}
        </div>
      ) : null}

      {empty && !txns.loading && !txns.error ? (
        <p className={NOTE}>
          {filter === null
            ? `No statement lines up to ${dayMonth(asOf)}.`
            : `Nothing under ${filter} up to ${dayMonth(asOf)}.`}
        </p>
      ) : null}

      {mostlyNameless ? (
        <p className={`${NOTE} mb-2 rounded-sm bg-tint-clay px-3 py-2.5`}>
          {nameless} of these {txns.items.length} lines name nobody. The bank writes them like{' '}
          <span className="font-mono text-[11.5px]">{sample}</span>, which is the rail and a
          reference, so there is no merchant to show. The dates and the amounts are exactly what it
          sent.
        </p>
      ) : null}

      <div className="divide-y divide-solid divide-hairline-mint">
        {txns.items.map((t, i) => (
          /* A row, and a button, because the name on it is a guess and the sheet is where the
             line it was guessed from lives. Full width and left aligned so it stays a list. */
          <button
            type="button"
            className="ds-press ds-rise ds-stagger flex w-full items-center gap-3 border-0 bg-transparent px-0 py-[11px] text-left"
            key={t.txnId}
            style={{ '--i': i } as CSSProperties}
            onPointerDown={ripple}
            onClick={() => onOpenLine(t)}
          >
            {/* The category, as a glyph. It was the category's *initial* until a screen of these
                showed what a closed set of fifteen does to one letter: Transport, Transfers and
                Food & dining are all `T`, so a third of the list disagreed with itself. A line
                that names nobody has no category to draw and gets the direction instead. */}
            <span
              className={`grid size-8 flex-none place-items-center rounded-pill ${
                t.txnType === 'CREDIT'
                  ? 'bg-tint-sage text-brand-deep'
                  : 'bg-ground-deep text-ink-mid'
              }`}
            >
              <SpendGlyph category={isNamed(t) ? t.spendCategory : null} direction={t.txnType} />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[14.5px] font-bold text-ink">{merchantOf(t)}</b>
              <span className="block truncate text-xs text-ink-soft">
                {/* The mode is UNKNOWN on every row of Priya's statement, which sends none, and
                    printing the word is worse than leaving the gap. On Neha's it is sent and
                    contradicts the narration: `NEFT OUTWARD 3188` arrives with mode CHQ, then
                    NEFT, then IMPS, then CARD, in sequence. So a nameless row shows the raw line
                    in place of the category and leaves the mode out of it. The line is the thing
                    that tells two otherwise identical rows apart. */}
                {dayMonth(t.txnDate)} ·{' '}
                {isNamed(t)
                  ? `${t.spendCategory}${t.txnMode === 'UNKNOWN' ? '' : ` · ${t.txnMode}`}`
                  : t.narration}
              </span>
            </span>
            <span
              className={`text-[14.5px] font-bold tabular-nums ${
                t.txnType === 'CREDIT' ? 'text-good' : 'text-ink'
              }`}
            >
              {t.txnType === 'CREDIT' ? '+' : '−'}
              {inr(t.txnAmount)}
            </span>
            <ChevronRight size={16} strokeWidth={2.4} className="-ml-1 flex-none text-ink-faint" />
          </button>
        ))}
      </div>

      {txns.hasMore ? (
        <div className="mt-3">
          <Button tone="secondary" full busy={txns.loading} onClick={() => void txns.loadMore()}>
            Show earlier
          </Button>
        </div>
      ) : null}
    </Card>
  )
}

/* ---------------------------------------------------------------- Commitments */

function Commitments({ snapshot }: { snapshot: Snapshot }): ReactNode {
  const c = snapshot.commitments

  /*
   * Nothing recognised is not the same as nothing committed.
   *
   * The card is built to break a total into rent, loans, bills and the rest, and over a
   * statement whose narrations carry no merchant every one of those is zero — so it read
   * "₹0 a month, ₹0 a year" over six rows of ₹0, which looks like a customer with no
   * obligations rather than a statement we could not read. IDBI's own feed makes that the
   * normal case.
   */
  if (c.total <= 0) {
    return (
      <div className="mt-3">
        <Card tint="clay">
          <h2>Nothing recognisable as a commitment</h2>
          <p className={`${META} mt-1.5`}>
            These are found by reading the narration on each line, and nothing in this statement
            carries one. Money is still going out; the bank just does not say what for.
          </p>
          {snapshot.debt.monthlyOutgo > 0 ? (
            <p className={`${NOTE} mt-3`}>
              Except {inr(snapshot.debt.monthlyOutgo)} a month of loan repayment, which comes from
              the loan record, not the statement.
            </p>
          ) : null}
        </Card>
      </div>
    )
  }

  return (
    <>
      <div className="mt-3">
        <Card tint="clay">
          <h2>Gone before you decide</h2>
          <p className={META}>Detected from the pattern of your statements, not from a form</p>
          <div className="mb-1 mt-3.5">
            <Amount value={c.total} size="xl" />
          </div>
          <p className={META}>a month, {inr(c.total * 12)} a year</p>

          <div className="mt-4">
            <Leader label="Rent" value={inr(c.rent)} filled />
            <Leader label="Loan repayments" value={inr(c.emis)} filled />
            <Leader label="Bills" value={inr(c.bills)} filled />
            <Leader label="Family and fees" value={inr(c.obligations)} filled />
            <Leader label="Subscriptions" value={inr(c.subscriptions)} filled />
            <Leader label="Already investing" value={inr(c.investments)} />
          </div>
        </Card>
      </div>

      <Eyebrow>Every mandate we found</Eyebrow>
      {c.series.map((s) => (
        <Card key={s.key}>
          <div className="flex justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[15.5px] font-bold text-ink">
                {s.merchant ?? prettyMerchant(s.key)}
              </div>
              <p className={`${META} mt-[3px]`}>
                {s.cadence}
                {s.dayOfMonth ? ` on day ${s.dayOfMonth}` : ''} · {s.occurrences} charges ·{' '}
                {s.fixed ? 'same amount every time' : 'varies'}
              </p>
            </div>
            <div className="text-right">
              <Amount value={s.monthlyCost} size="md" />
              <div className={NOTE}>{inr(s.annualCost)}/yr</div>
            </div>
          </div>

          {s.priceChanges.length > 0 ? (
            <p className="m-0 mt-[11px] rounded-sm bg-accent-soft px-3 py-2.5 text-[13.5px] leading-normal text-accent-text">
              Went from {inr(s.priceChanges[0]?.from ?? 0)} to {inr(s.priceChanges[0]?.to ?? 0)} in{' '}
              {monthYear(s.priceChanges[0]?.on ?? '')} —{' '}
              {inr(((s.priceChanges[0]?.to ?? 0) - (s.priceChanges[0]?.from ?? 0)) * 12)} a year you
              did not agree to.
            </p>
          ) : null}

          <p className={`${NOTE} mt-[9px]`}>
            Counted as a commitment because: {s.reason.replace(/-/g, ' ')}.
          </p>
        </Card>
      ))}
    </>
  )
}
