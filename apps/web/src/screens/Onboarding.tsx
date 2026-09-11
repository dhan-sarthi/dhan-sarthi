/**
 * First run: connect, ask, and hand over a plan.
 *
 * Four steps, and the first one is the reason this exists at all. Opening a customer fires four
 * live calls to a bank and takes a couple of seconds, and what used to fill that was a card
 * saying "one moment". A wait that shows what it is doing is a different experience from a wait
 * that does not — and here each line is a real call, ticked when its own reply lands, reporting
 * what actually came back. Nothing on this screen is on a timer.
 *
 * The second step is the honest one. The advice needs an income, a risk appetite and a number
 * of dependents, and IDBI has no endpoint for any of them: not one of the twenty-four
 * operations carries a declared income. Seeding those invisibly and hoping nobody asks is the
 * alternative, and it is how a demo ends up advising on figures nobody stated. So the app asks,
 * once, and says why it is asking.
 *
 * Everything here can be skipped except the profile, because the profile is what the engine
 * cannot run without.
 */
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { ArrowRight, Check, FileText, Landmark, ShieldCheck, Sparkles, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { DeclaredProfileResponse, HoldingsResponse, ProfilePatch, View } from '@dhan/contracts'
import { Button } from '../components/ui.tsx'
import { Choice, Field, MoneyInput, Stepper, TextInput } from '../components/Form.tsx'
import { api, isApiError } from '../api/client.ts'
import { approx, inr } from '../lib/money.ts'
import { useRipple } from '../lib/motion.ts'

type Step = 'connect' | 'about' | 'own' | 'ready'

/* ---------------------------------------------------------------- Connect */

type StepKey = 'accounts' | 'statement' | 'consents' | 'holdings'

interface Probe {
  key: StepKey
  icon: LucideIcon
  doing: string
  /** What to say once the reply is in. Written from that reply, never from a guess. */
  done: (facts: Facts) => string
}

interface Facts {
  accounts: number
  balance: number
  /**
   * Read off the statement page itself rather than off the snapshot's count, because this line
   * reports what its own call returned. `more` is set when the cursor says there are further
   * pages, so the figure is never quietly presented as a total when it is a page.
   */
  lines: number
  more: boolean
  debt: number
  outgo: number
  consents: number
  holdings: number
}

/**
 * One row per call, and there are exactly four calls.
 *
 * Not one call to `/view` with the rows revealed on a timer: the point of showing the steps is
 * that they are the work, and a progress bar that is really a `setTimeout` is precisely the
 * thing this screen exists to replace. They therefore land out of order sometimes, which is
 * honest — the statement is the slow one.
 */
const PROBES: readonly Probe[] = [
  {
    key: 'accounts',
    icon: Landmark,
    doing: 'Finding your accounts',
    done: (f) =>
      f.accounts === 0
        ? 'No accounts on this feed'
        : `${f.accounts} ${f.accounts === 1 ? 'account' : 'accounts'} \u00b7 ${inr(f.balance)}`,
  },
  {
    key: 'statement',
    icon: FileText,
    doing: 'Reading your statement',
    done: (f) =>
      f.lines === 0
        ? 'No statement lines on this feed'
        : `${f.lines}${f.more ? '+' : ''} ${f.lines === 1 && !f.more ? 'line' : 'lines'}`,
  },
  {
    key: 'consents',
    icon: ShieldCheck,
    doing: 'Checking your consents',
    done: (f) =>
      f.consents === 0 ? 'No accounts linked elsewhere' : `${f.consents} live at the aggregator`,
  },
  {
    key: 'holdings',
    icon: Wallet,
    doing: 'Looking for what you own',
    done: (f) =>
      f.holdings === 0
        ? 'Nothing on record here'
        : `${f.holdings} ${f.holdings === 1 ? 'thing' : 'things'} already recorded`,
  },
]

const EMPLOYMENT = [
  { id: 'Salaried', label: 'Salaried' },
  { id: 'Self-employed', label: 'Self-employed' },
  { id: 'Business', label: 'Business' },
] as const

const RISK = [
  { id: 'Conservative', label: 'Conservative' },
  { id: 'Balanced', label: 'Balanced' },
  { id: 'Growth', label: 'Growth' },
] as const

const REGIME = [
  { id: 'new', label: 'New regime' },
  { id: 'old', label: 'Old regime' },
] as const

export function Onboarding({ onDone }: { onDone: () => void }): ReactNode {
  const [step, setStep] = useState<Step>('connect')
  const [ticked, setTicked] = useState<StepKey[]>([])
  const [facts, setFacts] = useState<Facts | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  /*
   * Their name comes out of the first call, like everything else on this screen. The shell knows
   * only a cif at this point, and inventing a greeting from it would be the one made-up thing in
   * a flow whose whole argument is that nothing here is made up.
   */
  const [first, setFirst] = useState<string | null>(null)

  const connect = useCallback(async (): Promise<void> => {
    setFailed(null)
    setTicked([])
    const collected: Facts = {
      accounts: 0,
      balance: 0,
      lines: 0,
      more: false,
      debt: 0,
      outgo: 0,
      consents: 0,
      holdings: 0,
    }
    const tick = (key: StepKey): void => setTicked((prev) => [...prev, key])

    /*
     * Only this one is fatal. Without a view there is nothing to introduce, whereas a source
     * with no aggregator answers 503 on consents and a customer with nothing recorded is a
     * perfectly ordinary customer — those two report their emptiness and carry on.
     */
    const view = api('getView')
      .then((v: View) => {
        setFirst(v.snapshot.customer.name.split(' ')[0] ?? null)
        collected.accounts = v.accounts.length
        collected.balance = v.snapshot.balances.total
        collected.debt = v.snapshot.debt.total
        collected.outgo = v.snapshot.debt.monthlyOutgo
        tick('accounts')
      })
      .catch((err: unknown) => {
        setFailed(isApiError(err) ? err.message : 'Your accounts could not be read.')
      })

    const statement = api('listTransactions', { query: { limit: 200 } })
      .then((page) => {
        collected.lines = page.items.length
        collected.more = page.nextCursor !== null
        tick('statement')
      })
      .catch(() => tick('statement'))

    const consents = api('listConsentRequests')
      .then((list) => {
        collected.consents = list.filter((c) => c.status === 'ACTIVE').length
        tick('consents')
      })
      .catch(() => tick('consents'))

    const holdings = api('getHoldings')
      .then((h: HoldingsResponse) => {
        collected.holdings = h.holdings.length + h.policies.length
        tick('holdings')
      })
      .catch(() => tick('holdings'))

    await Promise.all([view, statement, consents, holdings])
    setFacts({ ...collected })
  }, [])

  useEffect(() => {
    // Off the effect's own tick, as everywhere else in this app.
    queueMicrotask(() => void connect())
  }, [connect])

  if (step === 'connect') {
    return (
      <Frame step={1}>
        <h1 className="m-0 text-[26px] font-semibold leading-tight text-ink">
          {first === null ? 'Reading your accounts' : `Reading ${first}\u2019s accounts`}
        </h1>
        <p className="m-0 mb-6 mt-2 text-[14.5px] leading-normal text-ink-mid">
          Straight from IDBI, live. Nothing here is stored in this browser.
        </p>

        <ul className="m-0 list-none p-0">
          {PROBES.map((probe, i) => (
            <ProbeRow
              key={probe.key}
              probe={probe}
              index={i}
              done={ticked.includes(probe.key)}
              facts={facts}
            />
          ))}
        </ul>

        {failed !== null ? (
          <div className="ds-rise mt-6">
            <p role="alert" className="m-0 mb-3 text-[13.5px] leading-normal text-danger">
              {failed}
            </p>
            <Button tone="secondary" onClick={() => void connect()}>
              Try again
            </Button>
          </div>
        ) : null}

        {facts !== null && failed === null ? (
          <div className="ds-rise mt-7">
            <Button full onClick={() => setStep('about')}>
              Next
              <ArrowRight size={17} strokeWidth={2.6} />
            </Button>
          </div>
        ) : null}
      </Frame>
    )
  }

  if (step === 'about') {
    return <About first={first} onNext={() => setStep(facts?.holdings === 0 ? 'own' : 'ready')} />
  }

  if (step === 'own') {
    return <Own onNext={() => setStep('ready')} />
  }

  return <Ready first={first} facts={facts} onDone={onDone} />
}

/* ---------------------------------------------------------------- Frame */

/** The shell each step sits in: a step counter, and room to breathe. */
function Frame({ step, children }: { step: number; children: ReactNode }): ReactNode {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none gap-1.5 px-5 pb-1 pt-6">
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            className={`h-1 flex-1 rounded-pill transition-colors duration-300 ${
              n <= step ? 'bg-accent' : 'bg-hairline'
            }`}
          />
        ))}
      </div>
      <div className="scroll ds-fade pt-5">{children}</div>
    </div>
  )
}

