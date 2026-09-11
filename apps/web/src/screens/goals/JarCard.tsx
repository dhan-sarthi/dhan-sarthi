/**
 * One jar, as a card.
 *
 * The reference's shape, kept: icon tile, name, chevron; a progress bar; the achieved-of-target
 * line; and the status band filling the foot of the card. Three things about it are deliberately
 * *not* the reference's.
 *
 * **The bar is orange whatever the status says.** SmartWealth paints the attention jar's fill
 * crimson and the healthy ones blue, which puts the state in two places and, in its own frames,
 * in two places that disagree — every bar in that video is drawn at about 30% regardless of the
 * percentage printed under it. Here the band says the state and the bar says the quantity, and
 * the bar is the app's one progress recipe (`Bar`, `bg-accent` on `bg-chart-idle`) rather than a
 * second one with a colour rule of its own.
 *
 * **A jar with nothing to measure draws no bar.** The card asks for a fraction it sometimes does
 * not have — how much of a debt has been repaid is not in the snapshot — and a bar at 0% under
 * the words "we cannot see it" is a claim the app cannot make. It says the sentence instead.
 *
 * **The pressable region is the title row, not the whole card.** The band carries its own ⓘ, so
 * a card-wide button would have a button inside it; and `.ds-press` clips, so the usual
 * stretched-overlay trick cannot reach past the row either (`DESIGN.md`, gotcha 3). The row is
 * 68px with the tile in it and carries the chevron, which is where the reference puts the
 * affordance anyway.
 */
import type { ReactNode } from 'react'
import { ChevronRight, CreditCard, Target, Umbrella } from 'lucide-react'
import { Bar } from '../../components/ui.tsx'
import { StatusBand } from '../../components/StatusBand.tsx'
import { approx, monthYear } from '../../lib/money.ts'
import { share, statusLabel, statusTone } from './jar.ts'
import type { Jar } from './jar.ts'

const GLYPH = {
  build_buffer: Umbrella,
  clear_debt: CreditCard,
  grow: Target,
  free_up: Target,
  get_cover: Umbrella,
} as const

export function JarCard({
  jar,
  onOpen,
  onInfo,
}: {
  jar: Jar
  onOpen: () => void
  /** The ⓘ on the band. Opens the engine's own sentence for the stage, never a dead end. */
  onInfo: () => void
}): ReactNode {
  const Glyph = GLYPH[jar.kind]
  return (
    <section className="mb-3 min-w-0 overflow-hidden rounded-md border border-solid border-hairline-mint bg-surface">
      <div className="p-4">
        {/* Cancels the card's padding and re-applies it, so the ripple runs the card's width. */}
        <button
          type="button"
          onClick={onOpen}
          className="ds-press -m-4 mb-0 flex w-full items-center gap-3 border-0 bg-transparent p-4 text-left"
        >
          <span
            aria-hidden="true"
            className="grid size-10 flex-none place-items-center rounded-sm bg-legend-chip text-brand-deep"
          >
            <Glyph size={21} strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            {/* Two lines, not one. The reference's jar names are nouns — "Apartment", "Dream
                Car" — and this app's are the engine's own purposes, which are sentences:
                "Enough to stop working at 60" truncated to "Enough to stop working…" says
                something else. */}
            <span className="line-clamp-2 block text-[16px] font-semibold leading-tight text-ink">
              {jar.name}
            </span>
            <span className="mt-1 block truncate text-[13px] text-ink-soft">
              {jar.isGoal ? 'Your goal · ' : ''}
              {/* A jar nothing is going into is better described by when it will start than by
                  when it would finish if it had. */}
              {jar.status === 'queued'
                ? `starts ${monthYear(jar.stage.startsOn)}`
                : jar.dated
                  ? `by ${monthYear(jar.by)}`
                  : 'not clearing'}
            </span>
          </span>
          <ChevronRight size={18} strokeWidth={2.2} className="flex-none text-ink-faint" />
        </button>

        {jar.fraction === null ? null : (
          <div className="mt-3.5">
            <Bar used={jar.fraction * 100} />
          </div>
        )}

        <p className="mb-0 mt-2.5 text-[13.5px] leading-snug text-ink-mid">
          {jar.achieved === null ? (
            <>
              {approx(jar.target)} outstanding. How much has already been repaid is not in your
              statements, so there is no share to show.
            </>
          ) : (
            <>
              Achieved <span className="font-semibold text-ink">{approx(jar.achieved)}</span> (
              {share(jar.fraction ?? 0)}) of {approx(jar.target)}
            </>
          )}
        </p>
      </div>

      <StatusBand
        flush
        tone={statusTone(jar.status)}
        label={statusLabel(jar.status)}
        onInfo={onInfo}
        infoLabel={`Why ${jar.name} is ${statusLabel(jar.status).toLowerCase()}`}
      />
    </section>
  )
}
