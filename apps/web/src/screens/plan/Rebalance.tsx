/**
 * Rebalancing, as one state machine.
 *
 *   intro → add ─┐
 *          └ align ┴→ review → ⟨spine⟩ → gate → OTP → order
 *                              └→ self-report, for the changes that are not a purchase
 *
 * ## What "rebalancing" means here
 *
 * Not what it means in the source. `12-rebalancing/04-rebalance-align-portfolio` compares Equity
 * 85% against Equity 75% and proposes swapping funds to close the difference; doing that needs a
 * look-through into each scheme, a live NAV and a model portfolio, and this app has none of the
 * three. `drift.ts` carries the full argument. What it has instead is a roadmap computed from
 * twelve months of statements and the same statements saying what actually happens each month, so
 * the drift here is a **flow** drift and every figure on these screens is a field on `Snapshot`
 * or on `Roadmap`.
 *
 * The source's two measures survive intact, because they are the only two answers there are:
 * **add more**, or **realign what is already moving**. Its own flow file records that `Continue`
 * serves two measures and never resolves which one it starts — so here they are two pressable
 * rows and the ambiguity does not ship.
 *
 * ## Where it ends, and the gate
 *
 * `12-rebalancing.md` → Gaps §4: *"No order-review, consent, OTP/authorisation, processing, or
 * success screen appears anywhere in this video."* The commit half was never filmed, and this app
 * already has the right one — the transaction spine in `screens/invest/`, built in step 3, behind
 * `packages/core/src/suitability.ts`. So this flow does not grow a second checkout. It ends at a
 * reviewed set of changes, and each change goes where its own nature sends it:
 *
 * - **A purchase** — start a term policy, start or raise a SIP, open a sweep-in — hands off to
 *   `Invest`, which means it passes the suitability gate on the same snapshot the order is built
 *   from, and a `BLOCKED` verdict stops the sale with the rule's own sentence. `07-DECISIONS.md`
 *   §3, unchanged and not routed around.
 * - **Everything else** — a card repayment, a spending cap, an arrear — has nothing to place, so
 *   it ends at the self-report the app already has (`decideAction`: did_it / declined / deferred
 *   / pushed_back). Where the parent wires `onDecide` and the daily plan carries a matching
 *   action, the buttons are here; where it does not, the change is still stated and says so.
 *
 * ## The empty state
 *
 * Designed, not observed — the source has no empty state anywhere and its brief says so. A
 * customer whose plan has not drifted gets a screen that says which checks were run and what each
 * one found, because "nothing to do" is only reassuring if you can see what was looked at.
 */
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Action, DecisionKind, ShelfProduct, Stage, Verdict, View } from '@dhan/contracts'
import {
  ArrowRight,
  ChartPie,
  CheckCircle2,
  Info,
  Scale,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { AllocationCompare } from '../../components/charts/index.ts'
import { Checkbox, Field, MoneyInput } from '../../components/Form.tsx'
import { Screen } from '../../components/Screen.tsx'
import { Sheet } from '../../components/Sheet.tsx'
import { StatusBand } from '../../components/StatusBand.tsx'
import { Button, Card, Eyebrow, Head, Leader, Pill, TextLink } from '../../components/ui.tsx'
import { approx, inr, monthYear } from '../../lib/money.ts'
import { futureValue, requiredLumpSum, requiredMonthly } from '../../lib/projection.ts'
/* The rate the engine will actually fund this target at, mirrored once in `goals/jar.ts` and
   proved against core there. Re-deriving it here would be a third copy of one branch, and the
   screen quoting a different monthly than the plan is the exact failure that comment warns of. */
import { fundingRatePct } from '../goals/jar.ts'
import { Invest } from '../invest/Invest.tsx'
import { BenefitCards, ChangeBand, Constituent, MeasureRow } from './parts.tsx'
import {
  changesFor,
  changeTotals,
  detectDrift,
  driftFor,
  fundingStage,
  investingNow,
  monthlyIncome,
  monthlyInterest,
  monthPair,
  monthsToClear,
  paymentToClear,
} from './drift.ts'
import type { Change, Drift } from './drift.ts'

type Step = 'intro' | 'add' | 'align' | 'review'

const NOTE = 'text-xs leading-relaxed text-ink-soft'

export interface RebalanceDecisions {
  /** The daily plan's actions, so a behavioural change can carry its real self-report. */
  actions: readonly Action[]
  /** Action ids already decided this session. */
  decided: ReadonlySet<string>
  enabled: boolean
  busy: boolean
  onDecide: (action: Action, kind: DecisionKind) => void
}

export function Rebalance({
  view,
  evaluate,
  onBack,
  onSeeRecord,
  decisions,
}: {
  view: View
  /** The suitability gate, injected. Same call the rest of the spine makes. */
  evaluate: (productId: string, monthly: number) => Promise<Verdict>
  onBack: () => void
  onSeeRecord: () => void
  /** Left out, the behavioural changes are stated without buttons and the screen says why. */
  decisions?: RebalanceDecisions | undefined
}): ReactNode {
  const { roadmap, snapshot } = view
  const [step, setStep] = useState<Step>('intro')
  const [extraMonthly, setExtraMonthly] = useState(0)
  const [wantsMonthly, setWantsMonthly] = useState(true)
  const [lumpSum, setLumpSum] = useState(0)
  const [wantsLump, setWantsLump] = useState(false)
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set())
  const [buying, setBuying] = useState<ShelfProduct | null>(null)
  const [explaining, setExplaining] = useState<Drift | null>(null)

  const drifts = useMemo(() => detectDrift(roadmap, snapshot), [roadmap, snapshot])
  const sellable = useMemo(() => new Set(view.shelf.map((p) => p.productId)), [view.shelf])
  const changes = useMemo(
    () =>
      changesFor(roadmap, snapshot, drifts, {
        extraMonthly: wantsMonthly ? extraMonthly : 0,
        lumpSum: wantsLump ? lumpSum : 0,
        sellable,
      }),
    [roadmap, snapshot, drifts, wantsMonthly, extraMonthly, wantsLump, lumpSum, sellable],
  )
  const kept = changes.filter((c) => !excluded.has(c.id))

  /* The spine takes the whole screen once it opens, exactly as it does from Discover. There is
     no cart on the server to hold the basket, so the flow that owns it has to stay mounted. */
  if (buying) {
    return (
      <Invest
        view={view}
        initial={buying}
        evaluate={evaluate}
        onExit={() => setBuying(null)}
        onSeeRecord={onSeeRecord}
      />
    )
  }

  const back = (): void => {
    if (step === 'intro') onBack()
    else if (step === 'review') setStep('intro')
    else setStep('intro')
  }

  const header = (
    <Head
      title="Rebalancing"
      sub={
        step === 'add'
          ? 'Add more'
          : step === 'align'
            ? 'Realign what is moving'
            : step === 'review'
              ? 'What would change'
              : (roadmap.goal.purpose ?? 'Your plan')
      }
      onBack={back}
    />
  )

  const sheet = (
    <Sheet
      open={explaining !== null}
      title={explaining?.title ?? ''}
      onClose={() => setExplaining(null)}
    >
      <p className="m-0 text-[15px] leading-relaxed text-ink-mid">{explaining?.detail}</p>
      {explaining && (explaining.planned !== null || explaining.observed !== null) ? (
        <div className="mt-4">
          {explaining.planned !== null ? (
            <Leader label="The plan asks for" value={inr(explaining.planned)} filled />
          ) : null}
          {explaining.observed !== null ? (
            <Leader label="Your statements show" value={inr(explaining.observed)} />
          ) : null}
        </div>
      ) : null}
      <p className={`${NOTE} mb-0 mt-4`}>
        Every figure here is read off your own statements and the plan built from them. Where this
        app cannot see something, it says so rather than showing a zero.
      </p>
    </Sheet>
  )

  if (step === 'intro') {
    return (
      <Screen header={header} after={sheet}>
        <RebalanceIntro
          drifts={drifts}
          roadmap={view.roadmap}
          onPick={setStep}
          onExplain={setExplaining}
        />
      </Screen>
    )
  }

  if (step === 'add') {
    return (
      <AddMore
        view={view}
        drifts={driftFor(drifts, 'add')}
        header={header}
        after={sheet}
        monthly={{ on: wantsMonthly, value: extraMonthly }}
        lump={{ on: wantsLump, value: lumpSum }}
        onMonthly={(on, value) => {
          setWantsMonthly(on)
          setExtraMonthly(value)
        }}
        onLump={(on, value) => {
          setWantsLump(on)
          setLumpSum(value)
        }}
        onExplain={setExplaining}
        onNext={() => setStep('review')}
      />
    )
  }

  if (step === 'align') {
    return (
      <Realign
        view={view}
        drifts={driftFor(drifts, 'realign')}
        header={header}
        after={sheet}
        onExplain={setExplaining}
        onNext={() => setStep('review')}
      />
    )
  }

  return (
    <Review
      changes={changes}
      kept={kept}
      header={header}
      after={sheet}
      roadmap={view.roadmap}
      onToggle={(id, on) =>
        setExcluded((prev) => {
          const next = new Set(prev)
          if (on) next.delete(id)
          else next.add(id)
          return next
        })
      }
      onBuy={(productId) => {
        const product = view.shelf.find((p) => p.productId === productId)
        if (product) setBuying(product)
      }}
      {...(decisions ? { decisions } : {})}
    />
  )
}