function ProbeRow({
  probe,
  index,
  done,
  facts,
}: {
  probe: Probe
  index: number
  done: boolean
  facts: Facts | null
}): ReactNode {
  const Icon = probe.icon
  return (
    <li
      className="ds-rise ds-stagger mb-2.5 flex items-center gap-3 rounded-md border border-solid border-hairline-mint bg-surface p-3.5"
      style={{ '--i': index } as CSSProperties}
    >
      <span
        className={`grid size-9 flex-none place-items-center rounded-pill ${
          done ? 'bg-brand text-on-dark' : 'bg-ground-deep text-ink-soft'
        }`}
      >
        {/* The subject of the call while it is in flight, a tick once it lands. A spinner in
            every row would say four times over what the moving line underneath already says. */}
        {done ? (
          <span className="ds-tick grid place-items-center">
            <Check size={17} strokeWidth={3} />
          </span>
        ) : (
          <Icon size={17} strokeWidth={2.2} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-semibold leading-snug text-ink">
          {probe.doing}
        </span>
        {done && facts !== null ? (
          <span className="ds-fade block text-[12.5px] leading-snug text-ink-soft">
            {probe.done(facts)}
          </span>
        ) : (
          <span className="relative mt-1.5 block h-1 overflow-hidden rounded-pill bg-ground-deep text-accent-soft">
            <span className="ds-track absolute inset-0 block" />
          </span>
        )}
      </span>
    </li>
  )
}

/* ---------------------------------------------------------------- About you */

function About({ first, onNext }: { first: string | null; onNext: () => void }): ReactNode {
  const [loaded, setLoaded] = useState<DeclaredProfileResponse | null>(null)
  const [income, setIncome] = useState(0)
  const [employment, setEmployment] = useState<(typeof EMPLOYMENT)[number]['id']>('Salaried')
  const [risk, setRisk] = useState<(typeof RISK)[number]['id']>('Balanced')
  const [dependents, setDependents] = useState(0)
  const [regime, setRegime] = useState<(typeof REGIME)[number]['id']>('new')
  const [dob, setDob] = useState('')
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
  const ready = income > 0 && (!needsDob || dob !== '')

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
    <Frame step={2}>
      <h1 className="m-0 text-[26px] font-semibold leading-tight text-ink">
        Five things the bank cannot tell me
      </h1>
      <p className="m-0 mb-6 mt-2 text-[14.5px] leading-normal text-ink-mid">
        {first === null ? 'Your' : `${first}\u2019s`} statements say what went out. They do not say
        what comes in, who depends on it, or how much risk is bearable. Every one of these changes
        the advice, so none of them is guessed.
      </p>

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-sm bg-danger-soft px-3 py-2.5 text-[13px] leading-snug text-danger"
        >
          {error}
        </p>
      ) : null}

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

      <Field label="People who depend on it" hint="Sets the life cover you are told you need.">
        <Stepper value={dependents} onChange={setDependents} />
      </Field>

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

      <div className="mb-2 mt-7">
        <Button full busy={busy} disabled={!ready} onClick={() => void save()}>
          {ready ? 'Next' : 'Fill these in to continue'}
          {ready ? <ArrowRight size={17} strokeWidth={2.6} /> : null}
        </Button>
      </div>
      <p className="mb-0 mt-3 text-xs leading-relaxed text-ink-soft">
        These are yours. They go to the advisor service, never to the bank, and Record &rarr; Your
        data marks them as declared.
      </p>
    </Frame>
  )
}

