import type { GoalHealth, Segment, SignalSeverity, Strength } from '@dhan/contracts'
import { CircleAlert, Eye, Lightbulb, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn.ts'
import { Chip, chipVariants, type ChipTone } from './Chip.tsx'
import { useBadgeTabIndex } from './interactive-row.tsx'
import { Tooltip } from './Tooltip.tsx'

/*
 * The console's status vocabulary: severity, segment, goal health, relationship strength.
 * One record per level, so "At risk" is the same words in the same colour on every page: a chip,
 * a bare mark, a bar and a legend swatch all read their colour from here, and a page that needs a
 * new way of drawing a level adds it here rather than a map of its own. Each pairs colour with a
 * word and a shape; none relies on colour alone.
 */

/* ---------------------------------------------------------------- Severity */

export interface SeverityStyle {
  /** The engine's level, re-voiced for the RM. The customer's app says "Worth doing now". */
  label: string
  /** The chip's fill. */
  tone: ChipTone
  /** The shape that goes with the level, for marks too narrow to carry the word. */
  icon: LucideIcon
  /** The mark's ink when it stands alone on a white or tinted surface. */
  ink: string
  /** A bar or a swatch of the level. */
  fill: string
}

/**
 * Act now is the one that needs a person, so it alone is red. Worth knowing is the least
 * actionable and usually the most common, so its bare mark is the quiet tertiary ink: ten of
 * them down a list must not outweigh one red.
 */
export const SEVERITY: Record<SignalSeverity, SeverityStyle> = {
  urgent: {
    label: 'Act now',
    tone: 'danger',
    icon: CircleAlert,
    ink: 'text-danger',
    fill: 'bg-danger',
  },
  important: {
    label: 'Worth a look',
    tone: 'streak',
    icon: Eye,
    ink: 'text-streak-ink',
    fill: 'bg-streak',
  },
  opportunity: {
    label: 'Worth knowing',
    tone: 'budget',
    icon: Lightbulb,
    ink: 'text-ink-faint',
    fill: 'bg-budget',
  },
}

export function SeverityChip({
  severity,
  size = 'sm',
  className,
}: {
  severity: SignalSeverity
  size?: 'sm' | 'md'
  className?: string
}) {
  const { label, tone, icon: Icon } = SEVERITY[severity]
  return (
    <Chip tone={tone} size={size} icon={<Icon aria-hidden />} className={className}>
      {label}
    </Chip>
  )
}

/**
 * The severity without its word, for a place too narrow to repeat "Worth a look" on every row:
 * a table column, a tile's corner, a chip's leading icon.
 *
 * - `filled`: the chip's fill and icon in a square (`xs` 16px, `sm` 20px).
 * - `bare`: the icon alone in the level's ink (`xs` 12px, `sm` 14px).
 *
 * The word is there for a screen reader either way (`role="img"` for a filled mark, visually
 * hidden text after a bare one, ending in `labelSuffix`: pass ": " when the mark leads a line of
 * text), and the shape differs per level, so colour is never the only signal.
 */
export function SeverityMark({
  severity,
  variant = 'filled',
  size = 'sm',
  labelSuffix = '',
  className,
}: {
  severity: SignalSeverity
  variant?: 'filled' | 'bare'
  size?: 'xs' | 'sm'
  labelSuffix?: string
  className?: string
}) {
  const { label, tone, icon: Icon, ink } = SEVERITY[severity]
  if (variant === 'bare') {
    return (
      <>
        <Icon
          aria-hidden
          className={cn('shrink-0', size === 'xs' ? 'size-3' : 'size-3.5', ink, className)}
        />
        <span className="sr-only">{`${label}${labelSuffix}`}</span>
      </>
    )
  }
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

/* ---------------------------------------------------------------- Segment */

export interface SegmentStyle {
  label: string
  /** The chip's tone, as a customer's header and Today's queue draw it. */
  tone: ChipTone
  rule: string
  /**
   * The segment in a stacked bar or a legend swatch: one sequential green, deepest for Priority,
   * as segments are ordered by value. The three steps are even in lightness, and the light end
   * stays clear of the white surface.
   */
  fill: string
  /** The quiet chip, for a dense table where the segment is context, not the action. */
  quiet: string
}

export const SEGMENT: Record<Segment, SegmentStyle> = {
  priority: {
    label: 'Priority',
    tone: 'ink',
    rule: 'Relationship value of ₹50L or more',
    fill: 'bg-chart-seq-550',
    quiet: 'bg-brand-soft text-ink',
  },
  affluent: {
    label: 'Affluent',
    tone: 'brand',
    rule: 'Relationship value of ₹10L to ₹50L',
    fill: 'bg-chart-seq-400',
    quiet: 'bg-brand-wash text-ink-soft',
  },
  mass: {
    label: 'Mass',
    tone: 'neutral',
    rule: 'Relationship value under ₹10L',
    fill: 'bg-chart-seq-300',
    quiet: 'bg-transparent text-ink-faint ring-1 ring-hairline ring-inset',
  },
}

/** The order segments are drawn and listed in: by value band, highest first. */
export const SEGMENT_ORDER: readonly Segment[] = ['priority', 'affluent', 'mass']

/**
 * The segment as a chip, with its rule one hover or tap away. `quiet` is the dense table's chip:
 * one family of tints, deepest for Priority, so the segment never carries the row's heaviest mark.
 */
export function SegmentBadge({
  segment,
  variant = 'solid',
  className,
}: {
  segment: Segment
  variant?: 'solid' | 'quiet'
  className?: string
}) {
  const { label, tone, rule, quiet } = SEGMENT[segment]
  const tabIndex = useBadgeTabIndex()
  return (
    <Tooltip content={rule} openOnTap>
      <span
        tabIndex={tabIndex}
        className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-focus"
      >
        <Chip tone={tone} className={cn(variant === 'quiet' && quiet, className)}>
          {label}
        </Chip>
      </span>
    </Tooltip>
  )
}

/* ---------------------------------------------------------------- Goal health */

export const HEALTH: Record<GoalHealth, { label: string; dot: string; text: string }> = {
  on_track: { label: 'On track', dot: 'bg-brand', text: 'text-ink' },
  at_risk: { label: 'At risk', dot: 'bg-streak', text: 'text-ink' },
  off_track: { label: 'Off track', dot: 'bg-danger', text: 'text-danger' },
}

/**
 * A dot and a word. The shapes differ as well as the colours (a ring for at risk, a filled
 * square for off track) so the three read apart in greyscale.
 */
export function HealthDot({
  health,
  showLabel = true,
  className,
}: {
  health: GoalHealth
  showLabel?: boolean
  className?: string
}) {
  const { label, dot, text } = HEALTH[health]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-label whitespace-nowrap',
        text,
        className,
      )}
      {...(showLabel ? {} : { role: 'img', 'aria-label': label })}
    >
      <span
        aria-hidden
        className={cn(
          'inline-block size-2 shrink-0',
          health === 'on_track' && cn('rounded-full', dot),
          health === 'at_risk' && 'rounded-full border-2 border-streak',
          health === 'off_track' && cn('rounded-mark', dot),
        )}
      />
      {showLabel ? label : null}
    </span>
  )
}

