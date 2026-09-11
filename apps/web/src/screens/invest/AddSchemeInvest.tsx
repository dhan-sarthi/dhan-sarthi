/**
 * `add-scheme-invest` — the core transaction screen.
 *
 * `spec/screens/10-diy-otp/04-add-scheme-invest.md`, which is the most exhaustively specced
 * screen in the set: a scheme card overlapping the app bar, a two-way segmented toggle, the
 * amount as a large centred figure with the same amount spelled out under it, and — on the SIP
 * side — a three-row form card, a three-column summary strip and the NAV disclaimer.
 *
 * What the source does not give, and the decisions taken here:
 *
 * - **No CTA is visible in any frame** (the lavender panel runs off the bottom edge in all five).
 *   It is `Screen`'s sticky footer, which `COMPONENT-GAP.md` records as having been lifted in
 *   step 2 for exactly this.
 * - **The editors are never opened** — not the keypad, the date picker, the installments editor
 *   or the folio dropdown. The amount is edited in place, because the reference's own treatment
 *   is a tap-to-edit figure with no box, and the other three are sheets, because every editing
 *   surface in this app is a sheet.
 * - **`999` is the reference's sentinel for "Until I Stop".** A sentinel that is also a plausible
 *   number is a bug waiting for the customer who wants 999 instalments, so this carries the
 *   absence as `null` and never renders a magic figure.
 * - **The date is `5 October 2026`, not `5ᵗʰ Oct 2026`.** The superscript ordinal is the
 *   reference's typography; this app already has one way of speaking a date, in `lib/money.ts`,
 *   and two would be worse than either.
 * - **The NAV disclaimer stays on the Lump sum tab**, where the source drops it. Cut-off timing
 *   decides the allotment NAV on a one-off purchase more directly than it does on a SIP; losing
 *   the disclosure there looks like an oversight rather than a design.
 *
 * The lavender panel (`#F2EDFD`) has no row in `03-PALETTE-MAP.md`. It is a schedule and a
 * projection, which is what `--tint-sky` is for in `DESIGN.md`, so it is a sky card rather than
 * a new token.
 *
 * ## What the parity pass changed, after putting the running screen beside frames 06–10
 *
 * Everything above was built to the measurements and none of it was looked at. Four things came
 * out of looking:
 *
 * - **The app bar is green.** The overlap is the reference's signature move on this screen and it
 *   was invisible here: a white card hanging 48px into a white-to-mint gradient overlaps nothing.
 *   `03-PALETTE-MAP.md` §2 says the navy bar is load-bearing and that the trick "must be rebuilt,
 *   not recoloured" against `--brand` green. `Head tone="brand"` is that rebuild.
 * - **The ribbon is on the corner**, not on the text gutter — the spec says flush to the card's
 *   edge and the frame shows it.
 * - **The toggle is a centred pill**, 242×43 in the frame, not a full-width track. See
 *   `Segments variant="switch"`.
 * - **The form rows are 66px, not 56px**, and the card holds them with no padding of its own, so
 *   the Lump sum tab's single Folio row is a 66px strip rather than a 100px card with one line in
 *   it. That is why this screen builds the form card by hand instead of using `Card`.
 */
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarDays, ChevronDown, SquarePen } from 'lucide-react'
import type { ShelfProduct } from '@dhan/contracts'
import { Screen } from '../../components/Screen.tsx'
import { Sheet } from '../../components/Sheet.tsx'
import { Choice } from '../../components/Form.tsx'
import { RibbonTab } from '../../components/charts/index.ts'
import { Button, Card, Head, Segments, TextLink } from '../../components/ui.tsx'
import { dayMonth, inWords, inr, longDate } from '../../lib/money.ts'
import {
  SIP_DAYS,
  committedTotal,
  lastInstalment,
  nextOnDay,
  settlementOf,
} from '../../lib/order.ts'
import type { FolioChoice, InvestMode, OrderLine, Settlement } from '../../lib/order.ts'
import { SchemeMark } from './SchemeMark.tsx'

const COUNTS = [12, 24, 36, 60] as const

const MODES: readonly { id: InvestMode; label: string }[] = [
  { id: 'sip', label: 'Monthly SIP' },
  { id: 'lumpsum', label: 'Lump sum' },
]

const FOLIOS: readonly { id: FolioChoice; label: string }[] = [
  { id: 'new', label: 'New folio' },
  { id: 'existing', label: 'Existing folio' },
]

