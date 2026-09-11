/**
 * The CAS flow, end to end: statement → consent → imported → holdings.
 *
 * `05-cas-import` is four screens and one state machine, and this file is the machine. It owns
 * the holdings block for the length of the flow, decides which folios are still missing from the
 * record, does the one thing in this feature that is not a fixture — writing them — and hands
 * each screen exactly what it needs to draw.
 *
 * ## The one decision worth reading
 *
 * `07-DECISIONS.md` §5 puts CAS back in scope with the rule that a screen may be driven by demo
 * data but may never claim the data is real. There were two ways to satisfy that.
 *
 * The cheap one is to draw four screens over a hardcoded list and label the list. That is a
 * mock, and mocks rot: nothing downstream of them changes, so the moment anyone scrolls past the
 * success beat the illusion is over.
 *
 * The one taken here is to make the *fetch* the only fixture. Pressing Verify runs
 * `POST /api/v1/holdings` once per folio with `heldOutsideIdbi: true`, and from that moment they
 * are ordinary declared holdings: the Dashboard's total counts them, the analytics chart them,
 * `packages/core/src/suitability.ts` reads them before it lets the customer buy another equity
 * fund, and `HoldingsSheet` can edit or delete any of them. Nothing in this flow is theatre
 * except the part that says it is.
 *
 * That is also why the flow is idempotent rather than replayable: a second run finds every folio
 * already in the record and writes nothing, because a demo that silently doubles someone's
 * portfolio each time you press the button is exactly the kind of lie the rule is about.
 *
 * ## Where the write is refused
 *
 * `GET /api/v1/holdings` answers with `editable`, and on the `memory` and `postgres` sources it
 * is **false**: those feeds serve a portfolio of their own, so the app does not own the block and
 * `BankBackedHoldings` refuses every write with a 409. Only `idbi-sandbox` — the seam the real
 * bank arrives through, and the one profile where no holdings feed exists — lets the app keep
 * holdings of its own.
 *
 * A flow that simply died there would put three of this feature's four screens out of reach on
 * the profile the app is demonstrated under. So the import has two modes and says which one it
 * ran in, every time:
 *
 * - **the record** where `editable` is true — a real write, and the folios outlive the session;
 * - **this session** where it is false — the folios are held here, shown on the list, and
 *   labelled on the success beat and on every row as not being on the record.
 *
 * §5 sanctions exactly that for the family surface — "demo state, labelled as such on screen the
 * way the simulated clock is" — and the labelling is the whole of the condition. What is not
 * allowed, and does not happen, is a session-held folio quietly counted as a recorded one.
 *
 * ## What cannot be carried across the write
 *
 * `HoldingSchema` has no folio number and no registrar. Both are shown on the statement screens
 * and neither survives the import, which is why the record is matched back by name — and why the
 * imported rows are recognised as this statement's rather than remembered as its.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { HoldingsResponse } from '@dhan/contracts'
import { api, isApiError } from '../../api/client.ts'
import { CAS_FOLIOS, mintCode } from './cas.ts'
import type { CasFolio } from './cas.ts'
import { CasLanding } from './CasLanding.tsx'
import { CasConsent } from './CasConsent.tsx'
import { CasSynced } from './CasSynced.tsx'
import { ExternalHoldings } from './ExternalHoldings.tsx'

type Step = 'landing' | 'consent' | 'synced' | 'holdings'

export function ExternalImport({
  onClose,
  onImported,
}: {
  /** Leave the flow. The caller decides what is underneath it. */
  onClose: () => void
  /**
   * Something was written. The host announces it and re-reads the view, the way every other
   * edit in this app does — the engine derives a new plan from a portfolio that just grew.
   */
  onImported: (message: string) => void
}): ReactNode {
  const [step, setStep] = useState<Step>('landing')
  const [held, setHeld] = useState<HoldingsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState(mintCode)
  const [written, setWritten] = useState<readonly CasFolio[]>([])
  /** Folios imported where the record would not take them. Gone on reload, and said to be. */
  const [session, setSession] = useState<readonly CasFolio[]>([])

  /** Does this source let the app own holdings? Unknown until the block has been read. */
  const persisted = held?.editable === true

  const load = useCallback(async (): Promise<HoldingsResponse | null> => {
    try {
      const next = await api('getHoldings')
      setHeld(next)
      setError(null)
      return next
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Your holdings could not be read.')
      return null
    }
  }, [])

  useEffect(() => {
    // Off the effect's own tick, as everywhere else in this app: state changes when the reply
    // arrives, never during the effect that asked for it.
    queueMicrotask(() => void load())
  }, [load])

  /* A folio counts as imported when a holding of the same name is on the record and marked as
     held outside IDBI. Name is all there is to match on — see the note at the head of the file. */
  const imported = useMemo(() => {
    const outside = new Set(
      (held?.holdings ?? []).filter((h) => h.heldOutsideIdbi === true).map((h) => h.name),
    )
    for (const f of session) outside.add(f.name)
    return CAS_FOLIOS.filter((f) => outside.has(f.name))
  }, [held, session])

  const missing = useMemo(
    () => CAS_FOLIOS.filter((f) => !imported.some((i) => i.name === f.name)),
    [imported],
  )

  const verify = async (): Promise<void> => {
    /* No write to attempt: this source owns the block. The folios are held here for the length
       of the session, and every screen from here on says that is what happened. */
    if (!persisted) {
      setSession((prev) => [...prev, ...missing])
      setWritten(missing)
      setStep('synced')
      return
    }

    setBusy(true)
    setError(null)
    const done: CasFolio[] = []
    try {
      /* One at a time, in the statement's order. A partial failure then leaves a record that is
         short rather than scrambled, and the reload below makes the landing tell the truth
         about which folios did land. */
      for (const f of missing) {
        await api('addHolding', {
          body: {
            holdingType: 'MUTUAL_FUND',
            name: f.name,
            assetClass: f.assetClass,
            investedAmount: f.invested,
            currentValue: f.value,
            sipActive: f.sipMonthly > 0,
            ...(f.sipMonthly > 0 ? { sipAmount: f.sipMonthly } : {}),
            ...(f.sipDay !== null ? { sipDebitDay: f.sipDay } : {}),
            heldOutsideIdbi: true,
          },
        })
        done.push(f)
      }
      await load()
      setWritten(done)
      setStep('synced')
      onImported(
        done.length === 1
          ? 'One folio added. Your plan has been recalculated.'
          : `${done.length} folios added. Your plan has been recalculated.`,
      )
    } catch (err) {
      await load()
      setError(
        isApiError(err)
          ? `${err.message}${done.length > 0 ? ` ${done.length} of the folios were written before it stopped.` : ''}`
          : 'The statement could not be imported.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (step === 'consent') {
    return (
      <CasConsent
        /* A new code is a new mount: the countdown, the digits, the tick and any error all
           restart as initial state rather than being re-synced from an effect. */
        key={code}
        code={code}
        folios={missing.length}
        persisted={persisted}
        busy={busy}
        error={error}
        onResend={() => setCode(mintCode())}
        onVerified={() => void verify()}
        onBack={() => {
          setError(null)
          setStep('landing')
        }}
      />
    )
  }

  if (step === 'synced') {
    return (
      <CasSynced
        written={written}
        persisted={persisted}
        skipped={imported.length - written.length}
        onViewHoldings={() => setStep('holdings')}
        onDone={onClose}
      />
    )
  }

  if (step === 'holdings') {
    return (
      <ExternalHoldings
        held={held}
        session={session}
        loading={held === null && error === null}
        onBack={() => setStep('landing')}
      />
    )
  }

  return (
    <CasLanding
      loading={held === null && error === null}
      persisted={persisted}
      missing={missing}
      imported={imported}
      error={error}
      onGenerate={() => {
        setCode(mintCode())
        setError(null)
        setStep('consent')
      }}
      onViewHoldings={() => setStep('holdings')}
      onBack={onClose}
    />
  )
}
