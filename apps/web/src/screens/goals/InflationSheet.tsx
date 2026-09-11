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
 * ## The one place this refuses the reference
 *
 * `packages/core/src/goal.ts` states targets in **today's money** on purpose, and records what
 * happened when it did not: a retirement number inflated forward to 60 came out at ₹11.48 crore,
 * overflowed the card, read as absurd and made every plan infeasible. So the engine funds a
 * long-horizon target at the *real* rate — nominal less inflation — and `Goal` carries no field
 * saying which money an amount is in.
 *
 * That makes the reference's button safe under ten years and wrong above it. Under ten years the
 * engine funds at the nominal rate, so a target restated in the rupees of the year it lands is
 * funded correctly, and "what the car costs in 2031" is the truer thing to save for. At ten years
 * and beyond, handing the engine an inflated target has it discount for inflation a second time:
 * the customer would be told to save far more than they need for a reason nobody could see. So
 * the sheet still shows both figures — the question is a fair one and the answer is interesting —
 * and offers to move the target only where moving it is right.
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
  /** False on a ten-year-plus growth target. See the header. */
  mayMoveTarget,
  onUseAdjusted,
}: {
  open: boolean
  onClose: () => void
  /** The amount as typed, in today's money. */
  amount: number
  years: number
  mayMoveTarget: boolean
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
        mayMoveTarget ? (
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
        ) : (
          <Button full onClick={onClose}>
            Keep today&rsquo;s amount
          </Button>
        )
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
          Your plan assumes {INFLATION_PCT}% a year. The chips are whole numbers because a rate you
          pick is a guess, and a guess to one decimal place is a guess pretending.
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
          {mayMoveTarget
            ? `Prices rise while you save, so ${inr(amount)} of something today is ` +
              `${inr(adjusted)} of it by the time you buy. Taking the adjusted amount aims at the ` +
              `second figure; your plan funds a target of this length at the full assumed return, ` +
              `so nothing is counted twice.`
            : `Over a horizon this long your plan already handles inflation, and it handles it in ` +
              `the projection rather than in the target: the target stays in money you recognise ` +
              `today and the contribution is sized at the return net of inflation. Moving the ` +
              `target as well would charge you for the same price rises twice, which is why the ` +
              `figure above is here to look at and not to save into.`}
        </p>
      </div>
    </Sheet>
  )
}
