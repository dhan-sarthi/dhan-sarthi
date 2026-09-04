/**
 * The primitives. Everything on every screen is built from these.
 *
 * The visual language is IDBI GO Mobile+, the app this module is meant to live inside: a white
 * ground, mint and peach tints to tell kinds of card apart, orange for every action, full pills
 * for buttons, and one number leading each card. Styling is Tailwind utilities over the tokens in
 * `styles/tokens.css` (exposed through `@theme` in `styles/app.css`), so `bg-tint-sage`,
 * `text-accent-text` and `rounded-md` resolve to the bank's values. See `DESIGN.md` for the
 * recipes.
 *
 * Preflight is not loaded, so every button carries an explicit `border-0` / background and every
 * border an explicit `border-solid`.
 */
import type { ReactNode } from 'react'
import { parts } from '../lib/money.ts'
import { Wave } from './Wave.tsx'

/* ---------------------------------------------------------------- Amount */

/* One number leads each card. Currency glyph and paise sit small on the same baseline. */
const AMOUNT_SIZE = {
  xl: 'text-[34px] font-bold',
  lg: 'text-[28px] font-bold',
  md: 'text-[22px] font-bold',
  sm: 'text-[18px] font-semibold',
} as const

export function Amount({
  value,
  size = 'lg',
  paise = false,
  fit = false,
}: {
  value: number
  size?: 'xl' | 'lg' | 'md' | 'sm'
  /** Show paise. Off almost everywhere: a plan does not need two decimal places. */
  paise?: boolean
  /**
   * Scale with the viewport instead of a fixed size, for half-width tiles. A seven-digit
   * balance at a fixed 22px overflows a tile on a 375px screen, and clipping a balance is the
   * one thing a money display must never do.
   */
  fit?: boolean
}): ReactNode {
  const p = parts(value)
  const sizeCls = fit ? 'text-[clamp(17px,6.2vw,22px)] font-bold' : AMOUNT_SIZE[size]
  return (
    <span
      className={`flex min-w-0 items-baseline leading-none tracking-tight tabular-nums ${sizeCls}`}
    >
      <span className="mr-[0.06em] text-[0.55em] opacity-70">{p.cur}</span>
      <span>{p.int}</span>
      {paise && p.frac ? <span className="text-[0.55em] opacity-70">{p.frac}</span> : null}
    </span>
  )
}

/* ---------------------------------------------------------------- Card */

/*
 * Kinds of card are told apart by tint: mint for money and position, peach for the clock and
 * anything that wants attention, sky for plans, brand green for the one hero card, and white
 * with an orange hairline for actions and forms. An untinted card is white with a mint hairline.
 *
 * Tinted cards also set `--tile-a` / `--tile-b`, which `Tile` reads: on the white ground tiles
 * alternate sage and clay, inside a tinted card they turn white so they stay visible.
 */
const CARD_TINT = {
  sage: 'bg-tint-sage [--tile-a:var(--surface)] [--tile-b:var(--surface)]',
  sky: 'bg-tint-sky [--tile-a:var(--surface)] [--tile-b:var(--surface)]',
  clay: 'bg-tint-clay [--tile-a:var(--surface)] [--tile-b:var(--surface)]',
  ink: 'bg-tint-ink text-on-dark [--tile-a:var(--surface)] [--tile-b:var(--surface)]',
  white: 'bg-surface border border-solid border-hairline',
} as const

export function Card({
  tint,
  flat,
  children,
}: {
  tint?: 'sage' | 'sky' | 'clay' | 'ink' | 'white'
  flat?: boolean
  children: ReactNode
}): ReactNode {
  const cls = flat
    ? 'mb-3 min-w-0 bg-transparent px-0 py-4 [&>*]:min-w-0 [&_h2]:m-0 [&_h2]:text-[18px] [&_h2]:leading-tight [&_h2]:font-semibold'
    : `mb-3 min-w-0 rounded-md p-4 [&>*]:min-w-0 [&_h2]:m-0 [&_h2]:text-[18px] [&_h2]:leading-tight [&_h2]:font-semibold ${
        tint ? CARD_TINT[tint] : 'bg-surface border border-solid border-hairline-mint'
      }`
  return <section className={cls}>{children}</section>
}

/* ---------------------------------------------------------------- Segments */

/* A two- or three-cell rectangle; the active cell is orange. Sits as a flex sibling under Head. */
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
    <div className="mx-4 my-3 flex flex-none rounded-md bg-ground-deep p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          className="h-10 min-w-0 flex-1 truncate rounded-sm border-0 bg-transparent px-1 text-sm font-semibold text-ink-mid transition-colors duration-150 aria-selected:bg-accent aria-selected:text-white"
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
  total = false,
}: {
  label: string
  value: string
  /** A committed figure (filled dot) rather than a flexible one (ring). */
  filled?: boolean
  /** A total: label in ink, value in brand green. */
  total?: boolean
}): ReactNode {
  return (
    <div className="flex items-baseline gap-2 py-[7px] text-[15px] leading-snug">
      <span
        className={`size-2 shrink-0 -translate-y-px rounded-pill ${
          filled ? 'bg-brand' : 'border-[1.5px] border-solid border-brand'
        }`}
      />
      <span className={total ? 'font-semibold text-ink' : 'text-ink-mid'}>{label}</span>
      <span className="flex-1 -translate-y-1 border-b-[1.5px] border-dotted border-hairline-mint" />
      <span className={`font-semibold tabular-nums ${total ? 'text-brand' : 'text-ink'}`}>
        {value}
      </span>
    </div>
  )
}

