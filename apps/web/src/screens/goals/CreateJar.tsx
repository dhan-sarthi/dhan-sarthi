/**
 * Create a jar — the destination, then what funds it.
 *
 * Two steps, which is the reference's own split: `create-jar-form` takes the name, the duration
 * and the amount, and `jar-investment-details` takes the SIP and the lump sum and says whether
 * the pair reaches the target. Both are here because they are one decision — the amount you pick
 * is only sensible once you have seen what it costs a month — and because there is one thing to
 * save at the end of them.
 *
 * ## What is actually written
 *
 * `PATCH /api/v1/session/goal` takes one field: `targetAmount`. So the amount is real, the plan
 * is re-cut against it and a new roadmap version is kept with the reason — and the name, the
 * date and the funding split are live inputs that drive every figure on screen and are then let
 * go. That is stated on the screen rather than hidden, and it is not papered over by keeping a
 * second copy of a goal in the browser: two stores would put two answers on screen and the wrong
 * one would be the pretty one. The missing fields are named in the handover, not invented here.
 *
 * ## Why the numbers here match the plan that follows
 *
 * `requiredMonthly` in `lib/projection.ts` is core's function line for line, and `fundingRatePct`
 * in `jar.ts` is the rate branch out of `buildRoadmap`'s goal stage. A customer who is quoted
 * ₹18,400 a month here and ₹22,000 on Plan a second later is right to stop believing both.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarDays, ChevronRight, RotateCcw } from 'lucide-react'
import type { Roadmap, Snapshot } from '@dhan/contracts'
import { api, isApiError } from '../../api/client.ts'
import { Screen } from '../../components/Screen.tsx'
import { StatusBand } from '../../components/StatusBand.tsx'
import { Checkbox, Field, MoneyInput, Stepper, TextInput } from '../../components/Form.tsx'
import { Button, Card, Head, Leader, TextLink } from '../../components/ui.tsx'
import { approx, inr, inWords, longDate, monthYear } from '../../lib/money.ts'
import { futureValue, requiredLumpSum, requiredMonthly } from '../../lib/projection.ts'
import { InflationSheet } from './InflationSheet.tsx'
import {
  addMonths,
  existingTowards,
  fundingRatePct,
  inflationMayMoveTarget,
  monthsBetween,
} from './jar.ts'

interface Adjustment {
  ratePct: number
  from: number
}

export function CreateJar({
  snapshot,
  roadmap,
  asOf,
  onBack,
  onSaved,
  onOpenProfile,
}: {
  snapshot: Snapshot
  roadmap: Roadmap
  asOf: string
  onBack: () => void
  /** Announced by the shell, which also re-reads the view — the plan changed underneath. */
  onSaved: (message: string) => void
  /** The profile strip's destination. Left out, the strip is a statement rather than a link. */
  onOpenProfile?: (() => void) | undefined
}): ReactNode {
  const goal = roadmap.goal
  const initialMonths = monthsBetween(asOf, goal.targetDate)

  const [step, setStep] = useState<'target' | 'funding'>('target')
  const [name, setName] = useState(goal.purpose ?? 'My jar')
  const [years, setYears] = useState(Math.floor(initialMonths / 12))
  const [months, setMonths] = useState(initialMonths % 12)
  const [amount, setAmount] = useState(goal.targetAmount)
  const [adjustment, setAdjustment] = useState<Adjustment | null>(null)
  const [inflationOpen, setInflationOpen] = useState(false)

  const totalMonths = Math.max(1, years * 12 + months)
  const horizonYears = totalMonths / 12
  const by = addMonths(asOf, totalMonths)
  const ratePct = fundingRatePct(goal.kind, horizonYears)
  const mayInflate = inflationMayMoveTarget(goal.kind, horizonYears)

  /* What already counts towards this target, and therefore what the recommendation may lean on:
     the invested corpus for a growth goal, the reachable balances for a buffer. */
  const existing = existingTowards(goal.kind, snapshot) ?? 0
  /*
   * A debt payoff is not a pot, so it does not get the funding screen.
   *
   * An SIP recommendation against a balance owed at 34.8% would be advice this app exists to
   * refuse: nothing on the shelf returns that, so every rupee belongs at the debt, and the route
   * already puts it first. Step two says that instead of inventing a rate to save at.
   */
  const isDebt = goal.kind === 'debt_payoff'
  const debtStage = roadmap.stages.find((s) => s.kind === 'clear_debt' && s.targetAmount > 0)
  /*
   * Whether the balance actually clears, and this is not a nicety.
   *
   * `monthsToClear` returns null where the payment does not beat the interest, and `buildRoadmap`
   * then falls back to 120 months so the stage has *a* length — which means `completesOn` on a
   * debt that never clears is a date that will never arrive. Printing it as "clear by October
   * 2036" is the exact thing core's own comment says is not a rounding error. Same test as core's:
   * the payment against the interest at the current balance.
   */
  const debtPrincipal = debtStage?.targetAmount ?? amount
  const debtInterest = Math.round((debtPrincipal * snapshot.debt.highestRate) / 100 / 12)
  const debtClears = debtStage !== undefined && debtStage.monthly > debtInterest

  const recommendedSip = requiredMonthly(amount, horizonYears, ratePct, existing)
  const recommendedLump = requiredLumpSum(amount, horizonYears, ratePct, existing)

  const [sipOn, setSipOn] = useState(true)
  const [lumpOn, setLumpOn] = useState(false)
  const [sip, setSip] = useState<number | null>(null)
  const [lump, setLump] = useState(0)
  /* Null means "whatever is recommended", so the field follows the target until it is typed in.
     Seeding state from a prop and then letting it drift is how a form starts lying. */
  const sipValue = sip ?? recommendedSip

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const monthly = sipOn ? sipValue : 0
  const upfront = lumpOn ? lump : 0
  const reached = futureValue(monthly, horizonYears, ratePct, existing + upfront)
  const enough = reached >= amount
  /* The reference's "SIP can be reduced to ₹12,000", made true: it is what the monthly falls to
     once the lump sum is doing part of the work. */
  const reducedTo = requiredMonthly(amount, horizonYears, ratePct, existing + upfront)
  const overDeployable = monthly > snapshot.surplus.deployable

  const save = async (): Promise<void> => {
    if (amount <= 0) return
    setBusy(true)
    setError(null)
    try {
      await api('setGoal', { body: { targetAmount: Math.round(amount) } })
      onSaved(`Target set to ${approx(amount)}. A new version of the plan is on the record.`)
      onBack()
    } catch (err) {
      setError(isApiError(err) ? err.message : 'That could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  /* ---------------------------------------------------------- Step 1 */

  if (step === 'target') {
    return (
      <Screen
        header={<Head onBack={onBack} title="Create a jar" sub="What you are saving for" />}
        footer={
          <Button full disabled={amount <= 0} onClick={() => setStep('funding')}>
            Continue
          </Button>
        }
        after={
          <InflationSheet
            open={inflationOpen}
            onClose={() => setInflationOpen(false)}
            amount={adjustment ? adjustment.from : amount}
            years={horizonYears}
            mayMoveTarget={mayInflate}
            onUseAdjusted={(adjusted, rate) => {
              setAdjustment({ ratePct: rate, from: adjustment ? adjustment.from : amount })
              setAmount(adjusted)
            }}
          />
        }
      >
        <Card tint="white">
          <Field label="Jar name">
            <TextInput
              ariaLabel="Jar name"
              value={name}
              maxLength={40}
              onChange={setName}
              placeholder="A house deposit"
            />
          </Field>

          {/* No duration control on a debt payoff. You do not choose when a balance clears — the
              payment chooses it, amortised, and offering a picker beside a date the engine has
              already worked out would put two answers on one screen. */}
          {isDebt ? (
            <p className="mb-4 mt-1 flex items-start gap-1.5 text-[13px] leading-snug text-ink-soft">
              <CalendarDays
                size={15}
                strokeWidth={2.1}
                className="mt-0.5 flex-none"
                aria-hidden="true"
              />
              <span>
                There is no date to pick. A balance clears when the payments clear it
                {debtStage && debtClears
                  ? ` — ${monthYear(debtStage.completesOn)}, at ${inr(debtStage.monthly)} a month.`
                  : debtStage
                    ? `, and at ${inr(debtStage.monthly)} a month against ${inr(debtInterest)} of interest, this one does not yet.`
                    : ', worked out from what you can pay.'}
              </span>
            </p>
          ) : (
            <>
              <span className="mb-1.5 block text-[13px] font-semibold text-ink">
                Target duration
              </span>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <label className="flex items-center gap-3">
                  <span className="text-[13px] text-ink-soft">Years</span>
                  <Stepper value={years} min={0} max={40} suffix="Y" onChange={setYears} />
                </label>
                <label className="flex items-center gap-3">
                  <span className="text-[13px] text-ink-soft">Months</span>
                  <Stepper value={months} min={0} max={11} suffix="M" onChange={setMonths} />
                </label>
              </div>
              <p className="mb-4 mt-2.5 flex items-center gap-1.5 text-[13px] text-ink-soft">
                <CalendarDays
                  size={15}
                  strokeWidth={2.1}
                  className="flex-none"
                  aria-hidden="true"
                />
                Reaches {longDate(by)}
              </p>
            </>
          )}

          <Field label="Amount needed" hint={amount > 0 ? inWords(amount) : undefined}>
            <MoneyInput
              ariaLabel="Amount needed"
              value={amount}
              onChange={(n) => {
                setAmount(n)
                setAdjustment(null)
              }}
            />
          </Field>

          {isDebt ? (
            <p className="m-0 -mt-1 text-[13px] leading-snug text-ink-soft">
              A balance owed does not inflate — it accrues, at {snapshot.debt.highestRate}% a year,
              and the plan amortises against that rather than against a price index.
            </p>
          ) : mayInflate ? (
            <div className="-mt-1 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <Checkbox
                  checked={adjustment !== null}
                  onChange={(next) => {
                    if (next) setInflationOpen(true)
                    else if (adjustment) {
                      setAmount(adjustment.from)
                      setAdjustment(null)
                    }
                  }}
                >
                  {adjustment
                    ? `Adjusted for ${adjustment.ratePct}% inflation, from ${inr(adjustment.from)}`
                    : 'Consider inflation'}
                </Checkbox>
              </div>
              <TextLink size="sm" onClick={() => setInflationOpen(true)}>
                {adjustment ? 'Change rate' : 'Adjust'}
              </TextLink>
            </div>
          ) : (
            <div className="-mt-1 flex items-center justify-between gap-2">
              <p className="m-0 min-w-0 flex-1 text-[13px] leading-snug text-ink-soft">
                Over a horizon this long the plan handles inflation in the projection, so this
                target stays in today&rsquo;s money.
              </p>
              <TextLink size="sm" onClick={() => setInflationOpen(true)}>
                See it
              </TextLink>
            </div>
          )}
        </Card>

        <Card tint="sky">
          <h2>{approx(amount)}</h2>
          <p className="m-0 mt-1.5 text-[13px] text-ink-soft">
            {isDebt
              ? `outstanding at ${snapshot.debt.highestRate}%`
              : `by ${monthYear(by)}${adjustment ? `, in ${by.slice(0, 4)} rupees` : ', in today’s money'}`}
          </p>
          {isDebt ? (
            <p className="mb-0 mt-3 text-[13.5px] leading-relaxed text-ink-mid">
              This one is a balance to clear rather than a pot to fill, so there is no rate to save
              at — the next screen shows what the plan is already paying at it.
            </p>
          ) : (
            <>
              <p className="m-0 mt-3 text-[14px] font-semibold leading-snug text-ink">
                About {inr(recommendedSip)} a month, or {approx(recommendedLump)} up front.
              </p>
              <p className="mb-0 mt-1 text-[13px] leading-snug text-ink-mid">
                At an assumed {ratePct}% a year
                {existing > 0 ? `, on top of the ${approx(existing)} you already hold` : ''}. The
                next screen is where you set it.
              </p>
            </>
          )}
        </Card>
      </Screen>
    )
  }

  /* ---------------------------------------------------------- Step 2 */

  return (
    <Screen
      header={
        <Head
          onBack={() => setStep('target')}
          title={name || 'Your jar'}
          sub={
            isDebt
              ? `${approx(amount)} outstanding at ${snapshot.debt.highestRate}%`
              : `Target of ${approx(amount)} by ${by.slice(0, 4)}`
          }
        />
      }
      footer={
        <>
          <Button full busy={busy} disabled={amount <= 0} onClick={() => void save()}>
            Save this target
          </Button>
          <p className="mb-0 mt-2.5 text-center text-xs leading-snug text-ink-soft">
            {isDebt
              ? 'Saving changes the target figure on your goal. It does not change what you owe, and while an expensive debt is top of the ladder the plan will keep proposing it — the record cannot hold a different kind of goal yet.'
              : 'The target is saved and the plan is re-cut against it. The name, the date and the split above are yours on this screen only — the goal record has one field the app can change.'}
          </p>
        </>
      }
    >
      {/* The reference's lavender profile strip. Real here: the risk profile is the customer's
          own and it is what the suitability rules are read against. */}
      {onOpenProfile ? (
        <button
          type="button"
          onClick={onOpenProfile}
          className="ds-press -mx-4 mb-3 flex w-full items-center gap-3 border-0 bg-legend-chip px-4 py-3 text-left"
        >
          <span className="min-w-0 flex-1 text-[14px] text-ink">
            Your investment profile is{' '}
            <span className="font-semibold">{snapshot.customer.riskProfile}</span>
          </span>
          <ChevronRight size={18} strokeWidth={2.2} className="flex-none text-brand-deep" />
        </button>
      ) : (
        <div className="-mx-4 mb-3 bg-legend-chip px-4 py-3 text-[14px] text-ink">
          Your investment profile is{' '}
          <span className="font-semibold">{snapshot.customer.riskProfile}</span>
        </div>
      )}

      {isDebt ? (
        <Card tint="white">
          <h2>What this costs</h2>
          <p className="m-0 mt-1.5 text-[13.5px] leading-relaxed text-ink-mid">
            There is no SIP to size here. Nothing on the shelf returns {snapshot.debt.highestRate}%
            a year, so every rupee that can go at this balance beats every rupee that goes anywhere
            else, and the plan already sends it there first.
          </p>
          <div className="mb-1.5 mt-3">
            <Leader label="Rate on the balance" value={`${snapshot.debt.highestRate}%`} />
            {/* `monthlyInterest` in core, inline: the balance times the rate over twelve. It is
                the number that ends the argument, and it is emphatically not `debt.monthlyOutgo`
                — that is the EMIs leaving across every loan, a different figure that was sitting
                under this label until somebody added the two up. */}
            <Leader label="Interest accruing" value={`${inr(debtInterest)} a month`} />
            <Leader
              label="Repayments leaving now"
              value={`${inr(snapshot.debt.monthlyOutgo)} a month`}
            />
            {debtStage ? (
              <>
                <Leader filled label="Going at it" value={`${inr(debtStage.monthly)} a month`} />
                {/* No date on a balance that is growing. See the note above `debtClears`. */}
                {debtClears ? (
                  <Leader total label="Clear by" value={monthYear(debtStage.completesOn)} />
                ) : null}
              </>
            ) : null}
          </div>
          {debtStage ? (
            <StatusBand
              tone={debtClears ? 'solid' : 'bad'}
              label={
                debtClears
                  ? 'The plan is paying at it.'
                  : debtStage.monthly > 0
                    ? 'This does not clear at that rate.'
                    : 'Nothing is going at it.'
              }
            >
              {debtClears
                ? `${inr(debtStage.monthly)} a month, clearing ${approx(debtStage.targetAmount)} by ${monthYear(debtStage.completesOn)}.`
                : debtStage.monthly > 0
                  ? `The interest alone is ${inr(debtInterest)} a month and ${inr(debtStage.monthly)} is going at it, so the balance grows. There is no date to give you — it is not a slow plan, it is not a plan.`
                  : 'Your statements show nothing spare once the commitments and a normal month are out, so the plan has committed nothing to it yet.'}
            </StatusBand>
          ) : null}
        </Card>
      ) : (
        <Card tint="white">
          <div className="flex items-start justify-between gap-3">
            <h2>Investment details</h2>
            <TextLink
              size="sm"
              onClick={() => {
                setSipOn(true)
                setSip(null)
                setLumpOn(false)
                setLump(0)
              }}
            >
              <RotateCcw size={14} strokeWidth={2.4} />
              Reset
            </TextLink>
          </div>
          <p className="m-0 mt-1.5 text-[13.5px] leading-relaxed text-ink-mid">
            We suggest an SIP of {inr(recommendedSip)} a month, or {approx(recommendedLump)} as a
            lump sum. Either reaches {approx(amount)} by {by.slice(0, 4)} at an assumed {ratePct}%.
          </p>

          <div className="mt-2">
            <Checkbox checked={sipOn} onChange={setSipOn}>
              Monthly SIP
            </Checkbox>
            {sipOn ? (
              <div className="mt-1.5">
                <MoneyInput ariaLabel="Monthly SIP" value={sipValue} onChange={setSip} />
                <p className="mb-0 mt-1.5 text-[13px] text-ink-soft">
                  {upfront > 0 ? (
                    <>
                      With {approx(upfront)} up front, the SIP can be reduced to{' '}
                      <span className="font-semibold text-ink">{inr(reducedTo)}</span>
                    </>
                  ) : (
                    <>
                      {inr(snapshot.surplus.deployable)} a month is what your statements say you
                      have free
                    </>
                  )}
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-2">
            <Checkbox checked={lumpOn} onChange={setLumpOn}>
              Lump sum
            </Checkbox>
            {lumpOn ? (
              <div className="mt-1.5">
                <MoneyInput ariaLabel="Lump sum" value={lump} onChange={setLump} />
                <p className="mb-0 mt-1.5 text-[13px] text-ink-soft">
                  {inr(snapshot.balances.savings)} sits in your savings accounts today
                </p>
              </div>
            ) : null}
          </div>

          {/*
           * The reference's green banner, and the two counterparts it never filmed — its own spec
           * records that no negative variant appears anywhere in 74 seconds.
           *
           * Three states, not two, and the third is the one that matters here. "Reaches the
           * target" and "is affordable" are different questions, and a solid green banner over an
           * amount the suitability rules would refuse is the app congratulating a customer on a
           * mandate it will not open. So arithmetic-yes-but-unaffordable gets the amber.
           */}
          <StatusBand
            live
            tone={!enough ? 'bad' : overDeployable ? 'warn' : 'solid'}
            label={
              !enough
                ? 'That falls short.'
                : overDeployable
                  ? 'That reaches it — on paper.'
                  : 'That reaches it.'
            }
          >
            {!enough
              ? `${approx(reached)} by ${by.slice(0, 4)} against ${approx(amount)} — about ${approx(Math.max(0, amount - reached))} short. ${inr(reducedTo)} a month closes it.`
              : overDeployable
                ? `${approx(reached)} by ${by.slice(0, 4)}, but ${inr(monthly)} a month is more than your statements say you have free.`
                : `${approx(reached)} by ${by.slice(0, 4)} on the illustration below, against a target of ${approx(amount)}.`}
          </StatusBand>
        </Card>
      )}

      {!isDebt && overDeployable ? (
        <Card tint="clay">
          <h2>More than you have spare</h2>
          <p className="m-0 mt-1.5 text-[13.5px] leading-relaxed text-ink-mid">
            {inr(monthly)} a month is {inr(monthly - snapshot.surplus.deployable)} more than the{' '}
            {inr(snapshot.surplus.deployable)} your statements say is free once the commitments and
            a normal month&rsquo;s spending are out. The suitability rules check an amount against
            that same figure, so a mandate this size is one the bank would refuse to start.
          </p>
        </Card>
      ) : null}

      {!isDebt ? (
        <Card>
          <h2>What this assumes</h2>
          <div className="mb-1.5 mt-2.5">
            <Leader label="Assumed annual return" value={`${ratePct}%`} />
            <Leader label="For" value={`${years}y ${months}m`} />
            {existing > 0 ? (
              <Leader label="Already invested" value={approx(existing)} filled />
            ) : null}
            {upfront > 0 ? <Leader label="Lump sum" value={approx(upfront)} filled /> : null}
            {monthly > 0 ? <Leader label="Each month" value={inr(monthly)} filled /> : null}
            <Leader total label="Target" value={approx(amount)} />
          </div>
          <p className="mb-0 mt-3 text-xs leading-relaxed text-ink-soft">{roadmap.disclaimer}</p>
        </Card>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-sm bg-danger-soft px-3 py-2.5 text-[13px] leading-snug text-danger"
        >
          {error}
        </p>
      ) : null}
    </Screen>
  )
}
