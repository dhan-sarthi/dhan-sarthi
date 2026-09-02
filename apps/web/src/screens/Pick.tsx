/**
 * The way in. No sign-in.
 *
 * A judge gives a link about ninety seconds before closing the tab, and an OTP screen spends all
 * of it. Three pre-loaded customers, one tap, straight into the product — and each one exists to
 * make a different rule fire, so whichever they pick they see the gate work.
 *
 * The line under each name is the whole pitch in one sentence, aimed at someone who has watched
 * customers fail to invest for thirty years and will recognise these people instantly.
 */
import type { ReactNode } from 'react'
import { personas } from '../lib/view.ts'

export function Pick({ onPick }: { onPick: (slug: string) => void }): ReactNode {
  return (
    /* `.scroll` is unlayered and sets a `padding` shorthand, so the top padding needs `!` to win. */
    <div className="scroll pt-10!">
      <p className="m-0 mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-accent-text">
        IDBI Innovate 2026 · Team Atomic
      </p>

      <h1 className="m-0 mb-3 text-[30px] font-bold leading-tight text-ink">
        A private banker for every IDBI account
      </h1>

      <p className="m-0 mb-2 text-[15px] leading-normal text-ink-mid">
        Uday reads every transaction, tells you the one thing to do today, and refuses to sell you
        an IDBI product that is wrong for you.
      </p>

      <p className="m-0 mb-7 text-sm leading-normal text-ink-soft">
        Pick a customer to try it. These are synthetic ledgers — twenty-four months each, generated,
        not written. Every number you see is arithmetic over them.
      </p>

      {personas.map((p) => (
        <button
          key={p.slug}
          type="button"
          onClick={() => onPick(p.slug)}
          className="mb-3 block w-full rounded-md border border-solid border-hairline-mint bg-white p-4 text-left font-sans text-ink transition-transform duration-100 active:scale-[0.985]"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-11 flex-none place-items-center rounded-pill bg-tint-sage text-[16px] font-bold text-brand">
              {p.customer.custName
                .split(' ')
                .map((n) => n[0])
                .join('')}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[18px] font-semibold leading-tight text-ink">
                {p.customer.custName}
              </div>
              <div className="mt-0.5 text-[13px] leading-snug text-ink-soft">{p.pitch}</div>
            </div>
            <span className="text-[20px] leading-none text-ink-faint">›</span>
          </div>
        </button>
      ))}

      <p className="m-0 mt-6 text-sm leading-normal text-ink-soft">
        Nothing here is a real customer, and no data leaves your browser.
      </p>
    </div>
  )
}
