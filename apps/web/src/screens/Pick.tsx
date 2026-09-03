/**
 * The way in. No sign-in.
 *
 * A judge gives a link about ninety seconds before closing the tab, and an OTP screen spends all
 * of it. Three pre-loaded customers, one tap, straight into the product — and each one exists to
 * make a different rule fire, so whichever they pick they see the gate work.
 *
 * The list comes from `GET /customers` and a tap is `POST /sessions`, which gives this browser
 * its own reviewer session on the server: its own clock, its own decisions, its own record.
 * Fifteen reviewers on fifteen phones do not share a session, and none of them holds any data.
 *
 * The line under each name is the whole pitch in one sentence, aimed at someone who has watched
 * customers fail to invest for thirty years and will recognise these people instantly.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { CustomerSummary } from '@dhan/contracts'
import { api, isApiError } from '../api/client.ts'
import { setSession } from '../api/session.ts'
import { loadOffline } from '../lib/view.ts'

interface Listed {
  customers: CustomerSummary[]
  /** The API could not be reached and the list came from the simulation instead. */
  offline: boolean
}

const ROW =
  'mb-3 block w-full rounded-md border border-solid border-hairline-mint bg-white p-4 text-left font-sans text-ink transition-transform duration-100 active:scale-[0.985] disabled:opacity-60'

export function Pick(): ReactNode {
  const [listed, setListed] = useState<Listed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState<string | null>(null)
  const runRef = useRef(0)

  const load = useCallback(async (): Promise<void> => {
    runRef.current += 1
    const run = runRef.current
    try {
      const customers = await api('listCustomers')
      if (run !== runRef.current) return
      setListed({ customers, offline: false })
      setError(null)
    } catch (err) {
      if (run !== runRef.current) return
      if (isApiError(err) && err.unreachable) {
        const mod = await loadOffline()
        if (run !== runRef.current) return
        if (mod) {
          setListed({ customers: mod.listCustomers(), offline: true })
          setError(null)
          return
        }
      }
      setListed(null)
      setError(isApiError(err) ? err.message : 'Could not reach the advisor service.')
    }
  }, [])

  useEffect(() => {
    // Off the effect's own tick: state changes when the reply arrives, never during the effect.
    queueMicrotask(() => void load())
  }, [load])

  const pick = async (customer: CustomerSummary): Promise<void> => {
    if (listed?.offline) {
      setSession({ token: null, cif: customer.cif })
      return
    }
    setPicking(customer.cif)
    setError(null)
    try {
      const created = await api('createSession', { body: { cif: customer.cif } })
      setSession({ token: created.token, cif: customer.cif })
    } catch (err) {
      setPicking(null)
      if (isApiError(err) && err.unreachable) {
        // The API went away between the list and the tap. Same answer as above.
        const mod = await loadOffline()
        if (mod) {
          setListed({ customers: mod.listCustomers(), offline: true })
          setSession({ token: null, cif: customer.cif })
          return
        }
      }
      setError(isApiError(err) ? err.message : 'Could not start a session.')
    }
  }

  return (
    /* `.scroll` is unlayered and sets a `padding` shorthand, so the top padding needs `!` to win. */
    <div className="scroll pt-10!">
      <p className="m-0 mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-accent-text">
        IDBI Innovate 2026 · Team Atomic
      </p>

      <h1 className="m-0 mb-3 text-[30px] font-bold leading-tight text-ink">
        A private banker for every IDBI account
      </h1>

      <p className="m-0 mb-2 text-[15px] leading-normal text-ink-mid">
        Uday reads every transaction, tells you the one thing to do today, and refuses to sell you
        an IDBI product that is wrong for you.
      </p>

      <p className="m-0 mb-7 text-sm leading-normal text-ink-soft">
        Pick a customer to try it. These are synthetic ledgers — twenty-four months each, generated,
        not written. Every number you see is arithmetic over them.
      </p>

      {listed?.offline ? (
        <p
          role="status"
          className="m-0 mb-4 rounded-sm bg-tint-clay px-3 py-2.5 text-[13px] leading-normal text-accent-text"
        >
          The advisor service could not be reached. You can still look around — as a simulation in
          this browser, with nothing recorded.
        </p>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-md border border-solid border-hairline-mint bg-white p-4">
          <p role="alert" className="m-0 text-[14.5px] leading-normal text-ink">
            {error}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 h-11 rounded-pill border-[1.5px] border-solid border-accent bg-white px-4 text-[15px] font-semibold text-accent-text transition-transform duration-100 active:scale-[0.985]"
          >
            Try again
          </button>
        </div>
      ) : null}

      {!listed && !error ? (
        <p className="m-0 mb-4 text-sm text-ink-soft" aria-live="polite">
          Reading the customer list…
        </p>
      ) : null}

      {listed?.customers.map((c) => (
        <button
          key={c.cif}
          type="button"
          onClick={() => void pick(c)}
          disabled={picking !== null}
          className={ROW}
        >
          <div className="flex items-center gap-3">
            <span className="grid size-11 flex-none place-items-center rounded-pill bg-tint-sage text-[16px] font-bold text-brand">
              {c.name
                .split(' ')
                .map((n) => n[0])
                .join('')}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[18px] font-semibold leading-tight text-ink">{c.name}</div>
              <div className="mt-0.5 text-[13px] leading-snug text-ink-soft">
                {picking === c.cif ? 'Opening your session…' : c.pitch}
              </div>
            </div>
            <span className="text-[20px] leading-none text-ink-faint">›</span>
          </div>
        </button>
      ))}

      <p className="m-0 mt-6 text-sm leading-normal text-ink-soft">
        Nothing here is a real customer. Each reviewer gets their own session on the advisor
        service; this browser keeps only the token for it.
      </p>
    </div>
  )
}