/* ---------------------------------------------------------------- What you own */

function Own({ onNext }: { onNext: () => void }): ReactNode {
  const [name, setName] = useState('')
  const [value, setValue] = useState(0)
  const [cover, setCover] = useState(0)
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState(0)
  const ripple = useRipple()

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
    <Frame step={3}>
      <h1 className="m-0 text-[26px] font-semibold leading-tight text-ink">
        Anything you already own?
      </h1>
      <p className="m-0 mb-6 mt-2 text-[14.5px] leading-normal text-ink-mid">
        IDBI has no record of funds, deposits elsewhere or insurance. Without them I might suggest
        something you already hold, or miss a gap you do not know about. This can wait.
      </p>

      <Field label="A fund or a deposit" hint="Leave blank if there is nothing to add.">
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
          <div className="mb-6">
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
        </div>
      ) : null}

      <Field label="Life cover already in force" hint="The amount insured, not the premium.">
        <MoneyInput ariaLabel="Life cover" value={cover} onChange={setCover} />
      </Field>
      {cover > 0 ? (
        <div className="ds-rise mb-6">
          <Button tone="secondary" size="sm" busy={busy} onClick={() => void add('cover')}>
            Add the cover
          </Button>
        </div>
      ) : null}

      {added > 0 ? (
        <p className="ds-rise m-0 mb-4 rounded-sm bg-tint-sage px-3 py-2.5 text-[13px] font-semibold text-brand-deep">
          {added} {added === 1 ? 'thing' : 'things'} recorded.
        </p>
      ) : null}

      <div className="mb-2 mt-4 flex gap-2">
        <button
          type="button"
          onPointerDown={ripple}
          onClick={onNext}
          className="ds-press h-12 rounded-pill border-0 bg-transparent px-2 text-[15px] font-semibold text-brand"
        >
          {added > 0 ? 'Done' : 'Not now'}
        </button>
        <Button full onClick={onNext}>
          See my plan
          <ArrowRight size={17} strokeWidth={2.6} />
        </Button>
      </div>
    </Frame>
  )
}

