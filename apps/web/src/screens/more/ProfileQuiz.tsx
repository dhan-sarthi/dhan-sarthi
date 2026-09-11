/**
 * The six-question evaluation, and its result.
 *
 * `spec/screens/03-profiling/02-profile-question.md` is one template rendered six times: a
 * `Question N/6` pill, a heading, four single-select cards, a live "Expected Investment Profile"
 * readout with a five-node stepper, and a footer that changes on the last step. That structure is
 * followed. Three things in it are not the source's, and each one says so on screen.
 *
 * **Four of the six questions are written for this build.** Only questions 1 and 6 are legible in
 * the footage; question 5 is ~60% occluded and `spec/flows/03-profiling.md` says in terms not to
 * invent the missing words, and questions 2, 3 and 4 never appear at all. Rather than ship a
 * two-question questionnaire or four reconstructions passed off as transcription, each question
 * carries a badge naming where its wording came from. `risk.ts` explains what the authored four
 * are for and why they only ask about temperament.
 *
 * **The running readout is scaled over what has been answered.** The source's demo build reads
 * `Conservative` on every frame and then lands on `Risk Averse`, which is what treating the
 * unanswered questions as the most cautious answer looks like. Here it is the answered questions
 * only, and it is labelled as provisional.
 *
 * **Next is disabled until the question is answered.** The source never shows an unanswered
 * state, so whether it can be skipped is unknown. A skipped question in a suitability assessment
 * is a score the customer did not give, and there is no defensible way to fill it in.
 *
 * ## What the frames changed that the spec text did not
 *
 * The first build of this screen was written from `02-profile-question.md` and was structurally
 * right and visually wrong. Put beside the picture: the answer cards were form fields rather than
 * a third of the screen; the live readout was a stacked paragraph where the frame has a
 * two-column card led by an illustration; the progress count and the provenance chip drew
 * identical pixels, which is the exact failure `DESIGN.md` warns about under "three tint names,
 * one colour"; and the app bar repeated the question number the pill already carries. The result
 * screen was the bigger miss and its own comment records it.
 *
 * Two things the reference does that this does not, both named rather than quietly dropped:
 *
 * - **The advance control is a full-width pill, not the frame's right-aligned square FAB.**
 *   `03-PALETTE-MAP.md` conflict 1 settles button shape for the whole app, and one screen is not
 *   the place to reopen it.
 * - **The tab bar stays.** The reference hides its nav for the questionnaire; this screen is
 *   reached through `More`, which owns the shell, and a surface cannot hide chrome it does not
 *   own.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { Screen } from '../../components/Screen.tsx'
import { Button, Card, Head, IconButton, Pill, TextLink } from '../../components/ui.tsx'
import { isApiError } from '../../api/client.ts'
import { OptionRow, ProfileScale } from './parts.tsx'
import { EMPTY_ANSWERS, MAX_SCORE, PROFILE_COPY, QUESTIONS, compare, outcomeOf } from './risk.ts'
import type { Answers, Outcome, RiskProfile } from './risk.ts'
import { Art } from '../../components/Art.tsx'

export function ProfileQuiz({
  current,
  onExit,
  onSave,
}: {
  current: RiskProfile
  /** Back out to the manual picker, answered or not. */
  onExit: () => void
  onSave: (next: RiskProfile) => Promise<void>
}): ReactNode {
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS)
  const [step, setStep] = useState(0)
  const [showResult, setShowResult] = useState(false)

  const outcome = outcomeOf(answers)
  const question = QUESTIONS[step]

  if (showResult && outcome.profile) {
    return (
      <Result
        profile={outcome.profile}
        current={current}
        score={outcome.score}
        onRetake={() => {
          setAnswers(EMPTY_ANSWERS)
          setStep(0)
          setShowResult(false)
        }}
        onBack={() => setShowResult(false)}
        onDone={onExit}
        onSave={onSave}
      />
    )
  }

  if (!question) return null

  const chosen = answers[step] ?? null
  const last = step === QUESTIONS.length - 1

  const choose = (index: number): void =>
    setAnswers((a) => a.map((v, i) => (i === step ? index : v)))

  return (
    <Screen
      header={
        /* No subtitle: the frame's progress affordance is the numeric pill and nothing else — no
           bar, no dot row, no step rail — and a bar's worth of the same number in the app bar was
           the screen saying it twice. */
        <Head
          title="Profile evaluation"
          onBack={step === 0 ? onExit : () => setStep(step - 1)}
          backLabel={step === 0 ? 'Leave the questionnaire' : 'Previous question'}
        />
      }
      footer={
        <div className="flex items-center gap-3">
          {/* The source shows no back affordance until the last step, which is a bug rather than
              a design: an answer you cannot revisit is one a customer will abandon rather than
              correct. It is here from question two onwards. */}
          {step > 0 ? (
            <IconButton label="Previous question" tone="grey" onClick={() => setStep(step - 1)}>
              <ChevronLeft size={19} strokeWidth={2.4} />
            </IconButton>
          ) : null}
          <div className="min-w-0 flex-1">
            <Button
              full
              disabled={chosen === null}
              onClick={() => (last ? setShowResult(true) : setStep(step + 1))}
            >
              {last ? 'See my profile' : 'Next'}
              {last ? null : <ChevronRight size={17} strokeWidth={2.4} />}
            </Button>
          </div>
        </div>
      }
    >
      {/*
       * Two chips, and they must not draw the same pixels. The frame has one — a soft tinted
       * `Question 1/6` — and this screen has to carry provenance beside it. `DESIGN.md` is
       * explicit that the three tint names are one colour and you cannot separate two things by
       * picking two of them, so the count is the *solid* chip and the provenance chips stay soft:
       * separated by weight, which survives a monochrome palette, rather than by hue, which does
       * not.
       */}
      <div className="mb-3.5 mt-4 flex flex-wrap items-center gap-2">
        <Pill tone="ok">
          <span className="tabular-nums">
            Question {step + 1}/{QUESTIONS.length}
          </span>
        </Pill>
        {question.from === 'source' ? (
          <Pill tone="plain">From the reference app</Pill>
        ) : (
          <Pill tone="warn">Written for this app</Pill>
        )}
      </div>

      <h1 className="m-0 text-[22px] font-bold leading-snug tracking-tight text-ink">
        {question.prompt}
      </h1>
      <p className="mb-5 mt-1.5 text-[13px] leading-snug text-ink-soft">{question.measures}</p>

      <div role="radiogroup" aria-label={question.prompt}>
        {question.options.map((option, i) => (
          <OptionRow
            key={option.label}
            label={option.label}
            size="lg"
            selected={chosen === i}
            onSelect={() => choose(i)}
          />
        ))}
      </div>

      <div className="mt-4">
        <ExpectedProfile outcome={outcome} />
      </div>
    </Screen>
  )
}

