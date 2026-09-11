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
 * **`MeasureRow`** — `12-rebalancing/02-rebalance-intro`'s two measures. Read off the frames
 * rather than off the spec line: a ~32px glyph alone in the left gutter, a bold title, two or
 * three lines of grey body, **no divider between the rows and roughly 40px of air instead**, and
 * the body indented to the title rather than running under the glyph. The first pass hung them on
 * a `divide-y`, which turns two considered blocks into a settings list. The source's rows are
 * informational; ours are the two things you can choose, so they *are* pressable and carry the
 * chevron the source's did not — the source has one `Continue` for two measures and its own flow
 * file lists "which measure?" as an unresolved gap.
 *
 * **`MeasureHead`** — the same glyph again at 56px, and the frames are clear that on
 * `03-rebalance-additional-investment` and `04-rebalance-align-portfolio` it sits **free on the
 * page ground**, not inside a card: glyph, then the screen title at 20px, then the paragraph. It
 * is the screen's own heading. Boxing it made the screen open on two stacked cards with no
 * heading between them.
 *
 * **`TargetCard`** — `03`'s `GoalCard`: a 40px icon tile beside the name with the date under it,
 * a full-width progress bar, an `Achieved <amount> (<pct>) out of <target>` caption, and the
 * alert `StatusBand` clipped to the card's foot. `progress` is optional and omitted rather than
 * faked — see the note on the component.
 *
 * **`StageCard`** — the route's step, with the reference's card discipline applied: the figures
 * the step actually moves laid out as constituents the way `select-basket` lays out a basket's
 * schemes, and the state said at the foot in a `StatusBand` rather than floating in a pill.
 *
 * **`ChangeBand` / `CartRow`** — `05-rebalancing-cart`'s grouped list. The band is full bleed with
 * a coloured dot, the label, the bold subtotal and a collapse chevron; the rows under it are full
 * bleed too, white, split by hairlines into name / figures / action, and separated from each
 * other by a band of page grey. Inset rounded cards under a full-bleed band was the first pass
 * and it broke the one thing the shape is for — a column you can run your eye down.
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

/**
 * The glyph chip both measures wear, at the two sizes the frames use it — 40px in an intro row,
 * 56px as a screen head.
 *
 * **It carries an illustration, not a stroke glyph, and the reference is why.** `02-rebalance-intro`
 * gives each measure its own drawn mark — an amber framed certificate with a `+` badge, and a
 * purple pie with one quadrant cut away on a pink halo — and reuses the *same* mark, enlarged, as
 * the head of the screen that measure opens. That reuse is what tells you which of the two
 * branches you followed, and it is the whole job the mark does. Two lucide arrows in two tinted
 * tiles could not do it here at all: `tint-clay` and `tint-sage` are the same colour since the
 * palette collapsed to one green, so the two chips were literally identical.
 *
 * So `measure-add` and `measure-align` were drawn for the set (`tools/genart.py`, `icon` kind) and
 * take the reference's own two accents — gold on the coins, violet on the lifted arc, both from
 * the four `DESIGN.md` allows. They are illustrated icons, so they follow that section's rules:
 * light ground, no tile in the file, the app supplies the container.
 */
export type Measure = 'add' | 'align'

const MEASURE_ART: Record<Measure, string> = {
  add: 'measure-add',
  align: 'measure-align',
}

function MeasureGlyph({ measure, size }: { measure: Measure; size: 'sm' | 'md' }): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={`grid flex-none place-items-center overflow-hidden rounded-sm bg-legend-chip ${
        size === 'sm' ? 'size-10' : 'size-14'
      }`}
    >
      <img
        src={`/icons/${MEASURE_ART[measure]}.png`}
        alt=""
        width={224}
        height={224}
        loading="lazy"
        decoding="async"
        className={`${size === 'sm' ? 'size-8' : 'size-11'} select-none object-contain`}
      />
    </span>
  )
}

