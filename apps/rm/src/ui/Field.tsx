import { ChevronDown } from 'lucide-react'
import { useId, type ComponentProps, type ReactNode } from 'react'
import { cn } from '../lib/cn.ts'

/*
 * Form controls. One height (36px), one edge, one focus ring, so a filter row, a sign-in form and
 * a reason prompt are the same controls. `Field` wires a label, a hint and an error to whatever
 * control it wraps.
 *
 * A field's edge is `field-edge` (3:1 or more on the white card and on the cream ground), not the
 * hairline cards and table rules use: on a white card the edge is the only sign a field is there.
 * Focus draws the same solid brand as the console's focus ring, as a 2px edge (the border and a
 * 1px ring inside the same box), so the field does not change size.
 */

const control = cn(
  'w-full rounded-md border border-field-edge bg-surface text-body text-ink shadow-raised transition-[border-color,box-shadow] duration-feedback',
  'placeholder:text-ink-hint hover:border-ink-hint',
  'focus:border-focus focus:ring-1 focus:ring-focus focus:outline-none',
  'disabled:cursor-not-allowed disabled:border-hairline disabled:bg-ground disabled:text-ink-faint',
  'aria-invalid:border-danger aria-invalid:focus:border-danger aria-invalid:focus:ring-danger',
)

export interface InputProps extends ComponentProps<'input'> {
  /** An icon inside the left edge: a search glass, a rupee sign. */
  leading?: ReactNode
  /** Anything inside the right edge: a key hint, a reveal toggle. */
  trailing?: ReactNode
  inputSize?: 'md' | 'lg'
}

export function Input({ className, leading, trailing, inputSize = 'md', ...props }: InputProps) {
  const height = inputSize === 'lg' ? 'h-control-lg' : 'h-control'
  if (!leading && !trailing) {
    return <input className={cn(control, height, 'px-3', className)} {...props} />
  }
  return (
    <div className={cn('relative flex items-center', className)}>
      {leading ? (
        <span className="pointer-events-none absolute left-3 inline-flex text-ink-hint [&_svg]:size-4">
          {leading}
        </span>
      ) : null}
      <input
        className={cn(control, height, leading ? 'pl-9' : 'pl-3', trailing ? 'pr-10' : 'pr-3')}
        {...props}
      />
      {trailing ? (
        <span className="absolute right-2 inline-flex items-center">{trailing}</span>
      ) : null}
    </div>
  )
}

export function Textarea({ className, rows = 3, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      rows={rows}
      className={cn(control, 'min-h-20 resize-y px-3 py-2 leading-normal', className)}
      {...props}
    />
  )
}

/**
 * The browser's own select, restyled: it opens the native list, which is keyboard and screen
 * reader correct on every platform without a line of ours.
 */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className={cn('relative', className)}>
      <select className={cn(control, 'h-control appearance-none pr-9 pl-3')} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-hint"
      />
    </div>
  )
}

export interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  /** Renders the control with the ids it needs: `id`, `aria-describedby`, `aria-invalid`. */
  children: (control: {
    id: string
    'aria-describedby'?: string
    'aria-invalid'?: true
  }) => ReactNode
  /** A control beside the label: "Forgot password?", "Show". */
  corner?: ReactNode
  className?: string
}

export function Field({ label, hint, error, children, corner, className }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  // The error replaces the hint on screen, so it replaces it for a screen reader too.
  const describedBy = error ? errorId : hint ? hintId : ''
  return (
    <div className={cn('grid gap-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-label text-ink">
          {label}
        </label>
        {corner}
      </div>
      {children({
        id,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(error ? { 'aria-invalid': true as const } : {}),
      })}
      {error ? (
        <p id={errorId} className="text-caption text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-caption-plain text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
