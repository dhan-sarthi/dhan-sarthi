/**
 * First run: connect, ask, and hand over a plan.
 *
 * Four steps under three headings, and the first one is the reason this exists at all. Opening a
 * customer fires four live calls to a bank and takes a couple of seconds, and what used to fill
 * that was a card saying "one moment". A wait that shows what it is doing is a different
 * experience from a wait that does not — and here each line is a real call, ticked when its own
 * reply lands, reporting what actually came back. Nothing on this screen is on a timer.
 *
 * The second step is the honest one. The advice needs an income, a risk appetite and a number
 * of dependents, and IDBI has no endpoint for any of them: not one of the twenty-four
 * operations carries a declared income. Seeding those invisibly and hoping nobody asks is the
 * alternative, and it is how a demo ends up advising on figures nobody stated. So the app asks,
 * once, and says why it is asking.
 *
 * Everything here can be skipped except the profile, because the profile is what the engine
 * cannot run without.
 *
 * ## What the parity pass changed
 *
 * This funnel predates the SmartWealth rebuild and had never been put beside the frames. Doing
 * that (`spec/images/02-onboarding/*`, all eleven) found the same thing on every step: the
 * content was right and the chrome was missing. No brand mark anywhere, an anonymous four-bar
 * progress strip where the reference names its three steps, a fetch whose results were four
 * one-line summaries where the reference renders the whole fetched file back at you, and a
 * primary action floating in the middle of the page on all four screens because nothing was
 * pinned. Each step now lives in `onboarding/`, wearing `Funnel` — brand lockup, named stepper,
 * sub-progress rail, pinned action.
 *
 * What was **not** taken from the reference, because this is not a KYC funnel: the welcome
 * carousel (`Pick` already makes the pitch, and five slides of marketing before a demo is a
 * cost), the net-banking handoff, the OTP screen, the profile-photo upload and the staff
 * attribution toggle. Each is a capability this product does not have, and building the screen
 * without the capability is the definition of fabricating one.
 */
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { HoldingsResponse, View } from '@dhan/contracts'
import { api, isApiError } from '../api/client.ts'
import { About } from './onboarding/About.tsx'
import { Connect } from './onboarding/Connect.tsx'
import { Own } from './onboarding/Own.tsx'
import { Ready } from './onboarding/Ready.tsx'
import { EMPTY_FACTS } from './onboarding/facts.ts'
import type { Facts, StepKey } from './onboarding/facts.ts'

type Step = 'connect' | 'about' | 'own' | 'ready'

export function Onboarding({ onDone }: { onDone: () => void }): ReactNode {
  const [step, setStep] = useState<Step>('connect')
  const [ticked, setTicked] = useState<StepKey[]>([])
  /*
   * Filled reply by reply rather than once at the end, so a row that has ticked is already
   * showing what its own call returned. Collecting into a local object and setting the lot after
   * `Promise.all` made four independent calls look like one batch, which is the opposite of what
   * this screen is for.
   */
  const [facts, setFacts] = useState<Facts>(EMPTY_FACTS)
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
    setFacts(EMPTY_FACTS)
    const tick = (key: StepKey): void => setTicked((prev) => [...prev, key])
    const learn = (patch: Partial<Facts>): void => setFacts((prev) => ({ ...prev, ...patch }))

    /*
     * Only this one is fatal. Without a view there is nothing to introduce, whereas a source
     * with no aggregator answers 503 on consents and a customer with nothing recorded is a
     * perfectly ordinary customer — those two report their emptiness and carry on.
     */
    const view = api('getView')
      .then((v: View) => {
        setFirst(v.snapshot.customer.name.split(' ')[0] ?? null)
        learn({
          accounts: v.accounts.length,
          balance: v.snapshot.balances.total,
          debt: v.snapshot.debt.total,
          outgo: v.snapshot.debt.monthlyOutgo,
          months: v.snapshot.quality.monthsOfHistory,
          customer: v.snapshot.customer,
          /* The reference's bank-details block is about one account; ours shows the first, which
             is the savings account on every feed captured. */
          account: v.accounts[0] ?? null,
        })
        tick('accounts')
      })
      .catch((err: unknown) => {
        setFailed(isApiError(err) ? err.message : 'Your accounts could not be read.')
      })

    const statement = api('listTransactions', { query: { limit: 200 } })
      .then((page) => {
        learn({ lines: page.items.length, more: page.nextCursor !== null })
        tick('statement')
      })
      .catch(() => tick('statement'))

    const consents = api('listConsentRequests')
      .then((list) => {
        learn({ consents: list.filter((c) => c.status === 'ACTIVE').length })
        tick('consents')
      })
      .catch(() => tick('consents'))

    const holdings = api('getHoldings')
      .then((h: HoldingsResponse) => {
        learn({ holdings: h.holdings.length + h.policies.length })
        tick('holdings')
      })
      .catch(() => tick('holdings'))

    await Promise.all([view, statement, consents, holdings])
  }, [])

  useEffect(() => {
    // Off the effect's own tick, as everywhere else in this app.
    queueMicrotask(() => void connect())
  }, [connect])

  if (step === 'connect') {
    return (
      <Connect
        first={first}
        ticked={ticked}
        facts={facts}
        failed={failed}
        onRetry={() => void connect()}
        onNext={() => setStep('about')}
      />
    )
  }

  if (step === 'about') {
    return <About first={first} onNext={() => setStep(facts.holdings === 0 ? 'own' : 'ready')} />
  }

  if (step === 'own') {
    return <Own onNext={() => setStep('ready')} />
  }

  return <Ready first={first} facts={facts} onDone={onDone} />
}
