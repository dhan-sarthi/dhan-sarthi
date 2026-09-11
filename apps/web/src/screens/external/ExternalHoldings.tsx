/**
 * `mutual-funds-holdings` — the payoff. Everything you hold in funds, and where each bit is held.
 *
 * The frame: a white app bar with a centred `Mutual Funds`, a row of three **value tabs**
 * (`All` · `SmartWealth` · `External`, each a two-line cell carrying its own total and change), a
 * scrolling chip row, a deep-navy stat card with one enormous figure and a three-column metric
 * row, then the fund rows with a gold `Recommended` ribbon, an AMC logo tile and a
 * `Market Value / Invested Value / Gain` grid.
 *
 * This is the single most important screen in the feature and the one the source never opens:
 * its own spec records that the `External` tab's list "is not observed" and that only its
 * headline `₹1.3L (-₹10K)` is visible. So the tab row is theirs; what is behind the third tab is
 * designed here.
 *
 * ## What lands, changed
 *
 * - **`SmartWealth` → `At IDBI`, `External` → `Elsewhere`.** The middle tab is the brand's own
 *   book in both apps. `Elsewhere` is the word this app already uses for it — the Dashboard promo
 *   says "Money held elsewhere" and `Holdings`' position rows say "held elsewhere".
 * - **The tab cell is three short lines, not two.** Theirs fits `₹4.5L (+₹1.5L)` on one line
 *   because it abbreviates lakhs; this app writes money out (`lib/money.ts` — a balance that is
 *   rounded looks like an estimate). A rupee change will not fit a 132px cell beside the value,
 *   and a percentage will, so the change is a percentage. It is also the more useful figure
 *   across three tabs of very different sizes, which is the comparison the row exists to make.
 * - **A row that is held elsewhere says so.** The reference's spec flags this as a gap —
 *   "no visual marker distinguishes an imported holding from an in-app one" — and on a screen
 *   whose whole job is that distinction it is the one thing that cannot be missing.
 *
 * ## What is omitted, and why
 *
 * - **`XIRR`.** A money-weighted return needs a dated cashflow series and a valuation date.
 *   Holdings here carry a cost and a value and no dates at all, so there is nothing to compute
 *   it from and no defensible way to fake it.
 * - **`Market Value`.** There is no price feed in this app. `portfolio.ts` says outright that
 *   nothing here may say "market value"; what is shown is what was recorded, and it is labelled
 *   as that.
 * - **The `Recommended` ribbon.** SmartWealth's only judgement about a fund. This app does not
 *   rate funds, and the gate that does judge — `packages/core/src/suitability.ts` — refuses
 *   orders rather than decorating rows.
 * - **The AMC logo tiles.** No logo assets, and no feed that would say which house a holding
 *   belongs to once it is imported.
 * - **The `⋮` kebab on the stat card and the filter-sheet icon.** Both lead somewhere the source
 *   never opens; a control that goes nowhere is worse than no control.
 */
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { HoldingsResponse } from '@dhan/contracts'
import { Amount, Card, Head, Pill, Skeleton } from '../../components/ui.tsx'
import { Screen } from '../../components/Screen.tsx'
import { StatusBand } from '../../components/StatusBand.tsx'
import { LegendRow, SegmentedBar } from '../../components/charts/index.ts'
import type { Slice } from '../../components/charts/index.ts'
import { approx, inr } from '../../lib/money.ts'
import type { CasFolio } from './cas.ts'

type TabId = 'all' | 'idbi' | 'elsewhere'

interface FundRow {
  id: string
  name: string
  assetClass: string
  value: number
  /** Null where no cost was recorded, so this row is outside every gain on the screen. */
  invested: number | null
  sipMonthly: number
  external: boolean
  /** Imported where the record would not take it, so it lives in this session and nowhere else. */
  session: boolean
}

interface Totals {
  value: number
  invested: number | null
  gain: number | null
  gainPct: number | null
  unpriced: number
}

/**
 * The arithmetic, in one place and stated once.
 *
 * A gain is only ever quoted over the rows that carry a cost — comparing a whole tab's value
 * against the recorded cost of half of it is exactly how a flat portfolio comes to look like it
 * doubled. `portfolio.ts` makes the same rule for the Dashboard; this screen holds to it so the
 * two surfaces cannot disagree about the same holdings.
 */
