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
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(130% 90% at 50% 8%, #1e4033 0%, #143025 48%, #0b1a15 100%)',
        display: 'flex',
        flexDirection: 'column',
        color: '#f4f1ea',
        overflow: 'hidden',
      }}
    >
      {/* --------------------------------------------------- Top bar */}
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: 'max(16px, env(safe-area-inset-top)) 18px 6px',
        }}
      >
        <button
          type="button"
          onClick={() => {
            avatar.stop()
            onClose()
          }}
          aria-label="Close"
          style={{
            width: 38,
            height: 38,
            flex: '0 0 auto',
            borderRadius: 999,
            border: 0,
            background: 'rgb(244 241 234 / 14%)',
            color: 'inherit',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <CloseIcon />
        </button>
        <div style={{ flex: 1 }} />
        {status ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 999,
              padding: '6px 12px',
              fontSize: 11.5,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              background: connected ? 'rgb(47 107 79 / 92%)' : 'rgb(244 241 234 / 14%)',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: connected ? '#8fe0b0' : '#f6c79b',
                animation: connecting ? 'blink 1.1s ease-in-out infinite' : 'none',
              }}
            />
            {status}
          </span>
        ) : null}
      </div>

      {/* --------------------------------------------------- The tile */}
      <div
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 18px',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '4 / 5',
            maxHeight: '100%',
            borderRadius: 28,
            overflow: 'hidden',
            background: '#0d1f19',
            // Two shadows: the settled one, and a warm ring that swells with his voice.
            boxShadow: `0 24px 70px rgb(0 0 0 / 45%), 0 0 0 ${(2 + glow * 5).toFixed(1)}px rgb(143 224 176 / ${(glow * 0.5).toFixed(2)})`,
            transform: `scale(${(1 + glow * 0.008).toFixed(4)})`,
            transition: 'box-shadow 90ms linear, transform 120ms ease-out',
          }}
        >
          {/* His actual reference portrait, pulled from the Character and served locally —
              Runway's own image URL carries an expiring token, so the browser cannot hold it. */}
          <img
            src="/uday.jpg"
            alt="Uday, your IDBI advisor"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center 28%',
              opacity: showVideo ? 0 : 1,
              // Longer than feels necessary, on purpose: the poster and the first video frame
              // are the same man in the same chair, so a slow dissolve reads as him settling
              // into focus. A quick swap reads as a glitch.
              transition: 'opacity 900ms ease-in-out, filter 400ms ease',
              filter: connecting ? 'brightness(0.7) saturate(0.85)' : 'none',
            }}
          />

          <video
            ref={avatar.videoRef}
            autoPlay
            playsInline
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center 28%',
              opacity: showVideo ? 1 : 0,
              transition: 'opacity 900ms ease-in-out',
            }}
          />

          {/* Only ever one line, and only while something is happening. */}
          {connecting || (connected && !avatar.videoLive) ? (
            <div
              style={{
                position: 'absolute',
                inset: 'auto 0 0 0',
                padding: '44px 18px 18px',
                background: 'linear-gradient(180deg, transparent, rgb(11 26 21 / 90%))',
                fontSize: 13.5,
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 9,
              }}
            >
              {speaking ? <Waveform level={avatar.audioLevel} /> : null}
              {connecting
                ? 'Connecting to Uday…'
                : speaking
                  ? 'He is already talking — one moment'
                  : 'Uday is joining…'}
            </div>
          ) : null}

          {avatar.muted && connected ? (
            <span
              style={{
                position: 'absolute',
                top: 14,
                left: 14,
                borderRadius: 999,
                padding: '5px 11px',
                fontSize: 11.5,
                fontWeight: 700,
                background: 'rgb(168 58 42 / 92%)',
              }}
            >
              Muted
            </span>
          ) : null}
        </div>

        <div style={{ textAlign: 'center', padding: '20px 4px 0' }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em' }}>Uday</div>
          <div style={{ fontSize: 14, opacity: 0.66, marginTop: 3 }}>
            {connected
              ? avatar.videoLive
                ? 'Interrupt him whenever you like'
                : 'Listen — he is introducing himself'
              : 'IDBI Bank'}
          </div>
        </div>
      </div>

      {/* --------------------------------------------------- Controls */}
      <div
        style={{
          flex: '0 0 auto',
          padding: '10px 18px max(20px, env(safe-area-inset-bottom))',
        }}
      >
        {avatar.reason && !connected ? (
          <p
            style={{
              margin: '0 0 12px',
              fontSize: 13,
              lineHeight: 1.5,
              textAlign: 'center',
              opacity: 0.66,
            }}
          >
            {avatar.reason}
          </p>
        ) : null}

        {connected ? (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              type="button"
              onClick={avatar.toggleMute}
              aria-label={avatar.muted ? 'Unmute' : 'Mute'}
              style={round(avatar.muted ? 'rgb(244 241 234 / 18%)' : 'rgb(47 107 79 / 92%)')}
            >
              <MicIcon />
            </button>
            <button
              type="button"
              onClick={avatar.stop}
              aria-label="End call"
              style={round('#a83a2a')}
            >
              <EndIcon />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={avatar.start}
            disabled={connecting}
            style={{
              width: '100%',
              border: 0,
              borderRadius: 999,
              padding: '18px 22px',
              fontSize: 17,
              fontWeight: 800,
              letterSpacing: '-0.01em',
              background: connecting ? 'rgb(217 119 46 / 55%)' : '#d9772e',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <MicIcon />
            {connecting ? 'Connecting…' : 'Talk to Uday'}
          </button>
        )}
      </div>

      <style>{`
        @keyframes blink { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
      `}</style>
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
    <span
      aria-hidden="true"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, height: 15 }}
    >
      {offsets.map((o, i) => (
        <span
          key={i}
          style={{
            width: 3,
            borderRadius: 999,
            background: '#8fe0b0',
            height: `${Math.max(3, Math.min(15, level * 22 * o + 3)).toFixed(1)}px`,
            transition: 'height 110ms ease-out',
          }}
        />
      ))}
    </span>
  )
}

/* ---------------------------------------------------------------- Bits */

/** mm:ss, for the session countdown — nobody should be cut off without warning. */
const fmt = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

const round = (bg: string): React.CSSProperties => ({
  width: 62,
  height: 62,
  flex: '0 0 auto',
  borderRadius: 999,
  border: 0,
  background: bg,
  color: '#fff',
  display: 'grid',
  placeItems: 'center',
})

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
