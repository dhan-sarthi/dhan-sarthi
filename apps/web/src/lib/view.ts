/**
 * The view model: one object every screen reads, fetched from the API.
 *
 * `GET /api/v1/view` is the whole engine output for this reviewer's session — snapshot, goal,
 * roadmap, daily plan, insights, shelf, rules — computed on the server over that session's
 * clock and decisions. The browser holds a bearer token and this object, nothing else. Every
 * mutation (clock, decision, goal, consent) ends by calling `refresh()`, which re-reads it with
 * `If-None-Match` so an unchanged view costs one 304.
 *
 * When the API cannot be reached the app does not go blank and it does not spin. If the build
 * allows it (`VITE_OFFLINE_FALLBACK`), the engine is loaded as a lazy chunk from `../offline/`
 * and runs over the synthetic ledger in the browser — labelled as a simulation on every screen,
 * with nothing recorded. That chunk is the only place `@dhan/core` and `@dhan/fixtures` may be
 * imported; `scripts/check-bundle.mjs` fails the build if they leak into the main bundle.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SessionState, View } from '@dhan/contracts'
import { ApiError, api, isApiError, request } from '../api/client.ts'
import { clearSession, getSession, setSession } from '../api/session.ts'
import type { StoredSession } from '../api/session.ts'
import type * as Offline from '../offline/index.ts'
import type { OfflineState } from '../offline/index.ts'

export const OFFLINE_ALLOWED = import.meta.env.VITE_OFFLINE_FALLBACK !== 'false'

export type OfflineModule = typeof Offline
export type ViewTier = 'server' | 'offline'

export interface OfflineHandle {
  mod: OfflineModule
  state: OfflineState
}

interface Loaded {
  /** Which stored session this state was loaded for. A mismatch means "still loading". */
  key: string | null
  view: View | null
  session: SessionState | null
  error: ApiError | null
  tier: ViewTier
  offline: OfflineHandle | null
  /** A refresh is in flight. The last view stays on screen meanwhile. */
  busy: boolean
}

const EMPTY: Loaded = {
  key: null,
  view: null,
  session: null,
  error: null,
  tier: 'server',
  offline: null,
  busy: false,
}

export interface ViewState {
  view: View | null
  session: SessionState | null
  loading: boolean
  error: ApiError | null
  tier: ViewTier
  offline: OfflineHandle | null
  busy: boolean
  /** Re-read /view and /session. Every mutation ends here. */
  refresh: () => Promise<void>
  /** From the offline tier: try the API again. */
  reconnect: () => Promise<void>
  /** A mutation returned the new session state; keep it without a round trip. */
  applySession: (session: SessionState) => void
  /** The offline clock moved; rebuild the simulated view. */
  setOfflineState: (state: OfflineState) => void
}

/**
 * A ternary on a module constant, so the bundler can see the branch is dead when the flag is
 * 'false' and leave the chunk out of the build altogether.
 */
export function loadOffline(): Promise<OfflineModule | null> {
  return OFFLINE_ALLOWED ? import('../offline/index.ts') : Promise.resolve(null)
}

const keyOf = (s: StoredSession | null): string | null => (s ? `${s.cif}|${s.token ?? ''}` : null)

const unreachable = (message = 'Could not reach the advisor service.'): ApiError =>
  new ApiError(0, 'NETWORK', message)

