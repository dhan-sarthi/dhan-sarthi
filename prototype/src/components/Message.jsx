import { formatINR } from '../data.js'

/**
 * One turn in the conversation.
 *
 * Structured output — an insight, a proposed action, a suitability verdict — renders as a card
 * inside the thread rather than in a separate panel. Keeping it in the thread is what makes
 * this a conversation rather than a chat window bolted to a dashboard.
 */

function Basis({ items }) {
  if (!items?.length) return null
  return (
    <details className="ds-basis">
      <summary>Why this advice</summary>
      <ul>{items.map((b, i) => <li key={i}>{b}</li>)}</ul>
    </details>
  )
}

function Actions({ actions, onAction }) {
  if (!actions?.length) return null
  return (
    <div className="ds-actions">
      {actions.map((a) => (
        <button
          key={a.id}
          className={`ds-btn ${a.tone === 'primary' ? 'ds-btn-primary' : 'ds-btn-quiet'}`}
          onClick={() => onAction?.(a)}
        >
          {a.label}
        </button>
      ))}
    </div>
  )
}

export default function Message({ msg, onAction }) {
  const mine = msg.from === 'you'

  if (msg.kind === 'thinking') {
    return (
      <div className="turn from-sarthi">
        <div className="bubble" aria-label="Thinking">
          <span className="thinking-dots"><i /><i /><i /></span>
        </div>
      </div>
    )
  }

  if (msg.kind === 'insight') {
    return (
      <div className="turn from-sarthi">
        <div className={`ds-card${msg.money ? ' money-block' : ''}`}>
          {msg.label && <div className="ds-card-head">{msg.label}</div>}
          <div className="ds-card-body">
            <div className="ds-figure">
              {typeof msg.value === 'number' ? formatINR(msg.value) : msg.value}
              {msg.unit && <span className="unit">{msg.unit}</span>}
            </div>
            {msg.text && <p className="ds-sub">{msg.text}</p>}
          </div>
          <Actions actions={msg.actions} onAction={onAction} />
          <Basis items={msg.basis} />
        </div>
      </div>
    )
  }

  // The suitability verdict. The one component a compliance officer will look at twice,
  // so the blocked state is as considered as the passing one — arguably more.
  if (msg.kind === 'verdict') {
    const blocked = msg.verdict === 'BLOCKED'
    return (
      <div className="turn from-sarthi">
        <div className={`ds-card ds-verdict ${blocked ? 'blocked' : 'pass'}`}>
          <div className="ds-card-body">
            <span className="tag">{blocked ? 'Not suitable' : 'Suitability check passed'}</span>
            <div className="product">{msg.product}</div>
            {msg.reason && <p className="reason">{msg.reason}</p>}
          </div>
          <Actions actions={msg.actions} onAction={onAction} />
          <Basis items={msg.basis} />
        </div>
      </div>
    )
  }

  return (
    <div className={`turn ${mine ? 'from-you' : 'from-sarthi'}`}>
      <div className="bubble">
        {msg.spoken && !mine && (
          <span className="spoken-mark">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Zm7 9a7 7 0 0 1-6 6.93V21h-2v-3.07A7 7 0 0 1 5 11h2a5 5 0 0 0 10 0h2Z" />
            </svg>
            spoken
          </span>
        )}
        {msg.text}
      </div>
    </div>
  )
}
