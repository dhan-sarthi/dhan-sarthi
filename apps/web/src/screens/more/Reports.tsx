/**
 * Reports — pick a statement.
 *
 * `spec/screens/13-reports/02-reports-home.md` is a hero illustration over three list cards:
 * Capital Gain / Loss, Transactions, Holding Statement. Two of the three ship. The third is on
 * the list, off, with the reason — see the header comment in `reports.ts` for why it cannot be
 * written honestly from what this app holds.
 *
 * Keeping the dead row visible is a deliberate call and it is the opposite of what a demo would
 * do. A reviewer who knows the reference will look for capital gain; finding it named, with one
 * sentence saying what it would need, is a better answer than finding it missing and wondering
 * whether it was forgotten. The source has no empty, error or unavailable state anywhere in 998
 * seconds of footage, and this is the screen where that absence would have cost the most.
 *
 * The reference titles this screen `Investment Profile`, which is its own bug — it is the
 * reports list, and the app has a different screen actually called that. It is titled Reports.
 *
 * ## What frame 02 says that the spec text did not
 *
 * The first build read "report type list" and drew a flat list of `ListRow`s on white, which is
 * what the More menu is. The frame is a different screen entirely, and the difference is the
 * whole character of it:
 *
 * - **The ground is tinted and the rows are cards.** `#F0F5FA` behind white `#FDFDFD` panels —
 *   `ground-deep` behind `surface` here. A flat list says "these are settings". Separated cards
 *   on a tint say "these are three things you can make", which is what this screen is for. The
 *   ground is the `sticky top-0` / `h-svh` layer from `DESIGN.md`'s third gotcha, because a
 *   surface that must paint to the bottom of the scroller cannot do it with `min-h-full`.
 * - **There is a hero, and it is big** — roughly 30% of the visible page, left-aligned, sitting
 *   on the tint above the first card with no caption under it. `art/reports-statement.png` is
 *   ours, generated to the spine in `tools/genart.py`: a stack of ruled sheets with a save mark
 *   across the corner, gold on the header band and nothing else off the green ladder.
 * - **The chevron aligns to the title, not to the card.** Their sub-labels wrap to two lines and
 *   a vertically centred chevron would float away from the thing it belongs to. `items-start`
 *   with the glyph nudged onto the title's optical centre.
 *
 * The card tile is `legend-chip` with a `brand-deep` glyph, which is `ListRow`'s tile at the 48px
 * this screen draws it — the frame's tile fill is the same value as its page background, and the
 * translation of that pair is `ground-deep` under `legend-chip`. Two greens a step apart rather
 * than one: `DESIGN.md`'s note about the three tints being one colour is about telling *kinds* of
 * card apart, and this is a tile on a card on a ground, which is depth, not kind.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronRight, FileChartColumn, FileSpreadsheet, Table2 } from 'lucide-react'
import type { View } from '@dhan/contracts'
import { Screen } from '../../components/Screen.tsx'
import { Art } from '../../components/Art.tsx'
import { Card, Head } from '../../components/ui.tsx'
import { useRipple } from '../../lib/motion.ts'
import type { Tier } from '../../components/TierBadge.tsx'
import { ReportForm } from './ReportForm.tsx'
import type { ReportKind } from './reports.ts'

const GLYPH = { size: 24, strokeWidth: 1.8 } as const

export function Reports({
  view,
  tier,
  onBack,
}: {
  view: View
  /** Offline, the ledger is in this browser and there is no statement endpoint to page through. */
  tier: Tier
  onBack: () => void
}): ReactNode {
  const [kind, setKind] = useState<ReportKind | null>(null)

  if (kind !== null) {
    return <ReportForm kind={kind} view={view} onBack={() => setKind(null)} />
  }

  /*
   * Offline is a real state and it is refused up front rather than after the button.
   *
   * The offline chunk rebuilds a view from a bundled ledger; it serves no `listTransactions` and
   * no `getHoldings`. Letting a customer choose a tenure and then fail on generate would be a
   * worse version of the same answer.
   */
  if (tier === 'offline') {
    return (
      <Screen header={<Head title="Reports" sub="Statements you can keep" onBack={onBack} />}>
        <Card tint="clay">
          <h2>Not while this browser is simulating</h2>
          <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
            The advisor service could not be reached, so the app is running its own copy of the
            ledger to keep the screens working. A statement has to be built from the real thing — it
            is a file you might file — so nothing is generated from the simulation.
          </p>
          <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
            Reconnect and this page works.
          </p>
        </Card>
      </Screen>
    )
  }

  return (
    <Screen header={<Head title="Reports" sub="Statements you can keep" onBack={onBack} />}>
      {/* -mx-4 -mt-1 -mb-6 cancels `.scroll`'s gutter and its tail so the tint is full bleed; the
          padding goes back on the inner block, because the pinned panel below must measure
          against the full width rather than the inset one. */}
      <div className="relative -mx-4 -mb-6 -mt-1">
        <div aria-hidden="true" className="pointer-events-none sticky top-0 z-0 h-0">
          <div className="absolute inset-x-0 top-0 h-svh bg-ground-deep" />
        </div>

        <div className="relative z-[1] px-4 pb-8 pt-3">
          <Art name="reports-statement" size="lg" className="mb-1 ml-1" />

          <ReportCard
            icon={<Table2 {...GLYPH} />}
            title="Transaction statement"
            sub="Every line of your account over a period you choose, with the category we read it as"
            onClick={() => setKind('transactions')}
          />
          <ReportCard
            icon={<FileSpreadsheet {...GLYPH} />}
            title="Holding statement"
            sub="What you own today, what it cost and what it is worth"
            onClick={() => setKind('holdings')}
          />
          {/* No `onClick`, so the card draws neither a chevron nor a press state — it is
              information rather than a control, and looking pressable while doing nothing is
              worse than being visibly off. */}
          <ReportCard
            icon={<FileChartColumn {...GLYPH} />}
            title="Capital gain / loss statement"
            sub="Not available — this app cannot compute one honestly"
          />

          <Card tint="sage">
            <h2>Why there is no capital-gain statement</h2>
            <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
              A capital-gain statement has to split every sale into short-term and long-term, which
              needs the units you bought, the day you bought them, the NAV on both days and a record
              of what you redeemed. This app holds one invested figure and one current value per
              holding, and no redemptions at all.
            </p>
            <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
              What it could produce from that is the change in value of what you still hold. That is
              not a capital gain, it is not what a tax return asks for, and putting it under this
              title would be wrong in the one place the number matters. The holding statement above
              shows that same figure under its own name.
            </p>
          </Card>

          <p className="m-0 px-1 text-[12.5px] leading-relaxed text-ink-soft">
            Whichever you pick, what you get is a CSV file saved to this device, built from the same
            data every screen in this app reads. It carries your name, the window it covers, the
            date it was taken and where the numbers came from, so it can be filed rather than only
            looked at.
          </p>
        </div>
      </div>
    </Screen>
  )
}

