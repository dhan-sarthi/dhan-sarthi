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
//
// The error arm is a `RetryLine`, not a sentence, because a sentence has nothing to press. Pull
// to refresh is the native way back, but it is inert on the web build and invisible to anyone
// who does not know it is there; a Try again pill is the way back that is always on screen.
// `OFFLINE` is exported so the payload panes say the same five words the tabs do.
import { forwardRef, useState, type ReactNode } from 'react'
import { RefreshControl, ScrollView, View as RNView } from 'react-native'
import { Type } from '~/ui/Text'
import { Button } from '~/ui/Button'
import { GlyphPlate, type GlyphName } from '~/ui/Glyph'
import { useSnapshot } from '~/state/snapshot'
import { color, size } from '@dhan/design'
import type { View } from '@dhan/contracts'

/** What every screen says when the read did not come back. */
export const OFFLINE = "Couldn't reach the bank."

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
    contentContainerClassName = 'px-pad pt-xl pb-xxl gap-md',
    className = 'flex-1',
  },
  ref,
) {
  const { data, state, refresh } = useSnapshot()
  const [refreshing, setRefreshing] = useState(false)
  // Held here rather than read off `state`: a retry moves the module to `loading`, which is
  // the arm that draws the loading sentence. Keeping the RetryLine up with its spinner going
  // is the difference between "it is trying" and the screen flickering back to a first load.
  const [retrying, setRetrying] = useState(false)
  const retry = () => {
    setRetrying(true)
    void Promise.all([refresh(), alsoRefresh?.()])
      .catch(() => undefined)
      .finally(() => setRetrying(false))
  }

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
      ) : state === 'error' || retrying ? (
        <RetryLine message={OFFLINE} onRetry={retry} busy={retrying} />
      ) : (
        <Type role="body" tone="mid">
          {loading}
        </Type>
      )}
    </ScrollView>
  )
})

/**
 * A read that did not come back, with the way to ask again.
 *
 * The full form stands in for a screen with nothing else to show; `compact` sits inside a
 * pane that still has other content around it, and announces itself as an alert so a reader
 * hears that the numbers below are missing rather than finding a gap. The port hint is a
 * developer's sentence and prints only in a development build.
 */
export function RetryLine({
  message = OFFLINE,
  detail,
  onRetry,
  busy = false,
  compact = false,
}: {
  message?: string
  detail?: string
  onRetry: () => void
  busy?: boolean
  compact?: boolean
}) {
  const hint = detail ?? (__DEV__ ? 'Dev: is the API running on :3001?' : undefined)

  if (compact) {
    return (
      <RNView
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        className="flex-row flex-wrap items-center gap-md"
      >
        <Type role="label" tone="danger" className="flex-1">
          {message}
        </Type>
        <Button
          size="sm"
          variant="secondary"
          label="Try again"
          loading={busy}
          haptic="none"
          onPress={onRetry}
        />
      </RNView>
    )
  }

  return (
    <RNView className="items-center gap-md px-xl py-xxl">
      <GlyphPlate name="refresh" size={size.plateXl} fill="bg-surface" />
      <Type role="heading" plain className="text-center">
        {message}
      </Type>
      {hint === undefined ? null : (
        <Type role="body" tone="mid" className="text-center">
          {hint}
        </Type>
      )}
      {/* Wrapped because a small Button places itself at the start of its row, which here
          would pull it left of the centred words above it. The wrapper is centred; the pill
          inside it is as wide as the wrapper. */}
      <RNView>
        <Button
          size="sm"
          variant="secondary"
          label="Try again"
          loading={busy}
          haptic="none"
          onPress={onRetry}
        />
      </RNView>
    </RNView>
  )
}

/**
 * A list with nothing in it, said honestly, with something to do about it where there is
 * something. Only reached once a read came back: "nothing here" is a claim about the
 * customer's money, and a failed read may not make it — that is `RetryLine`'s sentence.
 */
export function EmptyState({
  glyph,
  title,
  body,
  action,
}: {
  glyph: GlyphName
  title: string
  body: string
  action?: { label: string; onPress: () => void }
}) {
  return (
    <RNView className="flex-1 items-center justify-center gap-md px-xl py-xxl">
      <GlyphPlate name={glyph} size={size.plateXl} fill="bg-surface" />
      <Type role="heading" className="text-center">
        {title}
      </Type>
      <Type role="body" tone="mid" className="text-center">
        {body}
      </Type>
      {action === undefined ? null : (
        // Wrapped for the same reason as RetryLine's: centred under the words, not left of them.
        <RNView>
          <Button
            size="sm"
            variant="secondary"
            label={action.label}
            haptic="none"
            onPress={action.onPress}
          />
        </RNView>
      )}
    </RNView>
  )
}
