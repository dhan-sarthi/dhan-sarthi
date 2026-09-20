// The challenge wizard — four questions, one screen.
//
// Cleo run this as four steps behind a numbered rail, and the four questions are the right
// four: what are you cutting down, for how long, to what limit, and is this the challenge you
// meant. What is worth arguing about is that all four live in **one mounted component** with
// `step` in state rather than four routes the way onboarding does it.
//
// Onboarding is four routes because each of its steps is answered once and never revisited:
// backing up is rare, the draft lives in a provider, and a fresh mount per step costs nothing.
// This flow is the opposite on both counts. Step 3 cannot be drawn without a quote for the
// target and length chosen in steps 1 and 2, and a customer who gets to the limits and thinks
// "actually, fourteen days" will step back and forward again immediately. Four routes would
// re-fetch the target list and re-quote on every one of those moves, and the wizard would
// stutter in exactly the place the customer is comparing numbers. One component holds the
// answers and the quote, so walking back a step is free and walking forward again is instant.
//
// That is also why the rail is `StepDots` and not `Screen`'s `step`/`steps` props. Those
// render `ProgressRail`, which is right for onboarding for the same reason four routes are —
// it is a fresh mount each time and has nothing to remember. Here the rail stays on screen
// while the number under it changes, and the customer is looking straight at it when a plate
// turns from a grey 2 to a green tick. Passing `step` to `Screen` as well would draw both
// rails, so this screen is assembled out of `NavRow` + `StepDots` + a `ScrollView` by hand,
// the way `set-limit.tsx` assembles itself. The rail sits outside the scroller on purpose:
// a progress indicator that scrolls off the top of the first step is not an indicator.
//
// It is pushed over the tabs, and the snapshot provider is mounted at the root, so
// `useSnapshot()` reaches it. It reads `api.challenges()` itself — that is a different
// payload — and calls `refresh()` once a challenge exists, because the Grow tab underneath is
// still showing the promo card for a challenge that has now started.
//
// **Arriving hot.** `/challenge-generating` hands over a complete pick in the params — target,
// length, limit and the saving that limit predicts — and this screen then opens on step 4 with
// the card already drawn. That is Cleo's flow: the interstitial is followed by the generated
// challenge with "Let's do this" and "Create my own", not by step 1. Arriving with no params,
// which is what "Create my own" does, opens on step 1 with nothing chosen. Same component,
// same four steps, and the Edit button on the review card is the seam between the two.
//
// The quote is fetched here even though the interstitial already made that call. There is no
// request cache in this app and this screen is not the place to invent one: the interstitial
// needed one number out of the quote to make a recommendation, and the wizard needs the whole
// of it — every limit option for step 3 and the repeat multiples for step 4. What the params
// buy is the first paint, not the call: the gold card is drawn from them while the quote is
// still in flight, so the customer never lands on a screen full of holes.
//
// Two smaller decisions the captures do not make for you.
//
// **The Recommended chip sits under its row, not inside it.** `SelectCard` takes a `string`
// description and has no badge slot, and four other screens draw their rows from it — adding
// one for this flow is a change to a shared primitive, which is not this screen's call to
// make. The chip is punctuation on the row above it; the row is still the whole target.
//
// **The future-savings bars are the customer's number, not the engine's.** `quote.repeated`
// is computed server-side from the *recommended* limit, because the quote is answered before
// anybody has chosen one. Printing it verbatim under a card that says the saving is ₹4,600
// would have the same screen quote two different figures. So the run of days comes from
// `repeated` and the amount is `saving × n` — which is `repeatedSaving`'s own definition
// applied to the limit actually taken, and identical to the server's array whenever that
// limit is the recommended one.
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ScrollView, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { NavRow } from '~/ui/NavRow'
import { StepDots } from '~/ui/StepDots'
import { Pane } from '~/ui/Reveal'
import { Type } from '~/ui/Text'
import { Count } from '~/ui/Count'
import { Card } from '~/ui/Card'
import { Chip } from '~/ui/Chip'
import { Note } from '~/ui/Note'
import { Button } from '~/ui/Button'
import { SelectCard } from '~/ui/SelectCard'
import { AmountStepper } from '~/ui/AmountStepper'
import { MerchantMark } from '~/ui/MerchantMark'
import { Thinking } from '~/ui/Thinking'
import { cn } from '~/ui/cn'
import { dur, stagger, timing, useReducedMotion } from '~/ui/motion'
import { useSnapshot } from '~/state/snapshot'
import { ApiError, api } from '~/api/client'
import { rupees } from '~/lib/money'
import type { ChallengeQuote, ChallengeView, SpendTarget, TargetSpend } from '@dhan/contracts'

