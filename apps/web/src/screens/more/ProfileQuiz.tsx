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
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Screen } from '../../components/Screen.tsx'
import { Button, Card, Head, IconButton, Pill, TextLink } from '../../components/ui.tsx'
import { isApiError } from '../../api/client.ts'
import { OptionRow, ProfileScale } from './parts.tsx'
import { EMPTY_ANSWERS, MAX_SCORE, PROFILE_COPY, QUESTIONS, compare, outcomeOf } from './risk.ts'
import type { Answers, RiskProfile } from './risk.ts'

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
        <Head
          title="Profile evaluation"
          sub={`Question ${step + 1} of ${QUESTIONS.length}`}
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
      <div className="mb-3 mt-4 flex flex-wrap items-center gap-2">
        <Pill>
          Question {step + 1}/{QUESTIONS.length}
        </Pill>
        {/* Provenance, on every question, because four of the six are ours. */}
        {question.from === 'source' ? (
          <Pill tone="plain">From the reference app</Pill>
        ) : (
          <Pill tone="warn">Written for this app</Pill>
        )}
      </div>

      <h1 className="m-0 text-[22px] font-bold leading-snug tracking-tight text-ink">
        {question.prompt}
      </h1>
      <p className="mb-4 mt-2 text-[13px] leading-snug text-ink-soft">{question.measures}</p>

      <div role="radiogroup" aria-label={question.prompt}>
        {question.options.map((option, i) => (
          <OptionRow
            key={option.label}
            label={option.label}
            selected={chosen === i}
            onSelect={() => choose(i)}
          />
        ))}
      </div>

      <Card tint="sage">
        <div className="text-[13px] text-ink-soft">
          {outcome.profile
            ? `On your answers so far (${outcome.answered} of ${QUESTIONS.length})`
            : 'Where this is heading'}
        </div>
        <div className="mt-0.5 text-[20px] font-bold leading-tight text-ink">
          {outcome.profile ?? 'Nothing yet'}
        </div>
        <div className="mt-3">
          {outcome.profile ? (
            <ProfileScale value={outcome.profile} provisional={!outcome.complete} />
          ) : (
            <p className="m-0 text-[13px] leading-snug text-ink-mid">
              Answer the first question and this starts tracking. It can move either way until the
              last one.
            </p>
          )}
        </div>
      </Card>
    </Screen>
  )
}

/* ---------------------------------------------------------------- Result */

/**
 * The computed profile.
 *
 * The source's result screen is an illustration, a name, a paragraph, a retake link and
 * `Save and Continue`, with no scale on it at all. The scale is back here, because on a
 * three-stop ladder the useful thing about a result is where it sits relative to the other two —
 * and because the customer has been watching that stepper for six screens.
 *
 * `What this changes` is the part the reference has no equivalent for, and it is the only reason
 * this screen is worth reaching. It names the ceiling, says what will now be refused, and — where
 * it is true — says that the change refuses nothing at all. `risk.test.ts` proves those sentences
 * against the live gate.
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
      header={
        <Head
          title="Your investment profile"
          sub={saved ? 'Saved' : 'Not saved yet'}
          onBack={onBack}
          backLabel="Back to the last question"
        />
      }
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
      <div className="mt-5">
        <div className="text-[13px] text-ink-soft">Here is your evaluated investment profile</div>
        <h1 className="m-0 mt-1 text-[34px] font-bold leading-tight tracking-tight text-ink">
          {profile}
        </h1>
        <p className="mb-0 mt-2 text-[15px] leading-relaxed text-ink-mid">{copy.body}</p>
      </div>

      <div className="my-5">
        <ProfileScale value={profile} />
      </div>

      {saved ? (
        <div
          role="status"
          className="mb-3 rounded-md bg-tint-sage p-3.5 text-[13.5px] leading-relaxed text-brand-deep"
        >
          Saved. Your plan has been recalculated and the gate is using {profile} from now on.
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
              ? `This is narrower than the ${current} on your profile today. Saving it can only reduce what you are offered.`
              : `This is wider than the ${current} on your profile today. Saving it removes a refusal; it does not add a recommendation, and every other rule still runs.`}
        </p>
      </Card>

      <Card>
        <h2>How this was worked out</h2>
        <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
          You scored <b className="font-semibold tabular-nums text-ink">{score}</b> out of{' '}
          {MAX_SCORE}: nought to three per question, in three equal bands. Nought to six is
          Conservative, seven to twelve Balanced, thirteen and above Growth. Both edges fall on the
          narrower side, so a borderline answer reads as the more cautious profile.
        </p>
        <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
          Two of the six questions are the reference app&rsquo;s, word for word. The other four are
          written for this app and were labelled as such while you answered them — the source
          footage only ever shows two of its six questions legibly, and reconstructing the rest
          would have been invention.
        </p>
        <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
          None of them asks about your income, your horizon or what you could afford to lose. The
          app already reads all three from your statement and your goal, and enforces them in rules
          of their own.
        </p>
      </Card>

      <div className="mb-6 mt-1">
        <p className="m-0 text-[13.5px] text-ink-mid">Not convinced with the evaluation?</p>
        <TextLink flush onClick={onRetake}>
          Retake questionnaire
        </TextLink>
      </div>

      <p className="mb-2 text-center text-xs leading-relaxed text-ink-soft">
        You can always change your investment profile from{' '}
        <b className="font-semibold">More &rarr; Investment profile</b>.
      </p>
    </Screen>
  )
}
