import { useEffect, useRef, useState } from 'react'
import AvatarStage from '../components/AvatarStage.jsx'
import Artifact from '../components/Artifact.jsx'
import { startVoiceSession } from '../lib/realtime.js'
import { startAvatar } from '../lib/avatar.js'
import { buildInstructions } from '../lib/persona.js'
import { classifyTone } from '../lib/character.js'
import { buildFacts, buildToneSignals } from '../lib/facts.js'

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

/**
 * Which artifact a `show_artifact` tool call puts on screen.
 *
 * The Character calls this as it speaks, so the visual lands on the sentence rather than after
 * it. The mapping is here rather than in the tool schema because the schema should name what
 * the adviser is talking about, not our render order.
 */
const ARTIFACT_KIND = { idle: 'figure', projection: 'projection', suitability: 'suitability', comparison: 'comparison' }

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
  const [live, setLive] = useState(false)   // true once a real avatar stream is running
  const [caption, setCaption] = useState('')
  const timers = useRef([])
  const videoRef = useRef(null)
  const audioRef = useRef(null)
  const sessionRef = useRef(null)
  const avatarRef = useRef(null)
  const levelRef = useRef(0)

  const d = snapshot?.derived
  const facts = d ? buildFacts({
    persona: { monthlyIncome: d.monthlyInflow, age: 29, retireAt: 60 },
    insights: { ...d, avgMonthlySurplus: d.investableSurplus, existingSip: d.currentSip,
      idleMonths: 4, fdMaturingDays: 10, fdAmount: 200000,
      savingsAccountRate: d.savingsRate, inflationRate: d.inflation },
    spendTotal: d.monthlyOutflow, sip: d.currentSip, riskProfile: 'Balanced',
    corpus: 13000000, coverage: 0.14, needed: 91000000,
  }) : []
  const toneSignals = d ? buildToneSignals({ insights: d, coverage: 0.14, sip: d.currentSip }) : {}

  // The real level comes from the voice session. Only when nothing is connected does this
  // fall back to a synthetic wobble, so the placeholder still reads as alive.
  useEffect(() => {
    if (mode !== 'docked') { setLevel(0); return }
    const id = setInterval(() => {
      setLevel(sessionRef.current ? levelRef.current : Math.random() * 0.8)
    }, 100)
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

  /**
   * Open the conversation.
   *
   * Three things start together, and each degrades independently: the voice session, the
   * avatar that lip-syncs to it, and the scripted artifact sequence. If voice fails we still
   * have the sequence; if the avatar fails we still have the voice and the placeholder. The
   * demo has no single point of failure.
   */
  async function start() {
    setMode('docked')
    timers.current.forEach(clearTimeout)
    timers.current = script.map((_, i) => setTimeout(() => setStep(i), 700 + i * 3200))

    // Runway first. It owns the whole conversation — it hears the microphone, thinks, and
    // answers in the Character's voice — so if it comes up there is no second voice to start.
    const runway = await startAvatar({
      videoEl: videoRef.current,
      audioEl: audioRef.current,
      cif: snapshot?.customer?.cif,
      onClientEvent: (tool, args) => {
        if (tool !== 'show_artifact') return
        const kind = ARTIFACT_KIND[args?.kind]
        const i = script.findIndex((a) => a.kind === kind)
        if (i >= 0) setStep(i)
      },
      onTranscript: (entries) => {
        const last = entries[entries.length - 1]
        if (last) setCaption(last.text)
      },
      onError: (detail) => console.warn('[avatar]', detail),
    })
    if (runway) {
      avatarRef.current = runway
      setLive(true)
      // The scripted sequence was a stand-in for tool calls. With a live Character making
      // them, it would fight the real thing.
      timers.current.forEach(clearTimeout)
      timers.current = []
      setStep(-1)
      return
    }

    // Runway unavailable. Fall back to the voice-only path with the built-in renderer: the
    // conversation still happens, it just has no face.
    let key
    try {
      const r = await fetch('/api/realtime-token', { method: 'POST' })
      if (r.ok) key = (await r.json()).value
    } catch { /* no voice backend; the sequence still runs */ }
    if (!key) return

    const tone = classifyTone(toneSignals)
    sessionRef.current = await startVoiceSession({
      apiKey: key,
      instructions: buildInstructions({ toneContext: tone, facts, riskProfile: 'Balanced' }),
      tools: [],
      toolHandler: async () => ({ ok: true }),
      onLevel: (v) => { levelRef.current = v },
      onCaption: (text, isFinal) => { if (isFinal) setCaption(text) },
      // No avatar on this path: the face is Runway's, and Runway is the thing that failed.
      // The placeholder's mouth is driven by onLevel, and the scripted sequence stands in for
      // the tool calls a live Character would have made.
      onError: (why) => console.warn('[voice]', why),
    })
  }

  function end() {
    timers.current.forEach(clearTimeout)
    timers.current = []
    avatarRef.current?.stop()
    avatarRef.current = null
    sessionRef.current?.stop()
    sessionRef.current = null
    setLive(false)
    setCaption('')
    setStep(-1)
    setMode('hero')
  }

  useEffect(() => () => {
    timers.current.forEach(clearTimeout)
    avatarRef.current?.stop()
    sessionRef.current?.stop()
  }, [])

  return (
    <div className="stage-screen">
      <AvatarStage
        mode={mode}
        level={level}
        speaking={mode === 'docked'}
        live={live}
        videoRef={videoRef}
        audioRef={audioRef}
        onTap={mode === 'docked' ? end : start}
      />

      {mode === 'hero' ? (
        <div className="stage-hero">
          <h2>Talk to your adviser</h2>
          <p>He has read the last six months of your account. Speak normally — just say what is on your mind.</p>
          <button className="stage-start" onClick={start}>Start talking</button>
          {onType && (
            <button className="stage-type" onClick={onType}>or type instead</button>
          )}
        </div>
      ) : (
        <div className="stage-convo">
          <div className="stage-status">
            <span className="dot" />
            {caption || 'Listening · speak any time'}
          </div>
          <Artifact artifact={step >= 0 ? script[step] : null} />
          <button className="stage-end" onClick={onClose ? onClose : end}>End conversation</button>
        </div>
      )}
    </div>
  )
}
