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
import { ChevronDown } from 'lucide-react'
import { Amount, Card } from '../../components/ui.tsx'
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
      className={`flex min-w-0 flex-col gap-0.5 overflow-hidden rounded-md p-3.5 ${
        tone === 'sky' ? 'bg-tint-sky' : 'bg-tint-sage'
      }`}
    >
      <div className="truncate text-[13px] font-semibold text-ink-mid">{label}</div>
      {meta !== undefined ? (
        <div className="truncate text-[13px] tabular-nums text-ink-soft">{meta}</div>
      ) : null}
      <div className="mt-1.5">
        <Amount value={value} size="md" fit />
      </div>
      <div className="truncate text-xs text-ink-soft">{caption}</div>
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
    <div className="mb-2.5 min-w-0 rounded-md border border-solid border-hairline-mint bg-surface px-4">
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
}: {
  icon: ReactNode
  title: string
  note?: string | undefined
  right?: ReactNode | undefined
}): ReactNode {
  return (
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
    </div>
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
