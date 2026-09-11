/**
 * The two pieces every screen in this flow shares.
 *
 * `DemoStrip` is the important one, and it is not decoration. `07-DECISIONS.md` §5 puts CAS back
 * in scope on one condition — *a screen may be driven by demo data, but it may never claim the
 * data is real* — and this is how that condition is met on each of the four screens: a strip in
 * the register the app already uses for the simulated clock (`components/Clock.tsx`) and the
 * printed order code (`invest/VerifyOtp.tsx`). Same `tint-clay` ground, same `Demonstration`
 * eyebrow, same job: name the thing that did not happen, in the place where a reviewer is about
 * to assume it did.
 *
 * It is deliberately not an `InfoBanner` and not a `Pill`. A banner reads as a notice about the
 * screen's state — dismissible, transient, somebody else's problem — and a pill is a word. This
 * is a paragraph that changes what the screen above it means, so it is a card, and on the two
 * screens where the claim is strongest (the fetch and its success) it sits directly under the
 * thing it qualifies rather than at the foot of the page.
 */
import type { ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import { inr } from '../../lib/money.ts'
import type { CasFolio } from './cas.ts'

export function DemoStrip({ children }: { children: ReactNode }): ReactNode {
  return (
    <section className="mb-3 min-w-0 rounded-md bg-tint-clay p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent-text">
        <CircleAlert size={13} strokeWidth={2.6} />
        Demonstration
      </div>
      <p className="mb-0 mt-1.5 text-[13px] leading-relaxed text-ink-mid">{children}</p>
    </section>
  )
}

/**
 * One line of the statement, as a statement prints it.
 *
 * Folio number and registrar are on the row because a CAS without them is not a CAS — and
 * because they are the two fields that do *not* survive the import (`HoldingSchema` has nowhere
 * to put them), so this is the only place they are ever shown. The figures are the statement's
 * own: what went in at the left, what it is valued at on the right.
 */
export function FolioRow({
  folio,
  muted = false,
}: {
  folio: CasFolio
  muted?: boolean
}): ReactNode {
  const gain = folio.value - folio.invested
  return (
    <div className={`flex items-start gap-3 py-3 ${muted ? 'opacity-60' : ''}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-semibold leading-snug text-ink">{folio.name}</div>
        <p className="m-0 mt-0.5 text-[12.5px] leading-snug text-ink-soft">
          Folio {folio.folio} · {folio.registrar} · {folio.assetClass}
          {folio.sipMonthly > 0 ? ` · ${inr(folio.sipMonthly)} a month` : ''}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[15px] font-bold tabular-nums text-ink">{inr(folio.value)}</div>
        <div
          className={`mt-0.5 text-[12px] font-semibold tabular-nums ${
            gain >= 0 ? 'text-brand-deep' : 'text-danger'
          }`}
        >
          {gain >= 0 ? '+' : '−'}
          {inr(Math.abs(gain))}
        </div>
      </div>
    </div>
  )
}