/** Pure cover is bought as a premium, not as a SIP, and never as a lump sum. */
const isProtection = (p: ShelfProduct): boolean =>
  p.insuranceProduct === true && p.bundlesProtectionAndInvestment !== true

/**
 * The line under the summary strip.
 *
 * The reference's is the mutual-fund one — "NAV is subject to realisation of fund before the
 * applicable cut off timings" — and the reference only ever sells mutual funds. IDBI's shelf also
 * carries cover and deposits, and neither has units or a NAV, so a disclaimer that says they do
 * is worse than none: it is a disclosure that is false about the product it sits under.
 */
const SETTLEMENT: Record<Settlement, string> = {
  units:
    'Units are allotted at the NAV that applies once the money is realised, before the scheme’s ' +
    'cut-off time for the day.',
  cover: 'Cover begins once the first premium is realised and the policy is issued.',
  deposit: 'The instruction is placed once the money is realised, at the rate applicable that day.',
}

export function AddSchemeInvest({
  product,
  planned,
  asOf,
  editing,
  onBack,
  onCommit,
}: {
  product: ShelfProduct
  /** Named by a stage of this customer's roadmap. The only thing the ribbon may mean. */
  planned: boolean
  /** The session's simulated today. Every date offered is after it. */
  asOf: string
  /** Re-opened from the cart to change a line, rather than adding one. */
  editing?: OrderLine | null
  onBack: () => void
  onCommit: (line: OrderLine) => void
}): ReactNode {
  const cover = isProtection(product)
  const copy = cover
    ? { amount: 'Monthly premium', first: 'First premium', count: 'Premiums' }
    : { amount: 'SIP amount', first: 'First SIP', count: 'Instalments' }

  /*
   * The debit dates on offer, in the order they actually fall.
   *
   * Sorting by day number rather than by date put "25 May" after "20 June" in the picker, because
   * the 25th of this month has not gone yet and the 20th has. Six items, recomputed only when the
   * clock moves.
   */
  const dates = useMemo(
    () =>
      SIP_DAYS.map((day) => ({ day, on: nextOnDay(day, asOf) })).sort((a, b) =>
        a.on < b.on ? -1 : 1,
      ),
    [asOf],
  )

  const [mode, setMode] = useState<InvestMode>(editing?.mode ?? 'sip')
  const [amount, setAmount] = useState(editing?.amount ?? product.minInvestment)
  const [startDay, setStartDay] = useState(
    editing?.startDate ? Number(editing.startDate.slice(8, 10)) : (dates[0]?.day ?? 1),
  )
  const [installments, setInstallments] = useState<number | null>(editing?.installments ?? null)
  const [folio, setFolio] = useState(editing?.folio ?? 'new')
  const [sheet, setSheet] = useState<'date' | 'count' | 'folio' | null>(null)
  const [detail, setDetail] = useState(false)

  const recurring = mode === 'sip'
  const startDate = useMemo(() => nextOnDay(startDay, asOf), [startDay, asOf])

  const line: OrderLine = {
    id: editing?.id ?? `L${startDate}-${product.productId}`,
    productId: product.productId,
    name: product.name,
    manufacturer: product.manufacturer,
    category: product.category,
    mode,
    amount,
    startDate: recurring ? startDate : null,
    installments: recurring ? installments : null,
    folio,
    included: true,
  }

  const below = amount < product.minInvestment
  const last = lastInstalment(line)
  const total = committedTotal(line)

  return (
    <Screen
      scrollHeader
      overlap
      header={
        <Head
          onBack={onBack}
          backLabel="Back to the shelf"
          title="Add scheme"
          overlap
          tone="brand"
        />
      }
      footer={
        <Button full disabled={below} onClick={() => onCommit(line)}>
          {editing ? 'Save changes' : 'Add to order'}
        </Button>
      }
      after={
        <>
          <Sheet
            open={sheet === 'date'}
            onClose={() => setSheet(null)}
            title={`${copy.first} on`}
            sub="The day of the month IDBI debits your account. These are the dates the AMC accepts."
          >
            <Choice
              options={dates.map((d) => ({ id: String(d.day), label: dayMonth(d.on) }))}
              value={String(startDay)}
              onChange={(id) => {
                setStartDay(Number(id))
                setSheet(null)
              }}
            />
          </Sheet>

          <Sheet
            open={sheet === 'count'}
            onClose={() => setSheet(null)}
            title={`How many ${copy.count.toLowerCase()}`}
            sub="You can stop or pause at any time, whichever you pick."
          >
            <Choice
              options={[
                ...COUNTS.map((n) => ({ id: String(n), label: `${n} months` })),
                { id: 'open', label: 'Until I stop' },
              ]}
              value={installments === null ? 'open' : String(installments)}
              onChange={(id) => {
                setInstallments(id === 'open' ? null : Number(id))
                setSheet(null)
              }}
            />
          </Sheet>

          <Sheet
            open={sheet === 'folio'}
            onClose={() => setSheet(null)}
            title="Folio"
            sub="IDBI has not sent a folio number for this holding, so there is none to show."
          >
            <Choice
              options={FOLIOS}
              value={folio}
              onChange={(id) => {
                setFolio(id)
                setSheet(null)
              }}
            />
          </Sheet>
        </>
      }
    >
      {/* nth-child(2) of the content wrapper, which is what `overlap` pulls up into the slab. */}
      <Card tint="white">
        {planned ? <RibbonTab corner>In your plan</RibbonTab> : null}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2>{product.name}</h2>
            <p className="mb-0 mt-1 text-[13px] text-ink-soft">{product.manufacturer}</p>
          </div>
          <SchemeMark manufacturer={product.manufacturer} size="md" />
        </div>

        <TextLink flush size="sm" ariaExpanded={detail} onClick={() => setDetail((d) => !d)}>
          {detail ? 'Show less' : 'View more'}
        </TextLink>

        {detail ? (
          <>
            <dl className="m-0 mt-1 divide-y divide-solid divide-hairline-mint border-0 border-t border-solid border-hairline-mint">
              <Fact label="Riskometer" value={product.riskometer} />
              <Fact
                label="Lock-in"
                value={product.lockInYears > 0 ? `${product.lockInYears} years` : 'None'}
              />
              {product.expenseRatio !== undefined ? (
                <Fact label="Expense ratio" value={`${product.expenseRatio}%`} />
              ) : null}
              {product.indicativeReturn !== undefined ? (
                <Fact label="Indicative return" value={`${product.indicativeReturn}%`} />
              ) : null}
              {product.coverAmount !== undefined ? (
                <Fact label="Cover" value={inr(product.coverAmount)} />
              ) : null}
            </dl>
            {product.note ? (
              <p className="m-0 border-0 border-t border-solid border-hairline-mint pt-2.5 text-[13px] leading-relaxed text-ink-mid">
                {product.note}
              </p>
            ) : null}
          </>
        ) : null}
      </Card>

      {cover ? null : <Segments variant="switch" options={MODES} value={mode} onChange={setMode} />}

      <AmountField
        label={recurring ? copy.amount : 'Lump sum amount'}
        value={amount}
        onChange={setAmount}
        minimum={product.minInvestment}
        below={below}
      />

      {/* Not `Card`: the rows carry the height, so the card carries no vertical padding of its
          own. With `p-4` the Lump sum tab's single Folio row sat in a 100px box with 34px of air
          above and below it, where the frame shows a 52px strip. */}
      <section className="mb-3 min-w-0 divide-y divide-solid divide-hairline-mint rounded-md border border-solid border-hairline bg-surface px-4">
        {recurring ? (
          <>
            <Row
              label={copy.first}
              value={longDate(startDate)}
              icon={<CalendarDays size={18} strokeWidth={2} />}
              onClick={() => setSheet('date')}
            />
            <Row
              label={`No. of ${copy.count.toLowerCase()}`}
              value={installments === null ? 'Until I stop' : String(installments)}
              /* Only when there is something to say. "Until I stop" is already the value on
                 the right, and repeating it in the helper wrapped the row onto three lines. */
              help={last ? `Last one on ${longDate(last)}` : undefined}
              icon={<SquarePen size={18} strokeWidth={2} />}
              onClick={() => setSheet('count')}
            />
          </>
        ) : null}
        <Row
          label="Folio"
          value={folio === 'new' ? 'New folio' : 'Existing folio'}
          icon={<ChevronDown size={18} strokeWidth={2} />}
          onClick={() => setSheet('folio')}
        />
      </section>

      {/* The reference's lavender panel: three ruled columns over a hairline, then the settlement
          line centred under it. In the frame it is anchored to the bottom of the screen and
          clipped by it, because that screen has no CTA; this one does, so the panel is a panel
          and the sticky footer is the bottom edge. */}
      <section className="mb-3 min-w-0 rounded-md bg-tint-sky px-4 pb-3.5 pt-3">
        {recurring ? (
          <div className="mb-3 grid grid-cols-3 divide-x divide-solid divide-hairline-mint border-0 border-b border-solid border-hairline-mint pb-3">
            <Column label={copy.first} value={dayMonth(startDate)} />
            <Column
              label={copy.count}
              value={installments === null ? 'Until I stop' : String(installments)}
            />
            <Column label="In total" value={total === null ? 'Open-ended' : inr(total)} />
          </div>
        ) : null}
        <p className="m-0 text-center text-[12.5px] leading-relaxed text-ink-soft">
          {SETTLEMENT[settlementOf(product.category)]}
        </p>
      </section>
    </Screen>
  )
}

