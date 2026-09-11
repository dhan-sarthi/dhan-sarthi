/**
 * The variant carousel at the top of the create form.
 *
 * `spec/images/04-smart-jars/05-create-jar-form.png` opens on this and it is a quarter of the
 * screen: a horizontally scrolling row of illustrated goal cards, the selected one bordered and
 * radio-filled, the next one peeking past the right edge so the row obviously scrolls. Below it
 * the fields. The same card component is the whole of `jar-variant-picker`
 * (`03-jar-variant-picker.png`), laid out as a two-column grid instead of a row.
 *
 * It earns its place rather than repeating the catalogue: a customer who picked `A car`, reached
 * the form and wants `A home` should not have to go back a screen to say so. That is exactly the
 * job the reference gives it, and it is why the catalogue's grid and this row are one array in
 * `dreams.ts` rather than two lists that can drift.
 *
 * ## What is not copied
 *
 * The reference's radios are radios and behave as checkboxes — its own spec records `International
 * Holiday` and `My First crore` filled at the same time and says to build it as multi-select. Not
 * here: this app holds one goal, so one dream is selected and the control is a real radio in a
 * real `radiogroup`. Multi-select would be an affordance for a second pot that cannot exist.
 *
 * The peek is `snap-x` rather than a measured carousel. There is nothing to page: eight cards,
 * one row, and a native scroller that already does momentum, keyboard and screen-reader order.
 */
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { DREAMS } from './dreams.ts'
import type { Dream } from './dreams.ts'

export function DreamCarousel({
  selected,
  onPick,
}: {
  selected: string
  onPick: (dream: Dream) => void
}): ReactNode {
  /*
   * Bring the selected card to the left edge.
   *
   * The reference's row opens on the selected card, full width, with the next one peeking — and
   * it can, because its selection is always the first card. Ours is whichever tile the catalogue
   * was tapped on, so a customer who picked `Build wealth` and landed on a row showing
   * `Something else` would reasonably think the pick had not taken. `instant` on mount: the
   * screen has only just arrived and animating it would read as a glitch rather than a scroll.
   */
  const row = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = row.current?.querySelector<HTMLElement>('[aria-checked="true"]')
    if (el && row.current) row.current.scrollTo({ left: el.offsetLeft - 16, behavior: 'instant' })
  }, [selected])

  return (
    <div
      ref={row}
      role="radiogroup"
      aria-label="What you are saving for"
      /* -mx-4 px-4 so the first card starts at the gutter and the last one can scroll past it,
         which is what stops a horizontal row reading as a clipped grid. */
      className="-mx-4 mb-4 mt-3 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1"
    >
      {DREAMS.map((dream) => {
        const on = dream.id === selected
        return (
          <button
            key={dream.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(dream)}
            className={`ds-press flex w-[186px] flex-none snap-start flex-col gap-2.5 rounded-md border-[1.5px] border-solid p-3 text-left transition-colors duration-200 ${
              on ? 'border-accent bg-tint-sage' : 'border-hairline-mint bg-surface'
            }`}
          >
            <span className="flex w-full items-start gap-2">
              <span className="min-w-0 flex-1 text-[14px] font-semibold leading-tight text-ink">
                {dream.label}
              </span>
              {/* Drawn rather than an `<input type=radio>`: this is inside a button and a real
                  input there is a control inside a control. `role`/`aria-checked` above are the
                  accessible radio; this is its picture. */}
              <span
                aria-hidden="true"
                className={`grid size-5 flex-none place-items-center rounded-pill border-[1.5px] border-solid ${
                  on ? 'border-accent' : 'border-hairline-mint'
                }`}
              >
                {on ? <span className="size-2.5 rounded-pill bg-accent" /> : null}
              </span>
            </span>
            <span
              className={`grid h-[92px] w-full place-items-center overflow-hidden rounded-sm ${
                on ? 'bg-surface' : 'bg-legend-chip'
              }`}
            >
              <img
                src={`/icons/${dream.icon}.png`}
                alt=""
                aria-hidden="true"
                width={224}
                height={224}
                loading="lazy"
                decoding="async"
                className="size-[72px] select-none object-contain"
              />
            </span>
          </button>
        )
      })}
    </div>
  )
}
