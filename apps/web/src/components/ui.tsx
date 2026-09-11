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
 * Every button carries an explicit `border-0` and background and every border an explicit
 * `border-solid`. Preflight *is* loaded — `DESIGN.md` said otherwise for a while and this file
 * repeated it — so most of that is belt and braces; the `border-solid` half is not, and a border
 * that silently draws as `none` is the one mistake here nobody spots in review.
 */
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { ArrowLeft, ChevronRight } from 'lucide-react'
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

/*
 * A two- or three-cell rectangle; the active cell is orange. Sits as a flex sibling under Head.
 *
 * `variant="underline"` is SmartWealth's screen-level tab row: left-anchored labels on white, an
 * orange bar under the active one, a hairline running the full width as its track. Four labels do
 * not fit a 375px phone as equal thirds, so the underline row scrolls horizontally and the cells
 * size to their text — which is also why the indicator is a border on each cell rather than one
 * span that slides. A sliding span has to be measured, and there is nothing to measure against
 * once the row can be scrolled out from under it.
 *
 * The pill stays for switches *inside* a card, where three short words do fit.
 *
 * `variant="switch"` is the third: SmartWealth's `Monthly SIP | Lump sum` control, measured at
 * 242×43 and *centred* rather than run to the gutters, with a full-pill track and a full-pill
 * thumb. It is not the `pill` variant recoloured. A full-width 14px-radius track reads as a
 * screen-level tab row — "which part of this page am I on" — where a narrow centred pill reads
 * as one question with two answers, which is what choosing between a SIP and a lump sum is.
 * IDBI's own buttons are full pills, so the reference's radius and this app's agree here.
 */
export function Segments<T extends string>({
  options,
  value,
  onChange,
  variant = 'pill',
}: {
  options: readonly { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
  variant?: 'pill' | 'underline' | 'switch'
}): ReactNode {
  const index = Math.max(
    0,
    options.findIndex((o) => o.id === value),
  )
  if (variant === 'switch') {
    return (
      <div
        className="relative mx-auto my-5 flex w-fit max-w-full flex-none rounded-pill border border-solid border-hairline-mint bg-surface p-1"
        role="tablist"
      >
        <span
          aria-hidden="true"
          className="absolute bottom-1 top-1 rounded-pill bg-accent transition-transform duration-200 ease-[cubic-bezier(0.22,0.8,0.3,1)]"
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
            className="relative z-[1] h-[35px] min-w-[120px] flex-1 truncate rounded-pill border-0 bg-transparent px-3 text-[15px] font-semibold text-ink-mid transition-colors duration-200 aria-selected:text-on-accent"
            aria-selected={o.id === value}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    )
  }
  if (variant === 'underline') {
    return (
      <div
        className="flex flex-none overflow-x-auto border-0 border-b-[1.5px] border-solid border-hairline-mint bg-surface px-4"
        role="tablist"
      >
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={o.id === value}
            onClick={() => onChange(o.id)}
            /* -mb-[1.5px] so the active cell's 3px bar sits on the hairline rather than above
               it. text-accent-text, not text-accent: raw #f58220 is 2.6:1 on white. */
            className="ds-press -mb-[1.5px] h-11 flex-none whitespace-nowrap border-0 border-b-[3px] border-solid border-transparent bg-transparent px-3 text-[15px] font-semibold text-ink-mid transition-colors duration-200 first:pl-0 last:pr-0 aria-selected:border-accent aria-selected:font-bold aria-selected:text-accent-text"
          >
            {o.label}
          </button>
        ))}
      </div>
    )
  }
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
          className="relative z-[1] h-10 min-w-0 flex-1 truncate rounded-sm border-0 bg-transparent px-1 text-sm font-semibold text-ink-mid transition-colors duration-200 aria-selected:text-on-accent"
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
      <span className={`font-semibold tabular-nums ${total ? 'text-brand-deep' : 'text-ink'}`}>
        {value}
      </span>
    </div>
  )
}

/* ---------------------------------------------------------------- Bar */

/*
 * How much of an envelope is gone, and how much of it is already claimed.
 *
 * Each segment is the full width of the track and scaled down to its share, so a change animates
 * on the compositor. Transitioning `width` instead would relayout the row on every frame of
 * every bar, and there are a dozen of them on Money.
 *
 * The segments are positioned rather than laid out, and that is the whole point of this comment.
 * They used to be flex children carrying `flex: 0 0 {u}%` *as well as* `scaleX(u/100)`, and
 * flex-basis wins the main axis — so the transform scaled a box that was already the right size
 * and every bar painted `u²/100` of its track. A safe-to-spend envelope that was 72.5% gone drew
 * at 52.6%, under a card that said so in words. Absolute positioning leaves the transform as the
 * only thing that decides width, which is the only way the two cannot disagree again.
 */
