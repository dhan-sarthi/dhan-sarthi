/**
 * The pieces the four dashboard panes share, and nothing else uses.
 *
 * Everything here is a SmartWealth shape drawn in IDBI's palette through `03-PALETTE-MAP.md` —
 * no hex from a screen spec reaches this file. Where the reference's component already exists in
 * `components/ui.tsx` or `components/charts/`, it is used rather than re-cut: `Card`, `Amount`,
 * `Pill`, `ListRow`, `Button`, `TextLink`, `SegmentedBar`, `LegendRow`, `DonutChart`,
 * `BarList` and `StatusBand` all come from there. What is left is the three shapes the reference
 * has that this app did not: the stat card with three lines, the collapsible section header, and
 * the exposure table.
 *
 * They are here rather than in `components/` because one surface is not a system. If a second
 * screen wants any of them, that is the moment to lift it. The band welded to a card's bottom
 * edge was the fourth and is the worked example: three surfaces cut one each, so it went to
 * `components/StatusBand.tsx` and this file's copy went with it.
 */
import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Amount, Button, Card } from '../../components/ui.tsx'
import { SegmentedBar, bgOf, collapse, pct, series } from '../../components/charts/index.ts'
import type { Slice } from '../../components/charts/index.ts'
import { useRipple } from '../../lib/motion.ts'

/* ---------------------------------------------------------------- StatBox */

/*
 * The reference's stat card: a label, a masked identifier or a chip cluster, a big figure and a
 * caption, in a pastel that is a different colour from every other card on the screen.
 *
 * `Tile` in `ui.tsx` is the two-line version of this and `COMPONENT-GAP.md` is right that it is
 * SmartWealth's `StatCard`. It is not extended here because the difference is a whole line of
 * content between the label and the figure, and a `Tile` that grows a middle slot stops being
 * the thing every other screen uses it for.
 *
 * The two tints are the palette map's own: `#BBF3FB` → `tint-sky`, `#A6FDC9` → `tint-sage`. The
 * reference's diamond-lattice watermark is not reproduced — it is HDFC's brand furniture, and
 * IDBI's cards are flat.
 */
