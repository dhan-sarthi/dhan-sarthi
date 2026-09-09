/**
 * The declared profile, editable.
 *
 * Everything on this sheet is a fact IDBI has no endpoint for. Income, employment, dependents,
 * marital status, risk profile and tax regime are what a customer tells an adviser, and the
 * bank's twenty-four APIs carry none of them. So they are the app's own, and this is where they
 * are changed.
 *
 * It is also the most consequential screen in the app, which is why it says so. Raising the
 * declared income moves the surplus, the daily allowance, the goal target and the cover
 * requirement; changing the risk profile can turn a recommendation the suitability gate allowed
 * into one it refuses. The customer should press save knowing that, and should see the numbers
 * move when they come back.
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { DeclaredProfileResponse, ProfilePatch } from '@dhan/contracts'
import { Sheet } from '../components/Sheet.tsx'
import { Button, Skeleton } from '../components/ui.tsx'
import { Choice, Field, MoneyInput, Stepper, TextInput } from '../components/Form.tsx'
import { api, isApiError } from '../api/client.ts'

const EMPLOYMENT = [
  { id: 'Salaried', label: 'Salaried' },
  { id: 'Self-employed', label: 'Self-employed' },
  { id: 'Business', label: 'Business' },
] as const

const RISK = [
  { id: 'Conservative', label: 'Careful' },
  { id: 'Balanced', label: 'Balanced' },
  { id: 'Growth', label: 'Growth' },
] as const

const MARITAL = [
  { id: 'Single', label: 'Single' },
  { id: 'Married', label: 'Married' },
] as const

const REGIME = [
  { id: 'new', label: 'New regime' },
  { id: 'old', label: 'Old regime' },
] as const

type Draft = {
  declaredAnnualIncome: number
  employmentType: (typeof EMPLOYMENT)[number]['id']
  riskProfile: (typeof RISK)[number]['id']
  maritalStatus: string
  dependents: number
  taxRegime: (typeof REGIME)[number]['id']
  dateOfBirth: string
}

function toDraft(p: DeclaredProfileResponse): Draft {
  return {
    declaredAnnualIncome: p.declaredAnnualIncome,
    employmentType: p.employmentType,
    riskProfile: p.riskProfile,
    maritalStatus: p.maritalStatus,
    dependents: p.dependents,
    taxRegime: p.taxRegime,
    dateOfBirth: p.dateOfBirth ?? '',
  }
}

/** Only what actually moved, so an untouched field is never re-sent as a change. */
function changes(before: Draft, after: Draft): ProfilePatch {
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(after) as (keyof Draft)[]) {
    if (after[key] !== before[key]) patch[key] = after[key]
  }
  if (patch['dateOfBirth'] === '') delete patch['dateOfBirth']
  return patch as ProfilePatch
}

export function ProfileSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  /** The view has to be reloaded: every field here feeds the engine. */
  onSaved: (message: string) => void
}): ReactNode {
  const [loaded, setLoaded] = useState<DeclaredProfileResponse | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let live = true
    setError(null)
    void api('getProfile')
      .then((p) => {
        if (!live) return
        setLoaded(p)
        setDraft(toDraft(p))
      })
      .catch((err: unknown) => {
        if (!live) return
        setError(isApiError(err) ? err.message : 'Your profile could not be read.')
      })
    return () => {
      live = false
    }
  }, [open])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void =>
    setDraft((d) => (d === null ? d : { ...d, [key]: value }))

  const dirty =
    loaded !== null && draft !== null && Object.keys(changes(toDraft(loaded), draft)).length > 0
  const needsDob = loaded?.missing.includes('dateOfBirth') === true

  const save = async (): Promise<void> => {
    if (loaded === null || draft === null) return
    const patch = changes(toDraft(loaded), draft)
    if (Object.keys(patch).length === 0) return onClose()
    setBusy(true)
    setError(null)
    try {
      const next = await api('patchProfile', { body: patch })
      setLoaded(next)
      setDraft(toDraft(next))
      onSaved('Saved. Your plan has been recalculated.')
      onClose()
    } catch (err) {
      setError(isApiError(err) ? err.message : 'That could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="About you"
      sub="What the bank does not know. Every one of these changes the advice."
      footer={
        <Button full busy={busy} disabled={!dirty} onClick={() => void save()}>
          {dirty ? 'Save and recalculate' : 'Nothing to save'}
        </Button>
      }
    >
      {error ? (
        <p
          role="alert"
          className="mb-3 mt-1 rounded-sm bg-danger-soft px-3 py-2.5 text-[13px] leading-snug text-danger"
        >
          {error}
        </p>
      ) : null}

      {draft === null ? (
        <div className="pt-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="mb-5">
              <Skeleton h={13} w="38%" className="mb-2" />
              <Skeleton h={48} />
            </div>
          ))}
        </div>
      ) : (
        <div className="pt-1">
          {needsDob ? (
            <div className="mb-4 rounded-sm bg-tint-clay p-3">
              <p className="m-0 text-[13px] font-semibold leading-snug text-accent-text">
                The bank sends no date of birth for you
              </p>
              <p className="m-0 mt-1 text-[12.5px] leading-snug text-ink-mid">
                Age decides which products can be recommended at all, so nothing can be suggested
                until this is filled in.
              </p>
            </div>
          ) : null}

          {needsDob || draft.dateOfBirth !== '' ? (
            <Field
              label="Date of birth"
              hint={needsDob ? 'Needed before any advice can be given.' : undefined}
            >
              <TextInput
                type="date"
                ariaLabel="Date of birth"
                value={draft.dateOfBirth}
                onChange={(v) => set('dateOfBirth', v)}
              />
            </Field>
          ) : null}

          <Field
            label="What you earn a year"
            hint="Before tax. Used for the cover you need and the surplus you can invest."
          >
            <MoneyInput
              ariaLabel="Annual income"
              value={draft.declaredAnnualIncome}
              onChange={(n) => set('declaredAnnualIncome', n)}
            />
          </Field>

          <Field label="How you earn it">
            <Choice
              options={EMPLOYMENT}
              value={draft.employmentType}
              onChange={(v) => set('employmentType', v)}
            />
          </Field>

          <Field
            label="How you feel about risk"
            hint="Careful refuses more than Growth does. It can only ever narrow what you are offered."
          >
            <Choice
              options={RISK}
              value={draft.riskProfile}
              onChange={(v) => set('riskProfile', v)}
            />
          </Field>

          <Field label="Marital status">
            <Choice
              options={MARITAL}
              value={draft.maritalStatus as 'Single' | 'Married'}
              onChange={(v) => set('maritalStatus', v)}
            />
          </Field>

          <Field
            label="People who depend on your income"
            hint="Sets the life cover you are told you need."
          >
            <Stepper value={draft.dependents} onChange={(n) => set('dependents', n)} />
          </Field>

          <Field
            label="Tax regime"
            hint="The new regime has been the default since FY 2023-24, and under it a tax-saving fund saves no tax."
          >
            <Choice
              options={REGIME}
              value={draft.taxRegime}
              onChange={(v) => set('taxRegime', v)}
            />
          </Field>

          <p className="mb-1 mt-5 text-xs leading-relaxed text-ink-soft">
            These are yours, not the bank&rsquo;s. Record &rarr; Your data marks them as declared,
            and the bank never sees them.
          </p>
        </div>
      )}
    </Sheet>
  )
}
