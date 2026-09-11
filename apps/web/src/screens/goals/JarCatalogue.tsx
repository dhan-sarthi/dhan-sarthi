/**
 * Select your dream — the jar catalogue.
 *
 * `spec/images/04-smart-jars/02-jar-catalogue.png`. The one dark screen in Smart Jars and the
 * most distinctive surface in the reference: a full-bleed dark ground, a two-column grid of
 * recessed tiles, each one a lit jar with a bright object inside it and a centred label under it,
 * and a dashed `Create your own` slot in the first position. Everything else in the feature is
 * light, so the darkness is doing a job — the catalogue is the one moment in the funnel that is
 * about wanting something rather than about arithmetic, and it looks different on purpose.
 *
 * ## Navy becomes green, and it becomes the green this app already uses full bleed
 *
 * `03-PALETTE-MAP.md` sends SmartWealth's navy hero to `--tint-ink`, but that row is about *a
 * card*, and `DESIGN.md` is explicit that `bg-tint-ink` is the one hero card per screen. This is
 * not a card, it is a whole surface, and the app already has one of those: the Ask Uday call
 * screen, `bg-gradient-to-b from-brand-deep to-brand-night`. So the catalogue takes that exact
 * pair rather than inventing a third dark treatment. No hex from the screen spec reaches this
 * file — not the `#0A0A33` ground, not the `#090B3B` tile, not the `#5F69CE` jar stroke.
 *
 * The tiles are a white overlay rather than a darker panel. The reference recesses them by going
 * *darker* than its ground, which it can do because its ground is not already near the bottom of
 * its ladder; `brand-night` is, and a tile darker than it is a black rectangle. `bg-white/[0.06]`
 * over a hairline is the idiom Ask Uday already uses on the same gradient.
 *
 * ## Why the ground is a pinned layer and not a background on the block
 *
 * `min-h-full` does not reach here and it is worth writing down, because the failure is silent
 * and looks like a rounding error. `Screen` wraps a screen's children in its own `ds-enter` div
 * for the entrance stagger; that div is auto-height, so a percentage `min-height` on anything
 * inside it resolves against the content rather than against `.scroll`. Measured: the scroller is
 * 792px, the block 764px, and 28px of the white phone shows above the tab bar. So the ground is
 * a `sticky top-0` layer of zero height carrying a `h-svh` panel — pinned to the top of the
 * scroll viewport, always at least as tall as it, and costing no scroll length of its own. The
 * gradient therefore stays put while the grid moves over it, which is what a backdrop should do.
 *
 * ## What the screen is honest about
 *
 * The jars are `roadmap.stages` and the goal record holds a figure and the money it is in —
 * `dreams.ts` has the whole of why. So the subtitle says, before the choice rather than after
 * it, that picking a dream names the target and does not open a second pot. The reference's own
 * subtitle ("We willl create a SmartJar based on it", three L's and all) promises a jar per tile,
 * which is true of a distribution app holding as many goals as you like and is not true here.
 *
 * There are no amounts on the tiles. There are none in the frames either, and any this app put
 * there — a typical cost for a wedding, a car — would be invented.
 */
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Screen } from '../../components/Screen.tsx'
import { IconButton } from '../../components/ui.tsx'
import { useRipple } from '../../lib/motion.ts'
import { DREAMS } from './dreams.ts'
import type { Dream } from './dreams.ts'
import { JarMark } from './JarMark.tsx'

export function JarCatalogue({
  onBack,
  onPick,
  /** The dream the funnel is already carrying, so re-entering the grid shows where you are. */
  selected,
}: {
  onBack: () => void
  onPick: (dream: Dream) => void
  selected?: string | undefined
}): ReactNode {
  return (
    <Screen
      header={
        /* The reference's app bar is the same navy as the ground with no seam and no elevation,
           which is why this is not `Head`: every `Head` variant is the white-to-mint slab with a
           card shadow, and one of those above a dark grid is two screens stacked. Same metrics
           as `Head`'s back variant, on the dark ground. */
        <header className="flex flex-none items-center gap-3 bg-brand-deep px-4 pb-3.5 pt-4 text-on-dark">
          <IconButton label="Back" tone="ghost" onClick={onBack}>
            <ArrowLeft size={18} strokeWidth={2.3} />
          </IconButton>
          <h1 className="m-0 truncate text-[20px] font-semibold leading-tight text-on-dark">
            Create a jar
          </h1>
        </header>
      }
    >
      {/* -mx-4 -mb-6 cancels `.scroll`'s 16px gutter and its 24px tail, so the ground is full
          bleed and the backdrop below it measures against the full width. The padding goes back
          on the inner block, not this one — put it here and the pinned panel is inset by it. */}
      <div className="relative -mx-4 -mb-6">
        <div aria-hidden="true" className="pointer-events-none sticky top-0 z-0 h-0">
          <div className="absolute inset-x-0 top-0 h-svh bg-gradient-to-b from-brand-deep to-brand-night" />
        </div>

        <div className="relative z-[1] px-4 pb-8 pt-1">
          <h2 className="m-0 text-[24px] font-semibold leading-tight text-on-dark">
            Select your dream
          </h2>
          <p className="m-0 mb-4 mt-1.5 text-[13.5px] leading-snug text-white/70">
            One target at a time. Picking a dream names it and gives it a picture — the figure and
            the date come next.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {DREAMS.map((dream) => (
              <Tile
                key={dream.id}
                dream={dream}
                on={dream.id === selected}
                onPick={() => onPick(dream)}
              />
            ))}
          </div>
        </div>
      </div>
    </Screen>
  )
}

function Tile({ dream, on, onPick }: { dream: Dream; on: boolean; onPick: () => void }): ReactNode {
  const ripple = useRipple()
  /* The reference draws no persistent selected state on this grid — its own spec records that —
     but this funnel can be re-entered from the form's carousel, so there has to be one. A ring
     rather than a fill: a filled tile on a dark ground competes with the lit jar inside it. */
  const edge = dream.custom
    ? 'border-dashed border-white/35 bg-transparent'
    : 'border-solid border-white/10 bg-white/[0.06]'
  return (
    <button
      type="button"
      aria-pressed={on}
      onPointerDown={ripple}
      onClick={onPick}
      className={`ds-press flex min-w-0 flex-col items-center gap-2.5 rounded-md border px-2 pb-4 pt-[18px] text-center transition-shadow duration-200 ${edge} ${
        on ? 'shadow-[inset_0_0_0_2px_var(--color-accent-soft)]' : ''
      }`}
    >
      <JarMark icon={dream.icon} onDark {...(dream.custom ? { dashed: true } : {})} />
      <span
        className={`min-w-0 text-[13.5px] font-semibold leading-tight ${
          dream.custom ? 'text-white/70' : 'text-on-dark'
        }`}
      >
        {dream.label}
      </span>
    </button>
  )
}
