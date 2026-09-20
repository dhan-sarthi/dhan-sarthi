// The page scroller for a screen whose content is the snapshot.
//
// Four screens each held their own `refreshing` flag, their own RefreshControl and their own
// three-way ternary over the same module's states, and the sentence a customer sees when the
// API is down was written out four times. That is one rendering of one module's states, so it
// is written once here and the caller supplies only what differs: its loading line, and what
// to draw once the view has arrived.
//
// `idle` is drawn as loading, not as an error. There is no bearer yet, which is the state a
// cold start passes through — folding it into the error arm would put "could not reach the
// bank" on every tab for the first frames of every launch.
import { forwardRef, useState, type ReactNode } from 'react'
import { RefreshControl, ScrollView } from 'react-native'
import { Type } from '~/ui/Text'
import { useSnapshot } from '~/state/snapshot'
import { color } from '@dhan/design'
import type { View } from '@dhan/contracts'

export const SnapshotScroll = forwardRef<
  ScrollView,
  {
    /** The screen's own loading sentence. Each tab says what it is working out. */
    loading: string
    children: (view: View) => ReactNode
    /** Extra reads a pull should pull too, for a screen that has payloads beside the view. */
    alsoRefresh?: () => Promise<unknown>
    contentContainerClassName?: string
    className?: string
  }
>(function SnapshotScroll(
  {
    loading,
    children,
    alsoRefresh,
    contentContainerClassName = 'px-pad pt-lg pb-xxl gap-md',
    className = 'flex-1',
  },
  ref,
) {
  const { data, state, error, refresh } = useSnapshot()
  const [refreshing, setRefreshing] = useState(false)

  return (
    <ScrollView
      ref={ref}
      className={className}
      contentContainerClassName={contentContainerClassName}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={color.inkSoft}
          onRefresh={() => {
            setRefreshing(true)
            void Promise.all([refresh(), alsoRefresh?.() ?? Promise.resolve()]).finally(() =>
              setRefreshing(false),
            )
          }}
        />
      }
    >
      {data ? (
        children(data)
      ) : state === 'error' ? (
        <Type role="body" tone="danger">
          {error} Start the API on :3001 and pull to refresh.
        </Type>
      ) : (
        <Type role="body" tone="soft">
          {loading}
        </Type>
      )}
    </ScrollView>
  )
})