/* ---------------------------------------------------------------- Strength */

const STRENGTH_LABEL: Record<Strength['level'], string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}
const STRENGTH_BARS: Record<Strength['level'], number> = { high: 3, medium: 2, low: 1 }

/**
 * Relationship strength with its reason one hover or tap away. The reason is the point: "Active 6
 * days ago · 3 IDBI products · 62% of balances with IDBI" is what the RM acts on, not the word.
 * The reason is in the badge's text for a screen reader, not in an `aria-label` on a span, which
 * most screen readers drop; on screen the badge still reads "High".
 */
export function StrengthBadge({ strength, className }: { strength: Strength; className?: string }) {
  const bars = STRENGTH_BARS[strength.level]
  const low = strength.level === 'low'
  const tabIndex = useBadgeTabIndex()
  return (
    <Tooltip content={strength.reason} openOnTap>
      <span
        tabIndex={tabIndex}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-sm text-label whitespace-nowrap focus-visible:outline-2 focus-visible:outline-focus',
          low ? 'text-danger' : 'text-ink',
          className,
        )}
      >
        <span aria-hidden className="inline-flex h-3 items-end gap-[2px]">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={cn(
                'w-[3px] rounded-mark',
                n === 1 ? 'h-1.5' : n === 2 ? 'h-2.25' : 'h-3',
                n <= bars ? (low ? 'bg-danger' : 'bg-brand') : 'bg-hairline',
              )}
            />
          ))}
        </span>
        <span className="sr-only">Relationship strength </span>
        {STRENGTH_LABEL[strength.level]}
        <span className="sr-only">. {strength.reason}</span>
      </span>
    </Tooltip>
  )
}