const STEPS = 4

/**
 * The smallest limit the screen will offer.
 *
 * `ChallengeDraftSchema` takes `MoneySchema.positive()`, so a ₹0 limit is a 400 rather than
 * the zero-spend challenge it looks like — and ₹100 is `AmountStepper`'s own smallest step at
 * this scale, so the stepper cannot land between the two.
 */
const FLOOR_LIMIT = 100

/** The shortest bar that still reads as a bar, as a fraction of the track. `SpendBars`'s. */
const FLOOR_BAR = 0.035

function asText(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

function asAmount(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

export default function Challenge() {
  // The Grow tab underneath is showing the promo for a challenge this screen is about to
  // start, so it has to be told when one exists.
  const { refresh } = useSnapshot()
  // Everything here arrives as a string or not at all — a param is a URL, whatever the router's
  // generic says — so each one is read through a guard rather than cast. A half-formed pick
  // (a target with no length, say) simply leaves the wizard where it would have started.
  const params = useLocalSearchParams()
  const seedKind = asText(params.kind)
  const seedName = asText(params.name)
  const seedTarget: SpendTarget | null =
    seedName !== null && (seedKind === 'merchant' || seedKind === 'category')
      ? { kind: seedKind, name: seedName }
      : null
  const seedDays = asAmount(params.days)
  const seedLimit = asAmount(params.limit)
  const seedSaving = asAmount(params.saving)
  const seeded = seedTarget !== null && seedDays !== null && seedLimit !== null

  const [view, setView] = useState<ChallengeView | null>(null)
  const [viewFailed, setViewFailed] = useState(false)
  const [step, setStep] = useState(seeded ? STEPS : 1)
  const [dir, setDir] = useState(1)
  const [target, setTarget] = useState<SpendTarget | null>(seedTarget)
  const [days, setDays] = useState<number | null>(seedDays)
  const [limit, setLimit] = useState<number | null>(seedLimit)
  const [own, setOwn] = useState(false)
  const [quote, setQuote] = useState<ChallengeQuote | null>(null)
  const [quoteFailed, setQuoteFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scroller = useRef<ScrollView>(null)

  useEffect(() => {
    let cancelled = false
    api
      .challenges()
      .then((next) => {
        if (!cancelled) setView(next)
      })
      .catch(() => {
        if (!cancelled) setViewFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  // The quote is a question about a target and a length, so it is asked again whenever either
  // changes and thrown away the moment they do. The cancel flag is not belt and braces: a
  // customer flicking between 7 and 21 days has two quotes in flight, and the slower one is
  // the older one often enough to matter.
  useEffect(() => {
    if (target === null || days === null) return undefined
    let cancelled = false
    setQuote(null)
    setQuoteFailed(false)
    api
      .quoteChallenge(target.kind, target.name, days)
      .then((next) => {
        if (!cancelled) setQuote(next)
      })
      .catch(() => {
        if (!cancelled) setQuoteFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [target, days, attempt])

  function go(next: number) {
    setDir(next > step ? 1 : -1)
    setStep(next)
    // A step is a new page, not a continuation of the last one. Without this, stepping from the
    // bottom of the target list lands the customer halfway down step 2's much shorter page.
    scroller.current?.scrollTo({ y: 0, animated: false })
  }

  /** Back out of the wizard. A deep link has no stack to pop, so it is sent to the tab. */
  function leave() {
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)/grow')
  }

  function chooseTarget(next: SpendTarget) {
    setTarget(next)
    // The limit was chosen against the old target's baseline and means nothing against this
    // one. Dropping it is the honest move; carrying it forward would show a "predicted saving"
    // derived from spending the customer is no longer challenging.
    setLimit(null)
    setOwn(false)
  }

  function chooseDays(next: number) {
    setDays(next)
    setLimit(null)
    setOwn(false)
  }

  async function start() {
    if (target === null || days === null || limit === null) return
    setStarting(true)
    setError(null)
    try {
      await api.startChallenge({ target, limit, days })
      // The Grow tab is still mounted underneath on its Challenges pane, showing the promo
      // for a challenge that now exists.
      await refresh()
      leave()
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'You already have a challenge running. Finish or end it first.'
          : err instanceof ApiError && err.status === 422
            ? 'Not enough spending there to challenge. Pick another.'
            : 'Could not start that. Check the API and try again.',
      )
    } finally {
      setStarting(false)
    }
  }

  const merchants = view?.targets.merchants ?? []
  const categories = view?.targets.categories ?? []
  const lengths = view?.lengths ?? []
  const windowDays = view?.windowDays ?? 0

  // The chosen option when the limit came off the list, and the same arithmetic the server does
  // when it came off the stepper: `baseline - limit`, floored at zero. The seeded figure is the
  // fallback for the one frame before the quote lands on a hot arrival.
  const chosen = quote?.options.find((o) => o.limit === limit) ?? null
  const saving =
    chosen !== null
      ? chosen.predictedSaving
      : quote !== null && limit !== null
        ? Math.max(0, quote.baseline - limit)
        : (seedSaving ?? 0)

  const custom = own || (limit !== null && quote !== null && chosen === null)
  const answered = step === 1 ? target !== null : step === 2 ? days !== null : limit !== null

  if (viewFailed) {
    return (
      <Frame step={step} onBack={leave} onClose={leave}>
        <View className="flex-1 justify-center">
          <Type role="title">Could not reach the bank</Type>
          <Type role="body" tone="soft" className="mt-sm">
            A challenge is worked out from your last few weeks of statement, and that read did not
            come back.
          </Type>
          <View className="mt-xl">
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => {
                setViewFailed(false)
                setAttempt((n) => n + 1)
              }}
            />
          </View>
        </View>
      </Frame>
    )
  }

  if (view === null) {
    return (
      <Frame step={step} onBack={leave} onClose={leave}>
        <View className="flex-1 justify-center">
          <Thinking />
          <Type role="body" tone="soft" className="mt-lg">
            Reading what you have been spending.
          </Type>
        </View>
      </Frame>
    )
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow onBack={() => (step === 1 ? leave() : go(step - 1))} onClose={leave} />
      <StepDots step={step} steps={STEPS} />

      <ScrollView ref={scroller} className="flex-1 px-pad" contentContainerClassName="pt-xl pb-xxl">
        {/* Keyed on the step, which is what makes the entrance run at all — without the key the
            two panes reconcile into one and nothing moves. `dir` is set by `go`, so stepping
            back enters from the left and reads as a reversal rather than as more progress. */}
        <Pane key={step} dir={dir}>
          {step === 1 ? (
            <>
              <Type role="display">Choose your vice</Type>
              <Type role="body" tone="soft" className="mt-sm">
                Pick a spending habit you want to cut down.
              </Type>

              {merchants.length === 0 && categories.length === 0 ? (
                <View className="mt-xl">
                  <Note title="Nothing to challenge yet">
                    There is not enough spending in your last {windowDays} days to set a challenge
                    over. Come back once there is a habit to aim at.
                  </Note>
                </View>
              ) : null}

              {merchants.length > 0 ? (
                <>
                  <Type role="label" tone="soft" className="mt-xl">
                    Top spending merchants
                  </Type>
                  <Card className="mt-md overflow-hidden">
                    {merchants.map((t, i) => (
                      <Option
                        key={t.target.name}
                        title={t.target.name}
                        detail={spendLine(t, windowDays)}
                        selected={isSame(target, t.target)}
                        recommended={t.recommended}
                        divide={i > 0}
                        leading={<MerchantMark merchant={t.target.name} size={36} />}
                        onPress={() => chooseTarget(t.target)}
                      />
                    ))}
                  </Card>

                  {/* Cleo put this between the two lists rather than under both, and it belongs
                      there: it is about the merchant list specifically, and a customer who has
                      already scrolled past the categories has made their choice. */}
                  <View className="mt-lg">
                    <Note>The shop you cannot walk past is the honest place to start.</Note>
                  </View>
                </>
              ) : null}

              {categories.length > 0 ? (
                <>
                  <Type role="label" tone="soft" className="mt-xl">
                    Top spending categories
                  </Type>
                  <Card className="mt-md overflow-hidden">
                    {categories.map((t, i) => (
                      <Option
                        key={t.target.name}
                        title={t.target.name}
                        detail={spendLine(t, windowDays)}
                        selected={isSame(target, t.target)}
                        recommended={t.recommended}
                        divide={i > 0}
                        leading={
                          <MerchantMark merchant={null} category={t.target.name} size={36} />
                        }
                        onPress={() => chooseTarget(t.target)}
                      />
                    ))}
                  </Card>
                </>
              ) : null}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Type role="display">How long for?</Type>
              <Type role="body" tone="soft" className="mt-sm">
                Choose a stretch you think you can hold to.
              </Type>

              <Card className="mt-xl overflow-hidden">
                {lengths.map((l, i) => (
                  <Option
                    key={l.days}
                    title={`${l.days} days`}
                    detail={l.label}
                    selected={days === l.days}
                    recommended={l.recommended}
                    divide={i > 0}
                    onPress={() => chooseDays(l.days)}
                  />
                ))}
              </Card>

              <View className="mt-lg">
                <Note>
                  A longer run asks more of you, and the limit is measured across the whole of it
                  rather than per day — so a quiet fortnight can carry a loud weekend.
                </Note>
              </View>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <Type role="display">Set your limit</Type>
              <Type role="body" tone="soft" className="mt-sm">
                Choose an amount you can work with for the whole {days} days.
              </Type>

              {quoteFailed ? (
                <View className="mt-xl">
                  <Note title="Could not price that">
                    The limits are worked out from your own statement, and that read did not come
                    back.
                  </Note>
                  <View className="mt-lg">
                    <Button
                      label="Try again"
                      variant="secondary"
                      onPress={() => setAttempt((n) => n + 1)}
                    />
                  </View>
                </View>
              ) : quote === null ? (
                <View className="mt-xxl">
                  <Thinking />
                  <Type role="body" tone="soft" className="mt-lg">
                    Working out what these {days} days normally cost you.
                  </Type>
                </View>
              ) : (
                <>
                  <Type role="body" tone="mid" className="mt-xl">
                    At the rate of your last {windowDays} days, {days} days on{' '}
                    {target?.name ?? 'this'} costs about {rupees(quote.baseline)}. Anything you hold
                    back from that is the saving.
                  </Type>

                  <Card className="mt-lg overflow-hidden">
                    {quote.options.map((o, i) => (
                      <Option
                        key={o.limit}
                        title={rupees(o.limit)}
                        detail={`Predicted saving ${rupees(o.predictedSaving)}`}
                        selected={limit === o.limit && !own}
                        recommended={o.recommended}
                        divide={i > 0}
                        onPress={() => {
                          setLimit(o.limit)
                          setOwn(false)
                        }}
                      />
                    ))}
                  </Card>

                  {custom ? (
                    <View className="mt-lg">
                      <AmountStepper
                        value={limit ?? quote.baseline}
                        onChange={setLimit}
                        min={FLOOR_LIMIT}
                        format={rupees}
                        size="sm"
                      />
                      <Type
                        role="caption"
                        tone={saving > 0 ? 'soft' : 'danger'}
                        className="mt-sm text-center"
                      >
                        {saving > 0
                          ? `Predicted saving ${rupees(saving)}`
                          : `That is more than these ${days} days usually cost you, so there is nothing to cut.`}
                      </Type>
                    </View>
                  ) : (
                    <View className="mt-lg">
                      <Button
                        label="Set your own limit"
                        variant="secondary"
                        onPress={() => {
                          setOwn(true)
                          if (limit === null) setLimit(quote.baseline)
                        }}
                      />
                    </View>
                  )}

                  <View className="mt-lg">
                    <Note>
                      The lower the limit the harder the run, and the more it puts aside. The
                      prediction is that limit against what these days cost you at your current rate
                      — it is arithmetic on your own statement, not a forecast of next month.
                    </Note>
                  </View>
                </>
              )}
            </>
          ) : null}

          {step === STEPS && target !== null && days !== null && limit !== null ? (
            <>
              <Type role="display">Your personalised{'\n'}challenge</Type>

              {/* Gold, like every challenge surface in the app, and ink on it. The name is the
                  server's to derive once the challenge exists — this is the same sentence it
                  will build, drawn here so the review is not the one screen that calls it
                  something else. */}
              <View className="mt-xl rounded-lg bg-streak p-lg">
                <Type role="title">{target.name} Challenge</Type>

                <View className="mt-lg gap-sm">
                  <Line label="Goal" value="Control your spending" />
                  <Line label="Where" value={target.name} />
                  <Line label="Limit" value={rupees(limit)} />
                  <Line label="Length" value={`${days} days`} />
                </View>

                <View className="mt-lg rounded-md bg-surface/35 p-lg">
                  <Count value={saving} format={rupees} role="display" delay={dur.enter} />
                  <Type role="body" className="mt-xs opacity-80">
                    Predicted saving
                  </Type>
                </View>

                {/* Cleo call this "Create my own", because their customer arrived here from a
                    challenge the engine wrote. Ours may have built it themselves in four steps,
                    where that label would be nonsense — and the back arrow already gives them
                    step three. This one goes all the way back to the target, keeping every
                    answer, which is the move the word Edit actually promises. */}
                <View className="mt-lg">
                  <Button label="Edit" variant="secondary" onPress={() => go(1)} />
                </View>
              </View>

              {/* Held back until the quote lands, which on a hot arrival is a moment after the
                  card above it. An empty `Card` is a hairline box with nothing in it, and a
                  heading over one reads as a chart that failed rather than one still coming. */}
              {quote !== null && quote.repeated.length > 0 ? (
                <>
                  <Type role="heading" className="mt-xxl">
                    Your future savings
                  </Type>
                  <Type role="body" tone="soft" className="mt-xs">
                    What the same {days} days would put aside if you ran this challenge again, and
                    again.
                  </Type>
                  <Card className="mt-md">
                    <FutureBars
                      bars={quote.repeated.map((r, i) => ({
                        days: r.days,
                        saved: saving * (i + 1),
                      }))}
                    />
                  </Card>
                </>
              ) : null}
            </>
          ) : null}
        </Pane>

        {error !== null ? (
          <Type role="label" tone="danger" className="mt-lg">
            {error}
          </Type>
        ) : null}
      </ScrollView>

      <View className="px-pad pt-md pb-sm">
        {step === STEPS ? (
          <Button
            label="Let's do this"
            loading={starting}
            disabled={limit === null}
            onPress={() => void start()}
          />
        ) : (
          <Button label="Next" disabled={!answered} onPress={() => go(step + 1)} />
        )}
      </View>
    </SafeAreaView>
  )
}

/**
 * The scaffold, shared by the two states that have no wizard to draw yet.
 *
 * The rail is still there while the first read is in flight. `StepDots` clamps to step one on
 * its own, so the customer sees the shape of what they have opened rather than a blank screen
 * that suddenly grows a header.
 */
function Frame({
  children,
  step,
  onBack,
  onClose,
}: {
  children: ReactNode
  step: number
  onBack: () => void
  onClose: () => void
}) {
  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow onBack={onBack} onClose={onClose} />
      <StepDots step={step} steps={STEPS} />
      <View className="flex-1 px-pad">{children}</View>
    </SafeAreaView>
  )
}

function isSame(a: SpendTarget | null, b: SpendTarget): boolean {
  return a !== null && a.kind === b.kind && a.name === b.name
}

/** "₹4,820 over 28 days · 12 times" — the figure, the window it was measured over, and how
 *  often. Cleo print only the amount; the count is what tells a customer whether they are
 *  looking at a habit or at one expensive afternoon. */
function spendLine(t: TargetSpend, windowDays: number): string {
  const times = t.occurrences === 1 ? '1 time' : `${t.occurrences} times`
  return `${rupees(t.spent)} over ${windowDays} days · ${times}`
}

/**
 * One choosable row, with the engine's pick chipped underneath it.
 *
 * The chip is a sibling of the row rather than part of it — see the header. It is pulled up
 * into the row's own bottom padding so it reads as attached to the title above it, and
 * indented past the mark when there is one so the column of text stays a column.
 */
function Option({
  title,
  detail,
  selected,
  recommended,
  divide,
  leading,
  onPress,
}: {
  title: string
  detail: string
  selected: boolean
  recommended: boolean
  divide: boolean
  leading?: ReactNode
  onPress: () => void
}) {
  return (
    <View>
      <SelectCard
        title={title}
        description={detail}
        selected={selected}
        divide={divide}
        onPress={onPress}
        {...(leading === undefined ? {} : { leading })}
      />
      {recommended ? (
        <View className={cn('-mt-md pb-lg pr-lg', leading === undefined ? 'pl-lg' : 'pl-[68px]')}>
          <Chip tone="success">Recommended</Chip>
        </View>
      ) : null}
    </View>
  )
}

/** A label/value row on the gold card. Ink both sides, the label dimmed rather than recoloured
 *  — there is no ink-soft that holds up on `streak`, and opacity is how the rest of the
 *  saturated cards in this app draw their secondary text. */
function Line({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline justify-between gap-lg">
      <Type role="body" className="opacity-70">
        {label}
      </Type>
      <Type role="heading" className="flex-1 text-right">
        {value}
      </Type>
    </View>
  )
}

/**
 * Three bars: what one run, two runs and three runs of this challenge put aside.
 *
 * `SpendBars` is the daily chart and is the wrong instrument here — it is a calendar, with
 * weekday initials, days of the month, week paging and a flame on a no-spend day, none of
 * which mean anything about a multiple. What is borrowed is its idiom: a shared value and an
 * effect rather than `useDerivedValue`, height as a percentage of a fixed track rather than
 * `scaleY`, `dur.count` because a bar growing is a number being said, and a stagger so the
 * three read left to right as one statement getting bigger.
 */
function FutureBars({ bars }: { bars: ReadonlyArray<{ days: number; saved: number }> }) {
  const reduced = useReducedMotion()
  if (bars.length === 0) return null
  const peak = bars.reduce((max, b) => (b.saved > max ? b.saved : max), 0)

  return (
    <View className="flex-row items-end gap-md px-lg py-lg">
      {bars.map((b, i) => (
        <View key={b.days} className="flex-1 items-center gap-sm">
          <Type role="label">{rupees(b.saved)}</Type>
          <View className="h-[120px] w-full justify-end">
            <Bar
              fraction={Math.max(FLOOR_BAR, peak > 0 ? b.saved / peak : 0)}
              delay={reduced ? 0 : stagger(i)}
            />
          </View>
          <Type role="caption" tone="soft">
            {b.days} days
          </Type>
        </View>
      ))}
    </View>
  )
}

function Bar({ fraction, delay }: { fraction: number; delay: number }) {
  const grown = useSharedValue(0)

  useEffect(() => {
    grown.value = withDelay(delay, withTiming(fraction, timing(dur.count)))
  }, [fraction, delay, grown])

  const fill = useAnimatedStyle(() => ({ height: `${grown.value * 100}%` }))

  return <Animated.View style={fill} className="w-full rounded-md bg-ink" />
}
