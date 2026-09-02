/**
 * The primitives. Everything on every screen is built from these.
 *
 * The visual language is taken from Cleo (`ui/cleo/`): one enormous number per card, the currency
 * symbol small and the paise raised, pill segmented controls, dotted leader rows, and big
 * soft-cornered cards on a warm ground. Styling lives in `styles/tokens.css` rather than inline,
 * so the whole system can be re-themed in one file — which matters because IDBI will have brand
 * opinions and we should be able to absorb them in an afternoon.
 */
import type { ReactNode } from 'react'
import { parts } from '../lib/money.ts'

/* ---------------------------------------------------------------- Amount */

export function Amount({
  value,
  size = 'lg',
  paise = false,
}: {
  value: number
  size?: 'xl' | 'lg' | 'md' | 'sm'
  /** Show paise. Off almost everywhere: a plan does not need two decimal places. */
  paise?: boolean
}): ReactNode {
  const p = parts(value)
  return (
    <span className={`amount ${size}`}>
      <span className="cur">{p.cur}</span>
      <span className="int">{p.int}</span>
      {paise && p.frac ? <span className="frac">{p.frac}</span> : null}
    </span>
  )
}

/* ---------------------------------------------------------------- Card */

export function Card({
  tint,
  flat,
  children,
}: {
  tint?: 'sage' | 'sky' | 'clay' | 'ink'
  flat?: boolean
  children: ReactNode
}): ReactNode {
  const cls = ['card', tint ? `tint-${tint}` : '', flat ? 'flat' : ''].filter(Boolean).join(' ')
  return <section className={cls}>{children}</section>
}

/* ---------------------------------------------------------------- Segments */

export function Segments<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
}): ReactNode {
  return (
    <div className="segments" role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          className="segment"
          aria-selected={o.id === value}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- Leader row */

export function Leader({
  label,
  value,
  filled = false,
}: {
  label: string
  value: string
  filled?: boolean
}): ReactNode {
  return (
    <div className="leader">
      <span className={`dot${filled ? ' fill' : ''}`} />
      <span>{label}</span>
      <span className="rule" />
      <span className="val">{value}</span>
    </div>
  )
}

/* ---------------------------------------------------------------- Bar */

export function Bar({ used, pending = 0 }: { used: number; pending?: number }): ReactNode {
  const u = Math.max(0, Math.min(100, used))
  const p = Math.max(0, Math.min(100 - u, pending))
  return (
    <div className="bar" role="presentation">
      <span className="used" style={{ width: `${u}%` }} />
      <span className="soft" style={{ width: `${p}%` }} />
    </div>
  )
}

/* ---------------------------------------------------------------- Tiles */

export function Tile({ label, value }: { label: string; value: number }): ReactNode {
  return (
    <div className="tile">
      <Amount value={value} size="md" />
      <div className="k">{label}</div>
    </div>
  )
}

/* ---------------------------------------------------------------- Header */

export function Head({
  title,
  sub,
  right,
}: {
  title: string
  sub?: string
  right?: ReactNode
}): ReactNode {
  return (
    <header className="head">
      <div>
        <h1>{title}</h1>
        {sub ? <p className="sub">{sub}</p> : null}
      </div>
      {right}
    </header>
  )
}

/* ---------------------------------------------------------------- Pill */

export function Pill({
  tone = 'plain',
  children,
}: {
  tone?: 'plain' | 'warn' | 'bad' | 'ok'
  children: ReactNode
}): ReactNode {
  return <span className={`pill${tone === 'plain' ? '' : ` ${tone}`}`}>{children}</span>
}

export function Eyebrow({ children }: { children: ReactNode }): ReactNode {
  return <div className="eyebrow">{children}</div>
}
