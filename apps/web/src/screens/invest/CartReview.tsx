/**
 * `cart-review` — every scheme in the order, and the one action that authorises the lot.
 *
 * `spec/screens/10-diy-otp/05-cart-review.md`. The frame is scrolled and zoomed, so the app bar
 * is unknown; it gets the shell's back variant, because a pushed screen in this app has one.
 *
 * Four departures, each because the source is doing something this app cannot honestly copy:
 *
 * - **Two figures in the footer, not one.** The reference shows a single `Amount Payable` over a
 *   basket that mixes SIPs and lump sums, which cannot be right: a SIP takes nothing today and a
 *   lump sum takes nothing next month. Conflating them is how somebody authorises ₹15,000
 *   thinking it is a one-off. (Its own demo data disagrees with itself here — the visible lines
 *   total ₹10,000.40 against a ₹15,000 payable.)
 * - **The referral row is gone.** A toggle that reveals a field this app has no store for is
 *   furniture.
 * - **The balance strip is real.** `Available account balance` reads the account's
 *   `effectiveAvailableBalance` — IDBI's spendable floor, `AVAIL` less `LIEN` — and the order is
 *   held back when today's debit exceeds it. That is an insufficient-funds check and it says so
 *   in those words; it is emphatically **not** the suitability gate, which runs after it.
 * - **The terms sentence is rewritten.** The verbatim string capitalises "Structure" mid-sentence
 *   and is missing a verb.
 *
 * `Place order` runs the gate. Not after it, not beside it: `07-DECISIONS.md` §3 puts suitability
 * *before* checkout on the same snapshot the order is built from, so nothing here can reach the
 * OTP without a verdict, and a gate that cannot be reached fails closed.
 */
import type { ReactNode } from 'react'
import { Info, Plus, Trash2 } from 'lucide-react'
import { Screen } from '../../components/Screen.tsx'
import { InfoBanner } from '../../components/InfoBanner.tsx'
import { Checkbox } from '../../components/Form.tsx'
import { Amount, Button, Head, IconButton, TextLink } from '../../components/ui.tsx'
import { dayMonth, inr } from '../../lib/money.ts'
import { totals } from '../../lib/order.ts'
import type { OrderLine } from '../../lib/order.ts'
import { SchemeMark } from './SchemeMark.tsx'

export interface AvailableBalance {
  masked: string
  amount: number
}