function totalsOf(rows: readonly FundRow[]): Totals {
  const value = rows.reduce((n, r) => n + r.value, 0)
  const priced = rows.filter((r) => r.invested !== null)
  const invested = priced.length > 0 ? priced.reduce((n, r) => n + (r.invested ?? 0), 0) : null
  const pricedValue = priced.reduce((n, r) => n + r.value, 0)
  const gain = invested === null ? null : pricedValue - invested
  return {
    value,
    invested,
    gain,
    gainPct: gain === null || invested === null || invested <= 0 ? null : (gain / invested) * 100,
    unpriced: rows.length - priced.length,
  }
}

export function ExternalHoldings({
  held,
  session = [],
  loading = false,
  onBack,
}: {
  /** Null while the block is being read, and null again if reading it failed. */
  held: HoldingsResponse | null
  /**
   * Folios imported on a source that would not take a write. They are shown, because the point
   * of the screen is to show them — and each one says on its own row that it is not on the
   * record, because the point of `07-DECISIONS.md` §5 is that it must.
   */
  session?: readonly CasFolio[]
  /** The block is still being read. Distinct from `held === null`, which is also how a failed
      read arrives — and a failed read is a screen with something to say, not a spinner. */
  loading?: boolean
  onBack: () => void
}): ReactNode {
  const [tab, setTab] = useState<TabId>('all')
  const [klass, setKlass] = useState<string | null>(null)

  const rows = useMemo<FundRow[]>(
    () => [
      ...(held?.holdings ?? [])
        .filter((h) => h.holdingType === 'MUTUAL_FUND')
        .map((h) => ({
          id: h.holdingId,
          name: h.name,
          assetClass: h.assetClass,
          value: h.currentValue > 0 ? h.currentValue : 0,
          invested: h.investedAmount > 0 ? h.investedAmount : null,
          sipMonthly: h.sipActive ? (h.sipAmount ?? 0) : 0,
          external: h.heldOutsideIdbi === true,
          session: false,
        })),
      ...session.map((f) => ({
        id: `cas:${f.folio}`,
        name: f.name,
        assetClass: f.assetClass,
        value: f.value,
        invested: f.invested,
        sipMonthly: f.sipMonthly,
        external: true,
        session: true,
      })),
    ],
    [held, session],
  )

  const byTab = useMemo(
    () => ({
      all: rows,
      idbi: rows.filter((r) => !r.external),
      elsewhere: rows.filter((r) => r.external),
    }),
    [rows],
  )

  /* The chips are the asset classes actually present in the tab, in the order the ramp hands
     colours out. A chip for a class nothing is held in is a filter that can only empty the list. */
  const classes = useMemo(() => {
    const seen: string[] = []
    for (const r of byTab[held === null ? 'elsewhere' : tab]) {
      if (!seen.includes(r.assetClass)) seen.push(r.assetClass)
    }
    return seen
  }, [byTab, tab, held])

  /*
   * Without the record there is nothing to compare against, so the three tabs would be one tab
   * wearing three labels — and two of them would read `₹0`, which is a claim rather than a gap.
   * The row of tabs goes away and the screen becomes what it honestly is: the import, listed.
   */
  const known = held !== null
  const active: TabId = known ? tab : 'elsewhere'
  const shown = byTab[active].filter((r) => klass === null || r.assetClass === klass)
  const t = totalsOf(shown)
  /* How much of what is on screen is not on the record. It changes the caption above the total,
     because a figure labelled "recorded value" that includes rows nobody recorded is a lie in
     one word. */
  const held4Session = shown.filter((r) => r.session).length

  /* Where the money sits, as one bar. Two slices, so `tonesFor` spreads them to rungs 1 and 4
     rather than putting two darks side by side — `DESIGN.md`, the short-series rule. */
  const split: Slice[] = [
    { label: 'At IDBI', value: totalsOf(byTab.idbi).value },
    { label: 'Elsewhere', value: totalsOf(byTab.elsewhere).value },
  ].filter((s) => s.value > 0)

  return (
    <Screen
      header={
        <Head
          onBack={onBack}
          backLabel="Back to the statement"
          title="Mutual funds"
          sub={known ? 'At IDBI and elsewhere, in one list' : 'What the statement brought in'}
        />
      }
      tabs={
        known ? (
          <ValueTabs
            value={tab}
            onChange={(next) => {
              setTab(next)
              /* A class filter chosen on one tab may not exist on the next, and a filter you
               cannot see is a list that looks empty for no reason. */
              setKlass(null)
            }}
            cells={[
              { id: 'all', label: 'All', totals: totalsOf(byTab.all) },
              { id: 'idbi', label: 'At IDBI', totals: totalsOf(byTab.idbi) },
              { id: 'elsewhere', label: 'Elsewhere', totals: totalsOf(byTab.elsewhere) },
            ]}
          />
        ) : null
      }
    >
      {loading ? (
        <div className="pt-3">
          <Skeleton h={132} className="mb-3" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={78} className="mb-2.5" />
          ))}
        </div>
      ) : (
        <>
          {!known ? (
            <p
              role="alert"
              className="mb-3 mt-3 rounded-md bg-danger-soft px-3.5 py-3 text-[13px] leading-snug text-danger"
            >
              What you hold at IDBI could not be read, so this list is only what the statement
              brought in — nothing here to compare it against.
            </p>
          ) : null}
          {classes.length > 1 ? (
            <div
              role="group"
              aria-label="Filter by asset class"
              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 pt-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <Chip label="All" on={klass === null} onClick={() => setKlass(null)} />
              {classes.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  on={klass === c}
                  onClick={() => setKlass(klass === c ? null : c)}
                />
              ))}
            </div>
          ) : null}

          <div className="mt-3">
            <Card tint="ink">
              <div className="text-[13px] text-white/75">
                {held4Session > 0 ? 'Value on this list' : 'Recorded value'}
              </div>
              <div className="mt-1">
                <Amount value={t.value} size="xl" />
              </div>
              <div className="mt-3.5 flex items-start gap-3 border-0 border-t border-solid border-white/20 pt-3">
                <Figure label="Cost recorded" value={t.invested === null ? '—' : inr(t.invested)} />
                <Figure
                  label="Gain"
                  value={
                    t.gain === null
                      ? 'not quotable'
                      : `${t.gain >= 0 ? '+' : '−'}${inr(Math.abs(t.gain))}`
                  }
                  note={t.gainPct === null ? undefined : `${signed(t.gainPct)}%`}
                />
              </div>
              {t.unpriced > 0 ? (
                <p className="mb-0 mt-3 text-[12.5px] leading-snug text-white/75">
                  {t.unpriced} {t.unpriced === 1 ? 'holding has' : 'holdings have'} no cost
                  recorded, so {t.unpriced === 1 ? 'it is' : 'they are'} outside the gain above.
                </p>
              ) : null}
            </Card>
          </div>

          {known && tab === 'all' && split.length === 2 ? (
            <Card>
              <h2>Where it is held</h2>
              <SegmentedBar
                slices={split}
                label="Value at IDBI against value held elsewhere"
                className="mt-3"
              />
              <div className="mt-1.5 divide-y divide-solid divide-hairline-mint">
                <LegendRow tone={1} label="At IDBI" value={approx(split[0]?.value ?? 0)} />
                <LegendRow tone={4} label="Elsewhere" value={approx(split[1]?.value ?? 0)} />
              </div>
            </Card>
          ) : null}

          {shown.length === 0 ? (
            <Card>
              <h2>{active === 'elsewhere' ? 'Nothing imported yet' : 'No funds here'}</h2>
              <p className="mb-0 mt-1.5 text-[14px] leading-normal text-ink-mid">
                {active === 'elsewhere'
                  ? 'Generate a statement and the folios you hold with other fund houses land here.'
                  : 'Nothing in your record matches this filter.'}
              </p>
            </Card>
          ) : (
            <Card>
              <div className="flex items-baseline justify-between gap-3">
                <h2>{shown.length === 1 ? '1 fund' : `${shown.length} funds`}</h2>
                <span className="text-[12.5px] text-ink-soft">
                  {klass === null ? 'every asset class' : klass}
                </span>
              </div>
              <div className="mt-1 divide-y divide-solid divide-hairline-mint">
                {shown.map((r) => (
                  <FundListRow key={r.id} row={r} />
                ))}
              </div>

              {held4Session > 0 ? (
                <StatusBand
                  tone="warn"
                  label={`${held4Session} of these ${held4Session === 1 ? 'is' : 'are'} held for this session only,`}
                >
                  because this data source serves its own holdings and would not take the import —
                  not on your record, and gone when the app reloads.
                </StatusBand>
              ) : null}
            </Card>
          )}
        </>
      )}
    </Screen>
  )
}

