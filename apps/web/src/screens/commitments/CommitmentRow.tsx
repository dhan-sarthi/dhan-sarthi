/**
 * One commitment, as a row.
 *
 * The reference's `SipCard` is a good component and most of it is kept: the full-bleed white card
 * with a status chip at the top, the name over two lines, the grey tag chips, the hairline, and
 * the tri-column strip of `Monthly SIP` / `Last Paid On` / `Next Due`. That last strip in
 * particular is the right three numbers, and this row keeps all three under names that are true
 * of a detected debit rather than of a fund order.
 *
 * Two things change.
 *
 * The status is a **band clipped to the card's bottom edge** rather than only a chip floating in
 * the padding — `components/StatusBand.tsx`, which this row was hand-rolling until the three
 * copies of it were folded together. The reference uses the band on its SmartJar cards and,
 * oddly, not on the SIP rows. It earns its place here because the band is where the *provenance*
 * goes — "charging on schedule" is something we observed and "your note" is something you told
 * us, and those two cannot look the same. `quiet` is on the shared component for this screen:
 * a mandate that has gone silent is an observation, not a verdict, and none of the reference's
 * three tints says that. The fold cost one detail — the warning triangle that used to lead the
 * conflict band. It was decoration with no accessible name, and a leading glyph would have been
 * an option no other caller of the band wants; the red tint is not the only channel here,
 * because the sentence beside it says the whole thing in words.
 *
 * And the `Recommended` ribbon does not survive. In the reference it is on roughly half the rows
 * and means the distributor would like to sell you this; on a debit already leaving your account
 * it would mean nothing at all. The corner tab is kept for the one thing worth a ribbon on this
 * screen, which the engine finds and the reference could not: a fixed price that stepped up.
 */
import type { ReactNode } from 'react'
import { TrendingUp } from 'lucide-react'
import { StatusBand } from '../../components/StatusBand.tsx'
import { Amount, Pill } from '../../components/ui.tsx'
import { useRipple } from '../../lib/motion.ts'
import { dayMonth, inr } from '../../lib/money.ts'
import { CADENCE_LABEL, KIND_LABEL, railLabel, STATUS } from './model.ts'
import type { Commitment } from './model.ts'

function Stat({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="min-w-0">
      <div className="truncate text-xs text-ink-soft">{label}</div>
      <div className="mt-0.5 truncate text-[14.5px] font-semibold tabular-nums text-ink">
        {value}
      </div>
    </div>
  )
}

export function CommitmentRow({
  commitment,
  onOpen,
}: {
  commitment: Commitment
  onOpen: () => void
}): ReactNode {
  const ripple = useRipple()
  const c = commitment
  const s = c.series
  const status = STATUS[c.status]
  const rise = s.priceChanges[s.priceChanges.length - 1] ?? null

  return (
    /* `.ds-press` already sets `overflow: hidden` to keep the ripple inside the shape, which is
       also exactly what clips the band to the card's rounded bottom corners — see gotcha 3 in
       `DESIGN.md`. Nothing on this card may hang outside its edge, and nothing does. */
    <button
      type="button"
      onPointerDown={ripple}
      onClick={onOpen}
      className="ds-press mb-3 block w-full rounded-md border border-solid border-hairline-mint bg-surface p-0 text-left"
    >
      {rise ? (
        <div className="flex items-center gap-1.5 bg-accent-soft px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent-text">
          <TrendingUp size={12} strokeWidth={2.6} />
          Price rose {inr(rise.from)} → {inr(rise.to)}
        </div>
      ) : null}

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Pill tone={status.pill}>{status.label}</Pill>
            <div className="mt-2 text-[15.5px] font-bold leading-tight text-ink">{c.name}</div>
            <div className="mt-1 text-[13px] text-ink-soft">
              {railLabel(s.mode)} · {s.occurrences} charges since {dayMonth(s.firstSeen)}
            </div>
          </div>
          <div className="flex-none text-right">
            <Amount value={c.monthlyCost} size="md" />
            <div className="mt-0.5 text-xs text-ink-soft">a month</div>
          </div>
        </div>

        {/* The reference's three grey tag chips. Deduped: `Insurance · Insurance · Every month`
            is the kind and the category agreeing, which is one chip's worth of information. */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Pill>{KIND_LABEL[s.kind]}</Pill>
          {s.category === KIND_LABEL[s.kind] ? null : <Pill>{s.category}</Pill>}
          <Pill>{CADENCE_LABEL[s.cadence]}</Pill>
        </div>

        <div className="mt-3 border-0 border-t border-solid border-hairline-mint pt-3">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Each charge" value={inr(c.amount)} />
            <Stat label="Last charged" value={dayMonth(s.lastSeen)} />
            <Stat label="Next expected" value={c.nextDue === null ? 'None' : dayMonth(c.nextDue)} />
          </div>
        </div>
      </div>

      {/* The band, which is the shared `StatusBand` at `flush`: this card is its own button, so
          the band is a sibling at the edge rather than the last child of a padded body, and it
          carries no control of its own — an ⓘ here would be a button inside a button. What it
          says is where the status came from: a fact the engine read off the ledger, or a note
          this screen is holding for you and has not sent anywhere. */}
      {c.conflict ? (
        <StatusBand
          flush
          tone="bad"
          label={`You marked this ${c.status}, and it charged again on ${dayMonth(s.lastSeen)}`}
        />
      ) : (
        <StatusBand flush tone={status.tone} label={status.note}>
          · {inr(c.annualCost)} a year
        </StatusBand>
      )}
    </button>
  )
}
