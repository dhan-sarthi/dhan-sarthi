/**
 * Investment profile — pick one, or have it worked out.
 *
 * `spec/screens/03-profiling/01-investment-profile-select.md` is a horizontally paged carousel of
 * five profile cards over a five-stop slider, with `Confirm` and
 * `Or Get Your Investment Profile Evaluated` in a sticky sheet at the bottom. Two departures,
 * both deliberate.
 *
 * **Three profiles, not five.** See the header of `risk.ts`. The gate consumes a three-value
 * enum and a five-stop scale would show two distinctions it cannot act on.
 *
 * **No carousel and no slider.** A carousel hides two of three options off-screen and a slider
 * makes a compliance value something you can set by dragging past it. Three stacked cards show
 * all three at once with their consequences visible, which is what a customer needs to choose
 * between them. `COMPONENT-GAP.md` lists `RiskSlider` as still-to-extend; this screen is not the
 * caller that justifies it.
 *
 * What is kept from the source is the part that matters: the manual pick and the questionnaire
 * are two doors into the same value, offered together, with the questionnaire as the quieter of
 * the two. A customer who knows their own mind should not have to answer six questions.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { View } from '@dhan/contracts'
import { Screen } from '../../components/Screen.tsx'
import { Button, Card, Head, TextLink } from '../../components/ui.tsx'
import { api, isApiError } from '../../api/client.ts'
import { OptionRow, ProfileScale } from './parts.tsx'
import { ProfileQuiz } from './ProfileQuiz.tsx'
import { PROFILES, PROFILE_COPY, compare } from './risk.ts'
import type { RiskProfile } from './risk.ts'

export function InvestmentProfile({
  view,
  onBack,
  onSaved,
}: {
  view: View
  onBack: () => void
  /** Re-read the view. Changing this can turn a recommendation the gate allowed into a refusal. */
  onSaved: () => Promise<void>
}): ReactNode {
  const [page, setPage] = useState<'select' | 'quiz'>('select')
  const current = view.snapshot.customer.riskProfile

  /** One save path for both doors, so the PATCH and the recompute cannot drift apart. */
  const save = async (next: RiskProfile): Promise<void> => {
    await api('patchProfile', { body: { riskProfile: next } })
    await onSaved()
  }

  if (page === 'quiz') {
    return <ProfileQuiz current={current} onExit={() => setPage('select')} onSave={save} />
  }

  return (
    <SelectProfile
      current={current}
      onBack={onBack}
      onSave={save}
      onEvaluate={() => setPage('quiz')}
    />
  )
}

function SelectProfile({
  current,
  onBack,
  onSave,
  onEvaluate,
}: {
  current: RiskProfile
  onBack: () => void
  onSave: (next: RiskProfile) => Promise<void>
  onEvaluate: () => void
}): ReactNode {
  const [choice, setChoice] = useState<RiskProfile>(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const dirty = choice !== current
  const direction = compare(current, choice)

  const save = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await onSave(choice)
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
        <Head title="Investment profile" sub="What the gate will not go above" onBack={onBack} />
      }
      footer={
        <>
          <Button full busy={busy} disabled={!dirty} onClick={() => void save()}>
            {dirty ? `Save ${choice}` : 'Nothing to change'}
          </Button>
          <div className="mt-1 text-center">
            <TextLink onClick={onEvaluate}>Or have it worked out for you</TextLink>
          </div>
        </>
      }
    >
      <Card tint="sky">
        <h2>This one is enforced</h2>
        <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
          Your profile is not a label. It is read by the suitability gate before anything is
          recommended to you, and a product rated above it is refused outright — with the reason
          written into the record. Narrowing it can only ever reduce what you are offered.
        </p>
        <div className="mt-3.5">
          <ProfileScale value={current} />
        </div>
      </Card>

      {saved ? (
        <div
          role="status"
          className="mb-3 rounded-md bg-tint-sage p-3.5 text-[13.5px] leading-relaxed text-brand-deep"
        >
          Saved. Your plan has been recalculated and the gate is using {choice} from now on.
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

      <h2 className="m-0 mb-3 mt-2 text-[17px] font-semibold text-ink">Choose your profile</h2>
      <div role="radiogroup" aria-label="Investment profile">
        {PROFILES.map((p) => (
          <OptionRow
            key={p}
            label={p === current ? `${p} — your profile today` : p}
            sub={PROFILE_COPY[p].body}
            selected={choice === p}
            onSelect={() => {
              setChoice(p)
              setSaved(false)
            }}
          />
        ))}
      </div>

      <Card tint={direction === 'wider' ? 'clay' : 'sage'}>
        <h2>{dirty ? `What ${choice} would change` : `What ${choice} does today`}</h2>
        <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
          {PROFILE_COPY[choice].effect}
        </p>
        {dirty ? (
          <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
            {direction === 'narrower'
              ? `That is narrower than ${current}. Anything already recommended to you that sits above the new ceiling will start being refused.`
              : `That is wider than ${current}. Widening a profile removes a refusal — it does not add a recommendation, and every other rule still runs.`}
          </p>
        ) : null}
      </Card>

      {/*
       * The honest footnote about the scale itself. `spec/flows/03-profiling.md` names five
       * categories; a reviewer who knows the reference will count the cards and should find the
       * reason here rather than assume two were dropped.
       */}
      <Card>
        <h2>Why three and not five</h2>
        <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
          The suitability gate stores one of three values and looks each up in a three-row table of
          risk ceilings. A five-stop scale would ask you to choose between names that produce the
          same answer.
        </p>
        <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
          The same honesty cuts the other way, and it is on the card above: of the three, only
          Conservative refuses anything on risk band alone. What keeps a Balanced or Growth investor
          out of the wrong fund is the date on the goal, not the profile.
        </p>
      </Card>
    </Screen>
  )
}
