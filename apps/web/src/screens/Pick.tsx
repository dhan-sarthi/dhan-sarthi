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
import type { CSSProperties, ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import type { CustomerSummary } from '@dhan/contracts'
import { Skeleton, Spinner } from '../components/ui.tsx'
import { useRipple } from '../lib/motion.ts'
import { api, isApiError } from '../api/client.ts'
import { setSession } from '../api/session.ts'
import { loadOffline } from '../lib/view.ts'

interface Listed {
  customers: CustomerSummary[]
  /** The API could not be reached and the list came from the simulation instead. */
  offline: boolean
}

const ROW =
  'mb-3 block w-full rounded-md border border-solid border-hairline-mint bg-white p-4 text-left font-sans text-ink disabled:opacity-60'

export function Pick(): ReactNode {
  const [listed, setListed] = useState<Listed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState<string | null>(null)
  const ripple = useRipple()
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
      {/* The masthead rises once, ahead of the rows, so the first screen arrives rather than
          appearing. Wrapped rather than staggered per element: the rows below are direct
          children of the scroller and run their own ladder. */}
      <div className="ds-rise">
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

        {/*
          This used to promise "synthetic ledgers, twenty-four months each, generated". True of
          the fixtures, and false the moment the app was pointed at IDBI: the sandbox holds the
          bank's own customers and about a month of statement. The line that replaces it is true
          under every source, and Today's ribbon names the source exactly.
        */}
        <p className="m-0 mb-7 text-sm leading-normal text-ink-soft">
          Pick one. Every figure is computed from that customer’s own statements, none of it written
          by hand.
        </p>
      </div>

      {listed?.offline ? (
        <p
          role="status"
          className="m-0 mb-4 rounded-sm bg-tint-clay px-3 py-2.5 text-[13px] leading-normal text-accent-text"
        >
          The advisor service could not be reached. Look around as a simulation in this browser,
          with nothing recorded.
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
            className="ds-press mt-3 h-11 rounded-pill border-[1.5px] border-solid border-accent bg-white px-4 text-[15px] font-semibold text-accent-text"
          >
            Try again
          </button>
        </div>
      ) : null}

      {!listed && !error ? (
        <div aria-busy="true">
          <span className="sr-only">Reading the customer list</span>
          {[0, 1].map((i) => (
            <div key={i} className={`${ROW} pointer-events-none`}>
              <div className="flex items-center gap-3">
                <Skeleton h={44} w={44} className="flex-none rounded-pill" />
                <div className="min-w-0 flex-1">
                  <Skeleton h={17} w="46%" className="mb-2" />
                  <Skeleton h={12} w="76%" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {listed?.customers.map((c, i) => (
        <button
          key={c.cif}
          type="button"
          onPointerDown={ripple}
          onClick={() => void pick(c)}
          disabled={picking !== null}
          className={`ds-press ds-rise ds-stagger ${ROW}`}
          style={{ '--i': i } as CSSProperties}
        >
          <div className="flex items-center gap-3">
            <span className="grid size-11 flex-none place-items-center rounded-pill bg-tint-sage text-[16px] font-bold text-brand-deep">
              {c.name
                .split(' ')
                .map((n) => n[0])
                .join('')}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[18px] font-semibold leading-tight text-ink">{c.name}</div>
              <div className="mt-0.5 text-[13px] leading-snug text-ink-soft">
                {picking === c.cif ? 'Reading their statements…' : c.pitch}
              </div>
            </div>
            {/* A spinner on the row that was pressed, so the wait is attached to the thing that
                caused it. Opening a session is four live calls to a bank and takes a moment. */}
            {picking === c.cif ? (
              <Spinner size={17} />
            ) : (
              <ChevronRight size={19} strokeWidth={2.2} className="flex-none text-ink-faint" />
            )}
          </div>
        </button>
      ))}

      <p className="m-0 mt-6 text-sm leading-normal text-ink-soft">
        No real customers. Each reviewer gets their own session on the advisor service; this browser
        keeps only its token.
      </p>
    </div>
  )
}
