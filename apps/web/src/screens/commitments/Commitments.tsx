/**
 * Commitments — the recurring-commitments surface. SmartWealth calls it the Systematic Calendar.
 *
 * The reference builds this screen out of SIPs it sold: a month grid of debit dates, a cream
 * banner counting what is coming, and a list of `SipCard`s with status chips. The composition is
 * good and it is kept. What sits inside it is not a port, because the data underneath is
 * different in a way that changes the product:
 *
 * **The reference can only show you what it sold you.** Its calendar knows about SIPs registered
 * through HDFC SmartWealth and nothing else — not the rent, not the EMI, not the insurance
 * premium, not the gym. This app has no order history at all and does not need one:
 * `packages/core/src/recurring.ts` reads the whole ledger and finds every mandate in it, with the
 * true annual cost of each and the reason it counts as a commitment rather than as shopping. That
 * is a strictly larger and more useful set, and it is why this screen is worth building.
 *
 * The trade is that **nothing here can be acted on from here**. See `ManageSheets.tsx`: every
 * action is honest about being a projection plus an instruction for where the change is really
 * made. `model.ts` keeps observed status and declared status separately for the same reason.
 *
 * ## What is deliberately not reproduced
 *
 * - The 7×4 grid of 1–28 in reading order. See `CalendarMonth.tsx`; it is rebuilt.
 * - The `SIP` / `STP` / `SWP` tab row. Two of those three were never opened in the source and
 *   neither exists here; a tab row with one live tab is chrome pretending to be navigation.
 * - The tune/filter icon beside `Your SIPs`, never tapped in the source and specified nowhere.
 *   Selecting a date filters the list, which is the filter this screen actually needs and is also
 *   the per-date detail the reference's own banner promises and never delivers.
 * - `Recommended` on half the rows. On a debit already leaving your account it means nothing.
 */
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarX2, Info, X } from 'lucide-react'
import { ymd } from '@dhan/core'
import type { Snapshot } from '@dhan/contracts'
import { Screen } from '../../components/Screen.tsx'
import { Amount, Card, Head, Leader, TextLink } from '../../components/ui.tsx'
import { inr, longDate, monthYear } from '../../lib/money.ts'
import { CalendarMonth } from './CalendarMonth.tsx'
import { CommitmentRow } from './CommitmentRow.tsx'
import { CommitmentDetail } from './CommitmentDetail.tsx'
import {
  duesInMonth,
  monthLabel,
  monthRange,
  monthsBetween,
  monthTotals,
  shiftMonth,
} from './calendar.ts'
import { toCommitments } from './model.ts'
import type { Note } from './model.ts'