export function CartReview({
  lines,
  available,
  terms,
  placing,
  gateError,
  onSetTerms,
  onToggle,
  onEdit,
  onRemove,
  onAddMore,
  onBreakdown,
  onPlace,
  onBack,
}: {
  lines: readonly OrderLine[]
  available: AvailableBalance | null
  terms: boolean
  /** The gate is running. Nothing may be changed underneath it, and it cannot be run twice. */
  placing: boolean
  /** The gate could not be reached. The order stays here; it does not proceed. */
  gateError: string | null
  onSetTerms: (next: boolean) => void
  onToggle: (id: string) => void
  onEdit: (line: OrderLine) => void
  onRemove: (id: string) => void
  onAddMore: () => void
  onBreakdown: () => void
  onPlace: () => void
  onBack: () => void
}): ReactNode {
  const t = totals(lines)
  const short = available !== null && t.today > available.amount
  const ready = t.count > 0 && terms && !short && !placing

  /* Which figure leads the footer. A SIP-only order takes nothing today, and leading with ₹0
     would read as "this is free" rather than "this starts next month". */
  const lead = t.today > 0 ? { value: t.today, label: 'Payable today' } : null

  return (
    <Screen
      header={
        <Head
          onBack={onBack}
          backLabel="Back"
          title="Review order"
          sub={`${t.count} of ${lines.length} scheme${lines.length === 1 ? '' : 's'} selected`}
        />
      }
      notice={
        <InfoBanner tone="sage">
          <b className="font-semibold">Demonstration</b> — the suitability check on this order is
          real and is recorded. No money moves and nothing reaches the AMC.
        </InfoBanner>
      }
      footer={
        <>
          {short && available ? (
            <p
              role="alert"
              className="mb-3 mt-0 text-[13px] font-semibold leading-snug text-danger"
            >
              {inr(t.today)} is more than the {inr(available.amount)} available in{' '}
              {available.masked}. Reduce the order, or move money in first.
            </p>
          ) : null}
          {gateError ? (
            <p
              role="alert"
              className="mb-3 mt-0 text-[13px] font-semibold leading-snug text-danger"
            >
              {gateError}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              {lead ? (
                <>
                  <Amount value={lead.value} size="md" paise />
                  <button
                    type="button"
                    onClick={onBreakdown}
                    className="mt-0.5 inline-flex items-center gap-1 border-0 bg-transparent p-0 text-xs text-ink-mid underline-offset-2 hover:underline"
                  >
                    {lead.label}
                    <Info size={13} strokeWidth={2.2} className="text-accent-text" />
                  </button>
                  {t.monthly > 0 ? (
                    <div className="text-xs text-ink-soft">then {inr(t.monthly)} a month</div>
                  ) : null}
                </>
              ) : (
                <>
                  <Amount value={t.monthly} size="md" />
                  <button
                    type="button"
                    onClick={onBreakdown}
                    className="mt-0.5 inline-flex items-center gap-1 border-0 bg-transparent p-0 text-xs text-ink-mid underline-offset-2 hover:underline"
                  >
                    A month · nothing today
                    <Info size={13} strokeWidth={2.2} className="text-accent-text" />
                  </button>
                </>
              )}
            </div>
            <Button onClick={onPlace} disabled={!ready} busy={placing}>
              Place order
            </Button>
          </div>
        </>
      }
    >
      {lines.length === 0 ? (
        <div className="mt-6 text-center">
          <p className="m-0 text-[15px] leading-relaxed text-ink-mid">Nothing in the order yet.</p>
          <div className="mt-4">
            <Button full tone="secondary" onClick={onAddMore}>
              Pick a scheme
            </Button>
          </div>
        </div>
      ) : (
        /*
         * Full-bleed white blocks on a grey ground, all the way down.
         *
         * This is the reference's rhythm and the first pass only had half of it: the line items
         * were banded and everything after them — add-more, the balance strip, the terms — floated
         * back onto the page gutter, so the screen changed structure halfway. In frame 11 every
         * section is a white slab with an `#F2F5FA` band between it and the next, right down to
         * the terms row above the sticky bar. One grey ground, white blocks on it, 8px apart.
         */
        <div className="-mx-4 space-y-2 bg-ground-deep py-2">
          {lines.map((line) => (
            <Item
              key={line.id}
              line={line}
              onToggle={() => onToggle(line.id)}
              onEdit={() => onEdit(line)}
              onRemove={() => onRemove(line.id)}
            />
          ))}

          <div className="bg-surface px-4 py-3">
            <button
              type="button"
              onClick={onAddMore}
              className="ds-press flex h-12 w-full items-center justify-center gap-1.5 rounded-pill border-[1.5px] border-dashed border-accent bg-legend-chip px-4 text-[15px] font-semibold text-accent-text"
            >
              <Plus size={17} strokeWidth={2.6} />
              Add another scheme
            </button>
          </div>

          {available ? (
            <div className="bg-legend-chip px-4 py-2.5 text-center text-[13px] font-semibold text-brand-deep">
              Available in {available.masked}: {inr(available.amount)}
            </div>
          ) : null}

          <div className="bg-surface px-4 py-1">
            <Checkbox checked={terms} onChange={onSetTerms} disabled={placing}>
              I accept the{' '}
              <span className="font-semibold text-brand-deep underline underline-offset-2">
                terms and conditions
              </span>{' '}
              and the commission structure that applies to this transaction.
            </Checkbox>
          </div>
        </div>
      )}
    </Screen>
  )
}

/**
 * One line of the order.
 *
 * The paise are typeset smaller than the rupees, which is the reference's treatment and already
 * what `Amount paise` does. A SIP line also carries its start date and its count — the source
 * only ever shows lump-sum lines, and its own Gaps section flags that a SIP line item is
 * unobserved even though the flow plainly mixes both.
 */
function Item({
  line,
  onToggle,
  onEdit,
  onRemove,
}: {
  line: OrderLine
  onToggle: () => void
  onEdit: () => void
  onRemove: () => void
}): ReactNode {
  const recurring = line.mode === 'sip'
  const schedule = recurring
    ? `First debit ${dayMonth(line.startDate ?? '')} · ${
        line.installments === null ? 'until you stop' : `${line.installments} instalments`
      }`
    : null

  return (
    <article className={`bg-surface px-4 py-3 ${line.included ? '' : 'opacity-60'}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Checkbox checked={line.included} onChange={onToggle}>
            <span className="text-[15px] font-semibold leading-snug text-ink">{line.name}</span>
          </Checkbox>
          <p className="mb-0 mt-0 pl-8 text-[12.5px] text-ink-soft">
            {line.folio === 'new' ? 'New folio' : 'Existing folio'} · {line.manufacturer}
          </p>
        </div>
        <SchemeMark manufacturer={line.manufacturer} size="md" />
      </div>

      <div className="mt-3 border-0 border-t border-solid border-hairline-mint pt-3">
        <div className="text-[12.5px] text-ink-soft">
          {recurring ? 'Monthly SIP amount' : 'Lump sum amount'}
        </div>
        <div className="mt-0.5">
          <Amount value={line.amount} size="md" paise animate={false} />
        </div>
        {schedule ? <div className="mt-1 text-[12.5px] text-ink-soft">{schedule}</div> : null}
      </div>

      <div className="mt-2 flex items-center justify-between border-0 border-t border-solid border-hairline-mint pt-1">
        <TextLink flush size="sm" onClick={onEdit}>
          Edit details
        </TextLink>
        {/*
         * Not the danger tone. In frame 11 the trash is the same blue as `Edit Details` beside
         * it — the two are a pair of equal actions on the line, and a red disc made removing a
         * line the loudest thing on a screen whose actual refusal, when there is one, is the
         * gate. Red stays for that.
         */}
        <IconButton label={`Remove ${line.name}`} size="sm" tone="ghost" onClick={onRemove}>
          <Trash2 size={17} strokeWidth={2} className="text-brand-deep" />
        </IconButton>
      </div>
    </article>
  )
}
