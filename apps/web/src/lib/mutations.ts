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
import type { Action, ConsentScope, DecisionKind } from '@dhan/contracts'
import { api, isApiError, newIdempotencyKey } from '../api/client.ts'
import { clearSession } from '../api/session.ts'
import type { ViewState } from './view.ts'

/** The token is gone or expired. Back to the picker beats a notice nobody can act on. */
function sessionEnded(err: unknown): boolean {
  if (!isApiError(err) || err.status !== 401) return false
  clearSession()
  return true
}

export type { DecisionKind } from '@dhan/contracts'

type ClockOp = { advanceDays: 1 | 7 | 30 } | { reset: true }

export interface Mutations {
  advanceClock: (days: 1 | 7 | 30) => Promise<void>
  resetClock: () => Promise<void>
  /** Why the clock did not move, in the server's words. Null when it did. */
  clockNotice: string | null
  decide: (action: Action, kind: DecisionKind) => Promise<void>
  setConsent: (scope: ConsentScope, granted: boolean) => Promise<void>
  /** Action ids decided since this page loaded, so Today moves on before the record round-trips. */
  decided: ReadonlySet<string>
  /** The last decision or consent change failed; the sentence to show. */
  notice: string | null
  busy: boolean
}

/** Per-session state, so a notice or a decided id from one session never shows in the next. */
interface Scoped<T> {
  sid: string | null
  value: T
}

export function useMutations(vs: ViewState, onRecorded: () => void): Mutations {
  const sid = vs.session?.id ?? null
  const [clock, setClock] = useState<Scoped<string | null>>({ sid: null, value: null })
  const [general, setGeneral] = useState<Scoped<string | null>>({ sid: null, value: null })
  const [decidedIds, setDecidedIds] = useState<Scoped<ReadonlySet<string>>>({
    sid: null,
    value: new Set(),
  })
  const [busy, setBusy] = useState(false)

  const setClockNotice = useCallback((value: string | null) => setClock({ sid, value }), [sid])
  const setNotice = useCallback((value: string | null) => setGeneral({ sid, value }), [sid])
  const clockNotice = clock.sid === sid ? clock.value : null
  const notice = general.sid === sid ? general.value : null
  const decided: ReadonlySet<string> = decidedIds.sid === sid ? decidedIds.value : new Set()

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
      setNotice(null)
      try {
        await api('decideAction', {
          params: { actionId: action.id },
          body: { kind },
          idempotencyKey: newIdempotencyKey(),
        })
        setDecidedIds((prev) => ({
          sid,
          value: new Set(prev.sid === sid ? prev.value : []).add(action.id),
        }))
        onRecorded()
        await vs.refresh()
      } catch (err) {
        if (sessionEnded(err)) return
        setNotice(isApiError(err) ? err.message : 'Your decision could not be recorded.')
      } finally {
        setBusy(false)
      }
    },
    [vs, onRecorded, setNotice, sid],
  )

  const setConsent = useCallback(
    async (scope: ConsentScope, granted: boolean): Promise<void> => {
      if (vs.tier === 'offline') return
      setBusy(true)
      setNotice(null)
      try {
        const session = await api('setConsent', { body: { scope, granted } })
        vs.applySession(session)
        onRecorded()
        await vs.refresh()
      } catch (err) {
        if (sessionEnded(err)) return
        setNotice(isApiError(err) ? err.message : 'The change could not be saved.')
      } finally {
        setBusy(false)
      }
    },
    [vs, onRecorded, setNotice],
  )

  return {
    advanceClock,
    resetClock,
    clockNotice,
    decide,
    setConsent,
    decided,
    notice,
    busy: busy || vs.busy,
  }
}