export function useView(stored: StoredSession | null): ViewState {
  const key = keyOf(stored)
  const [state, setState] = useState<Loaded>(EMPTY)
  // Bookkeeping that is never rendered: the ETag of the view on screen, the offline handle to
  // carry across a failed retry, and a run counter so a slow reply cannot overwrite a newer one.
  const etagRef = useRef<string | null>(null)
  const offlineRef = useRef<OfflineHandle | null>(null)
  const loadedKeyRef = useRef<string | null>(null)
  const runRef = useRef(0)

  const load = useCallback(
    async (kind: 'initial' | 'refresh' | 'reconnect'): Promise<void> => {
      // A callback from the previous session must not start a request with the new token or
      // invalidate its in-flight load. The store changes before React's next effect runs.
      if (keyOf(getSession()) !== key) return
      runRef.current += 1
      const run = runRef.current
      const fresh = (): boolean => run === runRef.current && keyOf(getSession()) === key

      if (loadedKeyRef.current !== key) {
        etagRef.current = null
        offlineRef.current = null
        loadedKeyRef.current = key
      }

      if (!stored) {
        etagRef.current = null
        offlineRef.current = null
        setState(EMPTY)
        return
      }

      const fail = (error: ApiError): void => setState((s) => ({ ...s, key, error, busy: false }))

      const goOffline = async (): Promise<void> => {
        const previous = kind === 'reconnect' ? null : offlineRef.current
        const mod = previous?.mod ?? (await loadOffline())
        if (!fresh()) return
        if (!mod) {
          fail(unreachable())
          return
        }
        const offlineState = previous?.state ?? mod.createState(stored.cif)
        if (!offlineState) {
          fail(
            unreachable(
              'Could not reach the advisor service, and this customer cannot be simulated offline.',
            ),
          )
          return
        }
        offlineRef.current = { mod, state: offlineState }
        setState({
          key,
          view: mod.buildView(offlineState),
          session: mod.sessionState(offlineState),
          error: null,
          tier: 'offline',
          offline: offlineRef.current,
          busy: false,
        })
      }

      // A pick made while offline has no server row. Simulate until asked to reconnect, when the
      // cif is exchanged for a real session and the effect below reloads on the new token.
      if (stored.token === null) {
        if (kind !== 'reconnect') {
          await goOffline()
          return
        }
        try {
          const created = await api('createSession', { body: { cif: stored.cif } })
          if (!fresh()) return
          etagRef.current = null
          offlineRef.current = null
          setSession({ token: created.token, cif: stored.cif })
        } catch {
          if (fresh()) setState((s) => ({ ...s, busy: false }))
        }
        return
      }

      try {
        const etag = etagRef.current
        const [reply, session] = await Promise.all([
          request('getView', etag ? { etag } : {}),
          api('getSession'),
        ])
        if (!fresh()) return
        offlineRef.current = null
        if (reply.notModified) {
          setState((s) => ({
            ...s,
            key,
            session,
            error: null,
            tier: 'server',
            offline: null,
            busy: false,
          }))
        } else {
          etagRef.current = reply.etag
          setState({
            key,
            view: reply.body,
            session,
            error: null,
            tier: 'server',
            offline: null,
            busy: false,
          })
        }
      } catch (err) {
        if (!fresh()) return
        const e = isApiError(err) ? err : unreachable()
        // The token is gone or expired: back to the picker rather than an error nobody can fix.
        if (e.status === 401) {
          clearSession()
          return
        }
        if (e.unreachable && OFFLINE_ALLOWED) {
          await goOffline()
          return
        }
        fail(e)
      }
    },
    [stored, key],
  )

  useEffect(() => {
    // Off the effect's own tick: state changes when the reply arrives, never during the effect.
    queueMicrotask(() => void load('initial'))
  }, [load])

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, busy: true }))
    await load('refresh')
  }, [load])

  const reconnect = useCallback(async () => {
    setState((s) => ({ ...s, busy: true }))
    await load('reconnect')
  }, [load])

  const applySession = useCallback((session: SessionState) => {
    setState((s) => ({ ...s, session }))
  }, [])

  const setOfflineState = useCallback((next: OfflineState) => {
    const current = offlineRef.current
    if (!current) return
    const handle = { mod: current.mod, state: next }
    offlineRef.current = handle
    setState((s) => ({
      ...s,
      view: handle.mod.buildView(next),
      session: handle.mod.sessionState(next),
      offline: handle,
    }))
  }, [])

  const current = state.key === key
  return {
    view: current ? state.view : null,
    session: current ? state.session : null,
    loading: key !== null && !current,
    error: current ? state.error : null,
    tier: current ? state.tier : 'server',
    offline: current ? state.offline : null,
    busy: state.busy,
    refresh,
    reconnect,
    applySession,
    setOfflineState,
  }
}
