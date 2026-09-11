/**
 * Six boxed digits.
 *
 * Two specs describe the same control — `10-diy-otp/06-verify-otp.md` and, more cleanly,
 * `05-cas-import/04-cas-enter-otp.md`: one row, no separators, ~48–52pt squares, ~8pt apart,
 * spanning the content width, a 1px hairline that turns the focus colour on the active cell.
 * That geometry is here. Two things about it are not.
 *
 * **One input, six boxes.** Six real inputs is the obvious build and it is the wrong one: paste
 * puts all six digits in the first box, autofill has nothing to fill, backspace at the start of a
 * box does nothing, and a screen reader announces six unlabelled fields. So there is a single
 * `<input maxLength={6} autoComplete="one-time-code">` laid transparently over the row, and the
 * cells are presentation. The SMS autofill on iOS and Android needs exactly that attribute and
 * exactly one field.
 *
 * **The digits are shown.** The source masks every cell with a literal `*` — including, as its
 * own spec notes, before anything has been typed, which is how you can tell it is a mock. Masking
 * a code the customer is reading off their own lock screen protects nothing and costs them the
 * one check they have against a mistyped digit.
 */
import { useEffect, useId, useRef } from 'react'
import type { ChangeEvent, ReactNode } from 'react'

export function OtpInput({
  value,
  onChange,
  length = 6,
  label,
  invalid = false,
  disabled = false,
  autoFocus = false,
  onComplete,
}: {
  /** Digits only, never longer than `length`. The parent owns it. */
  value: string
  onChange: (next: string) => void
  length?: number
  /** The accessible name. There is one field, so there is one name. */
  label: string
  /** Draws every cell in the refusal colour and marks the field invalid. */
  invalid?: boolean
  disabled?: boolean
  autoFocus?: boolean
  /** Fired once, on the keystroke that fills the last cell. */
  onComplete?: (code: string) => void
}): ReactNode {
  const id = useId()
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) field.current?.focus({ preventScroll: true })
  }, [autoFocus])

  const handle = (e: ChangeEvent<HTMLInputElement>): void => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, length)
    onChange(digits)
    if (digits.length === length) onComplete?.(digits)
  }

  /* Where the next digit lands. Clamped, so a full code keeps the ring on the last cell rather
     than losing it off the end of the row. */
  const active = Math.min(value.length, length - 1)

  return (
    <div className="relative">
      {/*
       * `justify-between` with fixed square cells, not `flex-1` with a gap.
       *
       * Both specs measure the boxes as ~48-52pt *squares* "evenly spaced across the full
       * content width", and on the reference's 390pt phone those two facts happen to agree. On
       * a 430pt one they do not: six flexible cells across a 398px gutter are 60x48 letterboxes.
       * So the cell keeps its square and the row spends the slack on the gaps, which is the
       * shape in the frame rather than the arithmetic behind it.
       */}
      <div className="flex justify-between gap-1.5" aria-hidden="true">
        {Array.from({ length }, (_, i) => {
          const digit = value[i] ?? ''
          const focused = i === active && !disabled
          const border = invalid
            ? 'border-danger'
            : focused
              ? 'border-accent'
              : 'border-hairline-mint'
          return (
            <span
              key={i}
              className={`grid aspect-square w-[52px] min-w-0 shrink place-items-center rounded-sm border-[1.5px] border-solid bg-surface text-[21px] font-semibold tabular-nums text-ink transition-colors duration-150 ${border} ${
                disabled ? 'opacity-55' : ''
              }`}
            >
              {digit || (focused ? <Caret /> : null)}
            </span>
          )
        })}
      </div>

      {/*
       * The real field, over the cells rather than beside them: a tap anywhere on the row lands
       * on it and raises the keypad, which is what the row looks like it should do. Transparent
       * rather than `sr-only`, because a zero-size field is one some browsers refuse to autofill
       * and one a mobile keyboard will scroll the page to reach.
       */}
      <input
        ref={field}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d*"
        maxLength={length}
        disabled={disabled}
        aria-label={label}
        aria-invalid={invalid}
        value={value}
        onChange={handle}
        className="absolute inset-0 h-full w-full cursor-pointer rounded-sm border-0 bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent"
      />
    </div>
  )
}

/** The bar in the cell waiting for a digit. `animate-pulse` rather than a keyframe of our own. */
function Caret(): ReactNode {
  return <span className="h-6 w-[2px] animate-pulse rounded-pill bg-ink" />
}
