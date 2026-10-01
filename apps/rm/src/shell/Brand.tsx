import { cn } from '../lib/cn.ts'

/**
 * The console's mark: a small green tile and the product's name. Deliberately not the bank's
 * logo, which is IDBI's to supply; the green says whose desk this is.
 */
export function Brand({
  tone = 'ink',
  className,
}: {
  tone?: 'ink' | 'on-ink'
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span
        aria-hidden
        className={cn(
          'relative inline-flex size-7 items-center justify-center overflow-hidden rounded-md',
          tone === 'ink' ? 'bg-brand' : 'bg-on-ink/12 ring-1 ring-on-ink/20',
        )}
      >
        <svg viewBox="0 0 16 16" className="size-4 text-on-brand" fill="none" aria-hidden>
          <path
            d="M3 12.5 7 8.5l2.5 2.5L13 6.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10 6.5h3v3"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="leading-none">
        <span className={cn('block text-heading', tone === 'ink' ? 'text-ink' : 'text-on-ink')}>
          Dhan Sarthi
        </span>
        <span
          className={cn(
            'mt-0.5 block text-micro tracking-micro uppercase',
            tone === 'ink' ? 'text-ink-faint' : 'text-on-ink/70',
          )}
        >
          RM Desk
        </span>
      </span>
    </div>
  )
}
