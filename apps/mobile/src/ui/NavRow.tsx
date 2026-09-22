// The row above a pushed screen: a way back on the left, a way out on the right.
//
// Cleo draws a bare chevron or a bare ×, no plate, sitting on the screen's own gutter. The glyph
// is the one from `Glyph` at the app's 1.7 stroke — this row used to draw its own two SVGs at 2,
// the only heavier marks in the app, and they were the first thing on every pushed screen. The
// target is a full 44pt box pulled out into the gutter by its own inset, so the mark still lines
// up with the title under it while the finger gets a target it cannot miss. The box is rounded
// only for the web's keyboard focus ring, which takes the shape of what it rings: a circle round
// the ×, not a square that reads as a frame.
//
// The middle is optional and takes one of two things: a `title`, for a sheet that names itself
// in the bar, or a `center`, for the challenge wizard's step dots — back, dots and × on one line,
// as Cleo lays it out, rather than a rail stacked under the bar. An empty side keeps its box, so
// whatever sits in the middle stays on the screen's centre line. `trailing` takes the × slot for
// a screen whose right-hand control is something else.
//
// On a phone the row sits under the status bar, and the safe area is its top margin. A browser
// has no status bar, so there the row keeps 8pt of its own — the same 8pt a tab's header keeps —
// rather than pressing its 44pt box against the top of the window, where the keyboard's focus
// ring round the × was cut off.
import { useCallback, type ReactNode } from 'react'
import { Platform, View } from 'react-native'
import { router, useSegments, type Href } from 'expo-router'
import { Tap } from '~/ui/Tap'
import { Type } from '~/ui/Text'
import { Glyph } from '~/ui/Glyph'
import { color, space } from '@dhan/design'

/** The browser's stand-in for the status bar above the row; a phone's safe area does this job. */
const WEB_TOP = Platform.OS === 'web' ? { paddingTop: space.sm } : undefined

/**
 * Back out of a pushed screen: pop if there is somewhere to pop to, else go to `fallback`.
 *
 * A screen opened by a deep link or a refresh has no stack under it, and `router.back()` there
 * does nothing at all — the × is pressed and the customer stays put. Every modal's × and every
 * pushed screen's back chevron goes through this, so a cold open of `/statement` still lands on
 * Spend when it is closed.
 */
export function leave(fallback: Href = '/(tabs)/spend'): void {
  if (router.canGoBack()) router.back()
  else router.replace(fallback)
}

/**
 * Open a tab, on the pane or with the question its params name, from either side of the tabs.
 *
 * Which side decides the verb. React Navigation 7 answers `navigate` to a route that is not the
 * focused one by pushing a fresh copy of it, so from a screen pushed over the tabs — the
 * statement, the record, a notice — `navigate('/(tabs)/…')` stacks a second tab navigator on the
 * first: one tab bar on screen, two in memory, and closing the new one walks back into the old.
 * `dismissTo` pops back to the tabs already there and hands them the params, and on a cold deep
 * link, with no tabs underneath, it puts them in the pushed screen's place. Inside the tabs it is
 * the other way round: `navigate` is a jump between tabs, and `dismissTo` becomes a POP_TO the tab
 * navigator has no case for, which is dropped without a word.
 *
 * A route file knows its side and calls the verb itself. A component that renders on both — the
 * transaction sheet on /statement and on Spend, the credit content on /credit and in Spend's
 * Credit pane, the gate sheet on /record and on three tabs, Uday's lead bubble — takes this hook,
 * which reads the side from the route that is showing.
 */
export function useToTab(): (href: Href) => void {
  const inTabs = useSegments()[0] === '(tabs)'
  return useCallback(
    (href: Href) => {
      if (inTabs) router.navigate(href)
      else router.dismissTo(href)
    },
    [inTabs],
  )
}

export function NavRow({
  onBack,
  onClose,
  dark = false,
  title,
  center,
  trailing,
}: {
  onBack?: (() => void) | undefined
  onClose?: (() => void) | undefined
  dark?: boolean
  /** A name in the middle of the bar. */
  title?: string
  /** Anything else in the middle of the bar — the wizard's `StepDots`. Ignored with `title`. */
  center?: ReactNode
  /** Replaces the × slot. */
  trailing?: ReactNode
}) {
  const tint = dark ? color.onInk : color.ink

  return (
    <View
      accessibilityRole="toolbar"
      className="min-h-target flex-row items-center justify-between px-pad"
      style={WEB_TOP}
    >
      {onBack ? (
        <Tap
          onPress={onBack}
          hitSlop={12}
          scale={0.86}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="-ml-md h-target w-target items-center justify-center rounded-pill"
        >
          <Glyph name="chevronLeft" tint={tint} />
        </Tap>
      ) : (
        <View className="-ml-md h-target w-target" />
      )}

      {title !== undefined ? (
        <Type
          role="heading"
          plain
          numberOfLines={1}
          tone={dark ? 'onInk' : 'ink'}
          className="flex-1 text-center"
        >
          {title}
        </Type>
      ) : center !== undefined ? (
        <View className="flex-1 items-center">{center}</View>
      ) : null}

      {trailing !== undefined ? (
        trailing
      ) : onClose ? (
        <Tap
          onPress={onClose}
          hitSlop={12}
          scale={0.86}
          accessibilityRole="button"
          accessibilityLabel="Close"
          className="-mr-md h-target w-target items-center justify-center rounded-pill"
        >
          <Glyph name="close" tint={tint} />
        </Tap>
      ) : (
        <View className="-mr-md h-target w-target" />
      )}
    </View>
  )
}