/* ---------------------------------------------------------------- Bar */

export function Bar({
  used,
  pending = 0,
  onDark = false,
}: {
  used: number
  pending?: number
  /** On the green hero panel the idle track has to be white-on-green, not the grey. */
  onDark?: boolean
}): ReactNode {
  const u = Math.max(0, Math.min(100, used))
  const p = Math.max(0, Math.min(100 - u, pending))
  return (
    <div
      className={`flex h-2 overflow-hidden rounded-pill ${onDark ? 'bg-white/20' : 'bg-chart-idle'}`}
      role="presentation"
    >
      <span className="h-full bg-accent" style={{ width: `${u}%` }} />
      <span className="h-full bg-accent-soft" style={{ width: `${p}%` }} />
    </div>
  )
}

/* ---------------------------------------------------------------- Tiles */

const TILE_TONE = {
  sage: 'bg-tint-sage',
  clay: 'bg-tint-clay',
  white: 'bg-surface',
} as const

export function Tile({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  /** Force a background. Left out, tiles alternate sage/clay and turn white inside a tinted Card. */
  tone?: 'sage' | 'clay' | 'white'
}): ReactNode {
  const bg = tone
    ? TILE_TONE[tone]
    : 'odd:bg-[color:var(--tile-a,var(--tint-sage))] even:bg-[color:var(--tile-b,var(--tint-clay))]'
  return (
    <div className={`min-w-0 overflow-hidden rounded-sm p-3 ${bg}`}>
      <Amount value={value} size="md" fit />
      <div className="mt-1 text-xs text-ink-soft">{label}</div>
    </div>
  )
}

/* ---------------------------------------------------------------- Header */

/* The GO Mobile+ header slab: white fading to mint, rounded bottom corners, one soft shadow. */
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
    <header className="relative isolate flex flex-none items-start justify-between gap-3 overflow-hidden rounded-b-lg bg-gradient-to-b from-white to-header-mint p-4 shadow-card">
      <Wave tone="light" className="-z-10" />
      <div className="min-w-0">
        <h1 className="m-0 text-[26px] font-semibold leading-tight text-ink">{title}</h1>
        {sub ? <p className="mb-0 mt-1 text-sm text-ink-soft">{sub}</p> : null}
      </div>
      {right}
    </header>
  )
}

/* ---------------------------------------------------------------- HeroPanel */

/*
 * The one thing on the screen, and the only surface shaped like this.
 *
 * Deep green with the bank's wave and white type, borrowed from the account cards in GO Mobile+.
 * It exists to break the stack: when every block is a tinted card of the same radius and padding,
 * nothing leads, and a page of identical cards is the shape machine-written UI takes. Use it once
 * per screen — a second one on the same page would undo the point of the first.
 */
export function HeroPanel({
  label,
  meta,
  children,
  footer,
  settled,
}: {
  label: string
  meta?: string
  children: ReactNode
  footer?: ReactNode
  /** Re-render after a recompute: cross-fade so it reads as re-derived, not swapped. */
  settled?: string | number
}): ReactNode {
  return (
    <section className="relative isolate mb-3 overflow-hidden rounded-lg bg-gradient-to-br from-brand to-brand-deep p-4 text-on-dark shadow-lift">
      <Wave tone="dark" className="-z-10" />
      <h2 className="m-0 text-[13px] font-semibold uppercase tracking-wide text-on-dark/70">
        {label}
      </h2>
      {meta ? <p className="mb-0 mt-1 text-sm text-on-dark/75">{meta}</p> : null}
      <div key={settled} className="settle mt-3">
        {children}
      </div>
      {footer ? (
        <div className="mt-4 border-0 border-t border-solid border-white/15 pt-3">{footer}</div>
      ) : null}
    </section>
  )
}

/* ---------------------------------------------------------------- Pill */

const PILL_TONE = {
  plain: 'bg-legend-chip text-brand',
  warn: 'bg-accent-soft text-accent-text',
  bad: 'bg-danger-soft text-danger',
  ok: 'bg-brand text-on-dark',
} as const

export function Pill({
  tone = 'plain',
  children,
}: {
  tone?: 'plain' | 'warn' | 'bad' | 'ok'
  children: ReactNode
}): ReactNode {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-[11px] py-[5px] text-xs font-semibold ${PILL_TONE[tone]}`}
    >
      {children}
    </span>
  )
}

export function Eyebrow({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="mb-2.5 mt-6 text-[11px] font-semibold uppercase tracking-wide text-accent-text">
      {children}
    </div>
  )
}
