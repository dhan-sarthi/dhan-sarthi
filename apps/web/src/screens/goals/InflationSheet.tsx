/**
 * The inflation calculator behind "Adjust Inflation".
 *
 * The reference's sheet, kept whole: a row of rate chips, the adjusted figure over the original,
 * and two ways out — take the adjusted amount, or keep the one you typed. Its numbers are staged
 * (₹25,00,000 at 5% does not reach ₹33,50,000 for about six years, and the form behind it says
 * ₹27,50,000), so only the shape is copied. The arithmetic here is real and it is one line:
 * `inflated()` in `lib/projection.ts`, the inverse of the real-terms line the projection band
 * already draws, compounded annually because that is how an inflation rate is quoted.
 *
 * ## What the button now means, and what it used to have to refuse
 *
 * `packages/core/src/goal.ts` *proposes* targets in **today's money** on purpose, and records
 * what happened when it did not: a retirement number inflated forward to 60 came out at ₹11.48
 * crore, overflowed the card, read as absurd and made every plan infeasible. The engine funds
 * such a target at the *real* rate — nominal less inflation — which is right for a figure in
 * rupees the customer recognises now.
 *
 * It was wrong for a figure the customer had already inflated, and until `Goal.amountBasis`
 * existed there was no way to tell the two apart. So this sheet showed the adjusted amount
 * beyond ten years but would not let anyone use it: handing the engine an inflated target had
 * it discount the same price rises twice and quote a contribution most of the way to double.
 * Refusing at ten years and beyond meant refusing exactly where inflation matters most.
 *
 * The basis now travels — screen to `GoalPatch` to the session to `buildRoadmap` — so taking
 * the adjusted amount states an `at_horizon` target and the engine funds it at the full assumed
 * return, at any horizon. The sheet offers, unconditionally, and the caller does not mount it
 * where the question is meaningless: a balance owed accrues, it does not inflate.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Sheet } from '../../components/Sheet.tsx'
import { Button, TextLink } from '../../components/ui.tsx'
import { inr } from '../../lib/money.ts'
import { inflated } from '../../lib/projection.ts'
import { INFLATION_PCT } from './jar.ts'

/** The reference's five, and the app's own 5.5% assumption sits between the first two. */
const RATES = [5, 6, 7, 8, 9] as const

/** The chip nearest the plan's assumption, ties going up: a conservative default beats a neat one. */
function nearestRate(assumed: number): number {
  return (
    [...RATES].sort((a, b) => Math.abs(a - assumed) - Math.abs(b - assumed) || b - a)[0] ?? RATES[0]
  )
}

export function InflationSheet({
  open,
  onClose,
  amount,
  years,
  onUseAdjusted,
}: {
  open: boolean
  onClose: () => void
  /** The amount as typed, in today's money. */
  amount: number
  years: number
  /** Taking the adjusted figure restates the target at the horizon. The caller has to say so. */
  onUseAdjusted: (adjusted: number, ratePct: number) => void
}): ReactNode {
  const [rate, setRate] = useState(() => nearestRate(INFLATION_PCT))
  const adjusted = inflated(amount, years, rate)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Inflation adjustment"
      sub={`What ${inr(amount)} today costs in ${years < 1 ? 'under a year' : `${Math.round(years)} years`}`}
      footer={
        <>
          <Button
            full
            onClick={() => {
              onUseAdjusted(adjusted, rate)
              onClose()
            }}
          >
            Use the adjusted amount
          </Button>
          <div className="mt-1.5 flex justify-center">
            <TextLink onClick={onClose}>Keep the original amount</TextLink>
          </div>
        </>
      }
    >
      <div className="pt-1">
        <span className="mb-2 block text-[13px] font-semibold text-ink">
          Assumed inflation rate
        </span>
        <div className="flex gap-2" role="radiogroup" aria-label="Assumed inflation rate">
          {RATES.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={r === rate}
              onClick={() => setRate(r)}
              className={`ds-press h-11 min-w-0 flex-1 rounded-pill text-[14px] font-semibold tabular-nums ${
                r === rate
                  ? 'border-0 bg-accent text-on-accent'
                  : 'border-[1.5px] border-solid border-hairline bg-surface text-ink-mid'
              }`}
            >
              {r}%
            </button>
          ))}
        </div>
        <p className="mb-0 mt-2 text-xs leading-snug text-ink-soft">
          Your plan assumes {INFLATION_PCT}% a year. Whole numbers only — a rate you pick is a
          guess, and a guess to one decimal place is a guess pretending.
        </p>

        <div className="my-4 border-0 border-t border-solid border-hairline-mint" />

        <div className="flex items-baseline justify-between gap-3 py-1">
          <span className="text-[15px] font-semibold text-ink">Inflation adjusted amount</span>
          <span className="text-[17px] font-bold tabular-nums text-ink">{inr(adjusted)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-1">
          <span className="text-[15px] text-ink-soft">Original amount</span>
          <span className="text-[15px] font-semibold tabular-nums text-ink-soft">
            {inr(amount)}
          </span>
        </div>

        <p className="mb-1 mt-4 text-xs leading-relaxed text-ink-soft">
          Prices rise while you save, so {inr(amount)} today is {inr(adjusted)} by the time you buy.
          Take the adjusted amount and your plan is told the target is in future rupees — it funds
          it at the full assumed return and nothing is counted twice. Keep the original and the
          target stays in money you recognise now, with the price rises handled in the projection.
        </p>
      </div>
    </Sheet>
  )
}
