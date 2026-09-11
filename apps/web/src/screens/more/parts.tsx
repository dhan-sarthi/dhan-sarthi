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
 * A third size, `bare`, came out of `images/13-reports/03-report-capital-gain-config__09.png`.
 * The header above was written from the spec text and read the form's radios as the same card as
 * the questionnaire's, drawn lighter. The frame says otherwise: the report form has no cards at
 * all — a 20px ring, a 15px label at a 62dp inset, a ~44dp pitch, and nothing else. Six bordered
 * cards make a two-question form look like a decision; six bare rows make it look like a form,
 * which is what it is. The dot on the left rather than the right for the same reason — a radio
 * list is read down its ring column, and a card is read across its label.
 *
 * Both grew a second size when `images/03-profiling/02-profile-question.png` was measured against
 * the built screen. The frame's answer cards are 48pt tall on a 27pt pitch — the option list is a
 * third of the screen, not a form field stack — and its live-result stepper is a *hugging* row of
 * small nodes tucked beside an illustration, not a labelled rule run to the gutters. Both are
 * opt-in props with the old drawing as the default, because `ReportForm` shares this file and a
 * questionnaire's proportions are not a form's.
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
  size = 'md',
  onSelect,
}: {
  label: string
  /** A second line. The tenure rows put their resolved dates here; the answers have none. */
  sub?: string
  selected: boolean
  disabled?: boolean
  /**
   * `lg` is the questionnaire's proportions, measured off the frame: a 54px row on a 66px pitch
   * with a 22px radio, where `md` is the report form's field-sized row. Same control, same
   * states, same ink — only the air changes, because on the questionnaire the four answers *are*
   * the screen and on the form they are one input among six.
   *
   * `bare` is the report form as `03-report-capital-gain-config__09.png` actually draws it: no
   * border, no fill, no card, the ring moved to the left of the label and a 44px row. See the
   * header.
   */
  size?: 'bare' | 'md' | 'lg'
  onSelect: () => void
}): ReactNode {
  const ripple = useRipple()
  const off = disabled === true
  const big = size === 'lg'
  const flat = size === 'bare'

  /*
   * One ring, drawn at whichever weight the size asks for.
   *
   * A bare row's ring is the only mark the row has, so it is a step heavier than the card's —
   * `border-2` against `border-[1.5px]` — which is the frame's own reading: on a white ground
   * with no border to sit inside, a hairline ring disappears at arm's length.
   */
  const ring = (
    <span
      aria-hidden="true"
      className={`grid flex-none place-items-center rounded-pill border-solid ${
        big ? 'size-[22px]' : 'size-5'
      } ${flat ? 'border-2' : 'border-[1.5px]'} ${
        selected ? 'border-accent' : 'border-hairline-mint'
      }`}
    >
      <span
        className={`rounded-pill ${big ? 'size-3' : 'size-2.5'} ${selected ? 'bg-accent' : 'bg-transparent'}`}
      />
    </span>
  )

  const text = (
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
  )

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={off}
      onPointerDown={ripple}
      onClick={onSelect}
      className={`ds-press flex w-full items-center text-left ${
        flat
          ? 'min-h-11 gap-3.5 rounded-sm border-0 bg-transparent px-0 py-1.5'
          : `gap-3 rounded-md ${big ? 'mb-3 min-h-[54px] px-4 py-3.5' : 'mb-2 px-3.5 py-3'} ${
              off
                ? 'border border-solid border-hairline-mint bg-ground-deep'
                : selected
                  ? 'border-[1.5px] border-solid border-accent bg-accent-soft'
                  : 'border border-solid border-hairline-mint bg-surface'
            }`
      }`}
    >
      {flat ? (
        <>
          {ring}
          {text}
        </>
      ) : (
        <>
          {text}
          {ring}
        </>
      )}
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
  compact = false,
}: {
  value: RiskProfile
  /** Mid-questionnaire, where the answer can still move. Draws hollow rather than filled. */
  provisional?: boolean
  /**
   * The frame's in-card stepper: small nodes on fixed connectors, hugging the left, no labels.
   * It is legible without them because the profile's name is set in bold immediately above it —
   * which is exactly how the source draws it, and the reason its five nodes carry no captions.
   * The full-width labelled rule is still the default; it is what a scale standing on its own
   * has to be.
   */
  compact?: boolean
}): ReactNode {
  const index = PROFILES.indexOf(value)
  return (
    <div>
      <div className="flex items-center" aria-hidden="true">
        {PROFILES.map((p, i) => (
          <div
            key={p}
            className={`flex items-center last:flex-none ${compact ? 'flex-none' : 'min-w-0 flex-1'}`}
          >
            <span
              className={`grid flex-none place-items-center rounded-pill ${
                compact ? 'size-[18px]' : 'size-[22px]'
              } ${
                i === index
                  ? provisional
                    ? 'border-[1.5px] border-solid border-brand bg-surface text-brand-deep'
                    : 'border-0 bg-brand text-on-dark'
                  : 'border-[1.5px] border-solid border-hairline-mint bg-surface text-transparent'
              }`}
            >
              <Check size={compact ? 11 : 13} strokeWidth={3} />
            </span>
            {i < PROFILES.length - 1 ? (
              <span className={`h-px bg-chart-idle ${compact ? 'w-6' : 'flex-1'}`} />
            ) : null}
          </div>
        ))}
      </div>
      {compact ? null : (
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
      )}
      <span className="sr-only">
        {value}. {PROFILE_COPY[value].tagline}. Stop {index + 1} of {PROFILES.length}
        {provisional ? ', on the answers so far' : ''}.
      </span>
    </div>
  )
}
