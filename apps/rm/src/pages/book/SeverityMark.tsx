import type { SignalSeverity } from '@dhan/contracts'
import { cn } from '../../lib/cn.ts'
import { SEVERITY, SEVERITY_ICON, chipVariants } from '../../ui/index.ts'

/*
 * The kit's severity chip without its word, for a table column too narrow to repeat "Worth a
 * look" on every row. The same fill and the same icon as `SeverityChip`, and the word is still
 * there for a screen reader and on hover; the shape differs per level, so colour is never the
 * only signal.
 */
export function SeverityMark({
  severity,
  size = 'sm',
  className,
}: {
  severity: SignalSeverity
  size?: 'xs' | 'sm'
  className?: string
}) {
  const { label, tone } = SEVERITY[severity]
  const Icon = SEVERITY_ICON[severity]
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        chipVariants({ tone }),
        'shrink-0 justify-center px-0',
        size === 'sm' ? 'size-5 [&_svg]:size-3' : 'size-4 rounded-xs [&_svg]:size-2.5',
        className,
      )}
    >
      <Icon aria-hidden strokeWidth={2.25} />
    </span>
  )
}
