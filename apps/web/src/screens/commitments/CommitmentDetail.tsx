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
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertTriangle,
  CircleSlash,
  PauseCircle,
  PiggyBank,
  Receipt,
  RotateCcw,
  SquarePen,
  Target,
  TrendingUp,
} from 'lucide-react'
import { Screen } from '../../components/Screen.tsx'
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

  return (
    <Screen
      header={<Head onBack={onBack} title={c.name} sub={KIND_LABEL[s.kind]} />}
      after={
        <ManageSheets
          commitment={c}
          action={action}
          asOf={asOf}
          onClose={() => setAction(null)}
          onNote={onNote}
        />
      }
    >
      <div className="mt-3">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={status.pill}>{status.label}</Pill>
            <Pill>{railLabel(s.mode)}</Pill>
            {s.category === KIND_LABEL[s.kind] ? null : <Pill>{s.category}</Pill>}
          </div>

          <h2 className="mt-3">{c.name}</h2>

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

          <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3.5">
            <Stat label="First charged" value={longDate(s.firstSeen)} />
            <Stat label="Last charged" value={longDate(s.lastSeen)} />
            <Stat
              label="Next expected"
              value={c.nextDue === null ? 'Nothing projected' : longDate(c.nextDue)}
            />
            {/* Where the reference draws `Paid instalment 28/60` over a progress bar. The count
                is real; the denominator does not exist, so neither does the bar. */}
            <Stat label="Charges counted" value={`${String(s.occurrences)} so far`} />
          </div>
        </Card>
      </div>

      {c.conflict ? (
        <Card tint="clay">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={17} strokeWidth={2.4} className="mt-0.5 flex-none text-danger" />
            <div className="min-w-0">
              <h2>Your note and the ledger disagree</h2>
              <p className="m-0 mt-1.5 text-sm leading-relaxed text-ink-mid">
                You marked this {c.status} on {longDate(c.note?.on ?? asOf)}, and a charge of{' '}
                {inr(s.amount)} landed on {longDate(s.lastSeen)}. Either the instruction has not
                reached the rail yet, or it never went. Worth checking.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {c.note ? (
        <Card tint="sky">
          <h2>You have a note on this</h2>
          <p className="m-0 mt-1.5 text-sm leading-relaxed text-ink-mid">
            {c.note.kind === 'paused'
              ? `Off your calendar until ${longDate(c.note.until ?? asOf)}, then it comes back.`
              : c.note.kind === 'stopped'
                ? `Off your calendar from ${longDate(c.note.on)}.`
                : `Projected at ${inr(c.amount)}${c.dayOfMonth === null ? '' : ` on the ${String(c.dayOfMonth)}`} instead of the ${inr(s.amount)} the statement shows.`}{' '}
            Nothing was sent to the bank, and this is held for as long as this screen is open — it
            is not saved anywhere.
          </p>
        </Card>
      ) : null}

      {rise ? (
        <Card tint="clay">
          <div className="flex items-start gap-2.5">
            <TrendingUp size={17} strokeWidth={2.4} className="mt-0.5 flex-none text-accent-text" />
            <div className="min-w-0">
              <h2>The price went up</h2>
              <p className="m-0 mt-1.5 text-sm leading-relaxed text-ink-mid">
                {inr(rise.from)} to {inr(rise.to)} in {monthYear(rise.on)} —{' '}
                {inr((rise.to - rise.from) * 12)} a year you did not agree to. Nobody sends a letter
                about this; it is found by comparing one charge to the last.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

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
        <div className="mt-3.5">
          <Leader label="A month" value={inr(c.monthlyCost)} filled />
          <Leader label="A year" value={inr(c.annualCost)} total />
        </div>
        {/* The identifier a detected series actually has. Not a folio — there is no folio. */}
        <p className="m-0 mt-3 break-words text-xs leading-relaxed text-ink-soft">
          Matched on <span className="font-semibold text-ink-mid">{s.key}</span>
        </p>
      </Card>

      <div className="-mx-4 mt-2 bg-ground-deep px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-accent-text">
        What you can do
      </div>

      {c.note ? (
        <ListRow
          icon={<RotateCcw size={20} strokeWidth={2} />}
          title="Clear your note"
          sub="Put it back on the calendar exactly as the statement shows it"
          onClick={onClearNote}
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
