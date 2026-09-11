/**
 * Step 2 — the five things the bank cannot tell us.
 *
 * The questions are unchanged and so is the reason for asking them. What changed is the shape,
 * and it came off two frames:
 *
 * - **Bands.** `05-profile-kyc-details` never shows more than four facts between two full-bleed
 *   grey strips. Ours was five labelled fields and five hints stacked with nothing between them
 *   — an unbroken 900px column that read as a settings page. The same three-band device turns it
 *   into `WHAT COMES IN` / `WHO IT HAS TO COVER` / `HOW IT SHOULD BE INVESTED`, which is also a
 *   truer description of what each answer is for.
 *
 * - **A consent that is a control.** `03-register-mobile` puts three ticked checkbox rows between
 *   the field and the button, with the links inline in the sentence. Ours had a grey footnote
 *   under the button saying roughly the same thing, which is not a consent, it is a disclaimer.
 *   It is now a real box, ticked by default the way the reference's three are, and untickable —
 *   and the button will not proceed while it is off, because declaring an income to an advisor
 *   service is exactly the kind of thing the reference is asking about.
 *
 * The reference's other two consents are HDFC-specific and duplicated placeholders by its own
 * spec's admission; there is one thing being consented to here, so there is one box.
 */
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import type { DeclaredProfileResponse, ProfilePatch } from '@dhan/contracts'
import { Button } from '../../components/ui.tsx'
import { Checkbox, Choice, Field, MoneyInput, Stepper, TextInput } from '../../components/Form.tsx'
import { api, isApiError } from '../../api/client.ts'
import { EMPLOYMENT, REGIME, RISK } from '../../lib/profile-options.ts'
import { Band, Funnel } from './Chrome.tsx'

export function About({ first, onNext }: { first: string | null; onNext: () => void }): ReactNode {
  const [loaded, setLoaded] = useState<DeclaredProfileResponse | null>(null)
  const [income, setIncome] = useState(0)
  const [employment, setEmployment] = useState<(typeof EMPLOYMENT)[number]['id']>('Salaried')
  const [risk, setRisk] = useState<(typeof RISK)[number]['id']>('Balanced')
  const [dependents, setDependents] = useState(0)
  const [regime, setRegime] = useState<(typeof REGIME)[number]['id']>('new')
  const [dob, setDob] = useState('')
  const [consent, setConsent] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      const p = await api('getProfile')
      setLoaded(p)
      setIncome(p.declaredAnnualIncome)
      setEmployment(p.employmentType)
      setRisk(p.riskProfile)
      setDependents(p.dependents)
      setRegime(p.taxRegime)
      setDob(p.dateOfBirth ?? '')
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Your profile could not be read.')
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  const needsDob = loaded?.missing.includes('dateOfBirth') === true
  const filled = income > 0 && (!needsDob || dob !== '')
  const ready = filled && consent

  const save = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    const patch: ProfilePatch = {
      declaredAnnualIncome: income,
      employmentType: employment,
      riskProfile: risk,
      dependents,
      taxRegime: regime,
      ...(dob === '' ? {} : { dateOfBirth: dob }),
    }
    try {
      await api('patchProfile', { body: patch })
      onNext()
    } catch (err) {
      setError(isApiError(err) ? err.message : 'That could not be saved.')
      setBusy(false)
    }
  }

  return (
    <Funnel
      at="About you"
      fill={0.5}
      action={
        <Button full busy={busy} disabled={!ready} onClick={() => void save()}>
          {filled
            ? consent
              ? 'Next'
              : 'Tick the consent to continue'
            : 'Fill these in to continue'}
          {ready ? <ArrowRight size={17} strokeWidth={2.6} /> : null}
        </Button>
      }
    >
      <h1 className="m-0 text-[26px] font-semibold leading-tight text-ink">
        Five things the bank cannot tell me
      </h1>
      <p className="m-0 mb-5 mt-2 text-[14.5px] leading-normal text-ink-mid">
        {first === null ? 'Your' : `${first}’s`} statements say what went out. They do not say what
        comes in, who depends on it, or how much risk is bearable. Every one of these changes the
        advice, so none of them is guessed.
      </p>

      {error ? (
        <p
          role="alert"
          className="mb-4 mt-4 rounded-sm bg-danger-soft px-3 py-2.5 text-[13px] leading-snug text-danger"
        >
          {error}
        </p>
      ) : null}

      <Band>What comes in</Band>
      <div className="pt-3.5">
        {needsDob ? (
          <Field label="Date of birth" hint="Age decides which products can be recommended at all.">
            <TextInput type="date" ariaLabel="Date of birth" value={dob} onChange={setDob} />
          </Field>
        ) : null}
        <Field label="What comes in each year" hint="Before tax.">
          <MoneyInput ariaLabel="Annual income" value={income} onChange={setIncome} />
        </Field>
        <Field label="How it is earned">
          <Choice options={EMPLOYMENT} value={employment} onChange={setEmployment} />
        </Field>
      </div>

      <Band>Who it has to cover</Band>
      <div className="pt-3.5">
        <Field label="People who depend on it" hint="Sets the life cover you are told you need.">
          <Stepper value={dependents} onChange={setDependents} />
        </Field>
      </div>

      <Band>How it should be invested</Band>
      <div className="pt-3.5">
        <Field
          label="How you feel about risk"
          hint="Conservative can only ever narrow what you are offered, never widen it."
        >
          <Choice options={RISK} value={risk} onChange={setRisk} />
        </Field>
        <Field
          label="Tax regime"
          hint="Under the new one a tax-saving fund saves no tax, so it stops being recommended."
        >
          <Choice options={REGIME} value={regime} onChange={setRegime} />
        </Field>
      </div>

      <div className="mt-2 border-0 border-t border-solid border-hairline-mint pt-1">
        <Checkbox checked={consent} onChange={setConsent}>
          These five answers are mine to give. They go to the advisor service so it can judge what
          to recommend, never to the bank, and{' '}
          <span className="font-semibold text-brand-deep">Record &rarr; Your data</span> marks them
          as declared.
        </Checkbox>
      </div>
    </Funnel>
  )
}
