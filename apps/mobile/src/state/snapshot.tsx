// The signed-in customer's view of their money, read once.
//
// One GET /view holds everything every screen needs — the snapshot, the accounts, the
// roadmap, today's plan, the insights, the shelf and the rules. It is a single derivation
// on the server, so splitting it into per-screen fetches would mean several recomputations
// of the same snapshot and screens that disagree with each other about what day it is.
//
// This provider is mounted at the ROOT rather than on the tab layout, which an earlier
// version of it could not be. At the root its mount effect fires before onboarding has a
// bearer; the 401 branch below then drops the token and replaces to welcome, and because a
// mount effect runs once, a customer who afterwards completes signup would land on tabs that
// stay empty forever. The bearer gate is what makes root mounting safe: with no token the
// module sits in `idle` and reads nothing, and `onTokenChange` re-arms it the moment
// `api.createSession` stores one. Root mounting is what lets the modal routes — set-limit,
// deposit, edit-goal, save-hack, challenge, noticed, statement — call `refresh()` through the
// hook instead of through a module-level escape hatch.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { router } from 'expo-router'
import { ApiError, api, getToken, setToken, onTokenChange } from '~/api/client'
import type { View } from '@dhan/contracts'

/**
 * `idle` means there is no bearer, so nothing was asked for. It is not a failure and must
 * never be rendered as one.
 */
export type SnapshotState = 'idle' | 'loading' | 'ready' | 'error'

/**
 * What every screen reads.
 *
 * Named for the module rather than for the figures: `Snapshot` in `@dhan/core` is every
 * figure derived from a customer file on one date, and it arrives here as `data.snapshot`.
 * This is the thing that holds it.
 *
 * Invariants:
 *   · `data` is non-null once a read has landed, and **stays** non-null. A refresh that
 *     fails over a view already on screen leaves `data` standing and moves `state` to
 *     `'error'`, so a caller holding stale data can keep showing it — which means `data`
 *     and `state` are read together and `data` is read *first*. A caller that branches on
 *     `state` before `data` blanks a view the module is still holding.
 *   · `data` is null exactly while no read has ever landed: `'idle'`, the first `'loading'`,
 *     or a first read that failed.
 *   · `asOf` is `data?.snapshot.asOf ?? null`, and is the app's only 'today' outside the
 *     per-payload stamps the server puts on SessionState, SaveView and ChallengeView.
 *   · `state` is `'idle'` when and only when there is no bearer.
 *   · `error` is non-null exactly when `state === 'error'`, so the error sentence is never
 *     rendered with its first clause missing.
 *   · `refresh()` resolves once the read has settled, and never rejects.
 */
export type SnapshotStore = {
  data: View | null
  state: SnapshotState
  error: string | null
  asOf: string | null
  refresh: () => Promise<void>
}

const SnapshotContext = createContext<SnapshotStore | null>(null)

export function SnapshotProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<View | null>(null)
  const [state, setState] = useState<SnapshotState>('idle')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    // Clearing the error without moving the state left the error branch rendering with a
    // null `error` — the sentence saying what went wrong gone, a leading space where it had
    // been — for the whole in-flight window of a retry. A read in flight over nothing is
    // `loading`; a read in flight over a view already on screen stays `ready`, because the
    // view is still what the customer should be looking at.
    setState((current) => (current === 'ready' ? current : 'loading'))
    try {
      setData(await api.view())
      setState('ready')
    } catch (err) {
      // An expired or unknown bearer is not a network problem, and telling the customer to
      // check the API is advice they cannot act on. Drop the dead token and send them back
      // to the way in — which is also what happens when the server has simply restarted.
      // Unreachable from the gate below, which never reads without a bearer; kept because a
      // token can expire between the gate and the read.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        await setToken(null)
        router.replace('/(onboarding)/welcome')
        return
      }
      setError('Could not reach the bank.')
      setState('error')
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    // SecureStore is async, so the answer to "is there a bearer" arrives a frame or two
    // after mount. Deciding before it lands is what would fire the unauthenticated read
    // this gate exists to prevent, and would cut short the splash's own 1.4s hold.
    async function arm() {
      const token = await getToken()
      if (cancelled) return
      if (!token) {
        setState('idle')
        setData(null)
        return
      }
      await refresh()
    }

    void arm()
    const stop = onTokenChange(() => {
      void arm()
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [refresh])

  const value = useMemo<SnapshotStore>(
    () => ({ data, state, error, asOf: data?.snapshot.asOf ?? null, refresh }),
    [data, state, error, refresh],
  )
  return <SnapshotContext.Provider value={value}>{children}</SnapshotContext.Provider>
}

export function useSnapshot(): SnapshotStore {
  const ctx = useContext(SnapshotContext)
  if (!ctx)
    throw new Error('useSnapshot outside SnapshotProvider, which is mounted on app/_layout.tsx.')
  return ctx
}
