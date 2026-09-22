// The three renderings of a payload that is not the snapshot.
//
// `SnapshotScroll` does this for the view; this does it for /holdings, /save and /challenges.
// The precedence is the same on purpose: **data first**. A payload already on screen keeps
// being shown when a reload fails, because the figures are still the last true ones and
// blanking them is a worse answer than a stale stamp. Only a screen with nothing to show
// says the read failed.
//
// Failed and empty are different sentences, and that is the whole point of this file: "you
// hold nothing" is a claim about the customer's money and may only be made by a read that
// came back. The caller writes the empty line inside `children`, where it is reached only
// when the payload actually arrived.
//
// A failure carries its own way back. It used to be a red sentence telling the customer to
// start an API on a port number — a developer's instruction, printed in every build — and
// the only recovery was a pull-to-refresh nothing on screen mentioned. Now the pane says what
// it could not load and offers "Try again" beside it, in the same words and the same control
// every other failed read in the app uses.
import { useState, type ReactNode } from 'react'
import { Type } from '~/ui/Text'
import { RetryLine } from '~/ui/SnapshotScroll'
import type { Payload } from '~/state/payload'

export function PayloadPane<T>({
  payload,
  loading,
  error,
  onRetry,
  children,
}: {
  payload: Payload<T>
  /** What this pane is working out, in its own words. */
  loading: string
  /** What could not be loaded, in its own words: "Couldn't load your holdings." */
  error: string
  /** Asks again. Given, the failure line carries a "Try again" button that spins until it settles. */
  onRetry?: () => void | Promise<unknown>
  children: (data: T) => ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const { data, state } = payload

  if (data) return <>{children(data)}</>

  if (state === 'error') {
    if (onRetry === undefined) {
      return (
        <Type role="body" tone="danger">
          {error}
        </Type>
      )
    }
    return (
      <RetryLine
        compact
        message={error}
        busy={busy}
        onRetry={() => {
          setBusy(true)
          void Promise.resolve(onRetry()).finally(() => setBusy(false))
        }}
      />
    )
  }

  return (
    <Type role="body" tone="mid">
      {loading}
    </Type>
  )
}