export function StatBox({
  tone,
  label,
  meta,
  value,
  caption,
}: {
  tone: 'sky' | 'sage'
  label: string
  /** The line between the label and the figure: a masked account number, a count. */
  meta?: string | undefined
  value: number
  caption: string
}): ReactNode {
  return (
    <div
      className={`relative flex min-w-0 flex-col gap-0.5 overflow-hidden rounded-md p-3.5 ${
        tone === 'sky' ? 'bg-tint-sky' : 'bg-tint-sage'
      }`}
    >
      {/* The reference watermarks these two cards with a diamond lattice in their lower-right
          corner. It is texture and nothing else: `aria-hidden`, behind the content, and faint
          enough that the figure never competes with it. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-1 -right-1 size-24 rounded-tl-lg"
        style={{ backgroundImage: 'var(--lattice)' }}
      />
      <div className="relative">
        <div className="truncate text-[13px] font-semibold text-ink-mid">{label}</div>
        {meta !== undefined ? (
          <div className="truncate text-[13px] tabular-nums text-ink-soft">{meta}</div>
        ) : null}
        <div className="mt-1.5">
          <Amount value={value} size="md" fit />
        </div>
        <div className="truncate text-xs text-ink-soft">{caption}</div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- RowCard */

/**
 * A white card whose whole content is one `ListRow`.
 *
 * The reference's Overview list is a stack of 70px cards, and `Card`'s own 16px padding around a
 * 68px row makes it 100. The row already carries its own vertical rhythm, so the card gives it
 * side padding and nothing else.
 */
export function RowCard({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="mb-3 min-w-0 rounded-md border border-solid border-hairline-mint bg-surface px-4">
      {children}
    </div>
  )
}

/* ---------------------------------------------------------------- Section */

/*
 * The analytics accordion: full-bleed tinted header rows sitting flush against each other, the
 * section's own figure on the right of a collapsed one.
 *
 * `#F0F5FA` maps to `--ground-deep`, which is the same band the shelf list and the More menu
 * group their rows under, so the three read as one device rather than three.
 *
 * The body uses the `0fr → 1fr` grid transition the roadmap's stage cards use: it animates to a
 * height nobody had to measure, and the content stays mounted, so a screen reader reaches it and
 * `aria-expanded` is the whole of the state.
 */
export function Section({
  title,
  figure,
  open,
  onToggle,
  children,
}: {
  title: string
  /** Shown on the header row — the reference puts the value and share of a collapsed section. */
  figure?: string | undefined
  open: boolean
  onToggle: () => void
  children: ReactNode
}): ReactNode {
  const ripple = useRipple()
  const id = `sec-${title.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <section>
      <button
        type="button"
        onClick={onToggle}
        onPointerDown={ripple}
        aria-expanded={open}
        aria-controls={id}
        className="ds-press -mx-4 flex w-[calc(100%+32px)] items-center gap-3 border-0 bg-ground-deep px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">{title}</span>
        {figure !== undefined ? (
          <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink-mid">
            {figure}
          </span>
        ) : null}
        <ChevronDown
          size={18}
          strokeWidth={2.4}
          className={`shrink-0 text-ink-mid transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {/* `inert` while closed, not just clipped. The body of a section holds links — `View all
          securities` is one — and a link a keyboard can tab to inside a zero-height box is a
          focus that goes somewhere invisible. It also takes the collapsed content out of the
          accessibility tree, which is what `aria-expanded={false}` above has already claimed. */}
      <div
        id={id}
        inert={!open}
        className="grid transition-[grid-template-rows] duration-[260ms] ease-[cubic-bezier(0.22,0.8,0.3,1)]"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="pt-3">{children}</div>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- Table */

export interface ExposureRow {
  name: string
  type: string
  weight: string
}

/*
 * The reference's `Securities Exposure (Top 5)` table: a tinted header band with rounded corners
 * inside the card, three columns at roughly 45 / 30 / 25, inset hairlines between rows and none
 * under the last.
 *
 * Built as a real `<table>` rather than a grid of divs. It is tabular data with column headers,
 * and the markup is the only thing that tells a screen reader that "Equity" is the *type* of the
 * row above it. `table-fixed` plus a width on each column is what keeps the three columns lined
 * up between the header band and the body once a long fund name truncates.
 */
export function ExposureTable({
  caption,
  rows,
  columns,
}: {
  /** Read by assistive tech instead of being drawn: the card's own title says it on screen. */
  caption: string
  rows: readonly ExposureRow[]
  columns: readonly [string, string, string]
}): ReactNode {
  return (
    <table className="w-full table-fixed border-collapse text-left">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="bg-ground-deep">
          <th className="w-[45%] rounded-l-sm px-3 py-2.5 text-[13px] font-medium text-ink-soft">
            {columns[0]}
          </th>
          <th className="w-[30%] px-2 py-2.5 text-[13px] font-medium text-ink-soft">
            {columns[1]}
          </th>
          <th className="w-[25%] rounded-r-sm px-3 py-2.5 text-right text-[13px] font-medium text-ink-soft">
            {columns[2]}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.name}
            className="border-0 border-b border-solid border-hairline-mint last:border-b-0"
          >
            <td className="truncate px-3 py-3 text-[14px] text-ink">{r.name}</td>
            <td className="truncate px-2 py-3 text-[14px] text-ink-mid">{r.type}</td>
            <td className="px-3 py-3 text-right text-[14px] font-semibold tabular-nums text-ink">
              {r.weight}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ---------------------------------------------------------------- Two columns */

/*
 * The reference's `Market Value … Gain` pair under a holding group's name: a two-column label
 * row over a two-column value row, so the labels and the figures each share a baseline.
 */
export function Columns({
  left,
  right,
}: {
  left: { label: string; value: ReactNode }
  right: { label: string; value: ReactNode } | null
}): ReactNode {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-ink-soft">{left.label}</div>
        <div className="mt-0.5">{left.value}</div>
      </div>
      {right ? (
        <div className="min-w-0 flex-1 text-right">
          <div className="text-[13px] text-ink-soft">{right.label}</div>
          <div className="mt-0.5">{right.value}</div>
        </div>
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------------------- Card header */

/*
 * A 40px tile and a title, the row every card on the Holdings and Analytics panes opens with.
 * The tile is `legend-chip` with `brand-deep` ink, which is where the palette map sends the
 * reference's `#F1F4FA` icon tile — the same tile `ListRow` already draws.
 */
export function CardHead({
  icon,
  title,
  note,
  right,
  disclose,
}: {
  icon: ReactNode
  title: string
  note?: string | undefined
  right?: ReactNode | undefined
  /**
   * Turn the whole head into the card's disclosure control, with a rotating chevron at its right.
   *
   * The reference's holding-group card puts a `›` on this row and nothing else
   * (`03-dashboard-holdings-tab.md`), and it is the row you press. Ours turns rather than pushes,
   * because the detail list behind theirs was never filmed and the rows are already here — so the
   * glyph is a `ChevronDown` and `aria-expanded` says which way it is.
   */
  disclose?: { open: boolean; onToggle: () => void; label: string } | undefined
}): ReactNode {
  const ripple = useRipple()
  const body = (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-10 flex-none place-items-center rounded-sm bg-legend-chip text-brand-deep"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold text-ink">{title}</span>
        {note !== undefined ? (
          <span className="mt-0.5 block truncate text-[13px] text-ink-soft">{note}</span>
        ) : null}
      </span>
      {right !== undefined ? <span className="flex-none">{right}</span> : null}
      {disclose !== undefined ? (
        <ChevronDown
          size={20}
          strokeWidth={2.4}
          aria-hidden="true"
          className={`flex-none text-ink-faint transition-transform duration-200 ${
            disclose.open ? 'rotate-180' : ''
          }`}
        />
      ) : null}
    </div>
  )
  if (disclose === undefined) return body
  return (
    /* -m + p so the press target fills the card's own padding rather than sitting inside it. */
    <button
      type="button"
      onPointerDown={ripple}
      onClick={disclose.onToggle}
      aria-expanded={disclose.open}
      aria-label={disclose.label}
      className="ds-press -mx-4 -mt-4 block w-[calc(100%+32px)] border-0 bg-transparent px-4 pb-0 pt-4 text-left"
    >
      {body}
    </button>
  )
}

/* ---------------------------------------------------------------- Empty */

/**
 * The state the source has none of. Nothing recorded is not a failure and must not read as one —
 * one sentence about why the screen is empty, and the one control that fills it.
 */
export function Empty({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode | undefined
}): ReactNode {
  return (
    <Card tint="clay">
      <h2>{title}</h2>
      <p className="m-0 mt-1.5 text-sm leading-relaxed text-ink-mid">{children}</p>
      {action !== undefined ? <div className="mt-4">{action}</div> : null}
    </Card>
  )
}

/* ---------------------------------------------------------------- Figures */

/*
 * The right-hand block of a SmartWealth Overview row.
 *
 * Frame `01-dashboard-home__09` is the one to look at: the value on those rows is never a bare
 * number. It is one or two `label : figure` lines, right-aligned, the label in grey and the
 * figure in near-black bold — `Bought : ₹3.5K` over `Sold : ₹8.4K`, `Total : 5 │ ₹15K`. A bare
 * amount on the right of a 68px row is what our list had, and it is why our rows read lighter
 * than theirs at the same height: two figures per row is most of their density.
 *
 * The spacing convention is theirs and it is deliberate — a space on **both** sides of the colon
 * (`01-dashboard-home.md`, end of Content). `rule` is the thin vertical hairline their `My SIPs`
 * row puts between the count and the amount.
 */
export function Figures({
  rows,
  rule = false,
}: {
  rows: readonly { label?: string | undefined; value: ReactNode }[]
  /** Lay the rows out on one line, separated by a hairline, rather than stacked. */
  rule?: boolean
}): ReactNode {
  const cells = rows.map((r, i) => (
    <span key={`${i}-${r.label ?? ''}`} className="whitespace-nowrap">
      {r.label !== undefined ? (
        <span className="text-[13px] text-ink-soft">{r.label} : </span>
      ) : null}
      <span className="text-[15px] font-semibold tabular-nums text-ink">{r.value}</span>
    </span>
  ))
  if (rule) {
    return (
      <span className="flex items-center gap-2.5">
        {cells.map((cell, i) => (
          <span key={`c${i}`} className="flex items-center gap-2.5">
            {i > 0 ? <span aria-hidden="true" className="h-4 w-px bg-hairline-mint" /> : null}
            {cell}
          </span>
        ))}
      </span>
    )
  }
  return <span className="flex flex-col items-end gap-0.5 leading-tight">{cells}</span>
}

/* ---------------------------------------------------------------- AllocationRow */

/*
 * The `Product Allocation` / `Asset Allocation` cards at the foot of the reference's Overview.
 *
 * They are a different shape from `AllocationCard` in `components/charts/` and the difference is
 * the point: no donut, no stacked legend column, no hairlines. A tile and a title, a full-width
 * stacked bar, and then a **single line** of dot · label · bold percentage, wrapped and separated
 * by thin rules. It is a summary, and the breakdown with the donut and the rupee figures is one
 * tab across on Analytics — which is what the `link` at the foot goes to.
 *
 * Their two bars are drawn at a flat 50/50 whatever the legend says, and their Asset Allocation
 * legend sums to 120%; `01-dashboard-home.md` flags both as demo artefacts. `SegmentedBar` draws
 * `value / total` and nothing else, so ours cannot do that.
 */
export function AllocationRow({
  icon,
  title,
  slices,
  total,
  link,
}: {
  icon: ReactNode
  title: string
  slices: readonly Slice[]
  total?: number | undefined
  link?: ReactNode | undefined
}): ReactNode {
  const resolved = series(collapse(slices), total)
  if (resolved.empty) return null

  return (
    <Card>
      <CardHead icon={icon} title={title} />
      <SegmentedBar slices={slices} total={total} className="mt-3.5" />
      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {resolved.portions.map((portion, i) => (
          <span key={`${i}-${portion.label}`} className="flex items-center gap-2.5">
            {i > 0 ? <span aria-hidden="true" className="h-3.5 w-px bg-hairline-mint" /> : null}
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`size-2.5 rounded-pill ${bgOf(portion.tone)}`} />
              <span className="text-[13px] text-ink-mid">{portion.label}</span>
              <span className="text-[13px] font-bold tabular-nums text-ink">
                {pct(portion.share)}
              </span>
            </span>
          </span>
        ))}
      </div>
      {link !== undefined ? <div className="-mb-1.5 mt-2">{link}</div> : null}
    </Card>
  )
}

/* ---------------------------------------------------------------- Promo */

/*
 * The reference's `External Investments` banner: a full-width tinted card carrying a title with a
 * chevron welded to it and two lines of body copy, sitting between the stat cards and the tab row.
 *
 * Theirs is a diagonal green gradient with white text, and it is the loudest thing on the screen.
 * Ours is `tint-sage`, because `DESIGN.md` allows **one** ink card per screen and on this pane
 * that card is already `Today`'s single action — a second dark slab further down would be taking
 * the reference's emphasis along with its layout. The shape, the chevron and the two-line body
 * are theirs; the weight is this app's.
 */
export function PromoCard({
  title,
  children,
  onClick,
}: {
  title: string
  children: ReactNode
  onClick: () => void
}): ReactNode {
  const ripple = useRipple()
  return (
    <button
      type="button"
      onPointerDown={ripple}
      onClick={onClick}
      className="ds-press mb-3 block w-full rounded-md border-0 bg-tint-sage p-4 text-left"
    >
      <span className="flex items-center gap-1 text-[17px] font-bold leading-tight text-brand-deep">
        {title}
        <ChevronRight size={19} strokeWidth={2.4} className="flex-none" />
      </span>
      <span className="mt-1.5 block text-[13.5px] leading-snug text-ink-mid">{children}</span>
    </button>
  )
}

/* ---------------------------------------------------------------- Strip */

/*
 * The `Linked A/c Balance ₹9.85L … View All Bank A/c ›` bar from the legacy dashboard header
 * (`05-dashboard-home-alt-header.md` §2): a full-bleed coloured strip, one figure at the left and
 * one link at the right, sitting between two blocks of cards.
 *
 * Theirs is solid mid-blue with white text. The palette map sends that action blue to `--accent`,
 * and a solid accent strip running the width of the screen would read as a button — the same
 * argument `StatusBand` makes about its `warn` tone. `legend-chip` with `brand-deep` ink is what
 * this app already uses for a coloured band that is information rather than a control.
 */
export function Strip({
  label,
  value,
  action,
}: {
  label: string
  value: string
  action?: ReactNode | undefined
}): ReactNode {
  return (
    <div className="-mx-4 mb-3 flex items-center gap-3 bg-legend-chip px-4 py-2.5">
      <span className="min-w-0 flex-1 truncate text-[14px] text-brand-deep">
        {label} <span className="font-bold tabular-nums">{value}</span>
      </span>
      {action !== undefined ? <span className="flex-none">{action}</span> : null}
    </div>
  )
}

/* ---------------------------------------------------------------- Product tiles */

/*
 * The horizontally scrolling product carousel that leads the legacy dashboard hero
 * (`05-dashboard-home-alt-header.md` §1): ~150px tiles, one per product the customer can hold,
 * each with the product's name, its value and its gain — and, where the customer holds none of
 * it, **a call to action in place of the figure**. That last tile is the only genuine empty
 * state anywhere in the source footage and it is the best idea in the frame: the shelf shows you
 * the gap in your portfolio without a single fabricated number in it.
 *
 * The reference tiles carry a bright cyan accent line along their lower edge. Ours carry a
 * `chart-hi` line in the same place — the one green that means "this is the figure to read".
 *
 * Nothing here is derived: a tile shows a group's own value, its own gain and nothing else, and
 * a group with no rows shows no figure at all rather than a zero.
 */
export interface ProductTile {
  id: string
  label: string
  /** Null where the customer holds none of this — the tile then draws the CTA instead. */
  value: number | null
  /** Under the figure: a gain, a cover note, whatever the group can honestly say. */
  note?: ReactNode | undefined
}

export function ProductTiles({
  tiles,
  cta,
}: {
  tiles: readonly ProductTile[]
  /** The control an empty tile carries. One label and one handler, used by every empty tile. */
  cta: { label: string; onClick: () => void }
}): ReactNode {
  if (tiles.length === 0) return null
  return (
    /* -mx-4 + px-4 so the row scrolls edge to edge while the first tile still lines up with the
       cards above it, and the last one can be scrolled fully clear of the right gutter. */
    <ul className="-mx-4 mb-3 m-0 flex list-none gap-2.5 overflow-x-auto px-4 pb-1">
      {tiles.map((tile) => (
        <li
          key={tile.id}
          className="relative flex w-[152px] shrink-0 flex-col overflow-hidden rounded-md bg-tint-sage p-3.5"
        >
          <span className="truncate text-[13px] font-semibold text-ink-mid">{tile.label}</span>
          {tile.value === null ? (
            <span className="mt-2.5">
              <Button tone="secondary" size="sm" full onClick={cta.onClick}>
                {cta.label}
              </Button>
            </span>
          ) : (
            <>
              <span className="mt-1.5 block">
                <Amount value={tile.value} size="md" fit />
              </span>
              {tile.note !== undefined ? (
                <span className="mt-0.5 block truncate text-xs text-ink-soft">{tile.note}</span>
              ) : null}
            </>
          )}
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-chart-hi" />
        </li>
      ))}
    </ul>
  )
}
