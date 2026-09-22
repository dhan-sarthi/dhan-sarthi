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
// turns from a grey 2 to a green tick. It sits in the middle of the nav row, back · dots · ×,
// as Cleo lay it out, and outside the scroller on purpose: a progress indicator that scrolls off
// the top of the first step is not an indicator. `Screen` has no middle to put it in, so the
// frame is assembled here out of `NavRow` + `StepDots` + a `ScrollView`.
//
// It is pushed over the tabs, and the snapshot provider is mounted at the root, so
// `useSnapshot()` reaches it. It reads `api.challenges()` itself — that is a different
// payload — and refreshes the view once a challenge exists, because the Grow tab underneath
// reloads its challenge off the view and is still showing the promo for one that has started.
//
// **Arriving hot.** `/challenge-generating` hands over a complete pick in the params — target,
// length, limit and the saving that limit predicts — and this screen then opens on the review
// with the card already drawn, and without waiting for the target list, which the review does
// not need. That is Cleo's flow: the interstitial is followed by the generated challenge with
// "Let's do this" and "Create my own", not by step 1, and with no rail and no back arrow,
// because there are no steps behind it that the customer took. "Create my own" walks into step 1
// with the engine's answers still chosen; from then on the rail is back, and the review's second
// button says "Change my choices", which is what it does for a customer who built the challenge
// themselves. A pick that arrived without a limit — the quote had no options to recommend —
// opens on step 3, where the limit is asked. Arriving with no params opens on step 1.
//
// The quote is fetched here even though the interstitial already made that call. There is no
// request cache in this app and this screen is not the place to invent one: the interstitial
// needed one number out of the quote to make a recommendation, and the wizard needs the whole
// of it — every limit option for step 3 and the repeat multiples for step 4. What the params
// buy is the first paint, not the call: the gold card is drawn from them while the quote is
// still in flight, so the customer never lands on a screen full of holes.
//
// **The engine's pick is chipped inside its own row.** `SelectCard` carries a badge, so the
// Recommended chip sits under the row's description, inside the one pressable, and each list is
// a radio group. A chip drawn as a sibling under the row was a strip of the card that looked
// tappable and was not.
//
// **The gold card's words are ink, both sides.** `Row` sets its label in `mid`, which is 4.1:1
// on `streak` — under what body text needs — so the card keeps its own row, the label regular and
// the value semibold, the weight carrying the difference the colour cannot.
//
// **Starting lands on Grow's Challenges pane** by popping back to the tabs with the pane named,
// never by pushing or replacing them: either of those mounts a second tab navigator over the
// first — a second tab bar, and a back gesture that lands on the first. The toast is shown before
// the pop so it is drawn on the pane the customer lands on.
//
// **The future-savings bars are the customer's number, not the engine's.** `quote.repeated`
// is computed server-side from the *recommended* limit, because the quote is answered before
// anybody has chosen one. Printing it verbatim under a card that says the saving is ₹4,600
// would have the same screen quote two different figures. So the run of days comes from
// `repeated` and the amount is `saving × n` — which is `repeatedSaving`'s own definition
// applied to the limit actually taken, and identical to the server's array whenever that
// limit is the recommended one.
import { useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
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
import { NavRow, leave } from '~/ui/NavRow'
import { StepDots } from '~/ui/StepDots'
import { Pane } from '~/ui/Reveal'
import { Type } from '~/ui/Text'
import { Tap } from '~/ui/Tap'
import { Glyph } from '~/ui/Glyph'
import { Count } from '~/ui/Count'
import { Card } from '~/ui/Card'
import { Chip } from '~/ui/Chip'
import { Note } from '~/ui/Note'
import { Sheet } from '~/ui/Sheet'
import { Button, ButtonStack } from '~/ui/Button'
import { SelectCard } from '~/ui/SelectCard'
import { AmountStepper } from '~/ui/AmountStepper'
import { MerchantMark } from '~/ui/MerchantMark'
import { Thinking } from '~/ui/Thinking'
import { RetryLine } from '~/ui/SnapshotScroll'
import { useToast } from '~/ui/Toast'
import { dur, stagger, timing, useReducedMotion } from '~/ui/motion'
import { useSnapshot } from '~/state/snapshot'
import { ApiError, api } from '~/api/client'
import { rupees } from '~/lib/money'
import { challengeTitle, inSentence } from '~/lib/names'
import { color, size } from '@dhan/design'
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

/** How the saving is predicted. Step 3's note and the review card's sheet say the same thing. */
const SAVING_NOTE =
  'Lower limit, harder run, more put aside. The prediction is your limit against what these days cost you now — arithmetic on your statement, not a forecast.'

const RUNNING = 'You already have a challenge running. Finish it, or end it on Grow.'

/** Said when the start could not be confirmed. It names no cause, because none is known. */
const NOT_STARTED = "Couldn't start the challenge. Try again."

type StartError = { message: string; openGrow: boolean }

function asText(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

function asAmount(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

/** Grow's Challenges pane, reached by popping back to the tabs — see the header. */
function toChallenges() {
  router.dismissTo({ pathname: '/(tabs)/grow', params: { pane: 'challenges' } })
}

export default function Challenge() {
  const { data: snap, refresh } = useSnapshot()
  // The snapshot's habits say which category a merchant group sits in, so "Fast food" draws
  // the fork plate rather than a lettered "F" (the same reading as Grow's targetCategory).
  const habits = snap?.snapshot.discretionary.topHabits ?? []
  const toast = useToast()
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
  const priced = seedTarget !== null && seedDays !== null

  const [view, setView] = useState<ChallengeView | null>(null)
  const [viewFailed, setViewFailed] = useState(false)
  const [step, setStep] = useState(() => (seeded ? STEPS : priced ? 3 : 1))
  const [dir, setDir] = useState(1)
  // Whether the customer has been into the steps. Until they have, a hot arrival is the engine's
  // challenge and is reviewed the way Cleo draw it: no rail, no back arrow.
  const [walked, setWalked] = useState(!seeded)
  const [target, setTarget] = useState<SpendTarget | null>(seedTarget)
  const [days, setDays] = useState<number | null>(seedDays)
  const [limit, setLimit] = useState<number | null>(seedLimit)
  const [own, setOwn] = useState(false)
  const [quote, setQuote] = useState<ChallengeQuote | null>(null)
  const [quoteFailed, setQuoteFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<StartError | null>(null)
  const [explain, setExplain] = useState(false)
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
    setWalked(true)
    setError(null)
    // A step is a new page, not a continuation of the last one. Without this, stepping from the
    // bottom of the target list lands the customer halfway down step 2's much shorter page.
    scroller.current?.scrollTo({ y: 0, animated: false })
  }

  function back() {
    if (step === 1) leave('/(tabs)/grow')
    else go(step - 1)
  }

  // A second tap on the row already chosen changes nothing, so it must not throw the quote away
  // and ask for it again — which is what a fresh object in state used to do.
  function chooseTarget(next: SpendTarget) {
    if (isSame(target, next)) return
    setTarget(next)
    // The limit was chosen against the old target's baseline and means nothing against this
    // one. Dropping it is the honest move; carrying it forward would show a "predicted saving"
    // derived from spending the customer is no longer challenging.
    setLimit(null)
    setOwn(false)
  }

  function chooseDays(next: number) {
    if (days === next) return
    setDays(next)
    setLimit(null)
    setOwn(false)
  }

  async function start() {
    if (target === null || days === null || limit === null || starting) return
    setStarting(true)
    setError(null)
    try {
      await api.startChallenge({ target, limit, days })
      // The running challenge is read back before anything says it started. The start's key
      // used to be the draft itself, and the server keeps a key's answer for the session, so an
      // ended challenge started again identically got a 200 with nothing started. The key is per
      // press now (client.ts), so that replay cannot happen; this read stays as the proof, and a
      // miss says only that it did not start. A read that fails proves nothing either way, and
      // the start's own 200 stands.
      const now = await api.challenges().catch(() => null)
      if (now !== null && now.active === null) {
        setError({ message: NOT_STARTED, openGrow: false })
        return
      }
      if (now !== null && now.active !== null && !isSame(target, now.active.target)) {
        setError({ message: RUNNING, openGrow: true })
        return
      }
      // The Grow tab reloads its challenge off the view; waiting for the view means the pane is
      // showing the running challenge by the time the customer lands on it.
      await refresh()
      toast.show(`${challengeTitle(target.name)} started`)
      toChallenges()
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? { message: RUNNING, openGrow: true }
          : err instanceof ApiError && err.status === 422
            ? { message: 'Not enough spending there to challenge. Pick another.', openGrow: false }
            : { message: NOT_STARTED, openGrow: false },
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
  // Steps 1 and 2 are drawn from the target list; 3 and 4 only need the pick and the quote.
  const needsView = step <= 2

  if (needsView && viewFailed) {
    return (
      <Frame step={step} rail={walked} onBack={back} scroll={false}>
        <View className="flex-1 justify-center">
          <RetryLine
            message="Couldn't read your statement"
            detail="A challenge is built from it. Try again."
            onRetry={() => {
              setViewFailed(false)
              setAttempt((n) => n + 1)
            }}
          />
        </View>
      </Frame>
    )
  }

  if (needsView && view === null) {
    return (
      <Frame step={step} rail={walked} onBack={back} scroll={false}>
        <View className="flex-1 justify-center">
          <Thinking accessibilityLabel="Reading what you've been spending…" />
          <Type role="body" tone="mid" className="mt-lg">
            Reading what you've been spending…
          </Type>
        </View>
      </Frame>
    )
  }

  const footer =
    step < STEPS ? (
      <Button label="Next" disabled={!answered} haptic="none" onPress={() => go(step + 1)} />
    ) : (
      <View className="gap-md">
        {error === null ? null : (
          <View accessibilityRole="alert" accessibilityLiveRegion="polite" className="gap-sm">
            <Type role="label" tone="danger">
              {error.message}
            </Type>
            {error.openGrow ? (
              <Button
                size="sm"
                variant="secondary"
                label="Open Grow"
                haptic="none"
                onPress={toChallenges}
              />
            ) : null}
          </View>
        )}
        <ButtonStack>
          <Button
            label="Let's do this"
            loading={starting}
            disabled={limit === null}
            haptic="none"
            onPress={() => void start()}
          />
          <Button
            variant="secondary"
            label={walked ? 'Change my choices' : 'Create my own'}
            haptic="none"
            onPress={() => go(1)}
          />
        </ButtonStack>
      </View>
    )

  return (
    <Frame
      step={step}
      rail={walked}
      onBack={walked ? back : undefined}
      footer={footer}
      scrollRef={scroller}
    >
      {/* Keyed on the step, which is what makes the entrance run at all — without the key the
          two panes reconcile into one and nothing moves. `dir` is set by `go`, so stepping
          back enters from the left and reads as a reversal rather than as more progress. */}
      <Pane key={step} dir={dir}>
        {step === 1 ? (
          <>
            <Type role="display">Choose your vice</Type>
            <Type role="body" tone="mid" className="mt-sm">
              Pick the habit to cut.
            </Type>

            {merchants.length === 0 && categories.length === 0 ? (
              <View className="mt-xl">
                <Note
                  title="Nothing to challenge yet"
                  action={{ label: 'Back to Grow', onPress: () => leave('/(tabs)/grow') }}
                >
                  {`Not enough repeat spending in your last ${windowDays} days. Come back when there's a habit to aim at.`}
                </Note>
              </View>
            ) : null}

            {merchants.length > 0 ? (
              <>
                <Type role="label" tone="mid" className="mt-xl">
                  Where you spend most
                </Type>
                <Card
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Where you spend most"
                  className="mt-md overflow-hidden"
                >
                  {merchants.map((t, i) => (
                    <SelectCard
                      key={t.target.name}
                      title={t.target.name}
                      description={spendLine(t, windowDays)}
                      selected={isSame(target, t.target)}
                      divide={i > 0}
                      leading={
                        <MerchantMark
                          merchant={t.target.name}
                          category={habits.find((h) => h.merchant === t.target.name)?.category}
                          size={size.plateMd}
                        />
                      }
                      {...pick(t.recommended)}
                      onPress={() => chooseTarget(t.target)}
                    />
                  ))}
                </Card>

                {/* Cleo put this between the two lists rather than under both, and it belongs
                    there: it is about the merchant list specifically, and a customer who has
                    already scrolled past the categories has made their choice. */}
                <View className="mt-lg">
                  <Note>The shop you can't walk past is the honest place to start.</Note>
                </View>
              </>
            ) : null}

            {categories.length > 0 ? (
              <>
                <Type role="label" tone="mid" className="mt-xl">
                  What you spend most on
                </Type>
                <Card
                  accessibilityRole="radiogroup"
                  accessibilityLabel="What you spend most on"
                  className="mt-md overflow-hidden"
                >
                  {categories.map((t, i) => (
                    <SelectCard
                      key={t.target.name}
                      title={t.target.name}
                      description={spendLine(t, windowDays)}
                      selected={isSame(target, t.target)}
                      divide={i > 0}
                      leading={
                        <MerchantMark
                          merchant={null}
                          category={t.target.name}
                          size={size.plateMd}
                        />
                      }
                      {...pick(t.recommended)}
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
            <Type role="body" tone="mid" className="mt-sm">
              Pick a length you can hold to.
            </Type>

            <Card
              accessibilityRole="radiogroup"
              accessibilityLabel="How long for"
              className="mt-xl overflow-hidden"
            >
              {lengths.map((l, i) => (
                <SelectCard
                  key={l.days}
                  title={`${l.days} days`}
                  description={l.label}
                  selected={days === l.days}
                  divide={i > 0}
                  {...pick(l.recommended)}
                  onPress={() => chooseDays(l.days)}
                />
              ))}
            </Card>

            <View className="mt-lg">
              <Note>
                The limit covers the whole run, not each day, so a quiet fortnight can carry one
                loud weekend.
              </Note>
            </View>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Type role="display">Set your limit</Type>
            <Type role="body" tone="mid" className="mt-sm">
              An amount you can hold to for all {days} days.
            </Type>

            {quoteFailed ? (
              <View className="mt-xl">
                <Note
                  title="Couldn't work out the limits"
                  action={{ label: 'Try again', onPress: () => setAttempt((n) => n + 1) }}
                >
                  They come from your statement, and that read failed.
                </Note>
              </View>
            ) : quote === null ? (
              <View className="mt-xxl">
                <Thinking accessibilityLabel={`Working out what ${days} days normally cost you…`} />
                <Type role="body" tone="mid" className="mt-lg">
                  Working out what these {days} days normally cost you…
                </Type>
              </View>
            ) : (
              <>
                <Type role="body" tone="mid" className="mt-xl">
                  {rupees(quote.baseline)} is what {days} days on{' '}
                  {target === null ? 'this' : inSentence(target.name)} normally cost you. Whatever
                  you hold back is the saving.
                </Type>

                <Card
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Limits"
                  className="mt-lg overflow-hidden"
                >
                  {quote.options.map((o, i) => (
                    <SelectCard
                      key={o.limit}
                      title={rupees(o.limit)}
                      description={`Predicted saving ${rupees(o.predictedSaving)}`}
                      selected={limit === o.limit && !own}
                      divide={i > 0}
                      {...pick(o.recommended)}
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
                      label="Your limit"
                    />
                    <Type
                      role="label"
                      tone={saving > 0 ? 'mid' : 'danger'}
                      className="mt-sm text-center"
                    >
                      {saving > 0
                        ? `Predicted saving ${rupees(saving)}`
                        : `More than these ${days} days usually cost, so nothing to cut.`}
                    </Type>
                  </View>
                ) : (
                  <Button
                    label="Set your own limit"
                    variant="secondary"
                    glyph="pencil"
                    haptic="none"
                    className="mt-lg"
                    onPress={() => {
                      setOwn(true)
                      // From the engine's pick rather than the baseline: a stepper that opens on
                      // the figure these days already cost opens on "nothing to cut".
                      if (limit === null) {
                        setLimit(quote.options.find((o) => o.recommended)?.limit ?? quote.baseline)
                      }
                    }}
                  />
                )}

                <View className="mt-lg">
                  <Note>{SAVING_NOTE}</Note>
                </View>
              </>
            )}
          </>
        ) : null}

        {step === STEPS && target !== null && days !== null && limit !== null ? (
          <>
            <Type role="display">Your challenge</Type>

            {/* Gold, like every challenge surface in the app, and ink on it. The title is
                `challengeTitle` over the target, the call Grow's running card and the toast
                make too, so all three say "Fast food challenge". The server's own `name`
                capitalises "Challenge" and is drawn nowhere. */}
            <View className="mt-xl rounded-card bg-streak p-xl">
              <Type role="title">{challengeTitle(target.name)}</Type>

              <View className="mt-lg gap-sm">
                <Line label="Where" value={target.name} />
                <Line label="Limit" value={rupees(limit)} />
                <Line label="Length" value={`${days} days`} />
              </View>

              <View
                accessible
                accessibilityLabel={`Predicted saving ${rupees(saving)}`}
                className="mt-lg rounded-lg bg-surface/35 p-lg"
              >
                <Count value={saving} format={rupees} role="title" delay={dur.enter} />
                <Type role="body" className="mt-xs">
                  Predicted saving
                </Type>
              </View>

              <Tap
                accessibilityRole="button"
                accessibilityLabel="How is the saving predicted?"
                haptic="none"
                onPress={() => setExplain(true)}
                className="mt-md min-h-target flex-row items-center justify-center gap-sm self-center"
              >
                <Glyph name="info" size={20} tint={color.ink} />
                <Type role="body" className="underline">
                  How is the saving predicted?
                </Type>
              </Tap>
            </View>

            <View className="mt-lg">
              <Note>Check in on Grow to keep the streak.</Note>
            </View>

            {/* Held back until the quote lands, which on a hot arrival is a moment after the
                card above it. An empty `Card` is a hairline box with nothing in it, and a
                heading over one reads as a chart that failed rather than one still coming. */}
            {quote !== null && quote.repeated.length > 0 ? (
              <>
                <Type role="heading" className="mt-xxl">
                  Your future savings
                </Type>
                <Type role="body" tone="mid" className="mt-xs">
                  If you ran it again, and again.
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

            <Sheet
              open={explain}
              onClose={() => setExplain(false)}
              title="How the saving is predicted"
              footer={<Button label="Got it" haptic="none" onPress={() => setExplain(false)} />}
            >
              {quote === null ? null : (
                <Type role="body" className="mb-md">
                  {`${rupees(quote.baseline)} is what ${days} days on ${inSentence(target.name)} normally cost you. Hold to ${rupees(limit)} and ${rupees(saving)} stays with you.`}
                </Type>
              )}
              <Type role="body" tone="mid">
                {SAVING_NOTE}
              </Type>
            </Sheet>
          </>
        ) : null}
      </Pane>
    </Frame>
  )
}

/**
 * The wizard's scaffold: the nav row with the rail in its middle, the page, and the footer.
 *
 * The rail is there while the first read is in flight too. `StepDots` clamps to step one on its
 * own, so the customer sees the shape of what they have opened rather than a blank screen that
 * suddenly grows a header. The × always goes to Grow — where every way into this wizard starts.
 */
function Frame({
  children,
  step,
  rail,
  onBack,
  footer,
  scroll = true,
  scrollRef,
}: {
  children: ReactNode
  step: number
  rail: boolean
  onBack: (() => void) | undefined
  footer?: ReactNode
  scroll?: boolean
  scrollRef?: RefObject<ScrollView | null>
}) {
  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow
        onBack={onBack}
        onClose={() => leave('/(tabs)/grow')}
        {...(rail ? { center: <StepDots step={step} steps={STEPS} /> } : {})}
      />
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-pad"
          contentContainerClassName="pt-xl pb-xxl"
        >
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1 px-pad">{children}</View>
      )}
      {footer === undefined ? null : <View className="px-pad pt-md pb-lg">{footer}</View>}
    </SafeAreaView>
  )
}

/** The engine's pick, chipped inside its own row — spread onto a `SelectCard` only where it is. */
function pick(recommended: boolean): { badge?: ReactNode } {
  return recommended ? { badge: <Chip tone="success">Recommended</Chip> } : {}
}

function isSame(a: SpendTarget | null, b: SpendTarget): boolean {
  return a !== null && a.kind === b.kind && a.name === b.name
}

/** "₹4,820 in 28 days · 12 times" — the figure, the window it was measured over, and how
 *  often. Cleo print only the amount; the count is what tells a customer whether they are
 *  looking at a habit or at one expensive afternoon. */
function spendLine(t: TargetSpend, windowDays: number): string {
  const times = t.occurrences === 1 ? '1 time' : `${t.occurrences} times`
  return `${rupees(t.spent)} in ${windowDays} days · ${times}`
}

/** A label and its value on the gold card, ink both sides — see the header. Read as one line. */
function Line({ label, value }: { label: string; value: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      className="flex-row items-baseline justify-between gap-lg"
    >
      <Type role="body">{label}</Type>
      <Type role="body" weight="semibold" plain className="flex-1 text-right">
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
 * effect rather than `useDerivedValue`, height as a percentage of the track rather than
 * `scaleY`, `dur.count` because a bar growing is a number being said, and a stagger so the
 * three read left to right as one statement getting bigger. Under Reduce Motion they are drawn
 * at their height. Each column is one element to a screen reader: its days and its amount.
 */
function FutureBars({ bars }: { bars: ReadonlyArray<{ days: number; saved: number }> }) {
  const reduced = useReducedMotion()
  if (bars.length === 0) return null
  const peak = bars.reduce((max, b) => (b.saved > max ? b.saved : max), 0)

  return (
    <View className="flex-row items-end gap-md px-lg py-lg">
      {bars.map((b, i) => (
        <View
          key={b.days}
          accessible
          accessibilityLabel={`${b.days} days: ${rupees(b.saved)}`}
          className="flex-1 items-center gap-sm"
        >
          <Type role="label" plain numberOfLines={1}>
            {rupees(b.saved)}
          </Type>
          <View className="h-track w-full justify-end">
            <Bar
              fraction={Math.max(FLOOR_BAR, peak > 0 ? b.saved / peak : 0)}
              delay={stagger(i)}
              reduced={reduced}
            />
          </View>
          <Type role="caption" tone="mid" numberOfLines={1}>
            {b.days} days
          </Type>
        </View>
      ))}
    </View>
  )
}

function Bar({ fraction, delay, reduced }: { fraction: number; delay: number; reduced: boolean }) {
  const grown = useSharedValue(reduced ? fraction : 0)

  useEffect(() => {
    grown.value = reduced ? fraction : withDelay(delay, withTiming(fraction, timing(dur.count)))
  }, [fraction, delay, reduced, grown])

  const fill = useAnimatedStyle(() => ({ height: `${grown.value * 100}%` }))

  return <Animated.View style={fill} className="w-full rounded-md bg-ink" />
}
