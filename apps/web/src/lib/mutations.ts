/**
 * Everything that changes the session, and the one rule they share: a mutation ends by
 * re-reading the view. The server is the only thing that computes; the browser asks, then looks
 * again.
 *
 * The clock is an optimistic update. Two tabs pressing +1 month send the same `expectedVersion`
 * and the second is told 409 STALE_CLOCK — the answer is to re-read, not to move the clock
 * twice. Past the seeded ledger the server answers 422 with a sentence, and that sentence is
 * shown as it came.
 *
 * Decisions carry an Idempotency-Key so a retry of a slow tap records one decision, not two.
 * Amounts and products are never sent: the server re-derives the action from its own plan.
 */
import { useCallback, useState } from 'react'
import type {
  Action,
  ConsentScope,
  DecisionKind as ContractDecisionKind,
  LeadOutcomeResponse,
} from '@dhan/contracts'
import { api, isApiError, newIdempotencyKey } from '../api/client.ts'
import { clearSession } from '../api/session.ts'
import type { ViewState } from './view.ts'

/** The token is gone or expired. Back to the picker beats a notice nobody can act on. */
function sessionEnded(err: unknown): boolean {
  if (!isApiError(err) || err.status !== 401) return false
  clearSession()
  return true
}

/*
 * All four, not the two the daily plan's buttons offer.
 *
 * `decideAction` takes `DecisionKindSchema` and the record stores whichever of the four it is
 * given, so narrowing here was a UI-layer restriction with nothing behind it — and it blocked
 * the rebalancing screen, which defers a change as often as it takes one.
 */
export type DecisionKind = ContractDecisionKind

type ClockOp = { advanceDays: 1 | 7 | 30 } | { reset: true }

export interface Mutations {
  advanceClock: (days: 1 | 7 | 30) => Promise<void>
  resetClock: () => Promise<void>
  /** Why the clock did not move, in the server's words. Null when it did. */
  clockNotice: string | null
  decide: (action: Action, kind: DecisionKind) => Promise<void>
  setConsent: (scope: ConsentScope, granted: boolean) => Promise<void>
  /** A monthly limit on one category, or null to remove the one that is there. */
  setCap: (category: string, monthlyLimit: number | null) => Promise<void>
  /** Action ids decided since this page loaded, so Today moves on before the record round-trips. */
  decided: ReadonlySet<string>
  /** What the bank did with the last accepted recommendation, where one was handed over. */
  lead: LeadOutcomeResponse | null
  busy: boolean
}

/** Per-session state, so a notice or a decided id from one session never shows in the next. */
interface Scoped<T> {
  sid: string | null
  value: T
}

