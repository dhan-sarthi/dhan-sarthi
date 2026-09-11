/**
 * The pieces the four family screens share.
 *
 * Two of them carry the whole honesty argument, so they live together rather than being inlined
 * where they happen to be used first.
 *
 * **`Avatar` tells a real person from a demo one by weight, not by hue.** The reference gives each
 * member a different avatar colour — teal, ochre, burnt orange — and treats them as a
 * deterministic per-person set. This palette has one hue, and `DESIGN.md` is explicit that two
 * things cannot be separated by picking two of the tint aliases because all three are the same
 * colour: *in a one-hue palette the differentiators are weight and form.* So the customer's disc
 * is the solid brand fill and a demo member's is the soft tint inside a hairline ring. That is a
 * real difference at a glance, and it is carrying the one distinction on this surface that
 * matters — whose numbers came from a statement.
 *
 * **`Marker` is the word for it**, because colour is never the only channel. `You` is the filled
 * chip and `Demo` is the outline chip, which is the same weight-and-form split said in type.
 */
import type { ReactNode } from 'react'
import { Pill } from '../../components/ui.tsx'
import { inr } from '../../lib/money.ts'

/** First letters of the first two words. Same rule as `Head`'s greeting disc. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export function Avatar({
  name,
  real,
  size = 'md',
}: {
  name: string
  /** The customer, whose figures are computed. Solid; a demo member is the soft ring. */
  real: boolean
  size?: 'md' | 'sm'
}): ReactNode {
  const box = size === 'sm' ? 'size-10 text-[14px]' : 'size-12 text-[16px]'
  return (
    <span
      aria-hidden="true"
      className={`grid flex-none place-items-center rounded-pill font-bold ${box} ${
        real
          ? 'bg-brand text-on-dark'
          : 'border-[1.5px] border-solid border-hairline-mint bg-tint-sage text-brand-deep'
      }`}
    >
      {initials(name)}
    </span>
  )
}

/** `You` on the self member, `Demo` on everyone else. Never both, never neither. */
export function Marker({ self }: { self: boolean }): ReactNode {
  return self ? <Pill>You</Pill> : <Pill tone="quiet">Demo</Pill>
}

/**
 * A gain, with its sign carried by a word as well as a colour — the same rule the Dashboard's
 * Holdings pane follows, because the two surfaces show the same figures.
 *
 * `Recorded value` and `Invested` are plain; only this one is coloured, and `−` is the minus sign
 * rather than a hyphen so it lines up under a digit.
 */
export function Gain({ amount, pct }: { amount: number; pct: number | null }): ReactNode {
  /* A deposit recorded at what went into it has not gained nothing — it has not moved, and
     `+₹0 (0.0%)` in the app's positive green says the first thing while meaning the second. */
  if (amount === 0) return <Nothing>Level with invested</Nothing>
  const up = amount >= 0
  return (
    <span className={`text-[15px] font-semibold tabular-nums ${up ? 'text-brand' : 'text-danger'}`}>
      {up ? '+' : '−'}
      {inr(Math.abs(amount))}
      {pct === null ? null : (
        <span className="ml-1 text-[13px] font-semibold">({Math.abs(pct).toFixed(1)}%)</span>
      )}
    </span>
  )
}

/**
 * One cell of the 2×2 metric grid the reference puts on every member and holding card.
 *
 * Its grid is `Market Value | Invested Value` over `Gain | XIRR`. Ours is `Recorded value |
 * Invested` over `Gain | Monthly SIP`: there is no price feed, so nothing may be called a market
 * value, and there is neither a price series nor a dated cashflow behind a declared holding, so
 * there is no XIRR to print. The fourth cell takes the mandate instead — a figure that is in the
 * same block and is real.
 */
export function Metric({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="min-w-0">
      <div className="text-[13px] text-ink-soft">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}

/** The plain value shape inside a `Metric`. */
export function Figure({ children }: { children: ReactNode }): ReactNode {
  return <span className="text-[15px] font-semibold tabular-nums text-ink">{children}</span>
}

/** The dash a cell shows where there is nothing to show. Not a zero — a zero is a claim. */
export function Nothing({ children }: { children: string }): ReactNode {
  return <span className="text-[15px] text-ink-soft">{children}</span>
}
