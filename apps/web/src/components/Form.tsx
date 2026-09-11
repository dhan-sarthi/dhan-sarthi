/**
 * Form controls, in the app's own language rather than the browser's.
 *
 * A default `<select>` on Android is a full-screen list and a default number input opens the
 * wrong keyboard, and both of them look like a settings page rather than like this app. These
 * are the four shapes the editing sheets actually need: a labelled field, a choice of three or
 * four, a count with plus and minus, and money.
 *
 * The one rule worth stating: every control is at least 44px tall. Below that a thumb misses.
 */
import { useId } from 'react'
import type { ReactNode } from 'react'
import { Check, Minus, Plus } from 'lucide-react'
import { useRipple } from '../lib/motion.ts'
import { IconButton } from './ui.tsx'

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string | undefined
  children: ReactNode
}): ReactNode {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink">{label}</span>
      {children}
      {hint ? (
        <span className="mt-1.5 block text-xs leading-snug text-ink-soft">{hint}</span>
      ) : null}
    </label>
  )
}

/** A choice of two to four. Wraps rather than scrolls, so nothing hides off the right edge. */
export function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
}): ReactNode {
  const ripple = useRipple()
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          onPointerDown={ripple}
          onClick={() => onChange(o.id)}
          className={`ds-press h-11 min-w-0 flex-1 shrink-0 basis-[calc(50%-4px)] truncate rounded-pill px-3 text-[14px] font-semibold ${
            o.id === value
              ? 'border-0 bg-accent text-on-accent'
              : 'border-[1.5px] border-solid border-hairline bg-surface text-ink-mid'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * A box you tick.
 *
 * The app had no checkbox at all: `Choice` is a `role="radio"` group and the consent control on
 * Record is a `role="switch"` pill, and neither of those is the control for "I accept these
 * terms" — a switch reads as a setting you can come back to, and a radio has to have a sibling.
 * The cart's terms line and its per-line include control both need this one.
 *
 * The whole row is the target, not the 20px box: the box is what a 20px box has to be to look
 * right beside 13px copy, and a 20px tap target is one a thumb misses. The label is inside the
 * button, so it is the accessible name and there is nothing to associate by id.
 */
export function Checkbox({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  children: ReactNode
}): ReactNode {
  const ripple = useRipple()
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled === true}
      onPointerDown={ripple}
      onClick={() => onChange(!checked)}
      className="ds-press flex min-h-[44px] w-full items-start gap-3 rounded-sm border-0 bg-transparent px-0 py-2 text-left disabled:opacity-55"
    >
      <span
        aria-hidden="true"
        className={`mt-px grid size-5 flex-none place-items-center rounded-[6px] transition-colors duration-150 ${
          checked
            ? 'border-0 bg-accent text-on-accent'
            : 'border-[1.5px] border-solid border-hairline bg-surface text-transparent'
        }`}
      >
        <Check size={13} strokeWidth={3.2} />
      </span>
      <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink-mid">{children}</span>
    </button>
  )
}

/** A count, with the two buttons a thumb wants instead of a keyboard. */
export function Stepper({
  value,
  min = 0,
  max = 20,
  onChange,
  suffix,
}: {
  value: number
  min?: number
  max?: number
  onChange: (n: number) => void
  suffix?: string | undefined
}): ReactNode {
  return (
    <div className="flex items-center gap-3">
      <IconButton
        label="Fewer"
        size="lg"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus size={17} strokeWidth={2.6} />
      </IconButton>
      <span className="min-w-[3ch] text-center text-[19px] font-bold tabular-nums text-ink">
        {value}
        {suffix ? (
          <span className="ml-1 text-[13px] font-semibold text-ink-soft">{suffix}</span>
        ) : null}
      </span>
      <IconButton
        label="More"
        size="lg"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus size={17} strokeWidth={2.6} />
      </IconButton>
    </div>
  )
}

/**
 * Money.
 *
 * `inputMode="numeric"` rather than `type="number"`: the numeric keypad without the spinner,
 * the scroll-wheel hazard or the browser's own idea of what a valid amount looks like. The
 * value is grouped as it is typed, because a seven-digit income without separators is unreadable
 * and re-checking it is exactly what a customer does before pressing save.
 */
export function MoneyInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: number
  onChange: (n: number) => void
  placeholder?: string | undefined
  ariaLabel?: string | undefined
}): ReactNode {
  const id = useId()
  const shown = value > 0 ? new Intl.NumberFormat('en-IN').format(Math.round(value)) : ''
  return (
    <div className="flex h-12 items-center gap-1 rounded-md border-[1.5px] border-solid border-hairline bg-surface px-3 focus-within:border-accent-text">
      <span className="text-[16px] font-semibold text-ink-soft">₹</span>
      <input
        id={id}
        aria-label={ariaLabel}
        inputMode="numeric"
        autoComplete="off"
        className="h-full min-w-0 flex-1 border-0 bg-transparent text-[17px] font-semibold tabular-nums text-ink outline-none"
        value={shown}
        placeholder={placeholder}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, '').slice(0, 12)
          onChange(digits === '' ? 0 : Number(digits))
        }}
      />
    </div>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  type = 'text',
  maxLength,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string | undefined
  ariaLabel?: string | undefined
  type?: 'text' | 'date'
  maxLength?: number | undefined
}): ReactNode {
  return (
    <input
      aria-label={ariaLabel}
      type={type}
      maxLength={maxLength}
      autoComplete="off"
      className="h-12 w-full rounded-md border-[1.5px] border-solid border-hairline bg-surface px-3 text-[16px] font-medium text-ink outline-none focus:border-accent-text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