export function MeasureRow({
  measure,
  title,
  body,
  figure,
  onPick,
}: {
  /** Which of the two the row is. Decides the mark, and nothing else does. */
  measure: Measure
  title: string
  body: string
  /** The figure that makes the measure concrete — the gap it would close. */
  figure?: string | undefined
  onPick?: (() => void) | undefined
}): ReactNode {
  const inner = (
    <>
      <MeasureGlyph measure={measure} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold leading-tight text-ink">{title}</span>
        {/* One sentence, which is what the source's rows carry — "Current investments fall short
            by 10% to provide desired returns." The whole finding is on the measure's own screen;
            a row that runs to seven lines has stopped being a row, and clamping the paragraph
            instead cut it mid-clause. */}
        <span className="mt-1.5 block text-[13.5px] leading-relaxed text-ink-soft">{body}</span>
        {figure ? (
          <span className="mt-2.5 inline-flex rounded-pill bg-legend-chip px-[11px] py-[5px] text-xs font-semibold text-brand-deep">
            {figure}
          </span>
        ) : null}
      </span>
      {onPick ? (
        <ChevronRight size={18} strokeWidth={2.2} className="mt-1 flex-none text-ink-faint" />
      ) : null}
    </>
  )

  if (!onPick) return <div className="flex gap-3.5 py-3">{inner}</div>
  return (
    <button
      type="button"
      onClick={onPick}
      className="ds-press flex w-full gap-3.5 border-0 bg-transparent py-3 text-left"
    >
      {inner}
    </button>
  )
}

/**
 * The screen head both measure screens open on — glyph, title, paragraph, on the page ground.
 *
 * `03` and `04` are identical here and neither puts a card around it. The glyph is the same mark
 * the intro's measure row wore, enlarged, which is what tells you which of the two measures you
 * followed.
 */
export function MeasureHead({
  measure,
  title,
  body,
}: {
  measure: Measure
  title: string
  body?: ReactNode
}): ReactNode {
  return (
    <div className="mb-5 mt-4">
      <MeasureGlyph measure={measure} size="md" />
      <h2 className="mb-0 mt-3.5 text-[20px] font-semibold leading-tight text-ink">{title}</h2>
      {body ? <p className="mb-0 mt-2 text-[14px] leading-relaxed text-ink-soft">{body}</p> : null}
    </div>
  )
}

/**
 * `03`'s `GoalCard` — what the measure is being applied to, and how far along it is.
 *
 * **`progress` is optional and that is the point.** The source draws a progress bar on every one
 * of these because its jar always has a target and an amount achieved. Ours does too for a pot
 * that accumulates — the buffer, the growth stage — but a debt has no such fraction: the app can
 * see today's balance and not the principal it started at, so "40% repaid" would be a number
 * invented to fill a bar. That card gets the caption and no track.
 */
