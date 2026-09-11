/**
 * The presentation Plan and Rebalancing share.
 *
 * Three shapes lifted from the reference and translated onto IDBI, in the order they were taken:
 *
 * **`BenefitCards`** — `11-model-portfolios/02-discover`'s promo panel: two side-by-side sub-cards
 * on a dark ground, each an outlined icon chip over a bold title over three lines of body, with a
 * headline above and a single action below. The source uses it to sell a curated basket. There is
 * no curated basket here — that decision is in the build brief and is not reopened — so what the
 * pattern is used for is the thing this app actually has to explain: what the route is, and what
 * a rebalance would do. It is the one hero card per screen (`DESIGN.md`), so nothing else on the
 * screen may be `tint="ink"`.
 *
 * **`MeasureRow`** — `12-rebalancing/02-rebalance-intro`'s two measures: a 32px outlined glyph in
 * the left gutter, a bold title, two or three lines of grey body, generous whitespace, no
 * chevron. The source's rows are informational; ours are the two things you can choose, so they
 * *are* pressable and carry the affordance the source's did not. That is a deliberate departure —
 * the source has one `Continue` for two measures and its own flow file lists "which measure?" as
 * an unresolved gap.
 *
 * **`StageCard`** — the route's step, with the reference's card discipline applied: the figures
 * the step actually moves laid out as constituents the way `select-basket` lays out a basket's
 * schemes, and the state said at the foot in a `StatusBand` rather than floating in a pill.
 *
 * Colour, throughout: no hex from a screen spec survives. The source's navy hero is `tint-ink`,
 * its amber and purple measure glyphs are `tint-clay`/`accent-text` and `tint-sage`/`brand-deep`,
 * its `#1E38C3` actions are `bg-accent`, and its periwinkle CTA on navy is the orange primary,
 * which `DESIGN.md` says stays orange on an ink card.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Stage } from '@dhan/contracts'
import { Card, Pill, TextLink } from '../../components/ui.tsx'
import { StatusBand } from '../../components/StatusBand.tsx'
import { approx, inr, monthName } from '../../lib/money.ts'
import { Art } from '../../components/Art.tsx'
import type { ArtName } from '../../components/Art.tsx'

/* ---------------------------------------------------------------- Benefit cards */

export interface Benefit {
  icon: ReactNode
  title: string
  body: string
}

/**
 * The dark promo panel with two benefit sub-cards.
 *
 * The source's sub-card is a translucent lighter navy over the panel — `#263864` on `#0B1945`.
 * Translucency is the right instinct and survives the palette change intact: `bg-white/10` over
 * `tint-ink` is the same idea and needs no new token. Body copy on it is `text-on-dark/85`, which
 * the source also does and which clears AA comfortably over a green this dark.
 *
 * `note` is the source's social-proof line (`23K+ users gained 13%+ returns in 6 months`) in
 * position only. That sentence is a marketing claim about other people's returns and this app has
 * neither the users nor the returns to make it; what goes there instead is a fact about *this*
 * customer's plan, or nothing.
 */
