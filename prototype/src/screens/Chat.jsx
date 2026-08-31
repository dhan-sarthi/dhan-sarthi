import { useEffect, useRef, useState } from 'react'
import Avatar from '../components/Avatar.jsx'
import Message from '../components/Message.jsx'
import Icon from '../components/Icon.jsx'
import { formatINR } from '../data.js'

/**
 * The conversation. One thread, voice and text together.
 *
 * Everything the advisor produces arrives here as a message — including the suitability
 * verdict, which is the point: a refusal is part of the conversation, not a modal that
 * interrupts it.
 */

// Two of these are conversation starters; the third is the one that matters, because it
// asks the adviser to sell something it should refuse.
const OPENERS = [
  'Should I buy the ULIP the branch offered?',
  'Where is my money going?',
  'Am I saving enough?',
]

let seq = 0
const uid = () => `m${++seq}`

export default function Chat({ snapshot, level = 0, speaking = false, onStartVoice, onEvaluate }) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const threadRef = useRef(null)
  // A ref, not state: StrictMode invokes effects twice in dev and both runs read the same
  // stale `messages`, so a length check duplicates every opening line.
  const openedRef = useRef(false)

  const surplus = snapshot?.derived?.investableSurplus ?? 0
  const idle = snapshot?.derived?.idleBalance ?? 0

  // The opening. Deliberately a diagnosis before any recommendation — the advisor earns the
  // right to advise by proving it already understands the situation.
  useEffect(() => {
    if (!snapshot || openedRef.current) return
    openedRef.current = true
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

  // Follow the conversation, but never on the first paint — the opening diagnosis is the
  // most important thing on the screen and scrolling past it defeats the point.
  useEffect(() => {
    if (messages.length <= 2) return
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
        <div className="ds-chips">
          {OPENERS.map((o) => (
            <button key={o} className="ds-chip" onClick={() => ask(o)}>{o}</button>
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
          <Icon name="mic" size={21} />
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
        // The card carries a human reason; the auditor's wording lives in the basis and the
        // register, where an auditor will actually read it.
        { kind: 'verdict', verdict: verdict.verdict, product: verdict.product.name,
          reason: verdict.alternative
            ? `Roughly ${formatINR(verdict.alternative.monthly)} a month buys the same protection without the investment bundled in, and without a five-year lock-in.`
            : 'This does not pass the suitability check for your profile.',
          basis: [
            `Rule applied: ${verdict.ruleId}`,
            verdict.recorded,
            ...(verdict.alternative ? [`Suggested instead: ${verdict.alternative.name}, ${formatINR(verdict.alternative.monthly)}/month`] : []),
            'Recorded in the advice register · retained 5 years',
          ],
          actions: verdict.alternative
            ? [{ id: 'term', label: 'See term cover instead', tone: 'primary' }]
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
