/**
 * One commitment, as a row — SmartWealth's `SipCard`, rebuilt from the frames.
 *
 * The frames worth putting beside this file are `01-systematic-calendar__08/09/17` and
 * `10-diy-otp/07-your-sips__16`, which are the only tight crops of the row in the source. What
 * they show, top to bottom, is: a small amber tag flush with the card's top-left corner; a
 * coloured status chip; the fund name at ~16.5pt bold over two lines with the AMC's logo at the
 * right; a quiet identifier line; a row of **grey** taxonomy chips; a hairline; and a
 * three-column strip of `Monthly SIP` / `Last Paid On` / `Next Due`.
 *
 * Three things the first pass got wrong, all of them visible the moment the picture is open:
 *
 * - **Every chip was green.** The reference draws the status chip in its own colour and the
 *   taxonomy chips (`Equity`, `Large Cap`, `Growth`) in grey on pale neutral, and that split is
 *   what lets you scan a column of these. Four `plain` pills in a row is not a hierarchy. The
 *   taxonomy now takes `Pill tone="quiet"`, added to `ui.tsx` for this.
 * - **A 22px money figure sat top-right**, fighting the name for the row's lead and then saying
 *   the same number again three lines down under `Each charge`. The reference has no hero figure
 *   on the row at all: the *name* leads and the money lives in the strip. So does this now, with
 *   the strip's first value a step larger than the two dates beside it.
 * - **The `Recommended` slot was a full-width bar.** It is an ~81×22pt tag hanging off the
 *   corner. What goes in it here is not `Recommended` — on a debit already leaving your account,
 *   "we suggest this" means nothing — it is the one finding on this screen worth a corner tag and
 *   the one a distributor's app cannot make: a fixed price that stepped up.
 *
 * The status band across the card's foot stays. The reference puts that band on its SmartJar
 * cards and, oddly, not on its SIP rows; it earns its place here because the band is where the
 * *provenance* goes — "charging on schedule" is something we observed and "your note" is
 * something you told us, and those two must not look the same.
 *
 * Not drawn, for want of data: the AMC logo (a detected merchant has no logo) and `Folio:` (there
 * is no folio; the rail and the amount go in that line instead).
 */
import type { ReactNode } from 'react'
import { RibbonTab } from '../../components/charts/index.ts'
import { StatusBand } from '../../components/StatusBand.tsx'
import { Pill } from '../../components/ui.tsx'
import { useRipple } from '../../lib/motion.ts'
import { CADENCE_LABEL, KIND_LABEL, railLabel, STATUS } from './model.ts'
import type { Commitment } from './model.ts'
import { dayMonth, inr } from '../../lib/money.ts'

function Stat({ label, value, lead }: { label: string; value: string; lead?: boolean }): ReactNode {
  return (
    <div className="min-w-0">
      <div className="truncate text-[12.5px] text-ink-soft">{label}</div>
      <div
        className={`mt-0.5 truncate tabular-nums text-ink ${
          lead === true ? 'text-[17px] font-bold' : 'text-[15.5px] font-semibold'
        }`}
      >
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
       also exactly what clips the corner tag and the band to the card's rounded corners — see
       gotcha 3 in `DESIGN.md`. Nothing on this card may hang outside its edge, and nothing does.
       No border: the list sits on a `ground-deep` ground and the card is told by being white,
       which is how the reference separates its rows. */
    <button
      type="button"
      onPointerDown={ripple}
      onClick={onOpen}
      className="ds-press mb-3 block w-full rounded-md border-0 bg-surface p-0 text-left"
    >
      <div className="p-4">
        {/* The `Recommended` slot. `RibbonTab corner` is the shared tab the invest surface built
            off the same measurement — flush into the card's top-left corner, carrying the card's
            own radius there — so this is one component, not a second one that looks like it. */}
        {rise ? (
          <RibbonTab corner>
            Price rose {inr(rise.from)} → {inr(rise.to)}
          </RibbonTab>
        ) : null}
        <Pill tone={status.pill}>{status.label}</Pill>

        <h3 className="m-0 mt-2 text-[16.5px] font-bold leading-[1.25] text-ink">{c.name}</h3>

        {/* Where the reference prints `Folio: 4028475828`. There is no folio, so the line carries
            the two facts that identify a detected series instead: the rail it leaves on and what
            it takes each time. */}
        <div className="mt-1 text-[13px] text-ink-soft">
          {railLabel(s.mode)} · {inr(c.amount)} {CADENCE_LABEL[s.cadence].toLowerCase()}
        </div>

        {/* The reference's grey tag chips. Deduped: `Insurance · Insurance` is the kind and the
            category agreeing, which is one chip's worth of information. */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Pill tone="quiet">{KIND_LABEL[s.kind]}</Pill>
          {s.category === KIND_LABEL[s.kind] ? null : <Pill tone="quiet">{s.category}</Pill>}
        </div>

        <div className="mt-3 border-0 border-t border-solid border-hairline-mint pt-3">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="A month" value={inr(c.monthlyCost)} lead />
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
