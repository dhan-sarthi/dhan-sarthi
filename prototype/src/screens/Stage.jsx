import { useEffect, useRef, useState } from 'react'
import AvatarStage from '../components/AvatarStage.jsx'
import Artifact from '../components/Artifact.jsx'

/**
 * The speech-first screen.
 *
 * Two modes: the avatar large and centred before a conversation, then docked to the corner
 * with the screen given over to whatever the voice has just made true.
 *
 * The sequence below is scripted so the layout can be judged before committing to an avatar
 * vendor. In the real thing each artifact is pushed by a tool call from the voice agent —
 * which is why every one of them is derived from the snapshot rather than written down here.
 */

const RULES = [
  { id: 'HIGH_INTEREST_DEBT', label: 'High-interest debt' },
  { id: 'MISSED_REPAYMENT', label: 'Repayment history' },
  { id: 'EMERGENCY_BUFFER', label: 'Emergency buffer' },
  { id: 'RISK_CEILING', label: 'Risk profile' },
  { id: 'AFFORDABILITY', label: 'Affordability' },
  { id: 'HORIZON_VS_LOCKIN', label: 'Lock-in against goal' },
  { id: 'BUNDLED_PROTECTION', label: 'Bundled protection' },
]

export default function Stage({ snapshot, onClose, onType }) {
  const [mode, setMode] = useState('hero')
  const [step, setStep] = useState(-1)
  const [level, setLevel] = useState(0)
  const timers = useRef([])

  const d = snapshot?.derived

  // Stands in for the audio level a live stream will provide, so the mouth and the ring move.
  useEffect(() => {
    if (mode !== 'docked') { setLevel(0); return }
    const id = setInterval(() => setLevel(Math.random() * 0.8), 110)
    return () => clearInterval(id)
  }, [mode])

  const script = d ? [
    { kind: 'figure', label: 'Sitting idle', value: d.idleBalance,
      note: `Four months in savings, earning 3% while prices rise 6%. That gap costs about ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(d.idleCostPerYear)} a year.` },
    { kind: 'projection', sip: 18000, corpus: 56100000, target: 91000000, years: 31 },
    { kind: 'suitability', product: 'LIC Market Plus ULIP', rules: RULES, blockedAt: 'BUNDLED_PROTECTION' },
    { kind: 'comparison',
      reject: { name: 'LIC Market Plus ULIP', monthly: 2500, why: 'Cover and investment bundled. Five-year lock-in.' },
      keep:   { name: 'LIC Term Assurance, ₹1 Cr', monthly: 850, why: 'Same cover. No lock-in. Invest the difference yourself.' } },
  ] : []

  function start() {
    setMode('docked')
    timers.current.forEach(clearTimeout)
    timers.current = script.map((_, i) => setTimeout(() => setStep(i), 700 + i * 3200))
  }

  function end() {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setStep(-1)
    setMode('hero')
  }

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  return (
    <div className="stage-screen">
      <AvatarStage
        mode={mode}
        level={level}
        speaking={mode === 'docked'}
        onTap={mode === 'docked' ? end : start}
      />

      {mode === 'hero' ? (
        <div className="stage-hero">
          <h2>Talk to your adviser</h2>
          <p>She has read the last six months of your account. Speak normally — she will interrupt herself if you do.</p>
          <button className="stage-start" onClick={start}>Start talking</button>
          {onType && (
            <button className="stage-type" onClick={onType}>or type instead</button>
          )}
        </div>
      ) : (
        <div className="stage-convo">
          <div className="stage-status"><span className="dot" />Listening · speak any time</div>
          <Artifact artifact={step >= 0 ? script[step] : null} />
          <button className="stage-end" onClick={onClose ? onClose : end}>End conversation</button>
        </div>
      )}
    </div>
  )
}
