import { formatINR } from '../data.js'
import Icon from '../components/Icon.jsx'

/**
 * Money — the 360° view.
 *
 * Boring on purpose. Its job is to be the proof behind everything the adviser says, which
 * means every figure here comes from the same snapshot the conversation reads. Earlier this
 * screen read its own hardcoded constants and quoted ₹18,400 idle while the adviser said
 * ₹1.7 lakh; two numbers for the same thing is the fastest way to lose a room.
 */

export default function Dashboard({ snapshot, onToast, goPlan }) {
  // A skeleton shaped like the screen it precedes, rather than a spinner or a sentence.
  if (!snapshot) {
    return (
      <div className="body">
        <div className="skeleton" aria-busy="true" aria-label="Loading your accounts">
          <div className="sk block" />
          <div className="sk line short" />
          <div className="sk block" style={{ height: 180 }} />
        </div>
      </div>
    )
  }

  const d = snapshot.derived
  const spend = Object.entries(d.spendByCategory).filter(([k]) => k !== 'Income')
  const maxSpend = Math.max(...spend.map(([, v]) => v), 1)
  const fd = snapshot.accounts.find((a) => a.accountType === 'FD')
  const fdDays = fd?.maturityDate
    ? Math.max(0, Math.round((new Date(fd.maturityDate) - Date.now()) / 86_400_000))
    : null

  // Built from the snapshot rather than written down, so a nudge cannot survive the condition
  // that justified it disappearing.
  const nudges = [
    d.idleBalance > 0 && {
      key: 'idle', icon: 'idle',
      title: 'Money sitting still.',
      text: `${formatINR(d.idleBalance)} has been in your savings account earning ${(d.savingsRate * 100).toFixed(0)}% while prices rise ${(d.inflation * 100).toFixed(0)}%. That gap costs about ${formatINR(d.idleCostPerYear)} a year.`,
      action: 'Set up an auto-sweep SIP',
    },
    fdDays !== null && fdDays <= 30 && {
      key: 'fd', icon: 'maturity',
      title: `Your ${formatINR(fd.currentBalance)} deposit matures in ${fdDays} days.`,
      text: `Renewing all of it at ${fd.interestRate}% may be too conservative for a goal thirty years out — though some of it should stay exactly where it is.`,
      action: 'See a suitable split',
    },
    !d.hasTermCover && d.dependents > 0 && {
      key: 'cover', icon: 'cover',
      title: 'No life cover on record.',
      text: `With ${d.dependents} people depending on you, protection comes before investment. A ₹1 crore term policy is about ₹850 a month at your age.`,
      action: 'Get a quote via LIC',
    },
  ].filter(Boolean)

  return (
    <div className="body">
      <div className="hero">
        <div className="label">Sitting idle in savings</div>
        <div className="big">{formatINR(d.idleBalance)}</div>
        <div className="sub">
          Earning {(d.savingsRate * 100).toFixed(0)}% while inflation runs {(d.inflation * 100).toFixed(0)}%.
          Of what arrives each month, <b>{formatINR(d.investableSurplus)} is genuinely spare</b> after
          everything you have already committed.
        </div>
      </div>

      <div className="h-section">Last month · {formatINR(d.monthlyOutflow)} out</div>
      <div className="card barlist">
        {spend.map(([name, amount]) => (
          <div className="row" key={name}>
            <div className="name">{name}</div>
            <div className="track">
              {/* One hue, varying weight. A rainbow implies the categories mean something
                  categorically different, and they don't — they're all just spending. */}
              <div className="fill" style={{
                width: `${(amount / maxSpend) * 100}%`,
                background: `color-mix(in srgb, var(--primary) ${Math.round(45 + (amount / maxSpend) * 55)}%, #ffffff)`,
              }} />
            </div>
            <div className="val">{formatINR(amount)}</div>
          </div>
        ))}
      </div>

      <div className="h-section">Sarthi noticed</div>
      {nudges.map((n) => (
        <div className="card nudge" key={n.key}>
          <div className="ic"><Icon name={n.icon} size={20} /></div>
          <div>
            <div className="tx"><b>{n.title}</b> {n.text}</div>
            <div className="act">
              <button onClick={() => (
                n.action.includes('SIP')
                  ? goPlan()
                  : onToast(`Noted — <b>${n.action}</b> queued. A summary and consent request will arrive before anything changes.`)
              )}>
                {n.action} →
              </button>
            </div>
          </div>
        </div>
      ))}

      <div className="disclaimer">
        Generated from consented transaction data (RBI Account Aggregator · DPDP Act 2023).
        {' '}{snapshot.customer.custName.split(' ')[0]}'s figures are illustrative, drawn from
        {' '}{d.transactionCount} synthetic transactions.
      </div>
    </div>
  )
}
