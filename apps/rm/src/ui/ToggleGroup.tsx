import { useId, type ReactNode } from 'react'
import { cn } from '../lib/cn.ts'

export interface ToggleOption<V extends string> {
  value: V
  label: string
  icon?: ReactNode
}

export interface ToggleGroupProps<V extends string> {
  value: V
  onChange: (value: V) => void
  options: readonly ToggleOption<V>[]
  /** What the choice is, shown before it ("This is"), or read only by a screen reader. */
  label: string
  showLabel?: boolean
  disabled?: boolean
  /** `sm` in a dense composer, `md` in a dialog. */
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Two or three ways of one thing, as one segmented switch rather than separate forms: the RM who
 * opened "Add note" and realises it was a call changes one control, not the whole dialog. Each
 * option is a pressed button in a labelled group, so a screen reader hears the choice and which
 * one is on.
 */
export function ToggleGroup<V extends string>({
  value,
  onChange,
  options,
  label,
  showLabel = false,
  disabled = false,
  size = 'md',
  className,
}: ToggleGroupProps<V>) {
  const id = useId()
  return (
    <div
      role="group"
      aria-labelledby={`${id}-label`}
      className={cn('flex items-center gap-3', className)}
    >
      <span id={`${id}-label`} className={cn('text-label text-ink', !showLabel && 'sr-only')}>
        {label}
      </span>
      <div className="inline-flex w-fit rounded-md bg-ground-deep p-0.5">
        {options.map((option) => {
          const active = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                'relative inline-flex h-control-sm items-center gap-1.5 rounded-sm transition-colors duration-feedback [&_svg]:size-3.5',
                size === 'sm' ? 'px-2.5 text-caption' : 'px-3 text-label',
                'focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-45',
                'pointer-coarse:hit-target',
                active ? 'bg-surface text-ink shadow-raised' : 'text-ink-soft hover:text-ink',
              )}
            >
              {option.icon}
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
