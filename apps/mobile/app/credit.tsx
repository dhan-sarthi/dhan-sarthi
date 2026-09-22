// Credit, as a pushed route. Every door inside the app now opens the Home tab's Credit pane
// (`/spend?pane=credit`) instead, the gate sheet and the Plan's arrears stage included; this route
// stays for deep links and anything outside the app that still names it.
//
// The page itself is `CreditContent`, the same component the Home tab's Credit pane renders, so
// the two doors can't drift into two screens; its header carries every decision about what the
// page says. This file is only the frame: the back chevron, the display title and the promise
// under it, and the two arms a route owns that a pane inside Spend's scroll does not — the first
// read, and a read that failed.
//
// Reached by a deep link, so back can't assume a stack under it: `leave` pops where it can and
// lands on Home where it can't.
//
// `data` before `state`, per the store's own invariants: a refresh that fails over a view already
// on screen leaves `data` standing, and branching on `state` first would blank a page the store is
// still holding. The retry line is for having nothing at all, and it keeps its place while the
// retry runs, so the button spins under the finger instead of the page swapping out from under it.
import { useState } from 'react'
import { View } from 'react-native'
import { CreditContent } from '~/screens/CreditContent'
import { useSnapshot } from '~/state/snapshot'
import { leave } from '~/ui/NavRow'
import { Screen } from '~/ui/Screen'
import { OFFLINE, RetryLine } from '~/ui/SnapshotScroll'
import { Type } from '~/ui/Text'

export default function Credit() {
  const { data: view, state, refresh } = useSnapshot()
  const [retrying, setRetrying] = useState(false)
  const credit = view?.snapshot.credit ?? null

  async function retry() {
    setRetrying(true)
    // `refresh` settles and never rejects; the store's own `state` says how it went.
    await refresh()
    setRetrying(false)
  }

  return (
    <Screen
      onBack={() => leave('/(tabs)/spend')}
      title="Credit"
      subtitle="How you borrow with IDBI, what it's worth, and what we can't see."
    >
      {credit !== null ? (
        <View className="mt-xl gap-md">
          <CreditContent credit={credit} />
        </View>
      ) : state === 'error' || retrying ? (
        <RetryLine message={OFFLINE} onRetry={() => void retry()} busy={retrying} />
      ) : (
        <Type role="body" tone="mid" className="mt-xl">
          Reading your IDBI file…
        </Type>
      )}
    </Screen>
  )
}
