import { useEffect, useRef, useState } from 'react'
import FutureSelf from '../components/FutureSelf.jsx'
import { onboardingScript, computeRiskProfile, riskProfiles } from '../data.js'

export default function Onboarding({ onDone, speak }) {
  const [messages, setMessages] = useState([])
  const [stepIdx, setStepIdx] = useState(-1)
  const [typing, setTyping] = useState(false)
  const [chips, setChips] = useState(null)
  const answers = useRef({})
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing, chips])

  // play the bot lines of a step one by one, then show its chips
  const playStep = (idx) => {
    const step = onboardingScript[idx]
    setStepIdx(idx)
    setChips(null)
    let delay = 350
    step.bot.forEach((line, i) => {
      setTimeout(() => setTyping(true), delay)
      delay += 650 + line.length * 4
      setTimeout(() => {
        setTyping(false)
        const isLast = i === step.bot.length - 1
        setMessages((m) => [...m, { who: 'bot', text: line, fineprint: isLast ? step.fineprint : undefined }])
        speak(line)
        if (isLast) setChips(step.chips)
      }, delay)
      delay += 250
    })
  }

  useEffect(() => {
    playStep(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pick = (chip) => {
    setMessages((m) => [...m, { who: 'user', text: chip.label }])
    setChips(null)
    const step = onboardingScript[stepIdx]
    answers.current[step.key] = chip.value

    // find the next applicable step
    let next = stepIdx + 1
    if (onboardingScript[next]?.onlyIf && onboardingScript[next].onlyIf !== chip.value) next += 1

    if (next < onboardingScript.length) {
      playStep(next)
    } else {
      const profile = computeRiskProfile(answers.current)
      const closing = `Done! Your risk profile is ${profile} — so I'll recommend a mix of ${riskProfiles[profile].mix}. You can review or change this anytime; I keep a record of every answer, as SEBI requires. Now let me show you what I found in your accounts…`
      setTimeout(() => setTyping(true), 400)
      setTimeout(() => {
        setTyping(false)
        setMessages((m) => [
          ...m,
          { who: 'bot', text: closing, fineprint: 'Risk profile recorded with your consent · SEBI (IA) Regulations, 2013' },
        ])
        speak(closing)
        setChips([{ label: 'Show me →', value: 'done', done: true, profile }])
      }, 1600)
    }
  }

  return (
    <div className="body">
      <div className="avatar-hello">
        <div className="halo">
          <FutureSelf age={60} prosperity={0.75} />
        </div>
        <span className="pill brand" style={{ marginTop: 10 }}>Rohan, 60 · your future self</span>
      </div>

      <div className="chat-scroll">
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.who}`}>
            {m.text}
            {m.fineprint && <span className="fineprint">{m.fineprint}</span>}
          </div>
        ))}
        {typing && (
          <div className="msg bot typing"><i /><i /><i /></div>
        )}
        {chips && (
          <div className="chips">
            {chips.map((c) => (
              <button key={c.label} onClick={() => (c.done ? onDone(c.profile) : pick(c))}>
                {c.label}
              </button>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  )
}
