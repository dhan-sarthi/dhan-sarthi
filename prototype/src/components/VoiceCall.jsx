import { useEffect, useRef, useState } from 'react'
import FutureSelf from './FutureSelf.jsx'
import { startVoiceSession } from '../lib/realtime.js'
import { buildInstructions, voiceTools } from '../lib/persona.js'

const KEY_STORE = 'ds_oai_key'

// Public token backend: mints short-lived ephemeral keys so visitors need no key.
// Same-origin path works on the Vercel deployment; the absolute URL covers GitHub Pages.
const TOKEN_ENDPOINTS = [
  '/api/realtime-token',
  'https://dhan-sarthi.vercel.app/api/realtime-token',
]

async function fetchEphemeralKey() {
  for (const url of TOKEN_ENDPOINTS) {
    try {
      const r = await fetch(url, { method: 'POST' })
      if (r.ok) {
        const d = await r.json()
        if (d.value) return d.value
      }
    } catch { /* endpoint unavailable — try next */ }
  }
  return null
}

export function getStoredKey() {
  // allow #k=sk-... for quick team demos (fragment never hits any server)
  const m = window.location.hash.match(/[#&]k=([^&]+)/)
  if (m) {
    localStorage.setItem(KEY_STORE, decodeURIComponent(m[1]))
    history.replaceState(null, '', window.location.pathname + window.location.search)
  }
  return localStorage.getItem(KEY_STORE) || ''
}

const STATUS_LABEL = {
  mic: 'Allow microphone…',
  connecting: 'Waking up your future self…',
  listening: 'Listening',
  speaking: 'Speaking',
}

export default function VoiceCall({ progress, riskProfile, toolHandler, onClose }) {
  const [key, setKey] = useState(getStoredKey)
  const [gate, setGate] = useState(getStoredKey() ? 'call' : 'fetching') // fetching | keysheet | call
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [muted, setMuted] = useState(false)
  const [caption, setCaption] = useState('')
  const [userLine, setUserLine] = useState('')
  const [typed, setTyped] = useState('')
  const [level, setLevel] = useState(0)
  const sessionRef = useRef(null)
  const captionRef = useRef('')
  const levelRef = useRef(0)

  // throttle level → state so the SVG re-renders at a sane rate
  useEffect(() => {
    const id = setInterval(() => setLevel(levelRef.current), 80)
    return () => clearInterval(id)
  }, [])

  // no stored key → get a visitor token from the public backend
  useEffect(() => {
    if (gate !== 'fetching') return
    let cancelled = false
    fetchEphemeralKey().then((ek) => {
      if (cancelled) return
      if (ek) { setKey(ek); setGate('call') }
      else setGate('keysheet')
    })
    return () => { cancelled = true }
  }, [gate])

  useEffect(() => {
    if (!key || gate !== 'call') return
    let cancelled = false
    ;(async () => {
      const session = await startVoiceSession({
        apiKey: key,
        instructions: buildInstructions(riskProfile),
        tools: voiceTools,
        toolHandler,
        onStatus: (s) => !cancelled && setStatus(s),
        onLevel: (v) => { levelRef.current = v },
        onCaption: (text, isFinal) => {
          if (cancelled) return
          if (isFinal) { captionRef.current = '' ; setCaption(text) }
          else { captionRef.current += text; setCaption(captionRef.current) }
        },
        onUserCaption: (t) => !cancelled && setUserLine(t?.trim() || ''),
        onError: (why) => {
          if (cancelled) return
          if (why === 'bad-key' && !key.startsWith('ek_')) {
            localStorage.removeItem(KEY_STORE); setKey(''); setError(null); setGate('fetching')
          } else setError(why)
        },
      })
      if (cancelled) session?.stop()
      else sessionRef.current = session
    })()
    return () => { cancelled = true; sessionRef.current?.stop(); sessionRef.current = null }
  }, [key, gate, riskProfile]) // eslint-disable-line react-hooks/exhaustive-deps

  const end = () => { sessionRef.current?.stop(); onClose() }

  if (gate === 'fetching') {
    return (
      <div className="voice-overlay">
        <button className="v-close" onClick={onClose}>✕</button>
        <div className="v-stage" style={{ margin: 'auto 0' }}>
          <div className="v-halo"><FutureSelf age={60} prosperity={progress} /></div>
          <div className="v-status">Waking up your future self…</div>
        </div>
      </div>
    )
  }

  if (gate === 'keysheet') {
    return (
      <div className="voice-overlay">
        <button className="v-close" onClick={onClose}>✕</button>
        <div className="v-keysheet">
          <div className="v-keyhead">🎙 Enable live voice</div>
          <p>
            Couldn't reach the public voice backend right now. You can still start the
            call with your own OpenAI key — it runs on the <b>gpt-realtime</b>
            speech-to-speech model and is stored <b>only in this browser</b> (localStorage),
            never in our code or servers.
          </p>
          <input
            type="password" placeholder="sk-…" value={draft} autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && draft.startsWith('sk-')) { localStorage.setItem(KEY_STORE, draft.trim()); setKey(draft.trim()); setGate('call') } }}
          />
          <button
            className="btn primary" disabled={!draft.startsWith('sk-')}
            onClick={() => { localStorage.setItem(KEY_STORE, draft.trim()); setKey(draft.trim()); setGate('call') }}
          >
            Start the call
          </button>
          <p className="v-finenote">In production this is the bank's own hosted model — no keys, no third parties.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="voice-overlay">
      <div className={`v-ring ${status}`} />
      <button className="v-close" onClick={end}>✕</button>

      <div className="v-stage">
        <div className="v-halo" style={{ boxShadow: `0 0 0 ${6 + level * 26}px rgba(240,130,30,${0.12 + level * 0.25}), 0 18px 50px rgba(0,0,0,0.45)` }}>
          <FutureSelf age={60} prosperity={progress} talk={status === 'speaking' ? level : 0} />
        </div>
        <div className="v-name">Rohan, 60 · live</div>
        <div className={`v-status ${status}`}>
          {error ? 'Connection lost — tap ✕ and retry' : (STATUS_LABEL[status] || '…')}
        </div>
      </div>

      <div className="v-captions">
        {userLine && <div className="v-user">"{userLine}"</div>}
        <div className="v-bot">{caption || 'Say hello — or ask "what if I invest twenty thousand a month?"'}</div>
      </div>

      <form
        className="v-typebar"
        onSubmit={(e) => {
          e.preventDefault()
          const text = typed.trim()
          if (!text) return
          setUserLine(text)
          sessionRef.current?.sendText(text)
          setTyped('')
        }}
      >
        <input
          value={typed} onChange={(e) => setTyped(e.target.value)}
          placeholder="…or type instead of talking" aria-label="Type a message"
        />
        <button type="submit" disabled={!typed.trim()}>↑</button>
      </form>

      <div className="v-controls">
        <button
          className={`v-btn ${muted ? 'warn' : ''}`}
          onClick={() => { const m = !muted; setMuted(m); sessionRef.current?.setMuted(m) }}
        >
          {muted ? '🔇 Unmute' : '🎙 Mute'}
        </button>
        <button className="v-btn end" onClick={end}>End call</button>
      </div>
      <div className="v-finenote">
        Live speech-to-speech · gpt-realtime · advice is AI-generated, logged &amp; suitability-checked
      </div>
    </div>
  )
}
