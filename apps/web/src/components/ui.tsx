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
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { parts } from '../lib/money.ts'
import { useChanged, useCountUp, useRipple } from '../lib/motion.ts'

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
  animate = true,
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
  /**
   * Travel to a new value rather than jumping to it, and flash once on arrival.
   *
   * On by default, and it costs nothing on first paint: the count only runs when the number
   * *changes*. That is the case it exists for. Editing a declared income moves the surplus, the
   * daily allowance and the goal target at once, and four numbers that jump together tell a
   * customer nothing about which of them their edit touched.
   */
  animate?: boolean
}): ReactNode {
  const live = useCountUp(animate ? value : value)
  const shown = animate ? live : value
  const moved = useChanged(animate ? value : null)
  const p = parts(shown)
  const sizeCls = fit ? 'text-[clamp(17px,6.2vw,22px)] font-bold' : AMOUNT_SIZE[size]
  return (
    <span
      className={`flex min-w-0 items-baseline leading-none tracking-tight tabular-nums ${sizeCls} ${
        moved ? 'ds-flash' : ''
      }`}
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
  const index = Math.max(
    0,
    options.findIndex((o) => o.id === value),
  )
  return (
    <div className="relative mx-4 my-3 flex flex-none rounded-md bg-ground-deep p-1" role="tablist">
      {/* One pill that slides, rather than a background appearing on the newly selected cell.
          The movement is what tells you which way you went. */}
      <span
        aria-hidden="true"
        className="absolute bottom-1 top-1 rounded-sm bg-accent transition-transform duration-200 ease-[cubic-bezier(0.22,0.8,0.3,1)]"
        style={{
          width: `calc((100% - 8px) / ${options.length})`,
          left: 4,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          className="relative z-[1] h-10 min-w-0 flex-1 truncate rounded-sm border-0 bg-transparent px-1 text-sm font-semibold text-ink-mid transition-colors duration-200 aria-selected:text-white"
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

export function Bar({ used, pending = 0 }: { used: number; pending?: number }): ReactNode {
  const u = Math.max(0, Math.min(100, used))
  const p = Math.max(0, Math.min(100 - u, pending))
  // Each segment is full width and scaled down, so the change animates on the compositor.
  // Transitioning `width` instead would relayout the row on every frame of every bar.
  return (
    <div className="flex h-2 overflow-hidden rounded-pill bg-chart-idle" role="presentation">
      <span
        className="ds-bar-fill h-full bg-accent"
        style={{ width: '100%', transform: `scaleX(${u / 100})`, flex: `0 0 ${u}%` }}
      />
      <span
        className="ds-bar-fill h-full bg-accent-soft"
        style={{ width: '100%', transform: `scaleX(${p / 100})`, flex: `0 0 ${p}%` }}
      />
    </div>
  )
}

/* ---------------------------------------------------------------- Skeleton */

/*
 * A shape where content will be, while it is being fetched.
 *
 * Better than a spinner for one specific reason: the layout does not jump when the data lands,
 * because the skeleton is already the size of the thing. On this app that matters more than
 * usual, since a view is four live calls to a bank and takes a second or two.
 */
export function Skeleton({
  h = 16,
  w = '100%',
  className = '',
}: {
  h?: number
  w?: number | string
  className?: string
}): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={`ds-skeleton block ${className}`}
      style={{ height: h, width: typeof w === 'number' ? `${w}px` : w }}
    />
  )
}

/* ---------------------------------------------------------------- Button */

const BTN_TONE = {
  primary: 'bg-accent text-white border-0',
  secondary: 'bg-white text-accent-text border-[1.5px] border-solid border-accent',
  quiet: 'bg-ground-deep text-ink-mid border-0',
  danger: 'bg-danger-soft text-danger border-0',
} as const

/* Every tappable thing in the app, so the press response is the same everywhere. */
export function Button({
  tone = 'primary',
  size = 'md',
  full,
  disabled,
  busy,
  onClick,
  type = 'button',
  children,
  ariaLabel,
}: {
  tone?: keyof typeof BTN_TONE
  size?: 'md' | 'sm'
  full?: boolean
  disabled?: boolean
  /** Shows a spinner and blocks the press, without changing the button's width. */
  busy?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
  children: ReactNode
  ariaLabel?: string
}): ReactNode {
  const ripple = useRipple()
  const h = size === 'sm' ? 'h-10 px-3.5 text-[14px]' : 'h-12 px-5 text-[15px]'
  return (
    <button
      type={type}
      disabled={disabled === true || busy === true}
      aria-label={ariaLabel}
      aria-busy={busy === true}
      onPointerDown={(e: ReactPointerEvent<HTMLElement>) => ripple(e)}
      onClick={onClick}
      className={`ds-press inline-flex items-center justify-center gap-2 rounded-pill font-semibold disabled:opacity-55 ${h} ${
        BTN_TONE[tone]
      } ${full === true ? 'w-full' : ''}`}
    >
      {busy === true ? <Spinner /> : null}
      {children}
    </button>
  )
}

export function Spinner({ size = 15 }: { size?: number }): ReactNode {
  return (
    <span
      aria-hidden="true"
      className="ds-spin inline-block flex-none rounded-pill border-[2px] border-solid border-current border-t-transparent opacity-70"
      style={{ width: size, height: size }}
    />
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
    <header className="flex flex-none items-start justify-between gap-3 rounded-b-lg bg-gradient-to-b from-white to-header-mint p-4 shadow-card">
      {/* Keyed on the title so the words change with a fade rather than a jump. The header is
          the one part of a screen that does not unmount into the entrance stagger, so without
          this a tab change swapped "Today" for "Money" mid-frame while everything under it
          animated. Short: this runs on every tap of the bar. */}
      <div key={title} className="ds-screen min-w-0">
        <h1 className="m-0 text-[26px] font-semibold leading-tight text-ink">{title}</h1>
        {sub ? <p className="mb-0 mt-1 text-sm text-ink-soft">{sub}</p> : null}
      </div>
      {right}
    </header>
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
