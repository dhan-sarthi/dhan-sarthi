import { useEffect, useState } from 'react'
import { getAdviceRecords } from '../lib/api.js'

/**
 * The advice register.
 *
 * Every recommendation the system has made, the data that produced it, and whether the
 * suitability gate let it through. This screen exists for a bank's risk function more than
 * for the customer — which is exactly why it is worth having: two rival submissions claim
 * SEBI alignment on a slide, and none of them can open a record.
 *
 * Blocked entries are the interesting ones. A register full of approvals proves nothing.
 */

const fmtWhen = (iso) => {
  const d = new Date(iso)
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function Record({ r }) {
  const blocked = r.suitability === 'BLOCKED'
  const basis = r.basis || {}
  const facts = basis.facts || {}

  return (
    <article className={`record ${blocked ? 'blocked' : 'pass'}`}>
      <div className="record-top">
        <div className="grow">
          <div className="rec">{r.recommendation}</div>
          <div className="stamp">{fmtWhen(r.created_at)} · {r.id.slice(0, 8)}</div>
        </div>
        <span className="verdict-tag">{blocked ? 'Blocked' : 'Passed'}</span>
      </div>

      {r.block_reason && <p className="why">{r.block_reason}</p>}

      <details>
        <summary>Basis for this decision</summary>
        <dl className="kv">
          <dt>Product</dt>
          <dd>{basis.productId || '—'}</dd>

          {basis.amount ? (<><dt>Amount</dt><dd>₹{Number(basis.amount).toLocaleString('en-IN')} / month</dd></>) : null}

          <dt>Rules passed</dt>
          <dd>
            {(basis.rulesPassed || []).length
              ? (basis.rulesPassed || []).map((id) => <span key={id} className="rule">{id}<br /></span>)
              : 'none — blocked on the first rule'}
          </dd>

          <dt>Surplus</dt>
          <dd>{facts.investableSurplus != null ? `₹${Number(facts.investableSurplus).toLocaleString('en-IN')} / month` : '—'}</dd>

          <dt>Buffer</dt>
          <dd>{facts.emergencyFundMonths != null ? `${facts.emergencyFundMonths} months of outgoings` : '—'}</dd>

          <dt>Term cover</dt>
          <dd>{facts.hasTermCover == null ? '—' : facts.hasTermCover ? 'on record' : 'none on record'}</dd>

          <dt>Decided by</dt>
          <dd>{r.model === 'deterministic-rules' ? 'Deterministic rule engine — no model on the decision path' : r.model}</dd>
        </dl>
      </details>
    </article>
  )
}

export default function Register() {
  const [records, setRecords] = useState(null)

  useEffect(() => {
    let cancelled = false
    getAdviceRecords('demo-rohan')
      .then((d) => { if (!cancelled) setRecords(d.records || []) })
      .catch(() => { if (!cancelled) setRecords([]) })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="register">
      <div className="screen-head">
        <h2>Advice register</h2>
        <p className="note">
          Every recommendation, the data behind it, and whether the suitability check passed.
          Written at the moment advice is given, not reconstructed afterwards.
        </p>
      </div>

      {records === null ? (
        <div className="empty"><p>Loading the register…</p></div>
      ) : records.length === 0 ? (
        <div className="empty">
          <p>Nothing recorded yet. Ask your adviser about a product and the decision will appear here.</p>
        </div>
      ) : (
        <div className="register-list">
          {records.map((r) => <Record key={r.id} r={r} />)}
          <div className="retention">
            Retained for five years with the model version that produced each decision, per SEBI's
            framework for AI and machine learning in the securities market.
          </div>
        </div>
      )}
    </div>
  )
}