export function useMutations(
  vs: ViewState,
  onRecorded: () => void,
  /**
   * Where a failure goes.
   *
   * One place, over the tab bar, rather than a notice under whichever card was used. An inline
   * notice is below the fold as soon as the action is halfway down a scroll, and it stays on
   * screen long after the thing it describes, which makes an outcome read as a state.
   */
  say: (text: string, tone: 'ok' | 'bad' | 'info') => void,
): Mutations {
  const sid = vs.session?.id ?? null
  const [clock, setClock] = useState<Scoped<string | null>>({ sid: null, value: null })
  const [decidedIds, setDecidedIds] = useState<Scoped<ReadonlySet<string>>>({
    sid: null,
    value: new Set(),
  })
  const [leadState, setLead] = useState<Scoped<LeadOutcomeResponse | null>>({
    sid: null,
    value: null,
  })
  const [busy, setBusy] = useState(false)

  const setClockNotice = useCallback((value: string | null) => setClock({ sid, value }), [sid])
  const clockNotice = clock.sid === sid ? clock.value : null
  const decided: ReadonlySet<string> = decidedIds.sid === sid ? decidedIds.value : new Set()
  const lead = leadState.sid === sid ? leadState.value : null

  const moveClock = useCallback(
    async (op: ClockOp): Promise<void> => {
      // The offline simulation keeps its own clock and reports the same horizon sentence.
      if (vs.tier === 'offline') {
        if (!vs.offline) return
        const { mod, state } = vs.offline
        const next =
          'reset' in op
            ? { state: mod.reset(state), error: null }
            : mod.advance(state, op.advanceDays)
        setClockNotice(next.error)
        if (!next.error) vs.setOfflineState(next.state)
        return
      }

      if (!vs.session) return
      setBusy(true)
      setClockNotice(null)
      try {
        const session = await api('advanceClock', {
          body: { ...op, expectedVersion: vs.session.version },
        })
        vs.applySession(session)
        await vs.refresh()
      } catch (err) {
        if (sessionEnded(err)) return
        if (isApiError(err) && err.code === 'STALE_CLOCK') {
          await vs.refresh()
          setClockNotice('The clock was moved from another tab. Showing the latest.')
          return
        }
        setClockNotice(isApiError(err) ? err.message : 'The clock could not be moved.')
      } finally {
        setBusy(false)
      }
    },
    [vs, setClockNotice],
  )

  const advanceClock = useCallback(
    (days: 1 | 7 | 30) => moveClock({ advanceDays: days }),
    [moveClock],
  )
  const resetClock = useCallback(() => moveClock({ reset: true }), [moveClock])

  const decide = useCallback(
    async (action: Action, kind: DecisionKind): Promise<void> => {
      // Nothing is recorded offline, so nothing is decided offline. The buttons are disabled.
      if (vs.tier === 'offline') return
      setBusy(true)
      setLead({ sid, value: null })
      try {
        const result = await api('decideAction', {
          params: { actionId: action.id },
          body: { kind },
          idempotencyKey: newIdempotencyKey(),
        })
        setDecidedIds((prev) => ({
          sid,
          value: new Set(prev.sid === sid ? prev.value : []).add(action.id),
        }))
        /*
         * What the bank did with it.
         *
         * Worth surfacing rather than swallowing: accepting a recommendation hands IDBI a lead
         * their staff will work, and a customer who presses "Do it" has a right to know whether
         * that actually reached anybody. It is not an error either way — the decision is
         * recorded regardless — so it is a note rather than a failure.
         */
        setLead({ sid, value: result.lead })
        onRecorded()
        await vs.refresh()
      } catch (err) {
        if (sessionEnded(err)) return
        say(isApiError(err) ? err.message : 'Your decision could not be recorded.', 'bad')
      } finally {
        setBusy(false)
      }
    },
    [vs, onRecorded, say, sid],
  )

  const setConsent = useCallback(
    async (scope: ConsentScope, granted: boolean): Promise<void> => {
      if (vs.tier === 'offline') return
      setBusy(true)
      try {
        const session = await api('setConsent', { body: { scope, granted } })
        vs.applySession(session)
        onRecorded()
        await vs.refresh()
      } catch (err) {
        if (sessionEnded(err)) return
        say(isApiError(err) ? err.message : 'The change could not be saved.', 'bad')
      } finally {
        setBusy(false)
      }
    },
    [vs, onRecorded, say],
  )

  const setCap = useCallback(
    async (category: string, monthlyLimit: number | null): Promise<void> => {
      // The offline simulation has no session row to hold a cap, and its daily plan is computed
      // in this browser from a ledger that never changes. A control that cannot do anything is
      // worse than no control, so the caller hides it rather than this failing quietly.
      if (vs.tier === 'offline') return
      setBusy(true)
      try {
        const session = await api('setCategoryCap', { body: { category, monthlyLimit } })
        vs.applySession(session)
        // The daily plan reads caps, so the change is only real once the view is re-cut.
        await vs.refresh()
        say(
          monthlyLimit === null
            ? `Limit removed from ${category}.`
            : `${category} capped at ${new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 0,
              }).format(monthlyLimit)} a month.`,
          'ok',
        )
      } catch (err) {
        if (sessionEnded(err)) return
        say(isApiError(err) ? err.message : 'The limit could not be saved.', 'bad')
      } finally {
        setBusy(false)
      }
    },
    [vs, say],
  )

  return {
    advanceClock,
    resetClock,
    clockNotice,
    decide,
    setConsent,
    setCap,
    decided,
    lead,
    busy: busy || vs.busy,
  }
}
