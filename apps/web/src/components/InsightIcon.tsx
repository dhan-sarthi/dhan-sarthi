/**
 * Two-tone icons, drawn the way every icon in GO Mobile+ is drawn: a thin green line with exactly
 * one orange element carrying the meaning — the coin that is idle, the tick on a loan that ends,
 * the gap in a shield. It is a small thing that does a lot of the work of belonging to the bank.
 *
 * One shape per insight kind from `packages/core`, so the picture is a fact about the finding
 * rather than decoration. `unknown` falls back to the rupee coin instead of throwing, because a
 * new insight kind in core must never break a screen.
 */
import type { ReactNode } from 'react'
import type { Insight } from '@dhan/core'

const S = {
  fill: 'none',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export function InsightIcon({
  kind,
  className = '',
}: {
  kind: Insight['kind'] | 'default'
  className?: string
}): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={`size-6 flex-none ${className}`}
      stroke="currentColor"
      {...S}
    >
      {shape(kind)}
    </svg>
  )
}

/* The green is `currentColor` so the icon inherits the card's ink; the orange is explicit,
   because it is the one element that must stay the accent wherever the icon is placed. */
const O = '#f58220'

function shape(kind: Insight['kind'] | 'default'): ReactNode {
  switch (kind) {
    // Money that has sat still: a coin resting at the bottom of a jar.
    case 'idle_cash':
      return (
        <>
          <path d="M6 4h12v3a6 6 0 0 1-2 4.4 6 6 0 0 0 2 4.4V20H6v-4.2a6 6 0 0 0 2-4.4A6 6 0 0 1 6 7Z" />
          <circle cx="12" cy="16.5" r="2.2" fill={O} stroke="none" />
        </>
      )
    // A commitment that ends: the last instalment ticked off.
    case 'emi_ending':
      return (
        <>
          <path d="M4 6h13M4 12h9M4 18h6" />
          <path d="M14.5 17.6 17 20l4.2-5" stroke={O} />
        </>
      )
    // Charges that repeat on their own: a mandate on a loop.
    case 'subscription_review':
      return (
        <>
          <path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6" />
          <path d="M17.4 3v3.6h-3.6" stroke={O} />
          <path d="M6.6 21v-3.6h3.6" stroke={O} />
        </>
      )
    // A price that moved without anyone being told.
    case 'price_increase':
      return (
        <>
          <path d="M4 19h16" />
          <path d="M6 15l4.5-4.5 3 3L20 7" stroke={O} />
          <path d="M20 11V7h-4" stroke={O} />
        </>
      )
    // Spending drifting upward in one category.
    case 'category_drift':
      return (
        <>
          <path d="M4 20V9M10 20v-6M16 20v-9" />
          <path d="M22 20V5" stroke={O} />
        </>
      )
    // Cover that is not there: a shield with the gap left open.
    case 'protection_gap':
      return (
        <>
          <path d="M12 3.5 5 6.4v5.2c0 4.3 2.9 7.6 7 8.9 1.6-.5 3-1.4 4.1-2.6" />
          <path d="M19 6.4v4.3" stroke={O} strokeDasharray="0.1 3.2" />
          <circle cx="19" cy="14.2" r="1.3" fill={O} stroke="none" />
        </>
      )
    // Too little set aside: a buffer only part filled.
    case 'buffer_thin':
      return (
        <>
          <rect x="4" y="7" width="16" height="12" rx="2.5" />
          <path d="M4 15h16" stroke={O} />
          <path d="M8 4.5h8" />
        </>
      )
    // Debt that outruns everything: a card with a warning.
    case 'expensive_debt':
      return (
        <>
          <rect x="3" y="6" width="18" height="12" rx="2.5" />
          <path d="M3 10h18" />
          <path d="M17 12.6v2.6" stroke={O} />
          <circle cx="17" cy="17.4" r="0.9" fill={O} stroke="none" />
        </>
      )
    // A repayment that was missed: a calendar with the day marked.
    case 'missed_repayment':
      return (
        <>
          <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" />
          <path d="M3.5 10h17M8 3.5v4M16 3.5v4" />
          <path d="M10 15.5l4 4M14 15.5l-4 4" stroke={O} />
        </>
      )
    // A habit: the same small purchase, again and again.
    case 'habit_cost':
      return (
        <>
          <path d="M7 8h10l-1 11.5H8Z" />
          <path d="M9.5 8V6a2.5 2.5 0 0 1 5 0v2" />
          <circle cx="12" cy="13.5" r="1.8" fill={O} stroke="none" />
        </>
      )
    default:
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9.5 8.5h5M9.5 12h5M11 8.5v7" stroke={O} />
        </>
      )
  }
}