/* --------------------------------------------------- The live readout card */

/**
 * `ExpectedProfileCard`, from the frame rather than from the sentence describing it.
 *
 * The spec calls it "a tinted rounded card" and the first build read that as a stacked block of
 * text with a rule under it. The picture is a *two-column* card: a square illustration taking
 * about a third of the width on the left, and on the right a small grey caption, the profile name
 * in bold, and the stepper tucked under it at its own width. That shape is why the card reads as
 * a readout rather than as another paragraph, and it is the same illustration the result screen
 * leads with — the source reuses one mark across both, so this does too.
 *
 * Before the first answer there is nothing to read out. The card keeps its shape and says so,
 * rather than appearing halfway down the questionnaire and shifting everything under it.
 */
function ExpectedProfile({ outcome }: { outcome: Outcome }): ReactNode {
  return (
    <Card tint="sage">
      <div className="flex items-center gap-3.5">
        <Art name="profile-result" size="sm" />
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] leading-snug text-ink-soft">
            {outcome.profile
              ? `Expected profile · ${outcome.answered} of ${QUESTIONS.length} answered`
              : 'Expected profile'}
          </div>
          <div className="mt-0.5 text-[19px] font-bold leading-tight text-ink">
            {outcome.profile ?? 'Nothing yet'}
          </div>
          {outcome.profile ? (
            <div className="mt-2.5">
              <ProfileScale value={outcome.profile} provisional={!outcome.complete} compact />
            </div>
          ) : (
            <p className="m-0 mt-1 text-[12.5px] leading-snug text-ink-mid">
              Answer the first question and this starts tracking.
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}

/* ---------------------------------------------------------------- Result */

/**
 * The computed profile.
 *
 * `images/03-profiling/03-profile-result__08.png` is the clean frame and it is the airiest screen
 * in the whole reference: **no app bar at all**, white to the status bar, a cluster of pale
 * contour lines bleeding off the top-right corner, a big left-aligned illustration, then an
 * eyebrow, the profile name as the largest type on the screen, a grey paragraph, a hairline, the
 * retake pair, a deliberate empty stretch, a centred footnote, and the CTA. Nothing is in a card.
 * The first build put it under a header slab with the illustration at 128px and two cards
 * immediately under the paragraph, which is the same content at half the scale.
 *
 * So: no `Head`. The back arrow becomes a bordered disc floating on the white ground — the
 * reference has *no* back affordance here, which is a deliberate arrival but also means an answer
 * you cannot revisit, and this app already refused that on the question screen. Everything above
 * the fold is now the frame's order at the frame's size.
 *
 * Two things stay that the reference has no equivalent for, and they move below the retake pair
 * rather than interrupting the result:
 *
 * - The scale. On a three-stop ladder the useful thing about a result is where it sits relative
 *   to the other two, and the customer has been watching that stepper for six screens.
 * - `What this changes`, which is the only reason this screen is worth reaching. It names the
 *   ceiling, says what will now be refused, and — where it is true — says that the change refuses
 *   nothing at all. `risk.test.ts` proves those sentences against the live gate.
 */
function Result({
  profile,
  current,
  score,
  onRetake,
  onBack,
  onDone,
  onSave,
}: {
  profile: RiskProfile
  current: RiskProfile
  score: number
  onRetake: () => void
  onBack: () => void
  onDone: () => void
  onSave: (next: RiskProfile) => Promise<void>
}): ReactNode {
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copy = PROFILE_COPY[profile]
  const direction = compare(current, profile)

  const save = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await onSave(profile)
      setSaved(true)
    } catch (err) {
      setError(isApiError(err) ? err.message : 'That could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      header={null}
      footer={
        saved ? (
          <Button full onClick={onDone}>
            Done
          </Button>
        ) : (
          <Button full busy={busy} onClick={() => void save()}>
            Save and continue
          </Button>
        )
      }
    >
      {/* -mx-4 …px-4 so the contour lines can bleed off the right edge the way the frame's do,
          while the copy keeps the screen's 16px gutter. */}
      <div className="relative -mx-4 overflow-hidden px-4 pt-3">
        <ResultWaves />
        <div className="relative">
          <IconButton label="Back to the last question" tone="bordered" onClick={onBack}>
            <ArrowLeft size={18} strokeWidth={2.3} />
          </IconButton>
          <Art name="profile-result" size="lg" className="mb-4 mt-4" />
          <div className="text-[13.5px] text-ink-soft">Your evaluated investment profile</div>
          <h1 className="m-0 mt-1 text-[34px] font-bold leading-tight tracking-tight text-ink">
            {profile}
          </h1>
          <p className="mb-0 mt-2.5 text-[15px] leading-relaxed text-ink-mid">{copy.body}</p>
          <div className="mt-5">
            <ProfileScale value={profile} />
          </div>
        </div>
      </div>

      <div className="mb-6 mt-6 border-0 border-t border-solid border-hairline-mint pt-5">
        <p className="m-0 text-[14px] text-ink-mid">Not convinced with the evaluation?</p>
        <TextLink flush onClick={onRetake}>
          Retake questionnaire
        </TextLink>
      </div>

      {saved ? (
        <div
          role="status"
          className="mb-3 rounded-md bg-tint-sage p-3.5 text-[13.5px] leading-relaxed text-brand-deep"
        >
          Saved. Your plan has been recalculated and the gate now uses {profile}.
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mb-3 rounded-md bg-danger-soft p-3.5 text-[13.5px] leading-relaxed text-danger"
        >
          {error}
        </div>
      ) : null}

      <Card tint={direction === 'wider' ? 'clay' : 'sage'}>
        <h2>What this changes</h2>
        <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">{copy.effect}</p>
        <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
          {direction === 'same'
            ? `Your profile is already ${current}, so saving this changes nothing.`
            : direction === 'narrower'
              ? `Narrower than the ${current} on your profile today — saving it can only reduce what you are offered.`
              : `Wider than the ${current} on your profile today. It removes a refusal, does not add a recommendation, and every other rule still runs.`}
        </p>
      </Card>

      <Card>
        <h2>How this was worked out</h2>
        <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
          You scored <b className="font-semibold tabular-nums text-ink">{score}</b> out of{' '}
          {MAX_SCORE}: nought to three per question, in three equal bands. Nought to six is
          Conservative, seven to twelve Balanced, thirteen and above Growth — both edges falling to
          the narrower side, so a borderline answer reads as the more cautious profile.
        </p>
        <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
          Two of the six are the reference app&rsquo;s, word for word. The other four are written
          for this app and were labelled so while you answered — the footage shows only two of its
          six legibly, and reconstructing the rest would have been invention.
        </p>
        <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
          None asks about your income, your horizon or what you could afford to lose — the app reads
          all three from your statement and your goal, and enforces them in rules of their own.
        </p>
      </Card>

      <p className="mb-2 mt-8 text-center text-xs leading-relaxed text-ink-soft">
        Change it any time from <b className="font-semibold">More &rarr; Investment profile</b>.
      </p>
    </Screen>
  )
}

/**
 * The contour lines bleeding off the top-right of the result screen.
 *
 * Frame `08` has a family of thin parallel curves sweeping from the top edge out through the
 * right, behind the illustration, at `#E5F0F7` — barely a shade off white. It is the one piece of
 * decoration on the screen and it is what stops a page of left-aligned type reading as an unstyled
 * document. `03-PALETTE-MAP.md` has no row for "decorative contour", and the nearest honest role
 * in this palette is the hairline: `--hairline-mint` is the thin-line green, and at 70% on white
 * it lands about where the source's does against its own ground.
 *
 * Decorative in the strict sense — nothing here carries a meaning — so it is `aria-hidden` and
 * cannot be tapped.
 */
function ResultWaves(): ReactNode {
  return (
    /* One curve, drawn six times down a diagonal. Six *different* curves is what the first pass
       tried and they crossed each other into a knot in the corner; a translated copy cannot
       cross its own siblings, which is what makes the frame's set read as contour lines. */
    <svg
      aria-hidden="true"
      viewBox="0 0 240 300"
      fill="none"
      className="pointer-events-none absolute -top-6 right-0 h-[300px] w-[240px] stroke-hairline-mint opacity-80"
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path
          key={i}
          d="M 120 -40 C 178 48, 246 96, 400 118"
          transform={`translate(${-i * 24} ${i * 26})`}
          strokeWidth={1.1}
        />
      ))}
    </svg>
  )
}
