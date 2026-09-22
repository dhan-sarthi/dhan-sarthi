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
//
// The snapshot's *first* arrival is not a reason to read again. A screen opened cold mounts
// before /view has answered, so the mount read goes out with `reloadOn` still null, and the
// view landing a moment later used to send every side payload a second time for an answer
// that was already on its way — two GETs of /save, /holdings and /challenges on every cold
// open of Grow. Only a view that *changes* — a refresh, a moved clock, a decision taken — is
// news the side payloads have to follow. The one exception is a mount read that failed: then
// the view arriving is the first sign the bank is back, and it is taken.
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
 * Its first arrival from null does not, unless the mount read failed; see the header.
 */
export function usePayload<T>(read: () => Promise<T>, reloadOn?: unknown): Payload<T> {
  const [data, setData] = useState<T | null>(null)
  const [state, setState] = useState<PayloadState>('loading')
  const issued = useRef(0)
  const landed = useRef(0)
  const failed = useRef(false)
  const primed = useRef(false)
  const seen = useRef<unknown>(reloadOn)

  const reload = useCallback(async () => {
    const seq = ++issued.current
    try {
      const next = await read()
      if (seq < landed.current) return
      landed.current = seq
      failed.current = false
      setData(next)
      setState('ready')
    } catch {
      if (seq < landed.current) return
      landed.current = seq
      failed.current = true
      // `data` is left standing deliberately: a reload that fails over a payload already on
      // screen should not blank it. The caller shows what it has and says the read failed.
      setState('error')
    }
  }, [read])

  useEffect(() => {
    const before = seen.current
    seen.current = reloadOn
    const firstArrival = before == null && reloadOn != null
    if (primed.current && firstArrival && !failed.current) return
    primed.current = true
    void reload()
  }, [reload, reloadOn])

  return { data, state, reload }
}
