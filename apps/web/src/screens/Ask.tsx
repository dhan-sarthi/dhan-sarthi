/**
 * Ask Uday — a video call, and nothing else.
 *
 * An earlier version of this screen had a text input, tappable suggested questions and a
 * transcript. All of it is gone. Talking to your banker is a call: you see him, you press one
 * button, you talk. Every extra control was a reason to read the screen instead of using it.
 *
 * **Why the video sits in a tile rather than filling the screen.** Runway publishes a landscape
 * track — 1088×704, about 1.55:1 — and a phone is 390×844, about 0.46:1. Filling that with
 * `object-fit: cover` keeps **30% of the source width**, which is why he arrived cropped to the
 * bridge of his nose. A 4:5 tile keeps a little over half the width, which is close to the
 * head-and-shoulders framing the source was composed for.
 *
 * The deterministic question-answering engine in `@dhan/core` is untouched and still tested; it
 * simply is not what this screen is for. It backs "Why this?" on Today, and it remains the
 * fallback for a text surface if we ever want one.
 */
import type { ReactNode } from 'react'
import type { Snapshot } from '@dhan/core'
import { useAvatar } from '../lib/avatar.ts'

export function Ask({
  snapshot,
  onClose,
}: {
  snapshot: Snapshot
  onClose: () => void
}): ReactNode {
  const avatar = useAvatar(buildBrief(snapshot))

  const connecting = avatar.mode === 'connecting'
  const connected = avatar.mode === 'live'
  // Two different things. The room connects in about a second; the worker publishes nothing for
  // roughly five more. Swapping the poster for the video on connection alone makes a working
  // call look broken, so this waits for frames to actually decode.
  const showVideo = connected && avatar.videoLive

  // He is audible before he is visible — the worker publishes audio several seconds ahead of a
  // decodable video track. Holding the audio back would cut the first words off his greeting, so
  // instead the portrait responds to his voice while we wait. Stillness then reads as connecting
  // rather than frozen.
  const speaking = connected && !avatar.videoLive && avatar.audioLevel > 0.06
  const glow = Math.min(1, avatar.audioLevel * 1.7)

  // Only shown when something is actually happening. Idle needs no badge.
  // The countdown only appears when it is nearly up. A visible timer for the whole call makes a
  // conversation feel metered, and the only thing it needs to do is stop somebody being cut off
  // mid-sentence without warning.
  const runningOut = avatar.secondsLeft !== null && avatar.secondsLeft <= 120

  const status = connected
    ? avatar.videoLive
      ? runningOut
        ? `${fmt(avatar.secondsLeft ?? 0)} left`
        : 'Live'
      : speaking
        ? 'Speaking'
        : 'Joining…'
    : connecting
      ? 'Calling…'
      : avatar.reason
        ? 'Unavailable'
        : null

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-gradient-to-b from-brand to-brand-deep text-white">
      {/* --------------------------------------------------- Top bar */}
      <div className="flex flex-none items-center gap-2.5 px-4 pb-1.5 pt-[max(16px,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => {
            avatar.stop()
            onClose()
          }}
          aria-label="Close"
          className="grid size-[38px] flex-none place-items-center rounded-pill border-0 bg-white/15 text-white"
        >
          <CloseIcon />
        </button>
        <div className="flex-1" />
        {status ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill bg-white/15 px-3 py-1.5 text-[11.5px] font-bold text-white">
            <span
              className={`size-[7px] rounded-pill ${connected ? 'bg-tint-sage' : 'bg-accent'} ${
                connecting ? 'animate-pulse' : ''
              }`}
            />
            {status}
          </span>
        ) : null}
      </div>

      {/* --------------------------------------------------- The tile */}
      <div className="flex min-h-0 flex-1 flex-col justify-center px-4">
        <div
          className="relative aspect-[4/5] max-h-full w-full overflow-hidden rounded-lg bg-brand-deep shadow-lift transition-[box-shadow,transform] duration-100 ease-out"
          style={{
            // Two shadows: the settled one, and a mint ring that swells with his voice.
            boxShadow: `var(--shadow-lift), 0 0 0 ${(2 + glow * 5).toFixed(1)}px rgb(224 241 235 / ${(glow * 0.5).toFixed(2)})`,
            transform: `scale(${(1 + glow * 0.008).toFixed(4)})`,
          }}
        >
          {/* His actual reference portrait, pulled from the Character and served locally —
              Runway's own image URL carries an expiring token, so the browser cannot hold it. */}
          <img
            src="/uday.jpg"
            alt="Uday, your IDBI advisor"
            // Longer than feels necessary, on purpose: the poster and the first video frame
            // are the same man in the same chair, so a slow dissolve reads as him settling
            // into focus. A quick swap reads as a glitch.
            className={`absolute inset-0 size-full object-cover object-[center_28%] transition-[opacity,filter] duration-[900ms] ease-in-out ${
              showVideo ? 'opacity-0' : 'opacity-100'
            } ${connecting ? 'brightness-[0.7] saturate-[0.85]' : ''}`}
          />

          <video
            ref={avatar.videoRef}
            autoPlay
            playsInline
            className={`absolute inset-0 size-full object-cover object-[center_28%] transition-opacity duration-[900ms] ease-in-out ${
              showVideo ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Only ever one line, and only while something is happening. */}
          {connecting || (connected && !avatar.videoLive) ? (
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-[9px] bg-gradient-to-t from-brand-deep/90 to-transparent px-4 pb-4 pt-11 text-center text-[13.5px] text-white">
              {speaking ? <Waveform level={avatar.audioLevel} /> : null}
              {connecting
                ? 'Connecting to Uday…'
                : speaking
                  ? 'He is already talking — one moment'
                  : 'Uday is joining…'}
            </div>
          ) : null}

          {avatar.muted && connected ? (
            <span className="absolute left-3.5 top-3.5 rounded-pill bg-danger px-[11px] py-[5px] text-[11.5px] font-bold text-white">
              Muted
            </span>
          ) : null}
        </div>

        <div className="px-1 pt-5 text-center">
          <div className="text-[22px] font-bold leading-tight text-white">Uday</div>
          <div className="mt-1 text-sm text-white/70">
            {connected
              ? avatar.videoLive
                ? 'Interrupt him whenever you like'
                : 'Listen — he is introducing himself'
              : 'IDBI Bank'}
          </div>
        </div>
      </div>

      {/* --------------------------------------------------- Controls */}
      <div className="flex-none px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-2.5">
        {avatar.reason && !connected ? (
          <p className="m-0 mb-3 text-center text-[13px] leading-normal text-white/70">
            {avatar.reason}
          </p>
        ) : null}

        {connected ? (
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={avatar.toggleMute}
              aria-label={avatar.muted ? 'Unmute' : 'Mute'}
              className={`${ROUND} ${avatar.muted ? 'bg-white text-brand-deep' : 'bg-white/20 text-white'}`}
            >
              <MicIcon />
            </button>
            <button
              type="button"
              onClick={avatar.stop}
              aria-label="End call"
              className={`${ROUND} bg-danger text-white`}
            >
              <EndIcon />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={avatar.start}
            disabled={connecting}
            className="flex h-12 w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-pill border-0 bg-accent px-5 text-[15px] font-semibold text-white transition-transform duration-100 active:scale-[0.985] disabled:bg-accent/55"
          >
            <MicIcon />
            {connecting ? 'Connecting…' : 'Talk to Uday'}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * A voice meter, so the wait before the video arrives has something moving in it.
 *
 * Five bars driven off the same smoothed level as the tile's glow. Each is offset a little so
 * they do not pump in unison, which reads as a progress bar rather than a voice.
 */
function Waveform({ level }: { level: number }): ReactNode {
  const offsets = [0.55, 0.85, 1, 0.8, 0.5]
  return (
    <span aria-hidden="true" className="inline-flex h-[15px] items-center gap-[3px]">
      {offsets.map((o, i) => (
        <span
          key={i}
          className="w-[3px] rounded-pill bg-tint-sage transition-[height] duration-[110ms] ease-out"
          style={{ height: `${Math.max(3, Math.min(15, level * 22 * o + 3)).toFixed(1)}px` }}
        />
      ))}
    </span>
  )
}

/* ---------------------------------------------------------------- Bits */

/** mm:ss, for the session countdown — nobody should be cut off without warning. */
const fmt = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/* The two in-call controls: 62px discs, coloured by the caller. */
const ROUND = 'grid size-[62px] flex-none place-items-center rounded-pill border-0'

/* Inline SVG rather than emoji: 🎙 renders as a tofu box wherever the platform ships no emoji
   font, and these are the only controls on the screen. */
function MicIcon(): ReactNode {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="2.5" width="6" height="11" rx="3" fill="currentColor" />
      <path
        d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  )
}

function EndIcon(): ReactNode {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon(): ReactNode {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

/* ---------------------------------------------------------------- Brief */

/**
 * The personality brief sent to Runway at session start.
 *
 * Runway has **no mid-call context push** — verified in the prototype — so everything the
 * Character needs either goes in here (10,000 chars) or is pulled by a tool during the call. The
 * figures are included because they are what makes the conversation specific; the instruction not
 * to invent any is included because it is the only guard on the way out.
 */
function buildBrief(s: Snapshot): string {
  const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`
  return [
    'You are Uday, a relationship manager at IDBI Bank. Warm, direct, never salesy.',
    'You are the RM this customer was never profitable enough to be given. Act like it.',
    'Keep answers short — this is a phone call, not a letter.',
    '',
    `Customer: ${s.customer.name}, ${s.customer.age}, ${s.customer.city}. ` +
      `${s.customer.dependents} dependents. Risk profile ${s.customer.riskProfile}.`,
    `Income ${inr(s.income.monthly)}/month, ${s.income.stability}.`,
    `Committed ${inr(s.commitments.total)}/month. Discretionary ${inr(s.discretionary.monthly)}.`,
    `Deployable surplus ${inr(s.surplus.deployable)}/month.`,
    `Savings ${inr(s.balances.savings)}; ${inr(s.balances.idleFloor)} untouched for ${s.balances.idleMonths} months.`,
    `Buffer covers ${s.buffer.monthsCovered} months. Debt ${inr(s.debt.total)} at up to ${s.debt.highestRate}%.`,
    ...(s.debt.endingSoon
      ? [`${s.debt.endingSoon.loanType} ends in ${s.debt.endingSoon.monthsLeft} months, freeing ${inr(s.debt.endingSoon.emiAmount)}/month.`]
      : []),
    `Life cover in force ${inr(s.protection.lifeCoverInForce)}; indicative need ${inr(s.protection.lifeCoverNeeded)}.`,
    '',
    'Open by telling him what you already know from his statements. Do not ask what his goals',
    'are — he has never had advice and cannot answer that. Propose, and let him push back.',
    '',
    'Rules you must follow:',
    '- Never state a figure that is not in this brief. If you do not have it, say so.',
    '- You do not decide whether a product suits him. Read back the verdict the rules give you,',
    '  including when they refuse.',
    '- Never promise a return. Say "assumed" and name the rate.',
    '- Only raise a gap he can act on within the next month. Money already spent cannot be',
    '  unspent, so do not bring it up.',
    '- Protection before investment. Debt above 24% before either.',
    '- Never mock him. You are not a friend being funny; you are his banker.',
  ].join('\n')
}
