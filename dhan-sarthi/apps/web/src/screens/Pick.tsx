/**
 * The way in. No sign-in.
 *
 * A judge gives a link about ninety seconds before closing the tab, and an OTP screen spends all
 * of it. Three pre-loaded customers, one tap, straight into the product — and each one exists to
 * make a different rule fire, so whichever they pick they see the gate work.
 *
 * The line under each name is the whole pitch in one sentence, aimed at someone who has watched
 * customers fail to invest for thirty years and will recognise these people instantly.
 */
import type { ReactNode } from 'react'
import { personas } from '../lib/view.ts'

export function Pick({ onPick }: { onPick: (slug: string) => void }): ReactNode {
  return (
    <div className="scroll" style={{ paddingTop: 40 }}>
      <p
        className="eyebrow"
        style={{ marginTop: 0, color: 'var(--accent)' }}
      >
        IDBI Innovate 2026 · Team Atomic
      </p>

      <h1
        style={{
          fontSize: 42,
          lineHeight: 1.02,
          letterSpacing: '-0.035em',
          fontWeight: 800,
          margin: '0 0 12px',
        }}
      >
        A private banker for every IDBI account
      </h1>

      <p style={{ fontSize: 15.5, lineHeight: 1.5, color: 'var(--ink-mid)', margin: '0 0 8px' }}>
        Uday reads every transaction, tells you the one thing to do today, and refuses to sell you
        an IDBI product that is wrong for you.
      </p>

      <p className="note" style={{ marginBottom: 30 }}>
        Pick a customer to try it. These are synthetic ledgers — twenty-four months each,
        generated, not written. Every number you see is arithmetic over them.
      </p>

      {personas.map((p) => (
        <button
          key={p.slug}
          type="button"
          onClick={() => onPick(p.slug)}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            border: 0,
            background: 'var(--surface)',
            borderRadius: 'var(--r-lg)',
            padding: 20,
            marginBottom: 12,
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <span className="avatar-glyph" style={{ width: 46, height: 46, fontSize: 17 }}>
              {p.customer.custName
                .split(' ')
                .map((n) => n[0])
                .join('')}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>
                {p.customer.custName}
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 }}>{p.pitch}</div>
            </div>
            <span style={{ fontSize: 20, color: 'var(--ink-faint)' }}>›</span>
          </div>
        </button>
      ))}

      <p className="note" style={{ marginTop: 24 }}>
        Nothing here is a real customer, and no data leaves your browser.
      </p>
    </div>
  )
}