/* ---------------------------------------------------------------- Ready */

function Ready({
  first,
  facts,
  onDone,
}: {
  first: string | null
  facts: Facts | null
  onDone: () => void
}): ReactNode {
  return (
    <Frame step={4}>
      <div className="flex flex-col items-center pb-2 pt-6 text-center">
        <span className="relative grid size-20 place-items-center">
          <span className="ds-halo absolute inset-0 rounded-pill bg-accent-soft" />
          <span className="relative grid size-16 place-items-center rounded-pill bg-brand text-on-dark">
            <Sparkles size={30} strokeWidth={2} />
          </span>
        </span>
        <h1 className="m-0 mt-5 text-[26px] font-semibold leading-tight text-ink">
          {first === null ? 'That is everything' : `That is everything, ${first}`}
        </h1>
        <p className="m-0 mt-2 max-w-[30ch] text-[14.5px] leading-normal text-ink-mid">
          One thing to do today, and the reasoning behind it. Nothing on the next screen is written
          by hand.
        </p>
      </div>

      {facts !== null ? (
        <div className="ds-rise mt-6 rounded-md bg-tint-sage p-4">
          <p className="m-0 text-[13px] font-semibold uppercase tracking-wide text-accent-text">
            Built from
          </p>
          <ul className="m-0 mt-2.5 list-none p-0 text-[14px] leading-relaxed text-ink">
            <li>
              {facts.accounts} {facts.accounts === 1 ? 'account' : 'accounts'} holding{' '}
              {inr(facts.balance)}
            </li>
            <li>
              {facts.lines}
              {facts.more ? '+' : ''} statement lines
            </li>
            {facts.debt > 0 ? (
              /* The instalment only where the bank reported one. Neha's loans come back with no
                 monthly outgo at all, and "₹0 a month" is a claim rather than a gap. */
              <li>
                {approx(facts.debt)} of borrowing
                {facts.outgo > 0 ? `, ${inr(facts.outgo)} a month` : ''}
              </li>
            ) : null}
            {facts.holdings > 0 ? (
              <li>
                {facts.holdings} {facts.holdings === 1 ? 'thing' : 'things'} you told me you own
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <div className="mb-2 mt-7">
        <Button full onClick={onDone}>
          Show me
          <ArrowRight size={17} strokeWidth={2.6} />
        </Button>
      </div>
    </Frame>
  )
}
