import { formatINR } from '../data.js'
import Icon from './Icon.jsx'

/**
 * The conversation's canvas.
 *
 * One rule, and it is what separates this from a chat log: show what the voice just made
 * true, not what was said. An artifact is singular and replaces the previous one — the
 * current subject of the conversation, like a slide following a speaker. A transcript
 * accumulates; this does not.
 *
 * Deliberately absent: transcripts, waveforms, thinking animations. All three are decoration
 * that looks like function.
 */

/* 1. The figure, alone. Cheapest to build and the hardest to look away from. */
function Figure({ label, value, note }) {
  return (
    <div className="art art-figure">
      <span className="art-label">{label}</span>
      <div className="art-value">{typeof value === 'number' ? formatINR(value) : value}</div>
      {note && <p className="art-note">{note}</p>}
    </div>
  )
}

/* 2. The suitability check resolving. Inherently a process, so it animates without decoration. */
function Suitability({ rules, blockedAt, product }) {
  return (
    <div className="art art-rules">
      <span className="art-label">Checking {product}</span>
      <ul>
        {rules.map((r, i) => {
          const state = blockedAt === r.id ? 'blocked' : i < rules.findIndex((x) => x.id === blockedAt) || blockedAt == null ? 'pass' : 'idle'
          return (
            <li key={r.id} className={state} style={{ animationDelay: `${i * 90}ms` }}>
              <span className="mark">{state === 'blocked' ? '✕' : state === 'pass' ? '✓' : ''}</span>
              <span className="rule-name">{r.label}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* 3. The comparison. The demo's climax deserves a visual, not only a sentence. */
function Comparison({ reject, keep }) {
  return (
    <div className="art art-compare">
      <span className="art-label">Same protection, two prices</span>
      <div className="compare-grid">
        <div className="opt rejected">
          <div className="opt-name">{reject.name}</div>
          <div className="opt-cost">{formatINR(reject.monthly)}<small>/mo</small></div>
          <div className="opt-why">{reject.why}</div>
        </div>
        <div className="opt kept">
          <div className="opt-name">{keep.name}</div>
          <div className="opt-cost">{formatINR(keep.monthly)}<small>/mo</small></div>
          <div className="opt-why">{keep.why}</div>
        </div>
      </div>
    </div>
  )
}

/* 4. The projection answering a spoken number — voice driving the UI, causally. */
function Projection({ sip, corpus, target, years }) {
  const pts = Array.from({ length: 32 }, (_, i) => {
    const t = i / 31
    return { x: t * 100, y: 100 - Math.pow(t, 2.1) * 100 }
  })
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const coverage = Math.min(100, Math.round((corpus / target) * 100))
  return (
    <div className="art art-projection">
      <span className="art-label">At {formatINR(sip)} a month, {years} years</span>
      <div className="art-value">{formatINR(corpus)}</div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="curve" aria-hidden="true">
        <path d={`${d} L100,100 L0,100 Z`} fill="url(#g)" opacity=".18" />
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      <p className="art-note">{coverage}% of the {formatINR(target)} you need</p>
    </div>
  )
}

export default function Artifact({ artifact }) {
  if (!artifact) {
    return (
      <div className="art art-idle">
        <Icon name="mic" size={22} />
        <p>Ask me anything about your money.</p>
      </div>
    )
  }
  switch (artifact.kind) {
    case 'figure':      return <Figure {...artifact} />
    case 'suitability': return <Suitability {...artifact} />
    case 'comparison':  return <Comparison {...artifact} />
    case 'projection':  return <Projection {...artifact} />
    default:            return null
  }
}