/* ---------------------------------------------------------------- Pieces */

/**
 * The figure, and the figure in words.
 *
 * The reference has no input box at all — a 36px centred number you tap to edit. Keeping that
 * and still having a real control means the number *is* the field: no border around it, one
 * hairline under it that takes the focus colour, and the digits grouped as they are typed, the
 * same way `MoneyInput` does it.
 *
 * The words underneath are the point of the whole block. ₹50,000 and ₹5,00,000 look alike at a
 * glance and read nothing alike, and this is the only place a customer catches the extra zero.
 */
function AmountField({
  label,
  value,
  onChange,
  minimum,
  below,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  minimum: number
  below: boolean
}): ReactNode {
  const shown = value > 0 ? new Intl.NumberFormat('en-IN').format(Math.round(value)) : ''
  return (
    <section className="mb-5 mt-1 text-center">
      <div className="text-sm text-ink-soft">{label}</div>
      {/* The ₹ is 0.7em and the same ink as the digits, not a small grey prefix. In the frame the
          rupee sign is part of the figure — `₹2,416` is one word at one weight — and shrinking it
          into the label colour turns the number into a form field again. */}
      <div className="mx-auto mt-2 flex w-fit items-baseline justify-center border-0 border-b-[1.5px] border-solid border-hairline pb-1.5 focus-within:border-accent-text">
        <span className="mr-[0.06em] text-[27px] font-bold leading-none text-ink">₹</span>
        <input
          aria-label={label}
          inputMode="numeric"
          autoComplete="off"
          value={shown}
          placeholder="0"
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 9)
            onChange(digits === '' ? 0 : Number(digits))
          }}
          className="min-w-0 border-0 bg-transparent text-center text-[38px] font-bold leading-none tracking-tight tabular-nums text-ink outline-none placeholder:text-ink-faint"
          style={{ width: `${Math.max(3, shown.length || 1)}ch` }}
        />
      </div>
      <p className="mb-0 mt-3 text-[13px] leading-snug text-ink-soft">{inWords(value)}</p>
      <p
        className={`mb-0 mt-1 text-xs ${below ? 'font-semibold text-danger' : 'text-ink-soft'}`}
        role={below ? 'alert' : undefined}
      >
        Minimum {inr(minimum)}
      </p>
    </section>
  )
}