export function Commitments({
  snapshot,
  onBack,
  onRefresh,
  onSeeCharges,
  onMapToGoal,
}: {
  snapshot: Snapshot
  /** Present, the screen gets a back arrow. Left out, it is a tab and does not. */
  onBack?: () => void
  onRefresh?: () => Promise<void>
  /** Optional route into the statement. See `CommitmentDetail`. */
  onSeeCharges?: (seriesKey: string) => void
  /** Optional route into the goal surface, which another screen owns. */
  onMapToGoal?: (seriesKey: string) => void
}): ReactNode {
  const asOf = snapshot.asOf
  const here = ymd(asOf)

  /*
   * The customer's notes, held here and nowhere else.
   *
   * Not `localStorage`, deliberately — `api/session.ts` keeps a token and a cif in the browser
   * and nothing about the customer, so that "no customer data in the browser" is a claim somebody
   * can check in DevTools. A note that survived a reload would have to break that. The honest
   * home for one is a row on the session beside the caps and the decisions, which is an API
   * change rather than a screen, and every surface a note reaches says it is not saved.
   */
  const [notes, setNotes] = useState<ReadonlyMap<string, Note>>(new Map())
  const [month, setMonth] = useState({ year: here.year, month: here.month })
  const [selected, setSelected] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const commitments = useMemo(() => toCommitments(snapshot, notes), [snapshot, notes])
  /* Every commitment, not only the live ones: a series that has gone quiet still has a history
     worth seeing in the months it was charging, and its schedule already stops at its last
     charge so nothing is projected forward off it. */
  const schedules = useMemo(() => commitments.map((c) => c.schedule), [commitments])
  const dues = useMemo(
    () => duesInMonth(schedules, month.year, month.month, asOf),
    [schedules, month, asOf],
  )
  const totals = monthTotals(dues)
  const range = useMemo(() => monthRange(schedules, asOf), [schedules, asOf])

  const detail = commitments.find((c) => c.key === open) ?? null
  if (detail) {
    return (
      <CommitmentDetail
        commitment={detail}
        asOf={asOf}
        onBack={() => setOpen(null)}
        onNote={(note) => setNotes((prev) => new Map(prev).set(detail.key, note))}
        onClearNote={() =>
          setNotes((prev) => {
            const next = new Map(prev)
            next.delete(detail.key)
            return next
          })
        }
        {...(onSeeCharges ? { onSeeCharges: () => onSeeCharges(detail.key) } : {})}
        {...(onMapToGoal ? { onMapToGoal: () => onMapToGoal(detail.key) } : {})}
      />
    )
  }

  const header = (
    <Head
      title="Commitments"
      sub="Everything that leaves without you deciding"
      {...(onBack ? { onBack } : {})}
    />
  )

  if (commitments.length === 0) {
    return (
      <Screen header={header} {...(onRefresh ? { onRefresh } : {})}>
        <Empty snapshot={snapshot} />
      </Screen>
    )
  }

  const onDay = selected === null ? [] : dues.filter((d) => d.date === selected)
  const shown =
    selected === null ? commitments : commitments.filter((c) => onDay.some((d) => d.key === c.key))

  const counts = {
    live: commitments.filter((c) => c.status === 'live').length,
    lapsed: commitments.filter((c) => c.status === 'lapsed').length,
    noted: commitments.filter((c) => c.note !== null).length,
  }

  return (
    <Screen header={header} {...(onRefresh ? { onRefresh } : {})}>
      {/* The reference's cream banner, on `tint-clay` per `03-PALETTE-MAP.md`, saying the two
          numbers it does not: what has already gone this month, and what has not. */}
      <div className="mt-3">
        <Card tint="clay">
          <div className="text-[13px] text-ink-soft">
            {monthLabel(month.year, month.month)}
            {monthsBetween(here, month) === 0 ? ' · this month' : ''}
          </div>
          <div className="mt-1">
            <Amount value={totals.total} size="xl" />
          </div>
          <p className="m-0 mt-1 text-sm text-ink-mid">
            across {totals.count} {totals.count === 1 ? 'charge' : 'charges'}
          </p>
          <div className="mt-3.5">
            <Leader label="Already charged" value={inr(totals.paid)} filled />
            {totals.late > 0 ? (
              <Leader label="Due, not charged yet" value={inr(totals.late)} />
            ) : null}
            <Leader label="Still to come" value={inr(totals.due)} />
          </div>
        </Card>
      </div>

      <CalendarMonth
        year={month.year}
        month={month.month}
        asOf={asOf}
        dues={dues}
        selected={selected}
        onSelect={setSelected}
        onMonth={(by) => {
          setSelected(null)
          setMonth((m) => shiftMonth(m.year, m.month, by))
        }}
        canPrev={monthsBetween(range.first, month) > 0}
        canNext={monthsBetween(month, range.last) > 0}
      />

      {/*
       * The per-date detail. `01-systematic-calendar.md`: the banner reads "Tap on dates to see
       * SIP details", the grid selection never changes across any frame, and the flow file's
       * Gaps §2 records that the list is never date-filtered. So this whole block is designed.
       */}
      {selected !== null ? (
        <section className="mb-3 rounded-md border border-solid border-hairline-mint bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="m-0 text-[16px] font-semibold leading-tight text-ink">
                {longDate(selected)}
              </h2>
              <p className="m-0 mt-1 text-[13px] text-ink-soft">
                {onDay.length === 0
                  ? 'Nothing due on this date'
                  : `${inr(onDay.reduce((sum, d) => sum + d.amount, 0))} across ${String(onDay.length)} ${onDay.length === 1 ? 'charge' : 'charges'}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="ds-press -mr-1 -mt-1 flex h-9 flex-none items-center gap-1 rounded-pill border-0 bg-transparent px-2 text-[13px] font-semibold text-brand-deep"
            >
              <X size={14} strokeWidth={2.6} />
              Clear
            </button>
          </div>
          {onDay.length > 0 ? (
            <ul className="m-0 mt-3 list-none space-y-2 p-0">
              {onDay.map((d) => (
                <li key={d.key} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink">{d.label}</span>
                  <span className="flex-none text-[14.5px] font-semibold tabular-nums text-ink">
                    {inr(d.amount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <div className="-mx-4 mt-2 flex items-baseline justify-between gap-3 bg-ground-deep px-4 py-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-text">
          {selected === null ? 'Every commitment we found' : `On ${longDate(selected)}`}
        </span>
        {selected !== null ? (
          <TextLink size="sm" flush onClick={() => setSelected(null)}>
            Show all {commitments.length}
          </TextLink>
        ) : null}
      </div>

      <p className="mb-3 mt-2.5 text-[13px] leading-snug text-ink-soft">
        {counts.live} charging on schedule
        {counts.lapsed > 0 ? `, ${String(counts.lapsed)} gone quiet` : ''}
        {counts.noted > 0 ? `, ${String(counts.noted)} you have a note on` : ''}. Detected from the
        pattern of your statements, not from a form you filled in.
      </p>

      {shown.map((c) => (
        <CommitmentRow key={c.key} commitment={c} onOpen={() => setOpen(c.key)} />
      ))}

      <div className="mb-2 mt-4 flex gap-2.5 rounded-md bg-ground-deep p-3.5">
        <Info size={16} strokeWidth={2.2} className="mt-px flex-none text-ink-soft" />
        <p className="m-0 text-xs leading-relaxed text-ink-soft">
          Dates on the calendar are the rhythm of each series walked out from the last charge we
          actually saw — the engine gives us a pattern, not a list of debits. The last charge and
          the first are exact; the ones in between are where that rhythm says they fell. A charge
          shown as due has not happened yet, and one shown in red was expected and has not arrived.
        </p>
      </div>
    </Screen>
  )
}

/**
 * Nothing detected.
 *
 * The source has no empty state anywhere in 998 seconds of footage, and this is the one that
 * matters most: over IDBI's own feed a statement whose narrations carry no recognisable merchant
 * is the normal case, and "no commitments" then means "we could not read them", which is a
 * completely different sentence from "you have none". `Money.tsx` already makes that distinction
 * for the totals card; this makes it for the calendar.
 */
function Empty({ snapshot }: { snapshot: Snapshot }): ReactNode {
  const q = snapshot.quality
  return (
    <div className="mt-3">
      <Card tint="clay">
        <div className="flex items-start gap-2.5">
          <CalendarX2 size={18} strokeWidth={2.2} className="mt-0.5 flex-none text-accent-text" />
          <div className="min-w-0">
            <h2>Nothing in your statements repeats yet</h2>
            <p className="m-0 mt-1.5 text-sm leading-relaxed text-ink-mid">
              A commitment is found, not declared: the same charge has to appear at least three
              times, across three different months, at a steady interval — or arrive on a mandate,
              which counts on its own. Nothing here has done that.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <h2>What we read</h2>
        <div className="mt-3">
          <Leader label="Transactions" value={String(q.transactions)} filled />
          <Leader label="Months of history" value={String(Math.round(q.monthsOfHistory))} filled />
          <Leader
            label="Lines we could name"
            value={`${String(Math.round(q.categorisedShare * 100))}%`}
            filled
          />
        </div>
        <p className="m-0 mt-3.5 text-[13px] leading-relaxed text-ink-soft">
          {q.monthsOfHistory < 3
            ? `Three months is the floor for the pattern to be checkable at all, and there ${q.monthsOfHistory === 1 ? 'is' : 'are'} ${String(Math.round(q.monthsOfHistory))} here. Link an older account and this fills in.`
            : `There is enough history — ${monthYear(snapshot.asOf)} back ${String(Math.round(q.monthsOfHistory))} months — so this is about what the narrations say rather than how many there are. Bank feeds often print a reference number and nothing else, and a line nobody can name cannot be matched to the same line last month.`}
        </p>
      </Card>
    </div>
  )
}
