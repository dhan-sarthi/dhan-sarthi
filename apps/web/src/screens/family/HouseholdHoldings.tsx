/**
 * Overall Holdings — the same household cut by instrument instead of by person.
 *
 * The reference's shape is kept whole: a member dropdown above a row of product chips, then a list
 * of cards that each expand from one metric row into a 2×2. Four differences, all of them because
 * of what is behind the screen rather than what is on it.
 *
 * - **The dropdown is a picker, not a `<select>`.** `Form.tsx` says why the app has no native
 *   selects: on Android one is a full-screen list that looks like a settings page. The control
 *   keeps the reference's shape — full-width, hairline, value at the left, chevron at the right —
 *   and opens the app's own sheet.
 * - **The chips are the four groups this app models**, not `Mutual Fund · Deposits · Demat`. There
 *   is no demat feed — `portfolio.ts` says so — so a Demat chip would be a filter over nothing.
 *   `All` leads the row, because with four groups a row where one is always selected can never
 *   show the household.
 * - **No `Recommended` ribbon.** The reference badges holdings a customer already owns. This app
 *   does not rate what somebody holds, and the commitments surface rejected the same badge for the
 *   same reason: on money already invested it means nothing.
 * - **No fund-house logo tile.** There is no logo feed and no scheme registry; the tile carries the
 *   group's glyph, which is what `ListRow` and the Holdings pane already do.
 */
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ChartColumn, ChevronDown, ChevronUp, Landmark, PiggyBank } from 'lucide-react'
import { Sheet } from '../../components/Sheet.tsx'
import { IconButton } from '../../components/ui.tsx'
import { useRipple } from '../../lib/motion.ts'
import { inr } from '../../lib/money.ts'
import type { GroupId } from '../dashboard/portfolio.ts'
import { Figure, Gain, Marker, Metric, Nothing } from './parts.tsx'
import type { Household, HouseholdHolding } from './household.ts'

const GLYPH: Record<GroupId, ReactNode> = {
  funds: <ChartColumn size={22} strokeWidth={1.9} />,
  deposits: <Landmark size={22} strokeWidth={1.9} />,
  retirement: <PiggyBank size={22} strokeWidth={1.9} />,
  /* Cover never reaches this surface — a sum assured is not capital — but the record is total. */
  cover: <PiggyBank size={22} strokeWidth={1.9} />,
}

const ALL = 'all'

export function HouseholdHoldings({ household }: { household: Household }): ReactNode {
  const [member, setMember] = useState<string>(ALL)
  const [group, setGroup] = useState<GroupId | typeof ALL>(ALL)
  const [picking, setPicking] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const rows = useMemo(
    () =>
      household.holdings
        .filter((h) => (member === ALL ? true : h.memberId === member))
        .filter((h) => (group === ALL ? true : h.group === group))
        .sort((a, b) => b.value - a.value),
    [household.holdings, member, group],
  )

  const named = household.members.find((m) => m.id === member)
  const total = rows.reduce((n, h) => n + h.value, 0)

  return (
    <>
      {/* The reference's `All Members` dropdown, in the app's own controls. */}
      <button
        type="button"
        onClick={() => setPicking(true)}
        aria-haspopup="dialog"
        className="ds-press mb-3 flex h-13 w-full items-center gap-3 rounded-md border border-solid border-hairline-mint bg-surface px-3.5 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
          {named ? named.name : 'All members'}
        </span>
        <ChevronDown size={18} strokeWidth={2.2} className="flex-none text-ink-faint" />
      </button>

      {/* -mx-4 + px-4 so the row scrolls edge to edge while the first chip lines up with the cards
          under it. Four group labels plus `All` do not fit 430px on one static line. */}
      <div
        role="group"
        aria-label="What kind of holding"
        className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1"
      >
        <Chip on={group === ALL} onClick={() => setGroup(ALL)}>
          All
        </Chip>
        {household.groups.map((g) => (
          <Chip key={g.id} on={group === g.id} onClick={() => setGroup(g.id)}>
            {g.label}
          </Chip>
        ))}
      </div>

      {/* What the filter left, said as a count and a figure rather than left to be counted. */}
      <p className="m-0 mb-3 text-[13px] leading-snug text-ink-soft">
        {rows.length === 0
          ? 'Nothing recorded under this filter.'
          : `${String(rows.length)} ${rows.length === 1 ? 'entry' : 'entries'} · ${inr(total)} recorded`}
      </p>

      {rows.map((row) => (
        <HoldingCard
          key={row.id}
          holding={row}
          open={open === row.id}
          onToggle={() => setOpen((id) => (id === row.id ? null : row.id))}
        />
      ))}

      <Sheet title="Whose holdings" open={picking} onClose={() => setPicking(false)}>
        <div className="divide-y divide-solid divide-hairline-mint">
          <PickRow
            label="All members"
            on={member === ALL}
            onClick={() => {
              setMember(ALL)
              setPicking(false)
            }}
          />
          {household.members.map((m) => (
            <PickRow
              key={m.id}
              label={m.name}
              marker={<Marker self={m.self} />}
              on={member === m.id}
              onClick={() => {
                setMember(m.id)
                setPicking(false)
              }}
            />
          ))}
        </div>
      </Sheet>
    </>
  )
}

