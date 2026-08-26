import { useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import FutureSelf from '../components/FutureSelf.jsx'
import {
  persona, riskProfiles, sipFutureValue, corpusNeeded, spendTotal,
  lifeEvents, prices2057, formatINR,
} from '../data.js'

// The future self speaks in first person — identification, not lecturing.
const captions = [
  { at: 0.0, text: (c) => <>At this pace I retire on <b>{c}</b> — still working part-time at 70, counting every rupee. We can rewrite this, you and I.</> },
  { at: 0.35, text: (c) => <>It's okay-ish. <b>{c}</b> keeps my lights on — but one hospital bill and the maths breaks. A little more from you changes my whole life.</> },
  { at: 0.7, text: (c) => <>This is comfort. Morning walks, family dinners, the odd holiday — your monthly pinch became my <b>{c}</b> of freedom.</> },
  { at: 1.0, text: (c) => <>Freedom. <b>{c}</b> means I wake up when I want. Thank you — 29-year-old you bought me this life.</> },
]

// smooth count-up for money figures
function useCountUp(target, dur = 550) {
  const [val, setVal] = useState(target)
  const prev = useRef(target)
  useEffect(() => {
    const from = prev.current
    prev.current = target
    if (from === target) return
    let raf
    const t0 = performance.now()
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur)
      const e = 1 - (1 - p) ** 3
      setVal(from + (target - from) * e)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, dur])
  return val
}

export default function Planner({ riskProfile, sip, setSip, onToast }) {
  const years = persona.retireAt - persona.age
  const { rate, mix } = riskProfiles[riskProfile]
  const corpus = sipFutureValue(sip, years, rate)
  const needed = corpusNeeded(spendTotal, years)
  const progress = Math.min(1, corpus / needed)
  const caption = [...captions].reverse().find((c) => progress >= c.at) ?? captions[0]
  const pct = ((sip - 1000) / (40000 - 1000)) * 100

  const monthlyAt60 = (corpus * 0.04) / 12
  const pinchPct = Math.round((sip / persona.monthlyIncome) * 100)
  const shownCorpus = useCountUp(corpus)
  const shownIncome = useCountUp(monthlyAt60)

  // life events unlock as coverage crosses thresholds
  const zone = lifeEvents.filter((e) => progress >= e.at).length
  const prevZone = useRef(zone)
  const [event, setEvent] = useState(zone > 0 ? lifeEvents[zone - 1] : null)
  useEffect(() => {
    if (zone > prevZone.current && zone > 0) setEvent(lifeEvents[zone - 1])
    else if (zone < prevZone.current) setEvent(zone > 0 ? lifeEvents[zone - 1] : null)
    prevZone.current = zone
  }, [zone])

  const commit = () => {
    confetti({ particleCount: 130, spread: 75, origin: { y: 0.75 }, colors: ['#0e6e5c', '#f0821e', '#ffc188', '#8fd0be'] })
    onToast(`✓ SIP mandate of <b>₹${sip.toLocaleString('en-IN')}/month</b> prepared. Review the fund split and e-sign in IDBI GO Mobile+ — nothing is invested without your explicit confirmation.`)
  }

  return (
    <div className="body">
      <div className="fs-stagebox">
        <FutureSelf age={persona.retireAt} prosperity={progress} />
        <span className="fs-age">You, at {persona.retireAt}</span>
        <div className="fs-caption">{caption.text(formatINR(corpus))}</div>
      </div>

      {event && (
        <div className="life-event" key={event.at}>
          <span className="le-icon">{event.icon}</span>
          <span className="le-label">Memory unlocked</span>
          <span className="le-text">{event.text}</span>
        </div>
      )}

      <div className="slider-card">
        <div className="slider-head">
          <span className="lab">Monthly SIP</span>
          <span className="amt">₹{sip.toLocaleString('en-IN')}</span>
        </div>
        <input
          type="range" min="1000" max="40000" step="500" value={sip}
          style={{ '--pct': `${pct}%` }}
          onChange={(e) => setSip(+e.target.value)}
          aria-label="Monthly SIP amount"
        />
        <div className="slider-scale"><span>₹1,000</span><span>₹40,000</span></div>
      </div>

      <div className="proj">
        <div className="stat">
          <div className="k">Corpus at {persona.retireAt} ({riskProfile.toLowerCase()} mix)</div>
          <div className="v">{formatINR(shownCorpus)}</div>
        </div>
        <div className="stat">
          <div className="k">Goal coverage</div>
          <div className={`v ${progress >= 0.7 ? 'good' : ''}`}>{Math.round(progress * 100)}%</div>
        </div>
        <div className="stat">
          <div className="k">Pinch for you, today</div>
          <div className="v pinch">−₹{sip.toLocaleString('en-IN')}<span className="unit">/mo · {pinchPct}% of salary</span></div>
        </div>
        <div className="stat">
          <div className="k">My income at {persona.retireAt}, for life</div>
          <div className="v good">{formatINR(shownIncome)}<span className="unit">/mo</span></div>
        </div>
      </div>

      <div className="card prices">
        <div className="p-head">While you decide — my grocery bill in 2057:</div>
        <div className="p-row-wrap">
          {prices2057.map((p) => (
            <div className="p-row" key={p.item}>
              <span className="p-item">{p.item}</span>
              <span className="p-then">₹{p.today}</span>
              <span className="p-arrow">→</span>
              <span className="p-now">₹{p.future.toLocaleString('en-IN')}</span>
            </div>
          ))}
        </div>
        <div className="p-foot">Everyday prices at 6% inflation. This is why I need you to start now.</div>
      </div>

      <details className="card why">
        <summary>Why this advice? (explainable & audited)</summary>
        <p>
          You told me a ₹20,000 notional loss wouldn't make you sell — and your goal is {years} years away.
          That makes you a <b>{riskProfile}</b> investor, so I project a {mix} earning ~{Math.round(rate * 100)}%
          annually. Your target of {formatINR(needed)} is today's spending inflated at 6% to age {persona.retireAt},
          drawn down at a safe 4%/year. Every input, and this explanation, is stored for audit.
        </p>
        <div className="basis">
          <span className="pill brand">SEBI suitability ✓</span>
          <span className="pill brand">AI-use disclosed ✓</span>
          <span className="pill accent">Reviewed model v2.1</span>
        </div>
      </details>

      <button className="btn primary" onClick={commit}>
        Start this SIP with one tap
      </button>
      <div className="disclaimer">
        Projections assume constant returns and are illustrative, not guaranteed.
        Mutual fund investments are subject to market risks. Advice audit-logged per SEBI (IA) Regulations.
      </div>
    </div>
  )
}