/* ---------------------------------------------------------------- Intro */

/**
 * The landing screen: what a rebalance is, and the two measures.
 *
 * `02-rebalance-intro`'s shape — dark hero, white sheet with two measure rows, one action at the
 * foot — with the source's decorative see-saw illustration dropped. There is no IDBI counterpart
 * for it and drawing one would be inventing brand assets; the benefit sub-cards carry the same
 * "here is what this does" job with real content in them.
 */
function RebalanceIntro({
  drifts,
  roadmap,
  onPick,
  onExplain,
}: {
  drifts: readonly Drift[]
  roadmap: View['roadmap']
  onPick: (step: Step) => void
  onExplain: (drift: Drift) => void
}): ReactNode {
  const add = driftFor(drifts, 'add')
  const realign = driftFor(drifts, 'realign')

  if (drifts.length === 0) {
    return <NoDrift roadmap={roadmap} />
  }

  return (
    <>
      <div className="mt-3">
        <BenefitCards
          art="rebalance-balance-dark"
          eyebrow="Rebalancing"
          title="Bring the plan back onto its own figures"
          benefits={[
            {
              icon: <Scale size={18} strokeWidth={2} />,
              title: 'Two measures',
              body: 'Put more in, or move what is already moving. There is no third answer.',
            },
            {
              icon: <ShieldCheck size={18} strokeWidth={2} />,
              title: 'Checked, then placed',
              body: 'Anything this proposes to buy runs past the suitability rules first.',
            },
          ]}
          note={
            drifts.length === 1
              ? 'One thing on your plan has moved away from what it was built on.'
              : `${drifts.length} things on your plan have moved away from what it was built on.`
          }
        />
      </div>

      <p className="mb-1 mt-6 text-[15px] font-semibold leading-snug text-ink">
        Your plan can be brought back on track by taking the following measures
      </p>

      <div className="divide-y divide-solid divide-hairline-mint">
        <MeasureRow
          tone="clay"
          icon={<TrendingUp size={21} strokeWidth={2} />}
          title="Making additional investments"
          body={
            add.length > 0
              ? (add[0]?.detail ?? '')
              : 'Nothing here needs more money. The arithmetic reaches your target at the pace the plan is already running.'
          }
          figure={add.length > 1 ? `${add.length} findings` : undefined}
          onPick={add.length > 0 ? () => onPick('add') : undefined}
        />
        <MeasureRow
          tone="sage"
          icon={<ChartPie size={21} strokeWidth={2} />}
          title="Realigning what is moving"
          body={
            realign.length > 0
              ? (realign[0]?.detail ?? '')
              : 'Your money is going where the plan puts it. Nothing to move.'
          }
          figure={realign.length > 1 ? `${realign.length} findings` : undefined}
          onPick={realign.length > 0 ? () => onPick('align') : undefined}
        />
      </div>

      <Eyebrow>Everything we found</Eyebrow>
      {drifts.map((d) => (
        <Card key={d.id}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Pill tone={d.severity === 'bad' ? 'bad' : 'warn'}>
              {d.severity === 'bad' ? 'Needs attention' : 'Worth watching'}
            </Pill>
            <Pill>{d.measure === 'add' ? 'Add more' : 'Realign'}</Pill>
          </div>
          <h2>{d.title}</h2>
          <p className="mb-0 mt-2 text-sm leading-relaxed text-ink-mid">{d.detail}</p>
          {d.planned !== null || d.observed !== null ? (
            <div className="mt-3">
              {d.planned !== null ? (
                <Leader label="The plan asks for" value={inr(d.planned)} filled />
              ) : null}
              {d.observed !== null ? (
                <Leader label="Your statements show" value={inr(d.observed)} />
              ) : null}
            </div>
          ) : null}
          <div className="-mb-1.5 mt-1.5">
            <TextLink size="sm" flush onClick={() => onExplain(d)}>
              <Info size={15} strokeWidth={2.4} />
              What this is read from
            </TextLink>
          </div>
        </Card>
      ))}
    </>
  )
}