function PickRow({
  label,
  marker,
  on,
  onClick,
}: {
  label: string
  marker?: ReactNode
  on: boolean
  onClick: () => void
}): ReactNode {
  const ripple = useRipple()
  return (
    <button
      type="button"
      aria-pressed={on}
      onPointerDown={ripple}
      onClick={onClick}
      className="ds-press flex min-h-[56px] w-full items-center gap-2 bg-transparent px-0 text-left"
    >
      <span
        className={`min-w-0 flex-1 truncate text-[15px] ${
          on ? 'font-bold text-accent-text' : 'font-semibold text-ink'
        }`}
      >
        {label}
      </span>
      {marker}
    </button>
  )
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
}): ReactNode {
  const ripple = useRipple()
  return (
    <button
      type="button"
      aria-pressed={on}
      onPointerDown={ripple}
      onClick={onClick}
      className={`ds-press h-9 flex-none whitespace-nowrap rounded-pill border-[1.5px] border-solid px-3.5 text-[13.5px] font-semibold ${
        on
          ? 'border-accent bg-accent text-on-accent'
          : 'border-hairline-mint bg-surface text-ink-mid'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * One holding. Collapsed it is the value and the gain; expanded it is the 2×2.
 *
 * Whose it is sits under the name, with the marker beside it — on a list mixing the customer's
 * real entries with three demo people's, the owner is the most important thing about a row after
 * its name, and it is also the thing that says whether the figure was computed.
 */
function HoldingCard({
  holding,
  open,
  onToggle,
}: {
  holding: HouseholdHolding
  open: boolean
  onToggle: () => void
}): ReactNode {
  return (
    <section className="mb-3 min-w-0 rounded-md border border-solid border-hairline-mint bg-surface p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 flex-none place-items-center rounded-sm bg-legend-chip text-brand-deep"
        >
          {GLYPH[holding.group]}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-[15px] font-semibold leading-snug text-ink">{holding.name}</h3>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-[13px] text-ink-soft">{holding.memberName}</span>
            <Marker self={holding.real} />
          </div>
        </div>
        <IconButton
          label={`${open ? 'Hide' : 'Show'} the figures for ${holding.name}`}
          tone="bordered"
          size="sm"
          onClick={onToggle}
        >
          {open ? (
            <ChevronUp size={17} strokeWidth={2.2} />
          ) : (
            <ChevronDown size={17} strokeWidth={2.2} />
          )}
        </IconButton>
      </div>

      <div className="my-3.5 border-t border-solid border-hairline-mint" />

      <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
        <Metric label="Recorded value">
          <Figure>{inr(holding.value)}</Figure>
        </Metric>
        <Metric label="Gain">
          {holding.gain === null ? (
            <Nothing>No cost recorded</Nothing>
          ) : (
            <Gain amount={holding.gain} pct={holding.gainPct} />
          )}
        </Metric>
        {open ? (
          <>
            <Metric label="Invested">
              {holding.invested === null ? (
                <Nothing>Not recorded</Nothing>
              ) : (
                <Figure>{inr(holding.invested)}</Figure>
              )}
            </Metric>
            {/* The reference's XIRR cell. See `household.ts` — there is nothing to compute one from. */}
            <Metric label="Going in monthly">
              {holding.sipMonthly > 0 ? (
                <Figure>{inr(holding.sipMonthly)}</Figure>
              ) : (
                <Nothing>No mandate</Nothing>
              )}
            </Metric>
          </>
        ) : null}
      </div>
    </section>
  )
}
