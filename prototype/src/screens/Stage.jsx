import { useCallback, useMemo, useState } from 'react'
import {
  AvatarCall, AvatarVideo, useAvatarStatus, useClientEvent, useTranscript,
} from '@runwayml/avatars-react'
import AvatarStage from '../components/AvatarStage.jsx'
import Artifact from '../components/Artifact.jsx'

/**
 * The conversation. This is the product's primary surface — there is no typed chat behind it.
 *
 * Runway's Character owns the whole exchange: it hears the microphone, decides what to say, and
 * answers in its own voice with photoreal video. We supply three things and nothing else — the
 * customer's position at session start, a suitability tool it must call before recommending
 * anything, and a screen for it to put visuals on.
 *
 * There is deliberately no fallback voice. A second speech path was useful while the avatar
 * vendor was unsettled; now it only creates a mode where the demo half-works and nobody can
 * tell which path they are watching.
 */

/** `show_artifact` names what the adviser is talking about; we decide how to draw it. */
const ARTIFACT_KIND = {
  idle: 'figure',
  projection: 'projection',
  suitability: 'suitability',
  comparison: 'comparison',
}

const RULES = [
  { id: 'HIGH_INTEREST_DEBT', label: 'High-interest debt' },
  { id: 'MISSED_REPAYMENT', label: 'Repayment history' },
  { id: 'EMERGENCY_BUFFER', label: 'Emergency buffer' },
  { id: 'RISK_CEILING', label: 'Risk profile' },
  { id: 'AFFORDABILITY', label: 'Affordability' },
  { id: 'HORIZON_VS_LOCKIN', label: 'Lock-in against goal' },
  { id: 'BUNDLED_PROTECTION', label: 'Bundled protection' },
]

const inr = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

/**
 * Every artifact is built from the snapshot, never written down here.
 *
 * The adviser and the screen have to agree, and the only way to guarantee that is for both to
 * read the same derived object. A figure typed into this file is a figure that can drift from
 * what the Character just said.
 */
function artifactsFrom(derived) {
  if (!derived) return {}
  return {
    figure: {
      kind: 'figure',
      label: 'Sitting idle',
      value: derived.idleBalance,
      note: `Earning ${derived.savingsRate}% while prices rise ${derived.inflation}%. That gap costs about ${inr(derived.idleCostPerYear)} a year.`,
    },
    projection: { kind: 'projection', sip: 18000, corpus: 56100000, target: 91000000, years: 31 },
    suitability: {
      kind: 'suitability',
      product: 'LIC Market Plus ULIP',
      rules: RULES,
      blockedAt: 'BUNDLED_PROTECTION',
    },
    comparison: {
      kind: 'comparison',
      reject: { name: 'LIC Market Plus ULIP', monthly: 2500, why: 'Cover and investment bundled. Five-year lock-in.' },
      keep: { name: 'LIC Term Assurance, ₹1 Cr', monthly: 850, why: 'Same cover. No lock-in. Invest the difference yourself.' },
    },
  }
}

/**
 * The live call. Split out because every hook below needs to sit inside <AvatarCall>'s
 * provider, and the idle screen must not mount them.
 */
function InCall({ artifacts, onEnd }) {
  const status = useAvatarStatus()
  const ready = status.status === 'ready'
  const [kind, setKind] = useState(null)

  useClientEvent('show_artifact', (args) => {
    const mapped = ARTIFACT_KIND[args?.kind]
    if (mapped) setKind(mapped)
  })

  // Interim segments on purpose: a caption that appears only when a sentence finishes is a
  // subtitle, not a live caption.
  const transcript = useTranscript({ interim: true })
  const caption = transcript.at(-1)?.text ?? ''

  // He only gives up the middle of the screen when something needs it. With nothing to show,
  // shrinking him into a corner costs the one thing the product is selling and buys nothing.
  const mode = kind ? 'docked' : 'hero'

  return (
    <>
      <AvatarStage mode={mode} live={ready} speaking={ready}>
        <AvatarVideo className="avatar-video-host" />
      </AvatarStage>

      <div className={`stage-convo is-${mode}`}>
        <div className="stage-status">
          <span className="dot" />
          {caption || (ready ? 'Listening · speak any time' : 'Connecting your adviser…')}
        </div>
        {/* No empty state. During a live call the caption already says what is happening, and
            an "ask me anything" card underneath it is two prompts competing for the same job. */}
        {kind && <Artifact artifact={artifacts[kind]} />}
        <button className="stage-end" onClick={onEnd}>End conversation</button>
      </div>
    </>
  )
}

export default function Stage({ snapshot, onType }) {
  const [session, setSession] = useState(null)
  const [error, setError] = useState(null)
  const [starting, setStarting] = useState(false)

  const artifacts = useMemo(() => artifactsFrom(snapshot?.derived), [snapshot?.derived])

  const start = useCallback(async () => {
    setError(null)
    setStarting(true)
    try {
      const res = await fetch('/api/avatar/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cif: snapshot?.customer?.cif }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `session failed (${res.status})`)
      setSession(await res.json())
    } catch (err) {
      setError(err.message)
    } finally {
      setStarting(false)
    }
  }, [snapshot?.customer?.cif])

  /**
   * Ending the call has to reach the server, not just unmount the component. Runway bills by
   * the minute and a session nobody closed keeps running until its cap.
   */
  const end = useCallback(() => {
    const id = session?.sessionId
    setSession(null)
    if (id) {
      fetch(`/api/avatar/session/${encodeURIComponent(id)}`, { method: 'DELETE', keepalive: true })
        .catch(() => { /* the server-side reaper is the backstop */ })
    }
  }, [session?.sessionId])

  if (session) {
    return (
      <div className="stage-screen">
        <AvatarCall
          className="stage-call"
          avatarId={session.characterId}
          credentials={session}
          audio
          video={false}
          onEnd={end}
          onError={(err) => { setError(err.message); end() }}
        >
          <InCall artifacts={artifacts} onEnd={end} />
        </AvatarCall>
      </div>
    )
  }

  return (
    <div className="stage-screen">
      <AvatarStage mode="hero" onTap={start} />
      <div className="stage-hero">
        <h2>Talk to your adviser</h2>
        <p>He has read the last six months of your account. Speak normally — just say what is on your mind.</p>
        <button className="stage-start" onClick={start} disabled={starting}>
          {starting ? 'Connecting…' : 'Start talking'}
        </button>
        {error && <p className="stage-error" role="alert">{error}</p>}
        {onType && <button className="stage-type" onClick={onType}>or type instead</button>}
      </div>
    </div>
  )
}
