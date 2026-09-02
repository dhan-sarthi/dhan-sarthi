/**
 * Session state: who is being viewed, and what day it is.
 *
 * Two things make this more than a `useState`.
 *
 * **No sign-in.** A judge gets ninety seconds before they close the tab, and an OTP screen spends
 * all of it. The landing screen offers three pre-loaded customers and one tap goes straight in.
 * Auth is a Phase-2 concern; see `docs/product/09-decisions.md`.
 *
 * **A simulated clock.** `04-demo-plan.md` is right that memory, proactive nudges and roadmap
 * adaptation cannot be verified in a sixty-second slot, because they need time to pass. So time
 * passing is a control the judge operates. The ledger generator produces the days forward from a
 * fixed anchor, so advancing the clock reveals the future the ledger always had rather than a
 * second ledger invented on the spot — and what they already read does not change underneath them.
 */
import { useEffect, useState } from 'react'
import { addDays } from '@dhan/core'

/** The persona anchor. Every window in the fixtures is measured from here and it never moves. */
export const ANCHOR = '2026-09-01'

const KEY = 'dhan.session.v1'

export interface Session {
  slug: string | null
  /** The simulated today. */
  asOf: string
  /** When the customer last opened the app, for the "since you were away" panel. */
  lastSeen: string
  /** Actions the customer has accepted, so the app remembers across a reload. */
  accepted: string[]
  /** Actions they said no to. Declining is data too, and it changes what we say next. */
  declined: string[]
  caps: { category: string; monthlyLimit: number }[]
  goalTarget: number | null
}

const FRESH: Session = {
  slug: null,
  asOf: ANCHOR,
  lastSeen: addDays(ANCHOR, -6),
  accepted: [],
  declined: [],
  caps: [],
  goalTarget: null,
}

function read(): Session {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return FRESH
    return { ...FRESH, ...(JSON.parse(raw) as Partial<Session>) }
  } catch {
    // A private window, cleared site data, or a browser blocking storage. None of those are
    // errors worth surfacing — the app simply starts fresh.
    return FRESH
  }
}

function write(s: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* nothing to do, and nothing worth telling the customer about */
  }
}

export function useSession(): [Session, (patch: Partial<Session>) => void, () => void] {
  const [session, setSession] = useState<Session>(read)

  useEffect(() => {
    write(session)
  }, [session])

  const patch = (p: Partial<Session>): void => setSession((prev) => ({ ...prev, ...p }))
  const reset = (): void => setSession({ ...FRESH })

  return [session, patch, reset]
}

/**
 * Advance the clock.
 *
 * `lastSeen` moves to the old `asOf`, which is what makes "since you were away" mean anything:
 * jump a week and the app has a week of transactions to account for.
 */
export function advance(session: Session, days: number): Partial<Session> {
  return { lastSeen: session.asOf, asOf: addDays(session.asOf, days) }
}
