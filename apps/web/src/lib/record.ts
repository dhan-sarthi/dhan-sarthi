/**
 * The paper trail, read from the server. Advice records, decisions, roadmap versions and the
 * hash-chain check come from `/record` and `/record/verify`; the browser keeps none of it.
 * Offline there is no record, and the Record tab says so rather than inventing one.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChainVerification, RecordView } from '@dhan/contracts'
import { ApiError, api, isApiError } from '../api/client.ts'
import type { StoredSession } from '../api/session.ts'
import type { ViewTier } from './view.ts'

interface Loaded {
  key: string | null
  record: RecordView | null
  chain: ChainVerification | null
  error: ApiError | null
}

export interface RecordState {
  record: RecordView | null
  chain: ChainVerification | null
  loading: boolean
  error: ApiError | null
  refresh: () => Promise<void>
}

export function useRecord(stored: StoredSession | null, tier: ViewTier): RecordState {
  const key = stored?.token && tier === 'server' ? stored.token : null
  const [state, setState] = useState<Loaded>({ key: null, record: null, chain: null, error: null })
  const runRef = useRef(0)

  const load = useCallback(async (): Promise<void> => {
    if (!key) return
    runRef.current += 1
    const run = runRef.current
    try {
      const record = await api('getRecord')
      // The chain check is a second call so a failure there cannot hide the record itself.
      const chain = await api('verifyRecord').catch(() => null)
      if (run !== runRef.current) return
      setState({ key, record, chain, error: null })
    } catch (err) {
      if (run !== runRef.current) return
      const error = isApiError(err) ? err : new ApiError(0, 'NETWORK', 'Could not read the record.')
      setState((s) => ({
        key,
        record: s.key === key ? s.record : null,
        chain: s.key === key ? s.chain : null,
        error,
      }))
    }
  }, [key])

  useEffect(() => {
    // Off the effect's own tick: state changes when the reply arrives, never during the effect.
    queueMicrotask(() => void load())
  }, [load])

  const current = state.key === key
  return {
    record: current ? state.record : null,
    chain: current ? state.chain : null,
    loading: key !== null && !current,
    error: current ? state.error : null,
    refresh: load,
  }
}
