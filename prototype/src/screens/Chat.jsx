import { useEffect, useRef, useState } from 'react'
import Avatar from '../components/Avatar.jsx'
import Message from '../components/Message.jsx'
import { formatINR } from '../data.js'

/**
 * The conversation. One thread, voice and text together.
 *
 * Everything the advisor produces arrives here as a message — including the suitability
 * verdict, which is the point: a refusal is part of the conversation, not a modal that
 * interrupts it.
 */

const OPENERS = [
  'Where is my money going?',
  'Am I saving enough?',
  'Should I buy the ULIP the branch offered?',
  "What happens if I invest ₹18,000 a month?",
]

let seq = 0
const uid = () => `m${++seq}`

export default function Chat({ snapshot, level = 0, speaking = false, onStartVoice, onEvaluate }) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const threadRef = useRef(null)

  const surplus = snapshot?.derived?.investableSurplus ?? 0
  const idle = snapshot?.derived?.idleBalance ?? 0

  // The opening. Deliberately a diagnosis before any recommendation — the advisor earns the
  // right to advise by proving it already understands the situation.
  useEffect(() => {
    if (!snapshot || messages.length) return
    setMessages([
      { id: uid(), from: 'sarthi', kind: 'text',
        text: `Namaste ${snapshot.customer.custName.split(' ')[0]}. I've been through the last six months of your account.` },
      { id: uid(), from: 'sarthi', kind: 'insight', label: 'Sitting idle', value: idle, money: true,
        text: `Four months in your savings account, earning 3% while prices rise 6%. That's costing you about ${formatINR(Math.round(idle * 0.03))} a year in real terms.`,
        basis: [
          `Average balance over 3 months: ${formatINR(snapshot.accounts[0]?.avgMonthlyBalance3m ?? 0)}`,
          `Monthly surplus after commitments: ${formatINR(surplus)}`,
          'Savings rate 3.0% · assumed inflation 6.0%',
        ],
        actions: [
          { id: 'plan', label: 'What should I do?', tone: 'primary' },
          { id: 'later', label: 'Not now' },
        ] },
    ])
  }, [snapshot]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const push = (m) => setMessages((prev) => [...prev, { id: uid(), ...m }])

  async function ask(text) {
    if (!text.trim() || busy) return
    push({ from: 'you', kind: 'text', text })
    setDraft('')
    setBusy(true)
    push({ from: 'sarthi', kind: 'thinking' })

    const reply = await respond(text, { snapshot, onEvaluate })

    setMessages((prev) => {
      const withoutThinking = prev.filter((m) => m.kind !== 'thinking')
      return [...withoutThinking, ...reply.map((r) => ({ id: uid(), from: 'sarthi', ...r }))]
    })
    setBusy(false)
  }

  const status = speaking ? 'speaking' : busy ? 'thinking' : 'ready'

  return (
    <div className="chat">
      <header className="chat-head">
        <Avatar level={level} speaking={speaking} />
        <div className="who">
          <div className="name">Dhan Sarthi</div>
          <div className={`state ${status}`}>
            <span className="dot" />
            {speaking ? 'Speaking' : busy ? 'Thinking' : 'Ready · your adviser'}
          </div>
        </div>
      </header>

      <div className="thread" ref={threadRef}>
        {messages.map((m) => (
          <Message key={m.id} msg={m} onAction={(a) => ask(a.label)} />
        ))}
      </div>

      {messages.length <= 2 && (
        <div className="chips">
          {OPENERS.map((o) => (
            <button key={o} className="chip" onClick={() => ask(o)}>{o}</button>
          ))}
        </div>
      )}

      <form
        className="composer"
        onSubmit={(e) => { e.preventDefault(); ask(draft) }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about your money…"
          aria-label="Ask about your money"
        />
        <button type="button" className="mic" onClick={onStartVoice} aria-label="Talk to your adviser">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Zm7 9a7 7 0 0 1-6 6.93V21h-2v-3.07A7 7 0 0 1 5 11h2a5 5 0 0 0 10 0h2Z" />
          </svg>
        </button>
      </form>
    </div>
  )
}

/**
 * Text replies, for now, are rule-matched against the snapshot rather than model-generated.
 *
 * That is deliberate and not a placeholder: every number spoken here comes from the same
 * snapshot the screens render, so the advisor cannot quote a figure the UI does not show.
 * The live voice session is where the model speaks, and it is grounded on the same object.
 */
async function respond(text, { snapshot, onEvaluate }) {
  const q = text.toLowerCase()
  const d = snapshot.derived

  if (/ulip|market plus/.test(q)) {
    const verdict = await onEvaluate?.('LIC_ULIP_0088', 2500)
    if (verdict) {
      return [
        { kind: 'text', text: verdict.spoken },
        { kind: 'verdict', verdict: verdict.verdict, product: verdict.product.name,
          reason: verdict.recorded,
          basis: [
            `Rule applied: ${verdict.ruleId}`,
            ...(verdict.alternative ? [`Suggested instead: ${verdict.alternative.name} at ${formatINR(verdict.alternative.monthly)}/month`] : []),
            'Recorded in the advice register · retained 5 years',
          ],
          actions: verdict.alternative
            ? [{ id: 'term', label: `See ${verdict.alternative.name}`, tone: 'primary' }]
            : [] },
      ]
    }
  }

  if (/where.*money|spend|going/.test(q)) {
    return [
      { kind: 'insight', label: 'Last month', value: d.monthlyOutflow, money: true,
        text: `Against ${formatINR(d.monthlyInflow)} coming in. Your largest single outgoing was rent at ${formatINR(d.topCategoryAmount)}.`,
        basis: [`${d.transactionCount} transactions analysed`, 'Categorised from narration and merchant codes'] },
    ]
  }

  if (/saving enough|on track|retire/.test(q)) {
    return [
      { kind: 'insight', label: 'Investing now', value: d.currentSip, money: true, unit: '/mo',
        text: `While ${formatINR(d.investableSurplus)} a month goes unused. Closing that gap is the single biggest thing available to you, and it comes from money you already don't spend.`,
        basis: ['6-month spend analysis', 'Goal gap calculation against retirement at 60'],
        actions: [{ id: 'raise', label: 'Show me the difference', tone: 'primary' }] },
    ]
  }

  if (/18,?000|eighteen/.test(q)) {
    return [{ kind: 'text', text: 'Open the Future Self tab and drag the slider — you will see it rather than have me describe it.' }]
  }

  return [{ kind: 'text', text: 'Ask me about your spending, whether you are saving enough, or any product the branch has offered you.' }]
}