const signed = (n: number): string => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`

/* ---------------------------------------------------------------- The tab row */

/**
 * The reference's value tabs: a cell is a label with its own figure under it, and the active one
 * carries a thick bar on the strip's own hairline.
 *
 * Built here rather than through `Segments variant="underline"` because that control's cell is a
 * single line of text by construction, and the whole point of this row is that each tab states
 * what it is worth before you press it. Everything else about it — the 1.5px track, the 3px
 * indicator, `accent-text` on the active cell, `aria-selected` carrying the state — is
 * `DESIGN.md`'s underline recipe unchanged.
 */
function ValueTabs({
  value,
  onChange,
  cells,
}: {
  value: TabId
  onChange: (next: TabId) => void
  cells: readonly { id: TabId; label: string; totals: Totals }[]
}): ReactNode {
  return (
    <div
      role="tablist"
      aria-label="Where the funds are held"
      className="flex flex-none border-0 border-b-[1.5px] border-solid border-hairline-mint bg-surface px-4"
    >
      {cells.map((c) => {
        const on = c.id === value
        return (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(c.id)}
            className={`ds-press -mb-[1.5px] min-w-0 flex-1 border-0 border-b-[3px] border-solid bg-transparent px-1 py-2.5 text-left ${
              on ? 'border-accent' : 'border-transparent'
            }`}
          >
            <span
              className={`block truncate text-[14px] ${
                on ? 'font-bold text-accent-text' : 'font-semibold text-ink-mid'
              }`}
            >
              {c.label}
            </span>
            <span className="mt-0.5 block truncate text-[13px] font-semibold tabular-nums text-ink">
              {approx(c.totals.value)}
            </span>
            <span
              className={`mt-px block truncate text-[11.5px] font-semibold tabular-nums ${
                c.totals.gainPct === null
                  ? 'text-ink-soft'
                  : c.totals.gainPct >= 0
                    ? 'text-brand-deep'
                    : 'text-danger'
              }`}
            >
              {c.totals.gainPct === null ? 'no cost' : `${signed(c.totals.gainPct)}%`}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------- Small parts */

function Chip({
  label,
  on,
  onClick,
}: {
  label: string
  on: boolean
  onClick: () => void
}): ReactNode {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`ds-press h-9 flex-none whitespace-nowrap rounded-pill px-3.5 text-[13px] font-semibold ${
        on
          ? 'border-0 bg-accent text-on-accent'
          : 'border-[1.5px] border-solid border-hairline-mint bg-surface text-ink-mid'
      }`}
    >
      {label}
    </button>
  )
}

function Figure({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note?: string | undefined
}): ReactNode {
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate text-[12.5px] text-white/75">{label}</div>
      <div className="mt-0.5 truncate text-[16px] font-bold tabular-nums text-on-dark">
        {value}
        {note !== undefined ? (
          <span className="ml-1.5 text-[13px] font-semibold text-white/75">{note}</span>
        ) : null}
      </div>
    </div>
  )
}

/**
 * One fund. Name and where it is held on top, then the reference's three-column metric grid with
 * the middle column renamed: the figure is a recorded cost, not an invested value quoted by a
 * registrar, and a column called `Invested Value` beside one called `Market Value` implies a
 * feed this app does not have.
 */
function FundListRow({ row }: { row: FundRow }): ReactNode {
  const gain = row.invested !== null && row.invested > 0 ? row.value - row.invested : null
  const pct = gain === null || row.invested === null ? null : (gain / row.invested) * 100
  return (
    <div className="py-3.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold leading-snug text-ink">{row.name}</div>
          <p className="m-0 mt-1 text-[12.5px] leading-snug text-ink-soft">
            {row.assetClass}
            {row.sipMonthly > 0 ? ` · ${inr(row.sipMonthly)} a month` : ''}
            {row.session ? ' · this session only' : ''}
          </p>
        </div>
        {row.external ? <Pill tone="quiet">Elsewhere</Pill> : null}
      </div>

      <div className="mt-2.5 flex items-start gap-3">
        <Metric label="Recorded value" value={inr(row.value)} />
        <Metric label="Cost" value={row.invested === null ? '—' : inr(row.invested)} />
        <Metric
          label="Gain"
          value={
            gain === null
              ? 'no cost'
              : `${gain >= 0 ? '+' : '−'}${inr(Math.abs(gain))}${pct === null ? '' : ` (${signed(pct)}%)`}`
          }
          tone={gain === null ? 'quiet' : gain >= 0 ? 'good' : 'bad'}
        />
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  tone = 'plain',
}: {
  label: string
  value: string
  tone?: 'plain' | 'good' | 'bad' | 'quiet'
}): ReactNode {
  const ink =
    tone === 'good'
      ? 'text-brand-deep'
      : tone === 'bad'
        ? 'text-danger'
        : tone === 'quiet'
          ? 'text-ink-soft'
          : 'text-ink'
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate text-[12px] text-ink-soft">{label}</div>
      <div className={`mt-0.5 text-[13.5px] font-bold tabular-nums ${ink}`}>{value}</div>
    </div>
  )
}