export function Bar({ used, pending = 0 }: { used: number; pending?: number }): ReactNode {
  const u = Math.max(0, Math.min(100, used))
  const p = Math.max(0, Math.min(100 - u, pending))
  return (
    <div className="relative h-2 overflow-hidden rounded-pill bg-chart-idle" role="presentation">
      <span
        className="ds-bar-fill absolute inset-0 bg-accent"
        style={{ transform: `scaleX(${u / 100})` }}
      />
      {/* Starts where the used segment ends. The translate is a percentage of this span's own
          box, which is the full track, so `translateX(u%)` is u% of the track. */}
      <span
        className="ds-bar-fill absolute inset-0 bg-accent-soft"
        style={{ transform: `translateX(${u}%) scaleX(${p / 100})` }}
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
  primary: 'bg-accent text-on-accent border-0',
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

/* ---------------------------------------------------------------- IconButton */

/*
 * A square tap target with a glyph in it and no label on screen.
 *
 * This existed five times before it existed once: the sheet's close, the stepper's plus and
 * minus, the queue card's dismiss, the header chips that were on Today, and the holdings sheet's
 * delete. All five were `grid place-items-center rounded-pill` at a different size with a
 * different fill, and the differences between them were accidents rather than decisions. Three
 * sizes and four tones cover every one.
 *
 * `label` is required, because a button whose only content is an icon has no accessible name
 * without one, and that is the entire reason these were worth collapsing.
 */
const ICON_BTN_SIZE = { sm: 'size-9', md: 'size-10', lg: 'size-11' } as const

const ICON_BTN_TONE = {
  /** The default: a grey disc on white. Sheet close, stepper. */
  grey: 'border-0 bg-ground-deep text-ink-mid',
  /** A white pill with a mint hairline. The header chips. */
  bordered: 'border border-solid border-hairline-mint bg-white text-ink',
  /** No fill at all; inherits its ink, so it works on the dark surfaces too. */
  ghost: 'border-0 bg-transparent text-inherit',
  /** Destructive, and quiet about it: soft fill, red glyph. */
  danger: 'border-0 bg-danger-soft text-danger',
} as const

export function IconButton({
  label,
  size = 'md',
  tone = 'grey',
  count,
  disabled,
  onClick,
  ariaExpanded,
  children,
}: {
  /** The accessible name. Not optional: the glyph is decoration. */
  label: string
  size?: 'sm' | 'md' | 'lg'
  tone?: keyof typeof ICON_BTN_TONE
  /** A small orange disc on the top-right corner. Left out or zero, no badge. */
  count?: number
  disabled?: boolean
  onClick?: () => void
  ariaExpanded?: boolean
  children: ReactNode
}): ReactNode {
  const ripple = useRipple()
  const button = (
    <button
      type="button"
      aria-label={label}
      aria-expanded={ariaExpanded}
      disabled={disabled === true}
      onPointerDown={(e: ReactPointerEvent<HTMLElement>) => ripple(e)}
      onClick={onClick}
      className={`ds-press grid flex-none place-items-center rounded-pill disabled:opacity-40 ${ICON_BTN_SIZE[size]} ${ICON_BTN_TONE[tone]}`}
    >
      {children}
    </button>
  )
  if (count === undefined || count <= 0) return button
  /*
   * The badge sits on a wrapper rather than on the button, and it has to. `.ds-press` sets
   * `overflow: hidden` so the ripple stays inside the pill, which also clips anything hanging
   * off a corner — the count used to lose its top-right two pixels to it.
   */
  return (
    <span className="relative inline-flex flex-none">
      {button}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-0.5 -top-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-pill bg-accent px-1 text-[10.5px] font-bold text-on-accent"
      >
        {count}
      </span>
    </span>
  )
}

/* ---------------------------------------------------------------- TextLink */

/*
 * A word you can press, with nothing drawn around it.
 *
 * `Button`'s `quiet` tone is the filled grey pill, so the actual text link had no home and got
 * hand-rolled twice with near-identical strings. Green, not orange: in GO Mobile+ orange means
 * "this is the action" and a link beside a primary button must not compete with it. `brand-deep`
 * rather than `brand` — 9.8:1 against 4.71:1, and the copies disagreed about which to use.
 */
export function TextLink({
  onClick,
  size = 'md',
  flush = false,
  disabled,
  ariaExpanded,
  children,
}: {
  onClick?: () => void
  size?: 'md' | 'sm'
  /** Drop the side padding so the words line up with the paragraph above them. */
  flush?: boolean
  disabled?: boolean
  ariaExpanded?: boolean
  children: ReactNode
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled === true}
      aria-expanded={ariaExpanded}
      className={`ds-press inline-flex h-10 shrink-0 items-center gap-1 rounded-pill border-0 bg-transparent font-semibold text-brand-deep underline-offset-2 hover:underline disabled:opacity-60 ${
        flush ? 'px-0' : 'px-2'
      } ${size === 'sm' ? 'text-sm' : 'text-[15px]'}`}
    >
      {children}
    </button>
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

/* ---------------------------------------------------------------- ListRow */

/*
 * One row of a list: a glyph, a title, a second line, and something on the right.
 *
 * SmartWealth builds three whole screens out of this and holds it at 68pt; this app had the same
 * skeleton twice already, at ~54, in the statement list and in the onboarding probe rows. 68 is
 * the one to hold for a list screen — those two still need lifting onto this, and did not get
 * lifted here because the shell is not the place to restyle the statement.
 *
 * The leading tile is `legend-chip` with `brand-deep` ink, which is where `03-PALETTE-MAP.md`
 * sends SmartWealth's `#F1F4FA` icon tile. The chevron is `ink-faint`, the one colour in the
 * palette that is furniture rather than copy, and it appears only when the row does something.
 */
export function ListRow({
  icon,
  title,
  sub,
  value,
  badge,
  onClick,
}: {
  /** A 22px lucide glyph. Sits in a 40px tile; leave it out and the text starts at the gutter. */
  icon?: ReactNode
  title: string
  /**
   * The second line. A string in nine callers out of ten; a node because SmartWealth's Overview
   * rows put a **status chip** here rather than a sentence (`06-dashboard/01-dashboard-home.md`
   * §7 — `In Process`, `Needs attention`, `On Track`), and a chip is not a string.
   */
  sub?: ReactNode
  /** The right-hand block: an amount, a pill, a count. */
  value?: ReactNode
  /** A count pill before the chevron, in the neutral chip colours. */
  badge?: number
  onClick?: () => void
}): ReactNode {
  const ripple = useRipple()
  const body = (
    <>
      {icon ? (
        <span
          aria-hidden="true"
          className="grid size-10 flex-none place-items-center rounded-sm bg-legend-chip text-brand-deep"
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-ink">{title}</span>
        {sub ? (
          <span className="mt-0.5 block text-[13px] leading-snug text-ink-soft">{sub}</span>
        ) : null}
      </span>
      {value ? <span className="flex-none text-right">{value}</span> : null}
      {badge !== undefined && badge > 0 ? (
        <span className="flex-none rounded-pill bg-legend-chip px-2.5 py-1 text-xs font-bold tabular-nums text-brand-deep">
          {badge}
        </span>
      ) : null}
      {onClick ? (
        <ChevronRight size={18} strokeWidth={2.2} className="flex-none text-ink-faint" />
      ) : null}
    </>
  )
  const cls = 'flex min-h-[68px] w-full items-center gap-3 border-0 bg-transparent py-3 text-left'
  if (!onClick) return <div className={cls}>{body}</div>
  return (
    <button type="button" className={`ds-press ${cls}`} onPointerDown={ripple} onClick={onClick}>
      {body}
    </button>
  )
}

/* ---------------------------------------------------------------- Header */

/*
 * The GO Mobile+ header slab: white fading to mint, rounded bottom corners, one soft shadow.
 *
 * Three shapes, which is what SmartWealth's app bar turned out to be once the fourteen readings
 * were reconciled, and all three keep the same slab:
 *
 *   default   a 26px page title with an optional second line. What every screen shipped with.
 *   back      a back arrow, the title beside it at 20px, and up to two trailing actions. The
 *             shape a pushed screen needs, and the app had no affordance for it at all.
 *   greeting  an initials disc, "Hi, <name>", trailing actions. SmartWealth's home bar.
 *
 * `overlap` is the fourth thing the reference does with its bar and the only one that is a
 * layout affordance rather than a variant: the slab grows a chunk of empty bottom padding and
 * the first card of the screen is pulled up into it, so the header reads as a backdrop the
 * content sits on rather than a band above it. It only works when the header scrolls with the
 * content — see the note in `Screen` — which is why the prop is here and the mechanics are not.
 *
 * `tone="brand"` is the slab in green, and it exists only because `overlap` needs it.
 * `03-PALETTE-MAP.md` §2 is explicit: SmartWealth's navy bar is *load-bearing* — the overlap
 * reads because a white card is hanging into a dark band — and "the overlap-the-header trick
 * still works against `--brand` green, but it must be rebuilt, not recoloured". On the mint slab
 * a white card overlapping a near-white gradient is invisible, which is exactly what the first
 * pass shipped. Green is therefore not decoration here; it is the thing that makes the card read
 * as overlapping anything. Use it with `overlap`, and nowhere else.
 */
export function Head({
  title,
  sub,
  right,
  onBack,
  backLabel = 'Back',
  greeting,
  overlap = false,
  tone = 'slab',
}: {
  title: string
  sub?: string
  /** Trailing actions. Zero, one or two `IconButton`s; Head lays them out. */
  right?: ReactNode
  /** Present: the back variant. The title moves down to 20px and on to the arrow's baseline. */
  onBack?: () => void
  backLabel?: string
  /** Present: the greeting variant. `title` becomes the name after "Hi,". */
  greeting?: boolean
  /** Grow the slab so the screen's first card can be pulled up into it. */
  overlap?: boolean
  /** `brand` paints the slab green so an overlapping white card has something to overlap. */
  tone?: 'slab' | 'brand'
}): ReactNode {
  const dark = tone === 'brand'
  const ground = dark
    ? 'bg-gradient-to-br from-brand to-brand-deep'
    : 'bg-gradient-to-b from-white to-header-mint'
  const slab = `flex flex-none items-start justify-between gap-3 rounded-b-lg ${ground} px-4 pt-4 shadow-card ${
    dark ? 'text-on-dark' : ''
  } ${overlap ? 'pb-[68px]' : 'pb-4'}`
  const titleInk = dark ? 'text-on-dark' : 'text-ink'
  const subInk = dark ? 'text-white/75' : 'text-ink-mid'
  const actions = right ? <div className="flex flex-none items-center gap-2">{right}</div> : null

  if (onBack || greeting) {
    return (
      <header className={`${slab} items-center`}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {onBack ? (
            <IconButton label={backLabel} tone={dark ? 'ghost' : 'bordered'} onClick={onBack}>
              <ArrowLeft size={18} strokeWidth={2.3} />
            </IconButton>
          ) : (
            <span
              aria-hidden="true"
              className="grid size-10 flex-none place-items-center rounded-pill bg-tint-sage text-[15px] font-bold text-brand-deep"
            >
              {initials(title)}
            </span>
          )}
          <div key={title} className={`ds-screen min-w-0 ${dark ? '-ml-1' : ''}`}>
            <h1 className={`m-0 truncate text-[20px] font-semibold leading-tight ${titleInk}`}>
              {greeting ? `Hi, ${title}` : title}
            </h1>
            {sub ? <p className={`mb-0 mt-0.5 truncate text-[13px] ${subInk}`}>{sub}</p> : null}
          </div>
        </div>
        {actions}
      </header>
    )
  }

  return (
    <header className={slab}>
      {/* Keyed on the title so the words change with a fade rather than a jump. The header is
          the one part of a screen that does not unmount into the entrance stagger, so without
          this a tab change swapped "Today" for "Money" mid-frame while everything under it
          animated. Short: this runs on every tap of the bar. */}
      <div key={title} className="ds-screen min-w-0">
        <h1 className={`m-0 text-[26px] font-semibold leading-tight ${titleInk}`}>{title}</h1>
        {/* --ink-mid, not --ink-soft. The slab fades to mint under this line, and the soft grey
            reads 4.41:1 against it — the one place in the app where a background gradient, not a
            flat tint, is what pushes a colour under AA. */}
        {sub ? <p className={`mb-0 mt-1 text-sm ${subInk}`}>{sub}</p> : null}
      </div>
      {actions}
    </header>
  )
}

/** First letters of the first two words. `Meera Iyer` → `MI`, and never more than two. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

/* ---------------------------------------------------------------- Pill */

/*
 * `quiet` is the fifth and it is not a state.
 *
 * SmartWealth's SIP row carries two kinds of chip and draws them differently on purpose: the
 * status (`Active`, `Paused`, `Stopped`) is tinted in its own colour, and the taxonomy beside the
 * fund name (`Equity`, `Large Cap`, `Growth`) is grey text on a pale neutral. Rendering both as
 * `plain` puts four green chips on one row and throws that hierarchy away — which is what the
 * commitments list did until somebody put the frame beside it. `ground-deep` with `ink-mid` is
 * the neutral pairing `StatusBand` and `Button tone="quiet"` already use, at 8.4:1.
 */
const PILL_TONE = {
  plain: 'bg-legend-chip text-brand-deep',
  warn: 'bg-accent-soft text-accent-text',
  bad: 'bg-danger-soft text-danger',
  ok: 'bg-brand text-on-dark',
  quiet: 'bg-ground-deep text-ink-mid',
} as const

export function Pill({
  tone = 'plain',
  children,
}: {
  tone?: 'plain' | 'warn' | 'bad' | 'ok' | 'quiet'
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
