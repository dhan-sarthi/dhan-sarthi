/**
 * Which tier of the fallback ladder the reviewer is on, always visible.
 *
 *   live      the avatar can take a call
 *   text      the same engine, typed — Uday is busy, unconfigured, or out of minutes
 *   offline   the simulation in this browser; nothing is recorded
 *
 * A tier that is not labelled is a tier a reviewer mistakes for the product being broken.
 */
import type { ReactNode } from 'react'
import { Pill } from './ui.tsx'

export type Tier = 'live' | 'text' | 'offline'

const LABEL: Record<Tier, string> = {
  live: 'Live avatar',
  text: 'Text advisor',
  offline: 'Offline',
}

const TONE: Record<Tier, 'ok' | 'plain' | 'warn'> = {
  live: 'ok',
  text: 'plain',
  offline: 'warn',
}

export function TierBadge({ tier }: { tier: Tier }): ReactNode {
  return (
    <span role="status" aria-label={`Service tier: ${LABEL[tier]}`} className="inline-flex">
      <Pill tone={TONE[tier]}>{LABEL[tier]}</Pill>
    </span>
  )
}
