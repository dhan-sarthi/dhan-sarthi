/**
 * The chrome the first-run funnel wears, taken from SmartWealth's own signup screens.
 *
 * Three pieces, and the frames are the argument for each:
 *
 * - **A brand lockup in the app bar.** `02-onboarding/03-register-mobile` and `06-otp-verify`
 *   both carry it, left-aligned, above the stepper, on every step of the funnel — a bank badge
 *   over a product wordmark. It is also the whole of `01-splash`. Ours had nothing: the first
 *   screen anyone saw after picking a customer opened on a headline with four grey bars above it
 *   and no indication of whose app it was. This is why the reference bothers.
 *
 * - **A named stepper.** The reference's is `(1) Identify · (2) Authenticate · (3) Verify` —
 *   numbered discs and words, so the funnel says how long it is and what each part is for. Four
 *   anonymous 4px segments say only "there is more". Ours names its own three, because its
 *   funnel is not a KYC funnel: it reads, it asks, it hands over a plan.
 *
 * - **A rail that tracks sub-progress, not steps.** Measured on frame 03 the fill is ~16% of the
 *   width while step 1 of 3 is active — not a clean third, so it moves inside a step as well as
 *   between them. Ours does the same: the optional "what you own" detour advances the rail
 *   without advancing the stepper, which is exactly what it is.
 *
 * The footer is `Screen`'s, and that is the other half of the fix. Every step used to end with a
 * button floating in the middle of the screen above 400px of white, because the content was
 * short and the button came after it. The reference pins its primary action to the bottom on
 * every one of these screens.
 */
import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { Screen } from '../../components/Screen.tsx'

/**
 * The three parts of this funnel, in order, as the stepper names them.
 *
 * Not exported as a value: a module that exports a constant alongside its components loses fast
 * refresh, and the only thing outside this file needs is the name of the step it is on.
 */
const STEPS = ['Accounts', 'About you', 'Ready'] as const
export type StepName = (typeof STEPS)[number]

export function BrandBar(): ReactNode {
  return (
    <div className="flex flex-none items-center px-4 pb-3 pt-4">
      <span className="block">
        {/*
         * The badge is the bank and the wordmark is the product, stacked, the way the reference
         * stacks HDFC BANK over SmartWEalth. Caps and tracking are allowed here for the same
         * reason they are allowed on an eyebrow: it is a mark, not a sentence.
         */}
        <span className="inline-flex items-center rounded-[4px] bg-brand-deep px-1.5 py-[3px] text-[9.5px] font-bold uppercase leading-none tracking-[0.09em] text-on-dark">
          IDBI Bank
        </span>
        <span className="mt-[5px] block text-[19px] font-bold leading-none tracking-tight text-brand-deep">
          Dhan <span className="text-accent-text">Sarthi</span>
        </span>
      </span>
    </div>
  )
}

/**
 * The numbered row and the rail under it.
 *
 * A step behind the current one is a filled disc with a tick rather than a numeral — the
 * reference never advances far enough to show one, so this is the obvious completion of its
 * shape rather than something read off a frame.
 */
export function Stepper({ at, fill }: { at: StepName; fill: number }): ReactNode {
  const index = STEPS.indexOf(at)
  return (
    <div className="flex-none">
      <div className="flex items-center gap-3 px-4 pb-3">
        {STEPS.map((name, i) => {
          const done = i < index
          const here = i === index
          return (
            <span key={name} className="flex min-w-0 flex-1 items-center gap-2">
              <span
                aria-hidden="true"
                className={`grid size-7 flex-none place-items-center rounded-pill border-[1.5px] border-solid text-[13px] font-bold transition-colors duration-300 ${
                  done
                    ? 'border-accent bg-accent text-on-accent'
                    : here
                      ? 'border-accent bg-surface text-accent-text'
                      : 'border-hairline-mint bg-surface text-ink-faint'
                }`}
              >
                {done ? <Check size={15} strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={`min-w-0 truncate text-[13.5px] transition-colors duration-300 ${
                  here ? 'font-bold text-ink' : 'font-medium text-ink-soft'
                }`}
              >
                {name}
              </span>
            </span>
          )
        })}
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fill * 100)}
        aria-label={`Step ${index + 1} of ${STEPS.length}: ${at}`}
        className="h-[3px] w-full bg-ground-deep"
      >
        <span
          className="block h-full rounded-r-pill bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${Math.round(fill * 100)}%` }}
        />
      </div>
    </div>
  )
}

/**
 * One step of the funnel: the chrome above, the content in the scroller, the action pinned.
 *
 * `Screen` rather than a hand-rolled column, for the reason `DESIGN.md` gives — the ordering of
 * header, scroller and footer is the one thing a screen must not get wrong twice.
 */
export function Funnel({
  at,
  fill,
  action,
  children,
}: {
  at: StepName
  fill: number
  /** The pinned primary action. Every step has exactly one. */
  action: ReactNode
  children: ReactNode
}): ReactNode {
  return (
    <Screen
      header={
        <>
          <BrandBar />
          <Stepper at={at} fill={fill} />
        </>
      }
      footer={action}
    >
      <div className="pt-5">{children}</div>
    </Screen>
  )
}

/**
 * A full-bleed section band — the reference's `BANK DETAILS` / `DEMAT DETAILS` /
 * `PERSONAL DETAILS` strips on `05-profile-kyc-details`, and `DESIGN.md`'s own recipe for
 * grouping rows. It is what turns a list of facts into sections you can read at a glance.
 */
export function Band({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="-mx-4 bg-ground-deep px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-accent-text">
      {children}
    </div>
  )
}

/** A label above a value, two to a row — the grid under each band on the same frame. */
export function Detail({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="min-w-0">
      <div className="text-[12.5px] leading-snug text-ink-soft">{label}</div>
      <div className="mt-0.5 truncate text-[15px] font-semibold tabular-nums text-ink">{value}</div>
    </div>
  )
}

export function DetailGrid({ children }: { children: ReactNode }): ReactNode {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-3.5 py-3.5">{children}</div>
}
