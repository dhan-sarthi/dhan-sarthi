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
import type { ReactNode } from 'react'
import { Type } from '~/ui/Text'
import type { Payload } from '~/state/payload'

export function PayloadPane<T>({
  payload,
  loading,
  error,
  children,
}: {
  payload: Payload<T>
  /** What this pane is working out, in its own words. */
  loading: string
  /** What could not be read, in its own words. The ":3001" hint is appended here. */
  error: string
  children: (data: T) => ReactNode
}) {
  const { data, state } = payload
  if (data) return <>{children(data)}</>
  if (state === 'error')
    return (
      <Type role="body" tone="danger">
        {error} Start the API on :3001 and pull to refresh.
      </Type>
    )
  return (
    <Type role="body" tone="soft">
      {loading}
    </Type>
  )
}
