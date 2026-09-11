/**
 * One commitment, in full — the reference's `sip-details`, over data that actually exists.
 *
 * The reference's card is a good shape and most of it maps straight across: a status chip, the
 * name, the tag chips, one very large amount as the hero, a 2×2 grid of dates underneath, and a
 * full-bleed `QUICK ACTIONS` band over a list of rows. All of that is here.
 *
 * Three things are not, and each is a thing this app cannot honestly draw:
 *
 * - **`Folio: 4028475828`.** There is no folio. There is a narration and the key it collapses to,
 *   which is the real identifier for a detected series and is shown as one.
 * - **`Paid instalment 28/60`, with a progress bar.** A SIP the app sold has a registered tenure,
 *   so 60 is a real number. A detected debit has no end date at all, so a bar would need an
 *   invented denominator — and a progress bar is read as *progress towards finishing*, which for
 *   an open-ended mandate is a completely false idea. The count of charges is real and is shown;
 *   the bar is not, and is not.
 * - **`Mapped SmartJars`.** Goals are another surface's; if a caller passes `onMapToGoal` the row
 *   appears, and otherwise it does not, because a chevron that goes nowhere is worse than a gap.
 *
 * What replaces them is the thing the reference has no way to show: the evidence. Why the engine
 * called this a commitment rather than shopping, which rail it leaves on, how many charges it
 * counted and over what window, and — the one finding here that no distributor's app can make —
 * whether a fixed price stepped up while nobody was looking.
 *
 * ## What the frames changed, on the second pass
 *
 * `02-sip-details__11/13/24.png` and `07-map-sip-to-smartjar.png` are the same composition and it
 * is the reference's best screen: **the card hangs up into the app bar.** The navy is visible
 * only as a band down the card's gutters and behind the `Recommended` tag that overlaps its top
 * edge. The first pass shipped a mint slab with a card sitting politely below it, which is the
 * mistake `DESIGN.md` §Head warns about by name — a white card overlapping a white-to-mint
 * gradient overlaps nothing. So this screen now takes `Head tone="brand" overlap` and
 * `Screen scrollHeader overlap`, which is exactly what that pair exists for.
 *
 * Two smaller things came out of the same frames. The app bar reads `SIP Details`, generic, and
 * the *card* carries the name — ours printed the name in both places, twice on one screen. And
 * the reference attaches a tinted notice strip flush to the card's bottom for the state of the
 * thing (`This SIP is paused till 12 Dec, 2023`, frame `07`) rather than opening a second card
 * for it; the note, the conflict and the price rise now do the same, so the pile of four cards
 * this screen used to open with is one card with a foot.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  CircleSlash,
  PauseCircle,
  PiggyBank,
  Receipt,
  RotateCcw,
  SquarePen,
  Target,
} from 'lucide-react'
import { RibbonTab } from '../../components/charts/index.ts'
import { Screen } from '../../components/Screen.tsx'
import { StatusBand } from '../../components/StatusBand.tsx'
import { Amount, Card, Head, Leader, ListRow, Pill } from '../../components/ui.tsx'
import { inr, longDate, monthYear } from '../../lib/money.ts'
import { ManageSheets } from './ManageSheets.tsx'
import type { ManageAction } from './ManageSheets.tsx'
import { CADENCE_LABEL, KIND_LABEL, railLabel, REASON_LABEL, STATUS } from './model.ts'
import type { Commitment, Note } from './model.ts'

function Stat({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="min-w-0">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className="mt-0.5 truncate text-[15px] font-semibold tabular-nums text-ink">{value}</div>
    </div>
  )
}

export function CommitmentDetail({
  commitment,
  asOf,
  onBack,
  onNote,
  onClearNote,
  onSeeCharges,
  onMapToGoal,
}: {
  commitment: Commitment
  asOf: string
  onBack: () => void
  onNote: (note: Note) => void
  onClearNote: () => void
  /** The statement, filtered to this series. Owned by the Dashboard's Recent pane — see below. */
  onSeeCharges?: () => void
  /** Goals are another surface's; the row only appears when somebody wires it. */
  onMapToGoal?: () => void
}): ReactNode {
  const [action, setAction] = useState<ManageAction | null>(null)
  const c = commitment
  const s = c.series
  const status = STATUS[c.status]
  const rise = s.priceChanges[s.priceChanges.length - 1] ?? null

  /*
   * The card's foot. One band, in the order that matters most first — the reference's own
   * `07-map-sip-to-smartjar` attaches exactly one tinted strip to the bottom of its summary card
   * and never two, and stacking three here would put a fence across the middle of the screen.
   * Whatever does not fit in it is a sentence in the evidence card further down.
   */
  const foot = c.conflict ? (
    <StatusBand
      flush
      tone="bad"
      label={`You marked this ${c.status} on ${longDate(c.note?.on ?? asOf)}`}
    >
      · and {inr(s.amount)} was charged on {longDate(s.lastSeen)} anyway. Either the instruction has
      not reached the rail, or it never went.
    </StatusBand>
  ) : c.note ? (
    <StatusBand flush tone={status.tone} label="Your note, held on this screen only">
      ·{' '}
      {c.note.kind === 'paused'
        ? `off your calendar until ${longDate(c.note.until ?? asOf)}, then it comes back`
        : c.note.kind === 'stopped'
          ? `off your calendar from ${longDate(c.note.on)}`
          : `projected at ${inr(c.amount)}${c.dayOfMonth === null ? '' : ` on the ${String(c.dayOfMonth)}`} instead of the ${inr(s.amount)} the statement shows`}
      . Nothing was sent to the bank.
    </StatusBand>
  ) : rise ? (
    <StatusBand flush tone="warn" label={`The price went up in ${monthYear(rise.on)}`}>
      · {inr(rise.from)} to {inr(rise.to)}, which is {inr((rise.to - rise.from) * 12)} a year you
      did not agree to.
    </StatusBand>
  ) : (
    <StatusBand flush tone={status.tone} label={status.note}>
      · {inr(c.annualCost)} a year
    </StatusBand>
  )

  return (
    <Screen
      scrollHeader
      overlap
      header={
        <Head
          onBack={onBack}
          backLabel="Back to the calendar"
          title="Commitment"
          sub={KIND_LABEL[s.kind]}
          overlap
          tone="brand"
        />
      }
      after={
        <ManageSheets
          commitment={c}
          action={action}
          asOf={asOf}
          onClose={() => setAction(null)}
          onNote={onNote}
          onClearNote={onClearNote}
        />
      }
    >
      {/* nth-child(2) of the content wrapper, which is what `overlap` pulls up into the slab.
          `overflow-hidden` so the foot is clipped by the card's own corners. */}
      <section className="mb-3 overflow-hidden rounded-md border border-solid border-hairline-mint bg-surface">
        <div className="p-4">
          {rise ? (
            <RibbonTab corner>
              Price rose {inr(rise.from)} → {inr(rise.to)}
            </RibbonTab>
          ) : null}
          <Pill tone={status.pill}>{status.label}</Pill>

          <h2 className="mt-2 text-[18px] font-semibold leading-tight text-ink">{c.name}</h2>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Pill tone="quiet">{railLabel(s.mode)}</Pill>
            <Pill tone="quiet">{KIND_LABEL[s.kind]}</Pill>
            {s.category === KIND_LABEL[s.kind] ? null : <Pill tone="quiet">{s.category}</Pill>}
          </div>

          {/* The `Folio: 4028475828` line. There is no folio; the key the engine matched on is
              the identifier a detected series actually has, so it goes in the folio's slot. */}
          <p className="m-0 mt-2.5 break-words text-[13px] leading-snug text-ink-soft">
            Matched on <span className="font-semibold text-ink-mid">{s.key}</span>
          </p>

          <div className="mt-3.5 border-0 border-t border-solid border-hairline-mint pt-3.5">
            <div className="text-[13px] text-ink-soft">Each charge</div>
            <div className="mt-1">
              <Amount value={c.amount} size="xl" />
            </div>
            <p className="m-0 mt-1 text-[13px] text-ink-soft">
              {CADENCE_LABEL[s.cadence].toLowerCase()}
              {c.dayOfMonth === null ? '' : ` on the ${String(c.dayOfMonth)}`} ·{' '}
              {inr(c.monthlyCost)} a month · {inr(c.annualCost)} a year
            </p>
          </div>

          {/* The reference's 2×2, in its order: the two dates you act on, then the two that say
              how long this has been going on. Where its fourth cell is `End Date` there is a
              count, because a detected mandate has no end date to print. */}
          <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3.5">
            <Stat label="Last charged" value={longDate(s.lastSeen)} />
            <Stat
              label="Next expected"
              value={c.nextDue === null ? 'Nothing projected' : longDate(c.nextDue)}
            />
            <Stat label="First charged" value={longDate(s.firstSeen)} />
            {/* Where the reference draws `Paid instalment 28/60` over a progress bar. The count
                is real; the denominator does not exist, so neither does the bar. */}
            <Stat label="Charges counted" value={`${String(s.occurrences)} so far`} />
          </div>
        </div>
        {foot}
      </section>

      <Card>
        <h2>Why this counts as a commitment</h2>
        <p className="m-0 mt-1.5 text-sm leading-relaxed text-ink-mid">
          {REASON_LABEL[s.reason].charAt(0).toUpperCase() + REASON_LABEL[s.reason].slice(1)}. It has
          charged {s.occurrences} times between {longDate(s.firstSeen)} and {longDate(s.lastSeen)},
          {s.fixed
            ? ' at the same amount every time'
            : ` with the amount moving by about ${String(Math.round(s.amountVariation * 100))}%`}
          .
        </p>
        {rise ? (
          <p className="m-0 mt-2.5 text-sm leading-relaxed text-ink-mid">
            The price stepped from {inr(rise.from)} to {inr(rise.to)} in {monthYear(rise.on)}.
            Nobody sends a letter about that; it is found by comparing one charge to the last.
          </p>
        ) : null}
        <div className="mt-3.5">
          <Leader label="A month" value={inr(c.monthlyCost)} filled />
          <Leader label="A year" value={inr(c.annualCost)} total />
        </div>
      </Card>

      <div className="-mx-4 mt-2 bg-ground-deep px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-accent-text">
        What you can do
      </div>

      {/* The reference's resume, which its own narration promises and only the second take
          films — `10-diy-otp/07-your-sips__17`. It confirms, because clearing a note silently
          moves a five-figure sum back onto the plan. */}
      {c.note ? (
        <ListRow
          icon={<RotateCcw size={20} strokeWidth={2} />}
          title="Put it back on the calendar"
          sub="Clear your note and project it exactly as the statement shows it"
          onClick={() => setAction('resume')}
        />
      ) : null}
      <ListRow
        icon={<PauseCircle size={20} strokeWidth={2} />}
        title="Pause it for a while"
        sub="Take it off the calendar for a month or three, and see what that frees up"
        onClick={() => setAction('pause')}
      />
      <ListRow
        icon={<CircleSlash size={20} strokeWidth={2} />}
        title="Stop it"
        sub={`Take it off for good — ${inr(c.annualCost)} a year back`}
        onClick={() => setAction('stop')}
      />
      <ListRow
        icon={<SquarePen size={20} strokeWidth={2} />}
        title="Different amount or day"
        sub="Project it at the figures you have agreed rather than the ones we found"
        onClick={() => setAction('update')}
      />
      {onSeeCharges ? (
        <ListRow
          icon={<Receipt size={20} strokeWidth={2} />}
          title="See every charge"
          sub={`All ${String(s.occurrences)} of them, on the statement`}
          onClick={onSeeCharges}
        />
      ) : null}
      {onMapToGoal ? (
        <ListRow
          icon={<Target size={20} strokeWidth={2} />}
          title="Count it towards a goal"
          sub="Point this money at something you are saving for"
          onClick={onMapToGoal}
        />
      ) : null}

      <div className="mt-4 flex gap-2.5 rounded-md bg-ground-deep p-3.5">
        <PiggyBank size={16} strokeWidth={2.2} className="mt-px flex-none text-ink-soft" />
        <p className="m-0 text-xs leading-relaxed text-ink-soft">
          None of the three sends anything to the bank. This app reads your statements; it holds no
          mandate and cannot amend one. Each sheet says where the change is really made.
        </p>
      </div>
    </Screen>
  )
}