/**
 * The honest empty state.
 *
 * Not a shrug and not an illustration. A customer who opens rebalancing and is told "you're fine"
 * has no way to tell a working check from a broken one, so this names every check that ran. It is
 * the same list `detectDrift` walks, which is what keeps the two from drifting apart.
 */
function NoDrift({ roadmap }: { roadmap: View['roadmap'] }): ReactNode {
  const checks = [
    'Whether the target is still reachable at the pace the plan is running',
    'Whether the plan costs more each month than your statements leave spare',
    'Whether the money the plan asks for is actually leaving the account',
    'Whether the cover the plan proposes is in force',
    'Whether the balance on any expensive debt is falling or growing',
    'Whether reachable money still covers the months the rules require',
    'Whether everyday spending is climbing against the months the plan was cut on',
  ]
  return (
    <>
      <div className="mt-3">
        <Card tint="sage">
          <span
            aria-hidden="true"
            className="grid size-11 place-items-center rounded-sm bg-surface text-brand-deep"
          >
            <CheckCircle2 size={22} strokeWidth={2} />
          </span>
          <h2 className="mt-3">Nothing has drifted</h2>
          <p className="m-0 mt-2 text-sm leading-relaxed text-ink-mid">
            Version {roadmap.version} of your plan still matches what your statements show. There is
            nothing to rebalance, so this screen is not going to invent something to sell you.
          </p>
        </Card>
      </div>

      <Eyebrow>What was checked</Eyebrow>
      <Card>
        <ul className="m-0 list-none space-y-2.5 p-0">
          {checks.map((c) => (
            <li key={c} className="flex gap-2.5 text-sm leading-snug text-ink-mid">
              <CheckCircle2
                size={16}
                strokeWidth={2.2}
                className="mt-0.5 flex-none text-brand"
                aria-hidden="true"
              />
              <span className="min-w-0">{c}</span>
            </li>
          ))}
        </ul>
        <p className={`${NOTE} mb-0 mt-4`}>
          What this cannot check is what is inside each fund. There is no price feed and no
          portfolio disclosure in this app, so nothing here compares one scheme&rsquo;s holdings
          against another&rsquo;s — and a screen that claimed to would be guessing.
        </p>
      </Card>
    </>
  )
}

/* ---------------------------------------------------------------- Add more */

/**
 * Measure one: the funding gap, and what closes it.
 *
 * `03-rebalance-additional-investment`'s shape — the shortfall stated in a band over the goal,
 * then a card with two checkbox-and-amount rows and a footer band that flips as the amounts
 * change — with `06-model-portfolio-input`'s field treatment, which is the cleaner of the two:
 * a checkbox that enables its row, a labelled field, and a helper line under it carrying the
 * limit.
 *
 * Everything numeric here comes from `lib/projection.ts`, which mirrors core's own arithmetic and
 * is proved to (`goals/jar.test.ts`). The rate is on screen and the disclaimer is under it,
 * because a projected corpus presented as a fact is the one thing a risk officer marks us down
 * for — `docs/product/decisions.md` §B2.
 */
