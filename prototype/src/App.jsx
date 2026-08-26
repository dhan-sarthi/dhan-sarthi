import { useEffect, useRef, useState } from 'react'
import Onboarding from './screens/Onboarding.jsx'
import Dashboard from './screens/Dashboard.jsx'
import Planner from './screens/Planner.jsx'
import Advisor from './screens/Advisor.jsx'
import VoiceCall from './components/VoiceCall.jsx'
import {
  persona, spendCategories, spendTotal, insights, riskProfiles,
  sipFutureValue, corpusNeeded,
} from './data.js'

const TABS = [
  { id: 'home', label: 'Insights', icon: '◔' },
  { id: 'future', label: 'Future Self', icon: '✦' },
  { id: 'ask', label: 'Ask Sarthi', icon: '✉' },
]

export default function App() {
  const [phase, setPhase] = useState('onboarding') // onboarding | app
  const [tab, setTab] = useState('home')
  const [riskProfile, setRiskProfile] = useState('Balanced')
  const [sip, setSip] = useState(5000)
  const [voiceOn, setVoiceOn] = useState(false)
  const [inCall, setInCall] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

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

  const years = persona.retireAt - persona.age
  const needed = corpusNeeded(spendTotal, years)
  const projectFor = (amount, profile) => {
    const corpus = sipFutureValue(amount, years, riskProfiles[profile].rate)
    return { corpus, coverage: Math.min(1, corpus / needed) }
  }
  const progress = projectFor(sip, riskProfile).coverage

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
              {tab === 'home' && <Dashboard onToast={showToast} goPlan={() => setTab('future')} />}
              {tab === 'future' && <Planner riskProfile={riskProfile} sip={sip} setSip={setSip} onToast={showToast} />}
              {tab === 'ask' && <Advisor speak={speak} onToast={showToast} />}
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
              progress={progress}
              riskProfile={riskProfile}
              toolHandler={handleVoiceTool}
              onClose={() => setInCall(false)}
            />
          )}

          {toast && <div className="toast" dangerouslySetInnerHTML={{ __html: toast }} />}
        </div>
      </div>
    </div>
  )
}