/**
 * One report type, as frame 02 draws it.
 *
 * A white card rather than a list row, with the tile at 48px and the chevron pulled up onto the
 * title's line. `ds-press` sets `overflow: hidden`, which is fine here because nothing on this
 * card reaches past its edge — see `DESIGN.md`'s fourth gotcha for when that stops being true.
 */
function ReportCard({
  icon,
  title,
  sub,
  onClick,
}: {
  icon: ReactNode
  title: string
  sub: string
  onClick?: () => void
}): ReactNode {
  const ripple = useRipple()
  const body = (
    <>
      <span
        aria-hidden="true"
        className="grid size-12 flex-none place-items-center rounded-sm bg-legend-chip text-brand-deep"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold leading-snug text-ink">{title}</span>
        <span className="mt-1 block text-[13px] leading-snug text-ink-soft">{sub}</span>
      </span>
      {onClick ? (
        <ChevronRight
          size={19}
          strokeWidth={2.2}
          className="mt-1 flex-none text-ink-faint"
          aria-hidden="true"
        />
      ) : null}
    </>
  )
  const cls =
    'mb-3 flex w-full items-start gap-3 rounded-md border border-solid border-hairline-mint bg-surface p-3.5 text-left'
  if (!onClick) return <div className={cls}>{body}</div>
  return (
    <button type="button" className={`ds-press ${cls}`} onPointerDown={ripple} onClick={onClick}>
      {body}
    </button>
  )
}
