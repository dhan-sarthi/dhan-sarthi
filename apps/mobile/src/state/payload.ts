// A payload that is not the snapshot.
//
// Most of what a screen shows comes from one GET /view, held by `src/state/snapshot.tsx`.
// Three routes are not in it — /holdings, /save and /challenges — and every screen that
// reads one of them was writing the same four lines: a `useState<T | null>(null)`, a
// `.then(setX)`, a `.catch(() => setX(null))`, and a render that treats null as "still
// loading". That catch is the bug. It collapses *failed* onto *loading* or onto *empty*, so
// a 500 from /holdings printed "Nothing held yet." — a claim about what the customer owns,
// made after a read that did not come back — and a 500 from /save printed "Counting the
// pot…" forever.
//
// So the three states are kept apart here, once, and the module hands back the same shape
// the snapshot does: `data` survives a failed reload so a screen can keep showing what it
// has, and `state` says whether the last read landed. `ui/PayloadPane.tsx` renders it.
//
// Reads are sequenced by issue order, not arrival order. Two overlapping reloads — a pull
// racing a focus, or a decision firing one behind a gesture — used to resolve last-to-arrive,
// which can leave the older answer on screen.
import { useCallback, useEffect, useRef, useState } from 'react'

/** `loading` covers the first read only; a failed *reload* keeps `data` and reports `error`. */
export type PayloadState = 'loading' | 'ready' | 'error'

export type Payload<T> = {
  data: T | null
  state: PayloadState
  /** Resolves once the read has settled, and never rejects. */
  reload: () => Promise<void>
}

/**
 * Read one route, and say honestly which of the three things happened.
 *
 * `read` must be stable across renders — pass a method off the `api` object, or a
 * `useCallback`. Its identity is a dependency: changing it re-reads.
 *
 * `reloadOn` re-reads when the value changes. Screens beside the snapshot pass the view, so
 * a refreshed snapshot — a moved clock, a decision taken — pulls the side payloads with it.
 */
export function usePayload<T>(read: () => Promise<T>, reloadOn?: unknown): Payload<T> {
  const [data, setData] = useState<T | null>(null)
  const [state, setState] = useState<PayloadState>('loading')
  const issued = useRef(0)
  const landed = useRef(0)

  const reload = useCallback(async () => {
    const seq = ++issued.current
    try {
      const next = await read()
      if (seq < landed.current) return
      landed.current = seq
      setData(next)
      setState('ready')
    } catch {
      if (seq < landed.current) return
      landed.current = seq
      // `data` is left standing deliberately: a reload that fails over a payload already on
      // screen should not blank it. The caller shows what it has and says the read failed.
      setState('error')
    }
  }, [read])

  useEffect(() => {
    void reload()
  }, [reload, reloadOn])

  return { data, state, reload }
}
