/**
 * The two shapes the More surface needs that the primitives do not carry.
 *
 * `OptionRow` is SmartWealth's single-select card — the questionnaire's four answers and the
 * report form's tenure radios are the same control in the source, drawn twice at different
 * weights (a bare radio list on the form, a bordered card in the questionnaire). One control here
 * rather than two, because `03-PALETTE-MAP.md`'s density note asks for consistency *within* a
 * surface, and a form and a questionnaire two taps apart are one surface.
 *
 * `ProfileScale` is their five-node stepper at three nodes. See `risk.ts` for why three: the
 * gate's `PROFILE_CEILING` is a three-row table and a five-stop scale would show a customer two
 * distinctions the gate cannot act on.
 *
 * Neither is promoted to `src/components/`: `COMPONENT-GAP.md` is the register of what belongs
 * there, both of these have exactly one caller each outside this folder today, and lifting a
 * component on its first use is how a design system fills up with things nobody else wants.
 */
import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { useRipple } from '../../lib/motion.ts'
import { PROFILES, PROFILE_COPY } from './risk.ts'
import type { RiskProfile } from './risk.ts'

/**
 * One choice in a single-select group.
 *
 * A real `role="radio"` inside a `role="radiogroup"`, so arrow keys and the screen reader's
 * group announcement work; the whole card is the target rather than a 20px dot, for the same
 * reason `Checkbox` in `Form.tsx` takes the whole row.
 *
 * Selected is `accent-soft` behind an `accent` border, which is where the source's `#F0F5FA`
 * fill and `#1E38C3` border land under `03-PALETTE-MAP.md` — orange is this app's action colour
 * and a selected option is an action taken. Disabled is not `opacity`: an option that is off
 * because the app cannot do it has a reason, and the reason is copy, so it has to stay legible.
 */
export function OptionRow({
  label,
  sub,
  selected,
  disabled,
  onSelect,
}: {
  label: string
  /** A second line. The tenure rows put their resolved dates here; the answers have none. */
  sub?: string
  selected: boolean
  disabled?: boolean
  onSelect: () => void
}): ReactNode {
  const ripple = useRipple()
  const off = disabled === true
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={off}
      onPointerDown={ripple}
      onClick={onSelect}
      className={`ds-press mb-2 flex w-full items-center gap-3 rounded-md px-3.5 py-3 text-left ${
        off
          ? 'border border-solid border-hairline-mint bg-ground-deep'
          : selected
            ? 'border-[1.5px] border-solid border-accent bg-accent-soft'
            : 'border border-solid border-hairline-mint bg-surface'
      }`}
    >
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[15px] leading-snug ${
            off ? 'font-medium text-ink-soft' : selected ? 'font-semibold text-ink' : 'text-ink'
          }`}
        >
          {label}
        </span>
        {sub ? (
          <span className="mt-1 block text-[12.5px] leading-snug text-ink-soft">{sub}</span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className={`grid size-5 flex-none place-items-center rounded-pill border-[1.5px] border-solid ${
          selected ? 'border-accent' : 'border-hairline-mint'
        }`}
      >
        <span className={`size-2.5 rounded-pill ${selected ? 'bg-accent' : 'bg-transparent'}`} />
      </span>
    </button>
  )
}

/**
 * Where a profile sits on the scale, as three nodes.
 *
 * The reached node is filled brand green with a check, which is the source's treatment and
 * survives the palette translation unchanged — `#069463` is `--good`, and `--good` is an alias
 * of `--brand`. Colour is never the only channel: the current stop is also the only bold label,
 * and the node carries a glyph.
 */
export function ProfileScale({
  value,
  provisional = false,
}: {
  value: RiskProfile
  /** Mid-questionnaire, where the answer can still move. Draws hollow rather than filled. */
  provisional?: boolean
}): ReactNode {
  const index = PROFILES.indexOf(value)
  return (
    <div>
      <div className="flex items-center" aria-hidden="true">
        {PROFILES.map((p, i) => (
          <div key={p} className="flex min-w-0 flex-1 items-center last:flex-none">
            <span
              className={`grid size-[22px] flex-none place-items-center rounded-pill ${
                i === index
                  ? provisional
                    ? 'border-[1.5px] border-solid border-brand bg-surface text-brand-deep'
                    : 'border-0 bg-brand text-on-dark'
                  : 'border-[1.5px] border-solid border-hairline-mint bg-surface text-transparent'
              }`}
            >
              <Check size={13} strokeWidth={3} />
            </span>
            {i < PROFILES.length - 1 ? <span className="h-px flex-1 bg-chart-idle" /> : null}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex">
        {PROFILES.map((p, i) => (
          <span
            key={p}
            className={`min-w-0 flex-1 truncate text-[11px] last:flex-none ${
              i === index ? 'font-bold text-ink' : 'text-ink-soft'
            }`}
          >
            {p}
          </span>
        ))}
      </div>
      <span className="sr-only">
        {value}. {PROFILE_COPY[value].tagline}. Stop {index + 1} of {PROFILES.length}
        {provisional ? ', on the answers so far' : ''}.
      </span>
    </div>
  )
}