function AddMore({
  view,
  drifts,
  header,
  after,
  monthly,
  lump,
  onMonthly,
  onLump,
  onExplain,
  onNext,
}: {
  view: View
  drifts: readonly Drift[]
  header: ReactNode
  after: ReactNode
  monthly: { on: boolean; value: number }
  lump: { on: boolean; value: number }
  onMonthly: (on: boolean, value: number) => void
  onLump: (on: boolean, value: number) => void
  onExplain: (drift: Drift) => void
  onNext: () => void
}): ReactNode {
  const { roadmap, snapshot } = view
  const stage = fundingStage(roadmap)
  const running = investingNow(snapshot)
  const spare = snapshot.surplus.deployable
  const addedMonthly = monthly.on ? monthly.value : 0
  const addedLump = lump.on ? lump.value : 0

  return (
    <Screen
      header={header}
      after={after}
      footer={
        <Button full onClick={onNext}>
          See what would change
          <ArrowRight size={17} strokeWidth={2.4} />
        </Button>
      }
    >
      {stage === null ? (
        <div className="mt-3">
          <Card tint="clay">
            <h2>Nothing here takes money yet</h2>
            <p className="m-0 mt-2 text-sm leading-relaxed text-ink-mid">
              Your route&rsquo;s next step is behavioural — freeing money up, or clearing an arrear
              — so there is no pot for a top-up to go into. Realigning is the measure that applies.
            </p>
          </Card>
        </div>
      ) : stage.kind === 'clear_debt' ? (
        <DebtTopUp
          view={view}
          stage={stage}
          monthly={monthly}
          lump={lump}
          onMonthly={onMonthly}
          onLump={onLump}
        />
      ) : (
        <>
          <GrowthTopUp
            view={view}
            stage={stage}
            running={stage.kind === 'grow' ? running.amount : 0}
            spare={spare}
            added={{ monthly: addedMonthly, lump: addedLump }}
            monthly={monthly}
            lump={lump}
            onMonthly={onMonthly}
            onLump={onLump}
          />
          {/* Only here. The debt branch projects no corpus and quotes no assumed return — an
              illustration disclaimer over an amortisation schedule says the arithmetic above it
              is a guess, which is the opposite of true and devalues the sentence where it
              belongs. */}
          <p className={`${NOTE} mt-1`}>{roadmap.disclaimer}</p>
        </>
      )}

      {drifts.length > 0 ? (
        <>
          <Eyebrow>Why this measure</Eyebrow>
          {drifts.map((d) => (
            <Card key={d.id}>
              <h2>{d.title}</h2>
              <p className="mb-0 mt-2 text-sm leading-relaxed text-ink-mid">{d.detail}</p>
              <div className="-mb-1.5 mt-1.5">
                <TextLink size="sm" flush onClick={() => onExplain(d)}>
                  <Info size={15} strokeWidth={2.4} />
                  What this is read from
                </TextLink>
              </div>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  )
}

/** The measure header — `03-rebalance-additional-investment`'s 64px glyph over a bold title. */
function MeasureHead({
  title,
  sub,
  band,
}: {
  title: string
  sub: string
  band?: ReactNode
}): ReactNode {
  return (
    <div className="mt-3">
      <section className="mb-3 min-w-0 overflow-hidden rounded-md border border-solid border-hairline-mint bg-surface">
        <div className="p-4">
          <span
            aria-hidden="true"
            className="grid size-11 place-items-center rounded-sm bg-tint-clay text-accent-text"
          >
            <TrendingUp size={22} strokeWidth={2} />
          </span>
          <h2 className="mt-3 text-[18px] font-semibold leading-tight text-ink">{title}</h2>
          <p className="m-0 mt-1.5 text-sm leading-relaxed text-ink-soft">{sub}</p>
        </div>
        {band}
      </section>
    </div>
  )
}

/**
 * The two amount rows — `06-model-portfolio-input`'s field treatment, which is the cleaner of the
 * source's two: a checkbox that enables its row, a labelled field, a helper line under it.
 */
function AmountRows({
  monthly,
  lump,
  onMonthly,
  onLump,
  monthlyLabel,
  monthlyHint,
  lumpLabel,
  lumpHint,
}: {
  monthly: { on: boolean; value: number }
  lump: { on: boolean; value: number }
  onMonthly: (on: boolean, value: number) => void
  onLump: (on: boolean, value: number) => void
  monthlyLabel: string
  monthlyHint: string
  lumpLabel: string
  lumpHint: string
}): ReactNode {
  return (
    <div className="mt-3">
      <Checkbox checked={monthly.on} onChange={(on) => onMonthly(on, monthly.value)}>
        Add to the monthly amount
      </Checkbox>
      <div className={monthly.on ? '' : 'pointer-events-none opacity-45'}>
        <Field label={monthlyLabel} hint={monthlyHint}>
          <MoneyInput
            value={monthly.value}
            ariaLabel={monthlyLabel}
            onChange={(n) => onMonthly(monthly.on, n)}
          />
        </Field>
      </div>

      <Checkbox checked={lump.on} onChange={(on) => onLump(on, lump.value)}>
        Add a one-off amount
      </Checkbox>
      <div className={lump.on ? '' : 'pointer-events-none opacity-45'}>
        <Field label={lumpLabel} hint={lumpHint}>
          <MoneyInput
            value={lump.value}
            ariaLabel={lumpLabel}
            onChange={(n) => onLump(lump.on, n)}
          />
        </Field>
      </div>
    </div>
  )
}

/**
 * Topping up a pot that compounds — the growth stage, or the buffer.
 *
 * The rate is **the rate the engine will actually fund this target at**, not a round 10%. A goal
 * ten years out or further is funded at the real rate — nominal less inflation — because the
 * target is stated in today's money, and `goals/jar.ts` mirrors that branch once for exactly this
 * reason: a screen quoting ₹2,612 a month beside a plan quoting ₹9,948 teaches a customer that
 * neither figure means anything.
 */
function GrowthTopUp({
  view,
  stage,
  running,
  spare,
  added,
  monthly,
  lump,
  onMonthly,
  onLump,
}: {
  view: View
  stage: Stage
  running: number
  spare: number
  added: { monthly: number; lump: number }
  monthly: { on: boolean; value: number }
  lump: { on: boolean; value: number }
  onMonthly: (on: boolean, value: number) => void
  onLump: (on: boolean, value: number) => void
}): ReactNode {
  const { roadmap, snapshot } = view
  const years = Math.max(0.25, Math.round((stage.monthsToComplete / 12) * 100) / 100)
  const ratePct = fundingRatePct(roadmap.goal, years)
  const target = stage.targetAmount
  const existing = stage.kind === 'grow' ? snapshot.holdings.equity : snapshot.balances.total
  const nowMonthly = stage.kind === 'grow' ? running : stage.monthly

  const lands = futureValue(nowMonthly, years, ratePct, existing)
  const withExtra = futureValue(nowMonthly + added.monthly, years, ratePct, existing + added.lump)
  const missPct = target > 0 ? Math.max(0, Math.round(((target - lands) / target) * 100)) : 0
  const reaches = withExtra >= target
  const neededMonthly = Math.max(0, requiredMonthly(target, years, ratePct, existing) - nowMonthly)
  /* What a present sum has to cover: the target, less what the monthly already running will
     deliver by then. Quoting the whole target as a lump sum would charge for the same money
     twice — which is what the source's own demo data does, offering "an SIP of ₹20,000 or lump
     sum of ₹14 lakh" against a gap neither figure reconciles with. */
  const neededLump = requiredLumpSum(
    Math.max(0, target - futureValue(nowMonthly, years, ratePct, 0)),
    years,
    ratePct,
    existing,
  )

  return (
    <>
      <MeasureHead
        title="Additional investment"
        sub={`${approx(target)} by ${monthYear(stage.completesOn)}${
          stage.kind === 'grow' ? '' : ' — the emergency buffer'
        }.`}
        band={
          missPct > 0 ? (
            <StatusBand flush tone="bad" label="With what is going in now,">
              you land about {missPct}% short — {approx(lands)} against {approx(target)}, at the{' '}
              {ratePct}% this plan is funded at.
            </StatusBand>
          ) : undefined
        }
      />

      <section className="mb-3 min-w-0 overflow-hidden rounded-md border border-solid border-hairline bg-surface">
        <div className="p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="m-0 text-[18px] font-semibold leading-tight text-ink">
              Set additional investment
            </h2>
            <TextLink
              size="sm"
              flush
              onClick={() => {
                onMonthly(true, Math.min(neededMonthly, Math.max(0, spare)))
                onLump(false, 0)
              }}
            >
              Reset
            </TextLink>
          </div>
          <p className="m-0 mt-1.5 text-sm leading-relaxed text-ink-soft">
            {neededMonthly > 0
              ? `${inr(neededMonthly)} a month more, or about ${approx(neededLump)} in one go, closes the gap at ${ratePct}%.`
              : `Nothing more is needed at ${ratePct}%.`}
          </p>

          <AmountRows
            monthly={monthly}
            lump={lump}
            onMonthly={onMonthly}
            onLump={onLump}
            monthlyLabel="Monthly, on top of what is running"
            monthlyHint={
              spare > 0
                ? `Your statements leave ${inr(spare)} a month spare. Anything above that is money the plan cannot see.`
                : 'Your statements leave nothing spare this month, so anything here has to come from somewhere the plan cannot see yet.'
            }
            lumpLabel="One-off, today"
            lumpHint={
              snapshot.buffer.shortfall > 0
                ? `${inr(snapshot.balances.total)} is reachable, and the plan is still counting on it for the emergency buffer — money moved out of there is money the buffer no longer has.`
                : `${inr(snapshot.balances.total)} is reachable today.`
            }
          />
        </div>

        <StatusBand
          live
          flush
          tone={reaches ? 'solid' : 'warn'}
          label={reaches ? 'That reaches it.' : 'Not there yet.'}
        >
          {reaches
            ? `${approx(withExtra)} by ${monthYear(stage.completesOn)} at ${ratePct}%, against a target of ${approx(target)}.`
            : `${approx(withExtra)} against ${approx(target)}. ${inr(Math.max(0, neededMonthly - added.monthly))} a month more would close it.`}
        </StatusBand>
      </section>
    </>
  )
}

/**
 * Topping up a debt, which does not compound in the customer's favour and must not be drawn as
 * though it does.
 *
 * A corpus projection here would be nonsense — there is no pot, there is a balance at 34.8% — so
 * this screen asks the only question a card actually poses: does the payment beat the interest,
 * and if so by when is it gone. `monthsToClear` returns `null` where it never is, and that is the
 * headline rather than a footnote.
 */
function DebtTopUp({
  view,
  stage,
  monthly,
  lump,
  onMonthly,
  onLump,
}: {
  view: View
  stage: Stage
  monthly: { on: boolean; value: number }
  lump: { on: boolean; value: number }
  onMonthly: (on: boolean, value: number) => void
  onLump: (on: boolean, value: number) => void
}): ReactNode {
  const { snapshot } = view
  const rate = snapshot.debt.highestRate
  const balance = Math.max(stage.targetAmount, 0)
  const interest = monthlyInterest(balance, rate)
  const added = { monthly: monthly.on ? monthly.value : 0, lump: lump.on ? lump.value : 0 }
  const paying = stage.monthly + added.monthly
  const principal = Math.max(0, balance - added.lump)
  const months = monthsToClear(principal, rate, paying)
  const inThree = paymentToClear(principal, rate, 36)
  const spare = snapshot.surplus.deployable

  return (
    <>
      <MeasureHead
        title="Additional repayment"
        sub={`${inr(balance)} outstanding at ${rate}%, which accrues ${inr(interest)} a month in interest alone.`}
        band={
          months === null ? (
            <StatusBand flush tone="bad" label="At this payment the balance grows.">
              {inr(paying)} a month does not cover the {inr(interest)} of interest, so there is no
              payoff date to give you.
            </StatusBand>
          ) : undefined
        }
      />

      <section className="mb-3 min-w-0 overflow-hidden rounded-md border border-solid border-hairline bg-surface">
        <div className="p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="m-0 text-[18px] font-semibold leading-tight text-ink">
              Set additional repayment
            </h2>
            <TextLink
              size="sm"
              flush
              onClick={() => {
                onMonthly(true, Math.max(0, inThree - stage.monthly))
                onLump(false, 0)
              }}
            >
              Reset
            </TextLink>
          </div>
          <p className="m-0 mt-1.5 text-sm leading-relaxed text-ink-soft">
            {inr(inThree)} a month clears it inside three years —{' '}
            {inr(Math.max(0, inThree - stage.monthly))} more than the plan can currently find.
          </p>

          <AmountRows
            monthly={monthly}
            lump={lump}
            onMonthly={onMonthly}
            onLump={onLump}
            monthlyLabel="Monthly, on top of what the plan puts against it"
            monthlyHint={
              spare > 0
                ? `Your statements leave ${inr(spare)} a month spare.`
                : 'Your statements leave nothing spare, which is why the first step on your route is freeing some up.'
            }
            lumpLabel="One-off, today"
            lumpHint={`${inr(snapshot.balances.total)} is reachable. Every rupee off the balance is a rupee that stops accruing at ${rate}%.`}
          />
        </div>

        <StatusBand
          live
          flush
          tone={months === null ? 'bad' : 'solid'}
          label={months === null ? 'Still not clearing.' : 'That clears it.'}
        >
          {months === null
            ? `${inr(paying)} a month against ${inr(interest)} of interest. It has to beat the interest before the balance can fall at all.`
            : `${inr(paying)} a month clears ${inr(principal)} in about ${months} ${months === 1 ? 'month' : 'months'}.`}
        </StatusBand>
      </section>
    </>
  )
}

/* ---------------------------------------------------------------- Realign */

/**
 * Measure two: where the money goes, planned against observed.
 *
 * `AllocationCompare` is the component `12-rebalancing.md` asked to be built once and reused, and
 * this is the screen it was built for. What it compares is not two fund allocations — see the
 * head of `drift.ts` — but two months: the one the roadmap draws and the one the statements show,
 * in rupees, against the same income. Same labels, same order, so the ramp's positional colour
 * means the same thing in both rings, which is the whole reason `align` exists.
 */
function Realign({
  view,
  drifts,
  header,
  after,
  onExplain,
  onNext,
}: {
  view: View
  drifts: readonly Drift[]
  header: ReactNode
  after: ReactNode
  onExplain: (drift: Drift) => void
  onNext: () => void
}): ReactNode {
  const { roadmap, snapshot } = view
  const pair = monthPair(roadmap, snapshot)
  const income = monthlyIncome(snapshot)
  const running = investingNow(snapshot)

  return (
    <Screen
      header={header}
      after={after}
      footer={
        <Button full onClick={onNext}>
          See what would change
          <ArrowRight size={17} strokeWidth={2.4} />
        </Button>
      }
    >
      <div className="mt-3">
        <Card>
          <span
            aria-hidden="true"
            className="grid size-11 place-items-center rounded-sm bg-tint-sage text-brand-deep"
          >
            <ChartPie size={22} strokeWidth={2} />
          </span>
          <h2 className="mt-3">Realign your month</h2>
          <p className="m-0 mt-2 text-sm leading-relaxed text-ink-soft">
            This is not a comparison of what is inside your funds — there is no price feed in this
            app and nothing here will pretend otherwise. It is where your money goes each month:
            what the plan asks for, against what your statements show.
          </p>
        </Card>
      </div>

      {income.amount <= 0 ? (
        <Card tint="clay">
          <h2>There is no month to compare</h2>
          <p className="m-0 mt-2 text-sm leading-relaxed text-ink-mid">
            Nothing in your statements is recognisable as income, and you have not told us what
            comes in. Without that there is no whole for these shares to be shares of, so this
            screen would be drawing a chart out of nothing. Set your income on your profile and this
            becomes a real comparison.
          </p>
        </Card>
      ) : (
        <>
          <div className="mt-2">
            <AllocationCompare
              recommended={pair.planned}
              current={pair.observed}
              total={pair.whole}
              recommendedLabel="What the plan asks of your month"
              currentLabel="What your statements show"
              ribbon="The plan"
              empty="Nothing readable in this month."
            />
          </div>

          <p className={`${NOTE} mt-1`}>
            Both rings are shares of {inr(pair.whole)} a month
            {income.source === 'declared' ? ', the income you declared' : ''}
            {income.source === 'statement' ? ', read off your credits' : ''}.
            {running.source === 'mandates'
              ? ` What is going towards the plan is taken from your recorded mandates rather than from the statement, which does not recognise them.`
              : ''}
          </p>
        </>
      )}

      <Eyebrow>What is out of place</Eyebrow>
      {drifts.length === 0 ? (
        <Card>
          <p className="m-0 text-sm leading-relaxed text-ink-mid">
            Nothing. Your money is going where the plan puts it.
          </p>
        </Card>
      ) : (
        drifts.map((d) => (
          <Card key={d.id}>
            <div className="mb-2">
              <Pill tone={d.severity === 'bad' ? 'bad' : 'warn'}>
                {d.severity === 'bad' ? 'Needs attention' : 'Worth watching'}
              </Pill>
            </div>
            <h2>{d.title}</h2>
            <p className="mb-0 mt-2 text-sm leading-relaxed text-ink-mid">{d.detail}</p>
            <div className="-mb-1.5 mt-1.5">
              <TextLink size="sm" flush onClick={() => onExplain(d)}>
                <Info size={15} strokeWidth={2.4} />
                What this is read from
              </TextLink>
            </div>
          </Card>
        ))
      )}
    </Screen>
  )
}

/* ---------------------------------------------------------------- Review */

/*
 * The section band's label, counted the way the source counts its own: `2 SIPs to Stop`, a number
 * in front of a plural noun. `2 money to start moving` is what a collective noun does to that
 * template, so the nouns here are countable.
 */
const groupLabel = (group: 'start' | 'stop', n: number): string =>
  group === 'start'
    ? `${n} ${n === 1 ? 'thing' : 'things'} to start`
    : `${n} ${n === 1 ? 'cap' : 'caps'} to hold`

/**
 * The reviewed set — `05-rebalancing-cart` without the parts of it this app cannot mean.
 *
 * Kept: the grouped bands with a dot, a label and a bold subtotal; the per-line checkbox that
 * includes or excludes an instruction; the labelled metric strip; the action row at the foot of
 * each line.
 *
 * Dropped, and why: the folio number (there is no folio until an order exists), the AMC logo tile
 * (no asset, and inventing one is inventing a brand), the units figure on a sale
 * (`870.782 Units` needs a NAV), and the `Lump sum to Sell` / `SIPs to Stop` groups entirely —
 * this app has no redemption route, so a screen offering to sell something would be offering
 * something that does not exist. The exit group that survives is behavioural, which is the one
 * kind of "stop" the app can actually record.
 *
 * The source's cart has no submit control in any frame and its flow file says so. This one ends
 * where the app's own architecture already says it should: each line goes to the spine or to the
 * self-report, per line, and the footer totals what was kept.
 */
function Review({
  changes,
  kept,
  header,
  after,
  roadmap,
  onToggle,
  onBuy,
  decisions,
}: {
  changes: readonly Change[]
  kept: readonly Change[]
  header: ReactNode
  after: ReactNode
  roadmap: View['roadmap']
  onToggle: (id: string, on: boolean) => void
  onBuy: (productId: string) => void
  decisions?: RebalanceDecisions | undefined
}): ReactNode {
  const starting = changeTotals(kept.filter((c) => c.group === 'start')).monthly
  const freeing = changeTotals(kept.filter((c) => c.group === 'stop')).monthly
  const oneOff = changeTotals(kept).oneOff
  const groups = (['start', 'stop'] as const).filter((g) => changes.some((c) => c.group === g))

  return (
    <Screen
      header={header}
      after={after}
      footer={
        <div>
          {/*
            Two totals, never one. Money starting to move is an outflow and a cap held is money
            that stops leaving — adding them would produce a confident single figure that is not
            a quantity of anything. The source's cart adds its section subtotals into chips that
            do not reconcile with the sections; this is the version that does.
          */}
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <p className="m-0 text-[13px] text-ink-soft">
              {kept.length} of {changes.length} kept
            </p>
            <p className="m-0 text-right text-[15px] font-bold tabular-nums text-ink">
              {starting > 0 ? `${inr(starting)} a month to start` : 'Nothing to start'}
              {oneOff > 0 ? (
                <>
                  <br />
                  <span className="text-[13px] font-semibold text-ink-mid">{inr(oneOff)} once</span>
                </>
              ) : null}
              {freeing > 0 ? (
                <>
                  <br />
                  <span className="text-[13px] font-semibold text-brand-deep">
                    {inr(freeing)} a month freed
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <p className={`${NOTE} m-0`}>
            Nothing is placed from this screen. Each line goes to its own next step below.
          </p>
        </div>
      }
    >
      {changes.length === 0 ? (
        <div className="mt-3">
          <Card tint="sage">
            <h2>Nothing to change</h2>
            <p className="m-0 mt-2 text-sm leading-relaxed text-ink-mid">
              Version {roadmap.version} of your plan already matches what your statements show.
            </p>
          </Card>
        </div>
      ) : null}

      {groups.map((group) => {
        const rows = changes.filter((c) => c.group === group)
        const live = rows.filter((c) => kept.includes(c))
        return (
          <div key={group}>
            <ChangeBand
              tone={group}
              label={groupLabel(group, rows.length)}
              total={inr(changeTotals(live).monthly)}
            />
            {rows.map((c) => (
              <ChangeRow
                key={c.id}
                change={c}
                on={kept.includes(c)}
                onToggle={(on) => onToggle(c.id, on)}
                onBuy={onBuy}
                {...(decisions ? { decisions } : {})}
              />
            ))}
          </div>
        )
      })}

      <p className={`${NOTE} mt-5`}>
        The source app this screen is modelled on ends at a cart with no submit button — its own
        flow notes record that the authorisation half was never filmed. This one does not invent a
        second checkout: anything that buys a product goes through the same suitability gate as
        every other order in this app, and anything that does not buy a product has nothing to
        place.
      </p>
    </Screen>
  )
}

function ChangeRow({
  change,
  on,
  onToggle,
  onBuy,
  decisions,
}: {
  change: Change
  on: boolean
  onToggle: (on: boolean) => void
  onBuy: (productId: string) => void
  decisions?: RebalanceDecisions | undefined
}): ReactNode {
  /*
   * The self-report, where the daily plan already carries a real action for this change. An
   * action's id is `${insight.kind}:${suggests}` and nothing about it is derivable from a roadmap
   * stage, so the join has to be something both sides genuinely name.
   *
   * The product, where there is one. Where there is not — and every `self_report` row is
   * behavioural, so there never is — the action's *kind*: "put ₹5,992 a month against the card"
   * and `pay_down_card` are the same decision however it was reached. Matching on the product
   * alone meant the match never fired on exactly the rows built to use it, and "I did it" / "Not
   * now" / "Recorded" were unreachable on all of them.
   *
   * A behavioural change the plan carries no action for still shows — it simply has nothing to
   * press, and the row says where the decision is recorded instead.
   */
  const action = decisions?.actions.find((a) =>
    change.productId !== null
      ? a.productId === change.productId
      : change.actionKind !== null && a.kind === change.actionKind,
  )
  const decided = action ? decisions?.decided.has(action.id) === true : false

  return (
    <section
      className={`mb-3 min-w-0 overflow-hidden rounded-md border border-solid border-hairline-mint bg-surface ${
        on ? '' : 'opacity-60'
      }`}
    >
      <div className="px-4 pb-1 pt-2">
        <Checkbox checked={on} onChange={onToggle}>
          <span className="text-[15px] font-semibold text-ink">{change.label}</span>
        </Checkbox>
      </div>

      <p className="m-0 px-4 pb-3 pl-[calc(16px+20px+12px)] text-[13px] leading-snug text-ink-soft">
        {change.detail}
      </p>

      {/* The same strip the stage cards use, and the same component: two lists of figures on one
          flow at two type sizes is exactly what a shared cell prevents. Cells that would restate
          the line above them are dropped rather than filled with an em dash — the instruction
          already carries the amount, and `Into` would print a product name the label just said. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 border-0 border-y border-solid border-hairline-mint px-4 py-3">
        <Constituent label="Each month" value={change.monthly > 0 ? inr(change.monthly) : '—'} />
        {change.oneOff > 0 ? <Constituent label="Once" value={inr(change.oneOff)} /> : null}
        {change.productName && !change.label.includes(change.productName) ? (
          <Constituent wrap label="Into" value={change.productName} />
        ) : null}
      </div>

      <div className="px-4 py-3">
        <p className="m-0 text-[12.5px] leading-snug text-ink-soft">{change.terminusNote}</p>
        {on && change.terminus === 'spine' && change.productId ? (
          <div className="mt-3">
            <Button tone="secondary" size="sm" onClick={() => onBuy(change.productId as string)}>
              <Wallet size={15} strokeWidth={2.4} />
              Set this up
            </Button>
          </div>
        ) : null}
        {on && change.terminus === 'self_report' ? (
          action && decisions ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {decided ? (
                <Pill tone="ok">Recorded</Pill>
              ) : (
                <>
                  <Button
                    tone="secondary"
                    size="sm"
                    disabled={!decisions.enabled || decisions.busy}
                    onClick={() => decisions.onDecide(action, 'did_it')}
                  >
                    I did it
                  </Button>
                  <Button
                    tone="quiet"
                    size="sm"
                    disabled={!decisions.enabled || decisions.busy}
                    onClick={() => decisions.onDecide(action, 'deferred')}
                  >
                    Not now
                  </Button>
                </>
              )}
            </div>
          ) : (
            /* The line above already says the app records the decision rather than the money;
               this only says where. Two paragraphs both explaining "nothing to place" was one
               paragraph too many. */
            <p className={`${NOTE} mb-0 mt-2`}>
              Record it on Today, where the plan reads it back into the next version.
            </p>
          )
        ) : null}
      </div>
    </section>
  )
}
