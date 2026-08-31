import { useEffect, useRef, useState } from 'react'
import Chat from './screens/Chat.jsx'
import Onboarding from './screens/Onboarding.jsx'
import Dashboard from './screens/Dashboard.jsx'
import Planner from './screens/Planner.jsx'
import VoiceCall from './components/VoiceCall.jsx'
import {
  persona, spendCategories, spendTotal, insights, riskProfiles,
  sipFutureValue, corpusNeeded,
} from './data.js'
import { buildFacts, buildToneSignals } from './lib/facts.js'
import { getSnapshot, evaluateAdvice } from './lib/api.js'
import { openCommitments, listMemories } from './lib/memory/index.js'

const CUSTOMER_ID = 'demo-rohan'
const CIF = 'IDBI0009182731'

const TABS = [
  { id: 'chat', label: 'Adviser', icon: '◍' },
  { id: 'home', label: 'Money', icon: '◔' },
  { id: 'future', label: 'Future Self', icon: '✦' },
]

export default function App() {
  const [phase, setPhase] = useState('onboarding') // onboarding | app
  const [tab, setTab] = useState('chat')
  const [riskProfile, setRiskProfile] = useState('Balanced')
  const [sip, setSip] = useState(5000)
  const [voiceOn, setVoiceOn] = useState(false)
  const [inCall, setInCall] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  // What he remembers from previous calls. Loaded once; drives whether this session opens as
  // a first meeting, and whether he notices a commitment was kept.
  const [past, setPast] = useState({ commitments: [], memoryCount: 0 })
  // The one customer object every surface reads from. Loaded once; the advisor and the
  // screens share it, so neither can show a number the other does not have.
  const [snapshot, setSnapshot] = useState(null)
  const [voiceLevel, setVoiceLevel] = useState(0)

  // live mirrors for the voice tool-handler (it runs outside React's render cycle)
  const live = useRef({ sip, riskProfile })
  live.current = { sip, riskProfile }

  const speak = (text) => {
    if (!voiceOn || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text.replace(/₹/g, ' rupees '))
    u.rate = 1.02
    u.pitch = 0.95
    const voices = window.speechSynthesis.getVoices()
    u.voice = voices.find((v) => v.lang === 'en-IN') ?? voices.find((v) => v.lang.startsWith('en')) ?? null
    window.speechSynthesis.speak(u)
  }

  const showToast = (html) => {
    clearTimeout(toastTimer.current)
    setToast(html)
    toastTimer.current = setTimeout(() => setToast(null), 4200)
  }

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  useEffect(() => {
    let cancelled = false
    getSnapshot(CIF)
      .then((s) => { if (!cancelled) setSnapshot(s) })
      .catch((err) => console.warn('[snapshot] unavailable:', err.message))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([openCommitments(CUSTOMER_ID), listMemories(CUSTOMER_ID)])
      .then(([commitments, memories]) => {
        if (!cancelled) setPast({ commitments, memoryCount: memories.length })
      })
      .catch(() => {}) // no memory is a valid state, not an error
    return () => { cancelled = true }
  }, [])

  const years = persona.retireAt - persona.age
  const needed = corpusNeeded(spendTotal, years)
  const projectFor = (amount, profile) => {
    const corpus = sipFutureValue(amount, years, riskProfiles[profile].rate)
    return { corpus, coverage: Math.min(1, corpus / needed) }
  }
  const { corpus, coverage } = projectFor(sip, riskProfile)
  const progress = coverage

  // Everything the future self is allowed to say, and the register he says it in.
  const voiceFacts = buildFacts({
    persona, insights, spendTotal, sip, riskProfile, corpus, coverage, needed,
  })
  const toneSignals = buildToneSignals({
    insights, coverage, sip, commitments: past.commitments, memoryCount: past.memoryCount,
  })

  /** Run a product through the gate. The advisor never decides suitability itself. */
  const checkSuitability = async (productId, amount) => {
    if (!snapshot) return null
    try {
      return await evaluateAdvice({
        customerId: CUSTOMER_ID,
        productId,
        amount,
        customer: { riskProfile },
        facts: snapshot.derived,
      })
    } catch (err) {
      console.warn('[suitability] unavailable:', err.message)
      return null
    }
  }

  // ---- tools the live voice avatar can call ----
  const handleVoiceTool = async (name, args) => {
    const { sip: curSip, riskProfile: curProfile } = live.current
    switch (name) {
      case 'get_financial_snapshot': {
        const { corpus, coverage } = projectFor(curSip, curProfile)
        return {
          monthlyIncomeINR: persona.monthlyIncome,
          monthlySpendINR: spendTotal,
          spendByCategory: Object.fromEntries(spendCategories.map((c) => [c.name, c.amount])),
          idleMonthlySurplusINR: insights.avgMonthlySurplus,
          idleBalanceINR: insights.idleBalance,
          fdMaturingInDays: insights.fdMaturingDays,
          fdAmountINR: insights.fdAmount,
          currentPlannerSipINR: curSip,
          riskProfile: curProfile,
          recommendedMix: riskProfiles[curProfile].mix,
          projectedCorpusAt60INR: Math.round(corpus),
          goalCoveragePct: Math.round(coverage * 100),
          targetCorpusINR: Math.round(needed),
        }
      }
      case 'set_sip_amount': {
        const amount = Math.max(1000, Math.min(40000, Math.round((args.amount || 0) / 500) * 500))
        setPhase('app')
        setTab('future')
        setSip(amount)
        const { corpus, coverage } = projectFor(amount, curProfile)
        return {
          setSipINR: amount,
          projectedCorpusAt60INR: Math.round(corpus),
          goalCoveragePct: Math.round(coverage * 100),
          targetCorpusINR: Math.round(needed),
          assetMix: riskProfiles[curProfile].mix,
          note: 'The Future Self screen is now showing this scenario to the user.',
        }
      }
      case 'show_screen': {
        const map = { insights: 'home', future: 'future', ask: 'ask' }
        setPhase('app')
        setTab(map[args.screen] || 'home')
        return { ok: true, showing: args.screen }
      }
      case 'book_rm_callback': {
        const time = args.time || 'today, 6:00 pm'
        showToast(`✓ Callback booked for <b>${time}</b>. Your conversation summary has been shared with RM Priya Nair (with consent).`)
        return { booked: true, rm: 'Priya Nair', time }
      }
      default:
        return { error: `unknown tool ${name}` }
    }
  }

  return (
    <div className="stage">
      <div className="stage-copy">
        <span className="kicker">IDBI Innovate 2026 · Team Atomic</span>
        <h1>Dhan Sarthi — advice from the one advisor you'll always trust: <em>future you</em>.</h1>
        <p>
          An AI wealth advisor inside IDBI GO Mobile+, embodied as your age-progressed
          future self. Tap <b>🎙 Talk to future you</b> for a live voice conversation —
          say "what if I invest twenty thousand a month?" and watch your future change on screen.
        </p>
        <div className="pillars">
          <div className="pillar"><span className="dot" /><span><b>Live voice:</b> real-time speech-to-speech (gpt-realtime) — the avatar talks, listens, and drives the app.</span></div>
          <div className="pillar"><span className="dot" /><span><b>Behaviour-led:</b> reads consented transaction &amp; Account Aggregator data to find money you won't miss.</span></div>
          <div className="pillar"><span className="dot" /><span><b>Science-backed:</b> age-progressed future selves roughly doubled savings allocations (Hershfield et al., JMR 2011).</span></div>
          <div className="pillar"><span className="dot" /><span><b>Compliance-native:</b> SEBI suitability, AI-use disclosure and audit trail on every recommendation.</span></div>
        </div>
      </div>

      <div className="phone">
        <div className="screen">
          <div className="appbar">
            <div className="bank-mark">DS</div>
            <div className="titles">
              <div className="t1">Dhan Sarthi</div>
              <div className="t2">inside IDBI GO Mobile+ · Rohan</div>
            </div>
            <div className="spacer" />
            <button className={`voice-toggle ${voiceOn ? 'on' : ''}`} onClick={() => setVoiceOn(!voiceOn)}>
              {voiceOn ? '🔊 Read aloud' : '🔈 Read aloud'}
            </button>
          </div>

          {phase === 'onboarding' ? (
            <Onboarding
              speak={speak}
              onDone={(profile) => { setRiskProfile(profile); setPhase('app'); setTab('home') }}
            />
          ) : (
            <>
              {tab === 'chat' && (
                <Chat
                  snapshot={snapshot}
                  level={voiceLevel}
                  speaking={inCall}
                  onStartVoice={() => setInCall(true)}
                  onEvaluate={checkSuitability}
                />
              )}
              {tab === 'home' && <Dashboard onToast={showToast} goPlan={() => setTab('future')} />}
              {tab === 'future' && <Planner riskProfile={riskProfile} sip={sip} setSip={setSip} onToast={showToast} />}
              <div className="tabbar">
                {TABS.map((t) => (
                  <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
                    <span className="ticon">{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {!inCall && (
            <button className="call-fab" onClick={() => setInCall(true)}>
              🎙 Talk to future you
            </button>
          )}

          {inCall && (
            <VoiceCall
              onLevel={setVoiceLevel}
              progress={progress}
              riskProfile={riskProfile}
              toolHandler={handleVoiceTool}
              customerId={CUSTOMER_ID}
              facts={voiceFacts}
              toneSignals={toneSignals}
              onClose={() => {
                setInCall(false)
                // Re-read memory so the next call knows about the one that just ended.
                Promise.all([openCommitments(CUSTOMER_ID), listMemories(CUSTOMER_ID)])
                  .then(([commitments, memories]) =>
                    setPast({ commitments, memoryCount: memories.length }))
                  .catch(() => {})
              }}
            />
          )}

          {toast && <div className="toast" dangerouslySetInnerHTML={{ __html: toast }} />}
        </div>
      </div>
    </div>
  )
}
