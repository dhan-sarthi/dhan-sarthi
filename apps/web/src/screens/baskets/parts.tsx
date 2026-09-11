/**
 * The pieces `select-basket` is made of.
 *
 * Three of them are the reference's, read off frames `18`–`22` rather than off the measurements:
 *
 * - **The group header is a full-bleed band, not a card title.** A solid dot, the group's name, the
 *   group total hard right, and a chevron that collapses it. Pale green in the source, which
 *   `03-PALETTE-MAP.md` sends to `--legend-chip` with `--brand-deep` ink.
 * - **A fund is three stacked bands separated by hairlines**, not a list row: identity on top, a
 *   labelled metric strip in the middle, and the two controls at the foot. The metric strip is the
 *   single biggest legibility win in the whole reference — small grey caption over a bold value,
 *   three across — and `screens/plan/parts.tsx` already borrowed it once.
 * - **The section footer is a dashed outline button.** Tinted fill, dashed border, bold label.
 *
 * One of them is not the reference's. Its fund rows carry `Folio: 4028475828` — the same number on
 * every row in every frame, which its own spec flags as a stub. IDBI's feed has no folio numbers at
 * all (`lib/order.ts` says so where it defines `FolioChoice`), so that line is replaced by three
 * facts the shelf really carries: who runs the scheme, its SEBI riskometer band, and its lock-in.
 */
import type { ReactNode } from 'react'
import { ChevronDown, Trash2 } from 'lucide-react'
import { Checkbox } from '../../components/Form.tsx'
import { IconButton, Pill, TextLink } from '../../components/ui.tsx'
import { inr } from '../../lib/money.ts'
import { useRipple } from '../../lib/motion.ts'
import { SchemeMark } from '../invest/SchemeMark.tsx'
import type { OrderLine } from '../../lib/order.ts'

/**
 * A group of the basket — the SIPs, or the lump sums.
 *
 * `-mx-4` because the band is full bleed against `.scroll`'s 16px gutter, which is how every
 * grouping band in this app is drawn (`DESIGN.md`, ListRow).
 */
export function GroupHead({
  label,
  total,
  open,
  onToggle,
}: {
  label: string
  total: number
  open: boolean
  onToggle: () => void
}): ReactNode {
  const ripple = useRipple()
  return (
    <button
      type="button"
      aria-expanded={open}
      onPointerDown={ripple}
      onClick={onToggle}
      className="ds-press -mx-4 mt-3 flex w-[calc(100%+32px)] items-center gap-2.5 border-0 bg-legend-chip px-4 py-3 text-left"
    >
      <span aria-hidden="true" className="size-2 flex-none rounded-pill bg-brand" />
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-brand-deep">
        {label}
      </span>
      <span className="flex-none text-[15px] font-bold tabular-nums text-brand-deep">
        {inr(total)}
      </span>
      <ChevronDown
        size={18}
        strokeWidth={2.4}
        aria-hidden="true"
        className={`flex-none text-brand-deep transition-transform duration-200 ${
          open ? 'rotate-180' : ''
        }`}
      />
    </button>
  )
}

/** Grey caption over a bold value. Two to three of these across, ruled off above and below. */
export function MetricStrip({
  cells,
}: {
  cells: readonly { label: string; value: string }[]
}): ReactNode {
  return (
    <div className="flex gap-3 border-0 border-y border-solid border-hairline-mint py-2.5">
      {cells.map((c) => (
        <div key={c.label} className="min-w-0 flex-1">
          <div className="truncate text-[11.5px] text-ink-soft">{c.label}</div>
          <div className="mt-0.5 truncate text-[15px] font-semibold tabular-nums text-ink">
            {c.value}
          </div>
        </div>
      ))}
    </div>
  )
}

export function FundCard({
  line,
  sub,
  cells,
  /** Selection mode: the box picks rows to remove instead of including them in the basket. */
  selecting,
  selected,
  onToggle,
  onEdit,
  onRemove,
}: {
  line: OrderLine
  sub: string
  cells: readonly { label: string; value: string }[]
  selecting: boolean
  selected: boolean
  onToggle: (next: boolean) => void
  onEdit: () => void
  onRemove: () => void
}): ReactNode {
  const ticked = selecting ? selected : line.included
  return (
    <section
      className={`mb-2 rounded-md border border-solid bg-surface px-4 pb-1 pt-2 ${
        selecting && selected ? 'border-accent' : 'border-hairline-mint'
      } ${!selecting && !line.included ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={ticked}
          onChange={onToggle}
          label={
            selecting ? `Select ${line.name} for removal` : `Include ${line.name} in this basket`
          }
        />
        <span className="min-w-0 flex-1 py-2">
          <span className="block text-[15px] font-semibold leading-snug text-ink">{line.name}</span>
          <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-soft">{sub}</span>
        </span>
        <span className="py-2">
          <SchemeMark manufacturer={line.manufacturer} />
        </span>
      </div>
      <MetricStrip cells={cells} />
      {/* In selection mode the row's own two controls come off: the footer bar is doing the
          removing, and a per-row trash beside a counted `Remove (2)` is two answers to one
          question. The frame's multi-select rows carry neither. */}
      {selecting ? (
        <div className="h-3" />
      ) : (
        <div className="flex items-center justify-between">
          <TextLink flush size="sm" onClick={onEdit}>
            Edit details
          </TextLink>
          <IconButton label={`Remove ${line.name}`} tone="grey" size="sm" onClick={onRemove}>
            <Trash2 size={16} strokeWidth={2.2} />
          </IconButton>
        </div>
      )}
    </section>
  )
}

/** The section footer. Dashed, tinted, and it says what it adds rather than just `+`. */
export function DashedButton({
  children,
  onClick,
}: {
  children: ReactNode
  onClick: () => void
}): ReactNode {
  const ripple = useRipple()
  return (
    <button
      type="button"
      onPointerDown={ripple}
      onClick={onClick}
      className="ds-press mt-2 h-12 w-full rounded-md border-[1.5px] border-dashed border-accent bg-tint-sage px-4 text-[15px] font-semibold text-accent-text"
    >
      {children}
    </button>
  )
}

/** The two outlined pills over the list: what the basket comes to, by mode. */
export function SummaryChips({ chips }: { chips: readonly string[] }): ReactNode {
  if (chips.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {chips.map((c) => (
        <Pill key={c}>{c}</Pill>
      ))}
    </div>
  )
}