export function TargetCard({
  icon,
  name,
  when,
  progress,
  caption,
  band,
}: {
  icon: ReactNode
  name: string
  when: string
  /** `{ pct, tone }`, or omitted where the fraction is unknowable. */
  progress?: { pct: number; tone: 'good' | 'bad' } | undefined
  caption: string
  band?: ReactNode
}): ReactNode {
  return (
    <section className="mb-4 min-w-0 overflow-hidden rounded-md border border-solid border-hairline-mint bg-surface">
      <div className="p-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 flex-none place-items-center rounded-sm bg-legend-chip text-brand-deep"
          >
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-[17px] font-semibold leading-tight text-ink">{name}</p>
            <p className="mb-0 mt-0.5 truncate text-[13px] text-ink-soft">{when}</p>
          </div>
        </div>
        {progress ? (
          <div
            className="mt-3.5 h-2 overflow-hidden rounded-pill bg-chart-idle"
            role="presentation"
          >
            <span
              className={`ds-bar-fill block h-full origin-left ${
                progress.tone === 'bad' ? 'bg-danger' : 'bg-accent'
              }`}
              style={{ transform: `scaleX(${Math.max(0, Math.min(100, progress.pct)) / 100})` }}
            />
          </div>
        ) : null}
        <p className={`mb-0 ${progress ? 'mt-2' : 'mt-3'} text-[14px] leading-snug text-ink-mid`}>
          {caption}
        </p>
      </div>
      {band}
    </section>
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
      {/* Sentence case, not caps. The frames set every one of these — `SIP Amount`, `SIP Date`,
          `Instalments`, `Market Value` — as plain grey ~12px, and `DESIGN.md` letter-spaces
          nothing but eyebrows and CTA labels. Four shouting captions inside a card is a table
          header, which is what the cart stopped looking like once they came down. */}
      <p className="m-0 truncate text-[12px] leading-snug text-ink-soft">{label}</p>
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
 * Every cart frame draws the same thing: a full-bleed 42px strip, tinted red for the exit group
 * and mint for the entry one, carrying a 10px dot, the label, the bold rupee subtotal and a
 * chevron. The label itself is *not* tinted in the source — only the dot and the ground are — but
 * that reading was taken off navy-era ink on a pink strip, and `danger` on `danger-soft` is the
 * pairing this app already uses for "attention" everywhere else; a near-black label on a tinted
 * ground reads as a table row here rather than as a state.
 *
 * The chevron is a real control and not decoration: the frames show it up on every expanded
 * section, and a cart of six behavioural lines is exactly the list you want folded away once you
 * have read it. The first pass dropped it on the grounds that a collapsed section was never
 * filmed, which is an argument for designing the collapsed state rather than for shipping no
 * control at all.
 */
export function ChangeBand({
  tone,
  label,
  total,
  open,
  onToggle,
}: {
  tone: 'start' | 'stop'
  label: string
  total: string
  open?: boolean | undefined
  onToggle?: (() => void) | undefined
}): ReactNode {
  const skin = tone === 'start' ? 'bg-legend-chip text-brand-deep' : 'bg-danger-soft text-danger'
  const dot = tone === 'start' ? 'bg-brand' : 'bg-danger'
  const box = `-mx-4 flex min-h-[42px] w-[calc(100%+32px)] items-center gap-2.5 px-4 py-2 text-left ${skin}`
  const inner = (
    <>
      <span aria-hidden="true" className={`size-2.5 flex-none rounded-pill ${dot}`} />
      <span className="min-w-0 flex-1 text-[13.5px] font-semibold">{label}</span>
      <span className="flex-none text-[14px] font-bold tabular-nums">{total}</span>
      {onToggle ? (
        <ChevronDown
          size={17}
          strokeWidth={2.6}
          aria-hidden="true"
          className={`-mr-1 flex-none transition-transform duration-200 ${
            open === false ? '' : 'rotate-180'
          }`}
        />
      ) : null}
    </>
  )
  if (!onToggle) return <div className={box}>{inner}</div>
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open !== false}
      className={`ds-press border-0 ${box}`}
    >
      {inner}
    </button>
  )
}

/**
 * One line of the cart — `05-rebalancing-cart`'s `FundRow`, in the shape the frames actually draw.
 *
 * Full bleed and white, split by hairlines into three registers: what the instruction is, the
 * figures it moves, and what to do about it. Rows within a section are separated by a band of
 * page grey rather than by a gap — that grey is what makes the section read as one block and the
 * rows as its members, and it is why the first pass's inset rounded cards under a full-bleed band
 * looked like two unrelated lists.
 *
 * Not taken from the source, and each for the same reason: the folio number (there is no folio
 * until an order exists), the AMC logo tile (no asset, and drawing one is drawing a brand), the
 * units figure on a sale (needs a NAV), and the trash control (there is nothing to delete — the
 * checkbox already excludes a line, and a second, destructive-looking control for the same job is
 * how you end up writing a confirmation dialog nobody needed).
 */
export function CartRow({
  head,
  detail,
  figures,
  foot,
  dim,
  last,
}: {
  head: ReactNode
  detail?: ReactNode
  figures?: ReactNode
  foot?: ReactNode
  /** Excluded from the submission: the whole line steps back but stays readable. */
  dim?: boolean | undefined
  /** No grey separator under the last row of a section — the next band is the separator. */
  last?: boolean | undefined
}): ReactNode {
  return (
    <div
      className={`-mx-4 w-[calc(100%+32px)] border-0 border-solid border-ground-deep bg-surface ${
        last === true ? '' : 'border-b-[6px]'
      } ${dim === true ? 'opacity-60' : ''}`}
    >
      <div className="px-4 pb-3 pt-2.5">
        {head}
        {detail ? (
          /* Indented to the label, not to the gutter: checkbox 20px + gap 12px. The source hangs
             its `Folio:` line off the fund name the same way. */
          <div className="mt-1 pl-8 text-[13px] leading-snug text-ink-soft">{detail}</div>
        ) : null}
      </div>
      {figures ? (
        <div className="border-0 border-t border-solid border-hairline-mint px-4 py-3">
          {figures}
        </div>
      ) : null}
      {foot ? (
        <div className="border-0 border-t border-solid border-hairline-mint px-4 py-3">{foot}</div>
      ) : null}
    </div>
  )
}
