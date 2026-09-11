/**
 * Step 2b — anything already owned, for the customer IDBI has nothing recorded for.
 *
 * A detour rather than a step: it does not advance the stepper, it advances the rail inside
 * "About you", because everything on it is still the customer telling us something the feed
 * cannot. That is the reference's own reading of its progress bar — the fill on
 * `03-register-mobile` is ~16% while step 1 of 3 is lit, so it tracks work inside a step.
 *
 * Shape from `06-otp-verify`, which is the reference's one genuinely short screen: a headline, a
 * line of helper text, the control, and the action pinned. Ours had two conditional forms and
 * two loose secondary buttons stacked in the middle of the page with the primary underneath
 * them; the adds are now inside a bordered card each, and the skip is a quiet link beside the
 * pinned action rather than a third button competing with it.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { Button, TextLink } from '../../components/ui.tsx'
import { Field, MoneyInput, TextInput } from '../../components/Form.tsx'
import { api } from '../../api/client.ts'
import { Band, Funnel } from './Chrome.tsx'

export function Own({ onNext }: { onNext: () => void }): ReactNode {
  const [name, setName] = useState('')
  const [value, setValue] = useState(0)
  const [cover, setCover] = useState(0)
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState(0)

  const add = async (kind: 'fund' | 'cover'): Promise<void> => {
    setBusy(true)
    try {
      await api('addHolding', {
        body:
          kind === 'cover'
            ? {
                holdingType: 'INSURANCE',
                name: 'Life cover',
                assetClass: 'Protection',
                // Cover goes in `investedAmount` and the value stays zero: a net worth that
                // counted a sum assured would be wrong by the whole policy.
                investedAmount: cover,
                currentValue: 0,
                sipActive: false,
              }
            : {
                holdingType: 'MUTUAL_FUND',
                name: name.trim(),
                assetClass: 'Equity',
                investedAmount: value,
                currentValue: value,
                sipActive: false,
              },
      })
      setAdded((n) => n + 1)
      setName('')
      setValue(0)
      setCover(0)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Funnel
      at="About you"
      fill={0.72}
      action={
        <div className="flex items-center gap-2">
          <TextLink onClick={onNext}>{added > 0 ? 'Done' : 'Not now'}</TextLink>
          <Button full onClick={onNext}>
            See my plan
            <ArrowRight size={17} strokeWidth={2.6} />
          </Button>
        </div>
      }
    >
      <h1 className="m-0 text-[26px] font-semibold leading-tight text-ink">
        Anything you already own?
      </h1>
      <p className="m-0 mb-5 mt-2 text-[14.5px] leading-normal text-ink-mid">
        IDBI has no record of funds, deposits elsewhere or insurance. Without them I might suggest
        something you already hold, or miss a gap you do not know about. This can wait.
      </p>

      {added > 0 ? (
        <p className="ds-rise m-0 mt-4 inline-flex items-center gap-1.5 rounded-pill bg-legend-chip px-[11px] py-[5px] text-xs font-semibold text-brand-deep">
          <Check size={13} strokeWidth={3} />
          {added} {added === 1 ? 'thing' : 'things'} recorded
        </p>
      ) : null}

      <Band>A fund or a deposit</Band>
      <div className="mb-1 mt-3.5 rounded-md border border-solid border-hairline bg-surface p-4">
        <Field label="What is it called?" hint="Leave blank if there is nothing to add.">
          <TextInput
            ariaLabel="Investment name"
            value={name}
            maxLength={60}
            placeholder="Nifty 50 Index Fund"
            onChange={setName}
          />
        </Field>
        {name.trim() !== '' ? (
          <div className="ds-rise">
            <Field label="What is it worth today?">
              <MoneyInput ariaLabel="Investment value" value={value} onChange={setValue} />
            </Field>
            <Button
              tone="secondary"
              size="sm"
              busy={busy}
              disabled={value <= 0}
              onClick={() => void add('fund')}
            >
              Add it
            </Button>
          </div>
        ) : null}
      </div>

      <Band>Life cover already in force</Band>
      <div className="mb-2 mt-3.5 rounded-md border border-solid border-hairline bg-surface p-4">
        <Field label="How much is insured?" hint="The amount insured, not the premium.">
          <MoneyInput ariaLabel="Life cover" value={cover} onChange={setCover} />
        </Field>
        {cover > 0 ? (
          <div className="ds-rise">
            <Button tone="secondary" size="sm" busy={busy} onClick={() => void add('cover')}>
              Add the cover
            </Button>
          </div>
        ) : null}
      </div>
    </Funnel>
  )
}
