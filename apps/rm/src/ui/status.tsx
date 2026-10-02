import type { GoalHealth, Segment, SignalSeverity, Strength } from '@dhan/contracts'
import { CircleAlert, Eye, Lightbulb } from 'lucide-react'
import { cn } from '../lib/cn.ts'
import { Chip, type ChipTone } from './Chip.tsx'
import { Tooltip } from './Tooltip.tsx'

/*
 * The console's status vocabulary: severity, segment, goal health, relationship strength.
 * One component per meaning, so "At risk" is the same words in the same colour on every page.
 * Each pairs colour with a word and a shape; none relies on colour alone.
 */

/* ---------------------------------------------------------------- Severity */

/**
 * The engine's three levels, re-voiced for the RM. The customer's app says "Worth doing now";
 * the RM is told to act.
 */
export const SEVERITY: Record<SignalSeverity, { label: string; tone: ChipTone }> = {
  urgent: { label: 'Act now', tone: 'danger' },
  important: { label: 'Worth a look', tone: 'streak' },
  opportunity: { label: 'Worth knowing', tone: 'budget' },
}

/** The shape that goes with each level, for marks too narrow to carry the word. */
export const SEVERITY_ICON = {
  urgent: CircleAlert,
  important: Eye,
  opportunity: Lightbulb,
} as const

export function SeverityChip({
  severity,
  size = 'sm',
  className,
}: {
  severity: SignalSeverity
  size?: 'sm' | 'md'
  className?: string
}) {
  const { label, tone } = SEVERITY[severity]
  const Icon = SEVERITY_ICON[severity]
  return (
    <Chip tone={tone} size={size} icon={<Icon aria-hidden />} className={className}>
      {label}
    </Chip>
  )
}

/* ---------------------------------------------------------------- Segment */

export const SEGMENT: Record<Segment, { label: string; tone: ChipTone; rule: string }> = {
  priority: { label: 'Priority', tone: 'ink', rule: 'Relationship value of ₹50L or more' },
  affluent: { label: 'Affluent', tone: 'brand', rule: 'Relationship value of ₹10L to ₹50L' },
  mass: { label: 'Mass', tone: 'neutral', rule: 'Relationship value under ₹10L' },
}

export function SegmentBadge({ segment, className }: { segment: Segment; className?: string }) {
  const { label, tone, rule } = SEGMENT[segment]
  return (
    <Tooltip content={rule}>
      <span
        tabIndex={0}
        className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-focus"
      >
        <Chip tone={tone} className={className}>
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
          health === 'off_track' && cn('rounded-[2px]', dot),
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
 * Relationship strength with its reason one hover away. The reason is the point: "Active 6 days
 * ago · 3 IDBI products · 62% of balances with IDBI" is what the RM acts on, not the word.
 */
export function StrengthBadge({ strength, className }: { strength: Strength; className?: string }) {
  const bars = STRENGTH_BARS[strength.level]
  const low = strength.level === 'low'
  return (
    <Tooltip content={strength.reason}>
      <span
        tabIndex={0}
        aria-label={`Relationship strength ${STRENGTH_LABEL[strength.level]}. ${strength.reason}`}
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
                'w-[3px] rounded-[1px]',
                n === 1 ? 'h-1.5' : n === 2 ? 'h-2.25' : 'h-3',
                n <= bars ? (low ? 'bg-danger' : 'bg-brand') : 'bg-hairline',
              )}
            />
          ))}
        </span>
        {STRENGTH_LABEL[strength.level]}
      </span>
    </Tooltip>
  )
}