/** One row of the form card: a label, a value, and the glyph that says what editing it looks like. */
function Row({
  label,
  value,
  help,
  icon,
  onClick,
}: {
  label: string
  value: string
  help?: string | undefined
  icon?: ReactNode
  onClick?: (() => void) | undefined
}): ReactNode {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] text-ink-mid">{label}</span>
        {help ? <span className="mt-0.5 block text-[12.5px] text-ink-soft">{help}</span> : null}
      </span>
      <span className="flex-none text-[15px] font-semibold text-ink">{value}</span>
      {icon ? <span className="flex-none text-accent-text">{icon}</span> : null}
    </>
  )
  /* 66px, which is what the frame measures the three rows at (a 200px card, three ways). At 56
     the value, the helper line and the trailing glyph were touching their own dividers. */
  const cls = 'flex min-h-[66px] w-full items-center gap-3 border-0 bg-transparent py-3 text-left'
  if (!onClick) return <div className={cls}>{body}</div>
  return (
    <button type="button" className={`ds-press ${cls}`} onClick={onClick}>
      {body}
    </button>
  )
}

/** One of the three columns of the summary strip. */
function Column({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="min-w-0 px-2 first:pl-0 last:pr-0">
      <div className="truncate text-[11px] text-ink-soft">{label}</div>
      <div className="mt-0.5 truncate text-[13.5px] font-semibold text-ink">{value}</div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5 text-[13.5px]">
      <dt className="text-ink-mid">{label}</dt>
      <dd className="m-0 font-semibold text-ink">{value}</dd>
    </div>
  )
}
