/**
 * The persistent strip that says the app is simulating.
 *
 * Shown above the header on every screen while the offline chunk is in use, because the figures
 * look exactly as they do from the server and the one difference — nothing is recorded — is the
 * difference a compliance reviewer cares about. Peach, like the clock: attention, not alarm.
 *
 * The strip itself is `InfoBanner` now; this is the one message.
 */
import type { ReactNode } from 'react'
import { InfoBanner } from './InfoBanner.tsx'

export function OfflineBadge({ onRetry, busy }: { onRetry: () => void; busy: boolean }): ReactNode {
  return (
    <InfoBanner
      tone="clay"
      action={busy ? 'Trying…' : 'Try again'}
      onAction={onRetry}
      actionDisabled={busy}
    >
      <b className="font-semibold">Offline</b> — local simulation, nothing you do here is recorded.
    </InfoBanner>
  )
}
