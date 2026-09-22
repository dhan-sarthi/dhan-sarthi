// A card that rises over the screen you are on: the transaction's details, how a figure was
// worked out, a short list to pick from.
//
// A sheet is for something you look at and put away without losing your place — a route would
// take you somewhere, and the customer who taps a transaction wants the list still there, still
// scrolled, when they close it. Anything with its own steps is a route instead.
//
// Three ways out, all the same action: the ×, a tap on the dimmed screen above, and the system's
// own back gesture (`onRequestClose`). The × is 44pt and named "Close", and round, so the web's
// keyboard focus ring circles it as NavRow's does; the grabber at the top is only a picture of a
// handle — this sheet does not drag, and a handle that invited a drag and ignored it would be
// worse than none.
//
// The dim fades and the card travels. The Modal itself only fades: with `slide`, React Native
// slides the whole layer, so the scrim would ride up the screen with the card like a dark blind.
// The card's own rise is a layout animation from the bottom edge, and under Reduce Motion it is
// dropped, leaving the fade — the sheet still arrives, it just does not travel. Leaving is the
// Modal's fade either way.
//
// The card sizes to what it holds, up to 88% of the window, and scrolls past that; `full` pins
// it at 88% for a list that should not jump as it filters. The keyboard pushes the whole card
// up rather than covering the field it opened for, and the footer — the sheet's one button —
// keeps clear of the home indicator. The cream ground is the page colour, so white cards inside
// read exactly as they do on a screen.
import type { ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native'
import Animated, { SlideInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Glyph } from '~/ui/Glyph'
import { DIALOG_FOCUS, NO_RING, Tap } from '~/ui/Tap'
import { Type } from '~/ui/Text'
import { dur, easeOut, useReducedMotion } from '~/ui/motion'
import { color, space } from '@dhan/design'

/** How much of the window a sheet may take; the rest keeps the screen underneath in view. */
const TALLEST = 0.88

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  height = 'auto',
  scroll = true,
}: {
  open: boolean
  onClose: () => void
  title?: string
  /** One short line under the title, at body size. */
  subtitle?: string
  children: ReactNode
  /** Pinned under the content: the sheet's button, "Got it" or the one action it offers. */
  footer?: ReactNode
  height?: 'auto' | 'full'
  scroll?: boolean
}) {
  const reduced = useReducedMotion()
  const insets = useSafeAreaInsets()
  const { height: window } = useWindowDimensions()
  const tallest = window * TALLEST

  return (
    <Modal
      transparent
      visible={open}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1 justify-end"
        style={{ paddingTop: insets.top + space.xl }}
      >
        <Animated.View
          accessibilityViewIsModal
          {...DIALOG_FOCUS}
          entering={reduced ? undefined : SlideInDown.duration(dur.move).easing(easeOut)}
          className="z-10 shrink rounded-t-xl bg-ground"
          style={[
            height === 'full' ? { height: tallest } : { maxHeight: tallest },
            footer === undefined ? { paddingBottom: insets.bottom } : null,
            NO_RING,
          ]}
        >
          <View className="mt-sm h-handle w-xxl self-center rounded-pill bg-ink/20" />

          <View className="flex-row items-start justify-between gap-md px-pad pt-md">
            {/* 44pt tall, so a one-line title centres on the × and a long one hangs from it. */}
            <View className="min-h-target flex-1 justify-center">
              {title === undefined ? null : <Type role="title">{title}</Type>}
            </View>
            <Tap
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={8}
              className="-mr-md h-target w-target items-center justify-center rounded-pill"
            >
              <Glyph name="close" tint={color.ink} />
            </Tap>
          </View>

          {subtitle === undefined ? null : (
            <Type role="body" tone="mid" className="mt-xs px-pad">
              {subtitle}
            </Type>
          )}

          {scroll ? (
            <ScrollView
              className="shrink"
              contentContainerClassName="px-pad pt-lg pb-lg"
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {children}
            </ScrollView>
          ) : (
            <View className="px-pad pt-lg pb-lg">{children}</View>
          )}

          {footer === undefined ? null : (
            <View className="px-pad pt-md" style={{ paddingBottom: insets.bottom + space.lg }}>
              {footer}
            </View>
          )}
        </Animated.View>
        {/* After the card in the tree and under it on screen. On web the Modal's focus trap
            focuses the first element that will take focus: a focused full-screen scrim drew a
            ring round the whole viewport, and a focused × drew a dark square round itself
            before anyone had touched it. With the card first and focusable, focus opens on
            the card itself (`DIALOG_FOCUS`, no ring) and Tab goes next to the ×. The scrim is
            out of the tab order: the × is the keyboard's and the screen reader's way out, the
            scrim is the finger's. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          tabIndex={-1}
          onPress={onClose}
          className="absolute inset-0 bg-scrim"
        />
      </KeyboardAvoidingView>
    </Modal>
  )
}