export function BenefitCards({
  eyebrow,
  title,
  art,
  children,
  benefits,
  note,
  action,
}: {
  /** A spot illustration for the hero, where the surface has one. */
  art?: ArtName | undefined
  eyebrow?: string | undefined
  /** The headline. Omit it and pass `children` instead where the head is a figure, not a phrase. */
  title?: string | undefined
  /** The head of the card, for the screen whose lead is a number rather than a sentence. */
  children?: ReactNode
  benefits: readonly Benefit[]
  /** One line under the pair. A fact, never a claim about other customers. */
  note?: ReactNode
  action?: ReactNode
}): ReactNode {
  return (
    <Card tint="ink">
      {art ? <Art name={art} size="md" className="mb-1" /> : null}
      {eyebrow ? (
        <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-on-dark/75">
          {eyebrow}
        </p>
      ) : null}
      {title ? <h2 className={eyebrow ? 'mt-1.5' : ''}>{title}</h2> : null}
      {children}

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {benefits.map((b) => (
          <div key={b.title} className="min-w-0 rounded-sm bg-white/10 p-3">
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-sm border border-solid border-white/35 text-on-dark"
            >
              {b.icon}
            </span>
            <p className="mb-0 mt-2.5 text-[14.5px] font-semibold leading-tight text-on-dark">
              {b.title}
            </p>
            <p className="mb-0 mt-1.5 text-[12.5px] leading-snug text-on-dark/85">{b.body}</p>
          </div>
        ))}
      </div>

      {note ? (
        <p className="mb-0 mt-3.5 text-[12.5px] font-semibold leading-snug text-on-dark/90">
          {note}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </Card>
  )
}

/* ---------------------------------------------------------------- Measure row */

export function MeasureRow({
  icon,
  tone,
  title,
  body,
  figure,
  onPick,
}: {
  icon: ReactNode
  /** Which tint the glyph chip takes. Two measures, two chips, so they are told apart at a glance. */
  tone: 'clay' | 'sage'
  title: string
  body: string
  /** The figure that makes the measure concrete — the gap it would close. */
  figure?: string | undefined
  onPick?: (() => void) | undefined
}): ReactNode {
  const chip = tone === 'clay' ? 'bg-tint-clay text-accent-text' : 'bg-tint-sage text-brand-deep'
  const inner = (
    <>
      <span
        aria-hidden="true"
        className={`grid size-11 flex-none place-items-center rounded-sm ${chip}`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold leading-tight text-ink">{title}</span>
        {/* Three lines, as the source's rows are. The whole sentence is on the finding card
            below — a row that runs to seven lines stops being a row. */}
        <span className="mt-1.5 line-clamp-3 block text-[13.5px] leading-relaxed text-ink-soft">
          {body}
        </span>
        {figure ? (
          <span className="mt-2 inline-flex rounded-pill bg-legend-chip px-[11px] py-[5px] text-xs font-semibold text-brand-deep">
            {figure}
          </span>
        ) : null}
      </span>
      {onPick ? (
        <ChevronRight size={18} strokeWidth={2.2} className="mt-0.5 flex-none text-ink-faint" />
      ) : null}
    </>
  )

  if (!onPick) return <div className="flex gap-3.5 py-4">{inner}</div>
  return (
    <button
      type="button"
      onClick={onPick}
      className="ds-press flex w-full gap-3.5 border-0 bg-transparent py-4 text-left"
    >
      {inner}
    </button>
  )
}

/* ---------------------------------------------------------------- Stage card */

const STAGE_LABEL: Record<Stage['kind'], string> = {
  free_up: 'Free up money',
  get_cover: 'Get covered',
  clear_debt: 'Clear the debt',
  build_buffer: 'Build the buffer',
  grow: 'Grow it',
}

/** `Oct 2026`. Three letters, because the column is 96px and the full month name is not. */
const shortMonth = (iso: string): string => `${monthName(iso).slice(0, 3)} ${iso.slice(0, 4)}`

/**
 * One cell of a stage's constituents — the source's basket-row metric strip.
 *
 * Exported because the review screen's change rows are the same shape and were the same markup
 * twice, which is how two lists of figures on one flow end up at different type sizes.
 */
export function Constituent({
  label,
  value,
  wrap = false,
}: {
  label: string
  value: string
  /** A name rather than a figure: two lines, and not `tabular-nums`. */
  wrap?: boolean
}): ReactNode {
  return (
    <div className="min-w-0">
      <p className="m-0 truncate text-[11.5px] uppercase tracking-wide text-ink-soft">{label}</p>
      <p
        className={`mb-0 mt-0.5 text-[15px] font-semibold text-ink ${
          wrap ? 'line-clamp-2 leading-snug' : 'truncate tabular-nums'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

/**
 * A step of the route.
 *
 * What is new against the version this replaces is the middle band. `select-basket` and
 * `rebalancing-cart` both lay a scheme's figures out as a labelled metric strip — two or three
 * columns of a small grey caption over a bold value — rather than as a run-on sentence, and that
 * is the single biggest legibility win available here: the old card said
 * "₹9,948 a month · IDBI Nifty 50 Index Fund" in 13px grey, which is three facts wearing one
 * type size. The columns this app can fill are the ones it actually computes: what goes in each
 * month, what the step is aiming at, and when it lands.
 *
 * What is *not* taken is the reference's folio number, AMC logo tile, units and NAV. There is no
 * folio until an order exists, no logo asset, and no price feed — `COMPONENT-GAP.md` already
 * refused to invent them for `FundRow` and the same refusal applies here.
 */
export function StageCard({
  stage,
  last,
  status,
  onStatusInfo,
  action,
}: {
  stage: Stage
  last: boolean
  /** The state at the foot of the card, where the reference puts it. */
  status?: { tone: 'good' | 'warn' | 'bad'; label: string; note?: ReactNode } | undefined
  onStatusInfo?: (() => void) | undefined
  /** A button under the constituents — the route's own call to action for this step. */
  action?: ReactNode
}): ReactNode {
  const [open, setOpen] = useState(stage.index === 1)
  const dated = stage.monthsToComplete > 0 && stage.monthsToComplete < 120

  return (
    <div className="flex gap-3">
      {/* The spine. Makes the order the point rather than a detail. */}
      <div className="flex flex-col items-center pt-[22px]">
        <span
          className={`grid size-[30px] shrink-0 place-items-center rounded-pill text-[13px] font-bold ${
            stage.isGoal ? 'bg-accent text-on-accent' : 'bg-brand text-on-dark'
          }`}
        >
          {stage.index}
        </span>
        {!last ? <span className="mt-1.5 w-0.5 flex-1 bg-hairline-mint" /> : null}
      </div>

      <div className="min-w-0 flex-1">
        <section className="mb-3 min-w-0 overflow-hidden rounded-md border border-solid border-hairline-mint bg-surface">
          <div className="p-4">
            <div className="mb-2 flex flex-wrap gap-2">
              <Pill tone={stage.isGoal ? 'warn' : 'plain'}>{STAGE_LABEL[stage.kind]}</Pill>
              {stage.cadence === 'ongoing' ? <Pill>Ongoing</Pill> : null}
              {stage.verdict?.verdict === 'PASS' ? <Pill tone="ok">Suitability passed</Pill> : null}
            </div>

            <h3 className="m-0 text-[16.5px] font-semibold leading-snug text-ink">{stage.label}</h3>

            {/*
              The constituents, two across rather than the source's three, and the width is what
              decides it. Three columns on a 375px phone is about 96px each; `₹1,00,00,000`
              truncates there and so does `₹1.00 crore`, and a figure with an ellipsis in it is
              worse than no figure. Two columns is ~155px, which holds a crore and a product name
              on two lines. The source's own strip is 1, 2 or 3 columns depending on what the row
              carries — `Lump sum to sell` takes the full width alone — so a variable count is its
              rule rather than a departure from it.

              `approx` on the target for the same reason `DESIGN.md` gives: a number a customer
              has to count the digits of was the wrong format before it ran out of room.
            */}
            <div className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-3 border-0 border-y border-solid border-hairline-mint py-3">
              <Constituent
                label="Each month"
                value={stage.monthly > 0 ? inr(stage.monthly) : '—'}
              />
              <Constituent
                label={stage.kind === 'get_cover' ? 'Cover' : 'Target'}
                value={stage.targetAmount > 0 ? approx(stage.targetAmount) : '—'}
              />
              <Constituent label="By" value={dated ? shortMonth(stage.completesOn) : '—'} />
              {/* The engine bakes the product into some stage labels — "LIC Term Assurance —
                  ₹1 crore cover — ₹985 a month" is one string it computes — so the cell is
                  dropped where it would print the same name a second line above itself. What
                  the roadmap computes is untouched; this only declines to say it twice. */}
              {stage.productName && !stage.label.includes(stage.productName) ? (
                <Constituent wrap label="Into" value={stage.productName} />
              ) : null}
            </div>

            {/* Same grid trick as the insight cards: 0fr to 1fr transitions to a height nobody
                measured, and the reason stays mounted for a screen reader either way. */}
            <div
              className="grid transition-[grid-template-rows] duration-[260ms] ease-[cubic-bezier(0.22,0.8,0.3,1)]"
              style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
            >
              <div className="overflow-hidden">
                <p className="mb-0 mt-[11px] text-sm leading-relaxed text-ink-mid">{stage.why}</p>
              </div>
            </div>

            <div className="-mb-1.5 mt-1">
              <TextLink size="sm" flush ariaExpanded={open} onClick={() => setOpen((v) => !v)}>
                {open ? 'Hide' : 'Why this first?'}
                <ChevronDown
                  size={15}
                  strokeWidth={2.6}
                  className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
              </TextLink>
            </div>

            {action ? <div className="mt-3.5">{action}</div> : null}
          </div>

          {status ? (
            <StatusBand
              flush
              tone={status.tone}
              label={status.label}
              {...(onStatusInfo
                ? { action: { info: `About "${status.label}"`, onClick: onStatusInfo } }
                : {})}
            >
              {status.note}
            </StatusBand>
          ) : null}
        </section>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Change row */

/**
 * A section band over a group of changes — the reference's `CartSection` header.
 *
 * The source tints it red for exit actions and mint for entry ones, with a 10px dot, the label,
 * the subtotal in bold and a collapse chevron. Ours keeps the dot, the label and the subtotal and
 * drops the chevron: the source's own spec records that a collapsed section was never filmed, and
 * a control whose only evidence is a glyph pointing upwards is a control nobody specified. Two
 * groups of two lines do not need collapsing.
 */
export function ChangeBand({
  tone,
  label,
  total,
}: {
  tone: 'start' | 'stop'
  label: string
  total: string
}): ReactNode {
  const skin = tone === 'start' ? 'bg-legend-chip text-brand-deep' : 'bg-danger-soft text-danger'
  const dot = tone === 'start' ? 'bg-brand' : 'bg-danger'
  return (
    <div className={`-mx-4 mb-3 mt-6 flex items-center gap-2.5 px-4 py-2.5 ${skin}`}>
      <span aria-hidden="true" className={`size-2.5 flex-none rounded-pill ${dot}`} />
      <p className="m-0 min-w-0 flex-1 text-[13px] font-semibold">{label}</p>
      <p className="m-0 flex-none text-[14px] font-bold tabular-nums">{total}</p>
    </div>
  )
}
