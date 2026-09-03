/**
 * The persistent strip that says the app is simulating.
 *
 * Shown above the header on every screen while the offline chunk is in use, because the figures
 * look exactly as they do from the server and the one difference — nothing is recorded — is the
 * difference a compliance reviewer cares about. Peach, like the clock: attention, not alarm.
 */
import type { ReactNode } from 'react'

export function OfflineBadge({ onRetry, busy }: { onRetry: () => void; busy: boolean }): ReactNode {
  return (
    <div
      role="status"
      className="flex flex-none items-center gap-3 bg-tint-clay px-4 py-2.5 text-[13px] leading-snug text-accent-text"
    >
      <span className="min-w-0 flex-1">
        <b className="font-semibold">Offline</b> — local simulation, nothing you do here is
        recorded.
      </span>
      <button
        type="button"
        onClick={onRetry}
        disabled={busy}
        className="h-9 shrink-0 whitespace-nowrap rounded-pill border-[1.5px] border-solid border-accent bg-white px-3 text-[13px] font-semibold text-accent-text transition-transform duration-100 active:scale-[0.985] disabled:opacity-60"
      >
        {busy ? 'Trying…' : 'Try again'}
      </button>
    </div>
  )
}
