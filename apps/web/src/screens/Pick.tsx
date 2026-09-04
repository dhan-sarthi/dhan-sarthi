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
 *
 * Visually this is the front door, so it takes the bank's own opening move: the mint slab with
 * the wave carrying the name and the promise, and below it three people — not three list items.
 * Three roles, and only three: the slab, the customer cards, and bare text. Nothing here is a
 * hero panel; the day's one number earns that surface on Today, and a second one this early
 * would spend it.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { CustomerSummary } from '@dhan/contracts'
import { api, isApiError } from '../api/client.ts'
import { setSession } from '../api/session.ts'
import { Wave } from '../components/Wave.tsx'
import { riseDelay } from '../lib/motion.ts'
import { loadOffline } from '../lib/view.ts'

interface Listed {
  customers: CustomerSummary[]
  /** The API could not be reached and the list came from the simulation instead. */
  offline: boolean
}

/*
 * A customer takes the orange hairline GO Mobile+ gives an action card, not the neutral mint one:
 * on this screen the person *is* the action. It also sits a little roomier than the standard
 * `p-4` card, because three faces should not be measured out like three ledger rows.
 */
const CUSTOMER =
  'rise mb-3 block w-full rounded-md border border-solid border-hairline bg-white px-4 pb-3.5 pt-[18px] text-left font-sans text-ink transition-transform duration-100 active:scale-[0.985]'

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
    <>
      {/* The bank's own opening surface: white falling to mint, the wave underneath, the rounded
          bottom edge. Deeper than the Head slab on every other screen and the title a size larger,
          because this is the only screen with nothing above it. A flex-none sibling of `.scroll`,
          never inside it. */}
      <header className="relative isolate flex-none overflow-hidden rounded-b-lg bg-gradient-to-b from-white to-header-mint px-4 pb-6 pt-9 shadow-card">
        <Wave tone="light" className="-z-10" />
        <p className="m-0 mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-accent-text">
          IDBI Innovate 2026 · Team Atomic
        </p>
        <h1 className="m-0 text-[30px] font-bold leading-[1.12] text-ink">
          A private banker for every IDBI account
        </h1>
        <p className="mb-0 mt-3 text-[15px] leading-normal text-ink-mid">
          Uday reads every transaction, tells you the one thing to do today, and refuses to sell you
          an IDBI product that is wrong for you.
        </p>
      </header>

      {/* `.scroll` is unlayered and sets a `padding` shorthand, so the top padding needs `!`. */}
      <div className="scroll pt-5!">
        {/* A bare line, not a card. The slab made the promise; this is only the instruction that
            gets you to the three faces below it. */}
        <p className="m-0 mb-4 text-[13.5px] leading-normal text-ink-soft">
          Pick a customer to try it. These are synthetic ledgers — twenty-four months each,
          generated, not written. Every number you see is arithmetic over them.
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

        {/* A failure is told apart from a customer by its ground and its radius, not by being one
            more white card with the same hairline. */}
        {error ? (
          <div className="mb-5 rounded-sm bg-danger-soft px-3.5 py-3">
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

        {listed?.customers.map((c, i) => (
          <button
            key={c.cif}
            type="button"
            onClick={() => void pick(c)}
            disabled={picking !== null}
            style={riseDelay(i)}
            className={picking !== null && picking !== c.cif ? `${CUSTOMER} opacity-55` : CUSTOMER}
          >
            <span className="flex items-center gap-3.5">
              <span className="grid size-[52px] flex-none place-items-center rounded-pill bg-gradient-to-br from-tint-sage to-legend-chip text-[17px] font-bold text-brand">
                {c.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[18px] font-semibold leading-tight text-ink">
                  {c.name}
                </span>
                <span className="mt-1 block text-[13px] leading-snug text-ink-soft">
                  {picking === c.cif ? 'Opening your session…' : c.pitch}
                </span>
              </span>
              <span className="flex-none text-[22px] leading-none text-ink-faint">›</span>
            </span>

            {/* What this person proves. The field leads with the identifiers of the suitability
                rules they exercise, which is the most useful thing on this screen for a technical
                reviewer — those same identifiers head the ladder on Record. Set as running text
                they read as an unformatted string that escaped into the UI, so the identifiers
                are set as chips and the sentence follows as prose. */}
            <span className="mt-3 block border-0 border-t border-solid border-hairline-mint pt-2.5">
              <Demonstrates text={c.demonstrates} />
            </span>
          </button>
        ))}

        <p className="m-0 mt-6 text-xs leading-relaxed text-ink-soft">
          Nothing here is a real customer. Each reviewer gets their own session on the advisor
          service; this browser keeps only the token for it.
        </p>
      </div>
    </>
  )
}

/**
 * Split "HIGH_INTEREST_DEBT — the advisor refuses to invest anything at all" into the rule
 * identifiers and the sentence about them.
 *
 * The split lives here rather than in the contract because `demonstrates` is a persisted column
 * on the customer row: modelling it as an array would mean a migration and a reseed of the shared
 * database to change how one line looks. This is a presentation concern, so it is handled in the
 * presentation layer, and it degrades to plain text for any value that does not match the shape.
 */
function Demonstrates({ text }: { text: string }): ReactNode {
  const cut = text.indexOf(' — ')
  const head = cut === -1 ? '' : text.slice(0, cut)
  const rest = cut === -1 ? text : text.slice(cut + 3)
  const rules = head.split(/\s+and\s+/).filter((r) => /^[A-Z][A-Z_]+$/.test(r))
  // The field is written as one sentence, so the half after the dash starts lower case. Once the
  // identifiers are lifted out onto their own line it has to stand as a sentence on its own.
  const sentence = rest.charAt(0).toUpperCase() + rest.slice(1)

  if (rules.length === 0) {
    return <span className="text-[11.5px] leading-[1.5] text-ink-soft">{text}</span>
  }

  return (
    <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
      {rules.map((rule) => (
        <code
          key={rule}
          className="rounded-sm bg-legend-chip px-1.5 py-px font-mono text-[10.5px] font-semibold tracking-tight text-brand"
        >
          {rule}
        </code>
      ))}
      <span className="block w-full text-[11.5px] leading-[1.5] text-ink-soft">{sentence}</span>
    </span>
  )
}
