/**
 * The single avatar slot, from the point of view of the person who did not get it.
 *
 * Three states, each a designed screen rather than a spinner: waiting (position and an honest
 * estimate, text conversation underneath), claimable (the slot is held for a short window and
 * the card counts it down), and expired (the window lapsed; the line is back to the tap). The
 * estimate is arithmetic over the live call's remaining cap, so "about 3 min" is what it says,
 * not a promise of a call.
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { QueuePlace } from '../lib/avatar.ts'

const minutes = (seconds: number | null): string | null =>
  seconds === null ? null : `about ${Math.max(1, Math.round(seconds / 60))} min`

/** Seconds until `until`, re-read four times a second and never below zero. */
function useCountdown(until: string | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!until) return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [until])
  if (!until) return 0
  return Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000))
}

export function QueueCard({
  place,
  onJoin,
  onLeave,
  onCallAgain,
}: {
  place: QueuePlace
  onJoin: () => void
  onLeave: () => void
  onCallAgain: () => void
}): ReactNode {
  const left = useCountdown(place.state === 'claimable' ? place.holdUntil : null)

  if (place.state === 'expired') {
    return (
      <div className="mx-4 mb-3 flex flex-none items-center gap-3 rounded-md bg-white/15 p-3 text-[13px] leading-snug text-white">
        <span className="min-w-0 flex-1">
          Your turn came and went. Call again to take a new place in line.
        </span>
        <button
          type="button"
          onClick={onCallAgain}
          className="h-10 flex-none whitespace-nowrap rounded-pill border-0 bg-accent px-4 text-[14px] font-semibold text-white"
        >
          Call again
        </button>
        <button
          type="button"
          onClick={onLeave}
          aria-label="Dismiss"
          className="grid size-10 flex-none place-items-center rounded-pill border-0 bg-transparent text-white/70"
        >
          ×
        </button>
      </div>
    )
  }

  if (place.state === 'claimable') {
    const holdSeconds = place.holdSeconds
    const pct = holdSeconds > 0 ? Math.round((left / holdSeconds) * 100) : 0
    return (
      <div className="mx-4 mb-3 flex-none rounded-md bg-white/15 p-3 text-[13px] leading-snug text-white">
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1">
            Uday is free — the line is held for you for{' '}
            <span className="font-bold tabular-nums">{left}s</span>.
          </span>
          <button
            type="button"
            onClick={onJoin}
            className="h-10 flex-none whitespace-nowrap rounded-pill border-0 bg-accent px-4 text-[14px] font-semibold text-white"
          >
            Join now
          </button>
        </div>
        <div
          className="mt-2.5 flex h-1.5 overflow-hidden rounded-pill bg-white/20"
          role="presentation"
        >
          <span
            className="h-full bg-accent transition-[width] duration-200 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    )
  }

  const eta = minutes(place.estimatedWaitSeconds)
  return (
    <div className="mx-4 mb-3 flex flex-none items-center gap-3 rounded-md bg-white/15 p-3 text-[13px] leading-snug text-white">
      <span className="min-w-0 flex-1">
        {place.position === 1 ? 'You are next in line' : `You are number ${place.position} in line`}
        {eta ? `, ${eta}` : ''}. Carry on in text meanwhile.
      </span>
      <button
        type="button"
        onClick={onLeave}
        className="h-10 flex-none whitespace-nowrap rounded-pill border-[1.5px] border-solid border-white/40 bg-transparent px-3 text-[14px] font-semibold text-white"
      >
        Leave line
      </button>
    </div>
  )
}
