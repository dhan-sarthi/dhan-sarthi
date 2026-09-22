// The lime banner that says a thing is done, from Cleo's "Spending limit set".
//
// A commit in this app ends by leaving the screen it happened on: the limit is set and the
// sheet closes, the deposit lands and the customer is back on the goal. The confirmation has
// to be said on the screen they land on, not the one that is sliding away. So the host lives
// here, mounted once in app/_layout.tsx above the navigator, and every caller shows first and
// navigates second. A toast is state that outlives the screen that raised it.
//
// Measured against Cleo's frame: a 51pt banner, 8pt clear of the screen edge where their cards
// sit at 16 — so it hangs slightly wider than the column it floats over, which is what makes it
// read as laid on top of the page rather than as one more card in it — and 8pt clear of the
// tab bar's top edge. Their label is 14–15pt semibold, which is our body at semibold, the same
// idiom the small button uses. The check is ours: on a lime ground it is the one mark that
// says "done" before the words are read.
//
// It says itself once. iOS has no live regions, so the message is announced — queued behind
// whatever VoiceOver is already reading, because a toast usually lands mid-transition and an
// interrupting announcement is one the screen change cuts off. Android and the web have live
// regions, and the host is one; announcing there as well would read every toast twice.
//
// Latest replaces. Two commits in a row show the second message, with a fresh clock, and the
// first is not queued behind it — a confirmation of something already superseded is noise.
// There is no haptic: the commit that raised the toast already ticked.
//
// What it does not do: float above a native modal. A `presentation: 'modal'` route and the
// Sheet's Modal are separate native windows on iOS, and anything drawn in this tree sits under
// them. That is the contract, not a gap — raise the toast, then dismiss.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AccessibilityInfo, Platform, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated'
import { Tap } from '~/ui/Tap'
import { Type } from '~/ui/Text'
import { Glyph, type GlyphName } from '~/ui/Glyph'
import { cn } from '~/ui/cn'
import { dur, easeOut, flat, flatOut, useReducedMotion } from '~/ui/motion'
import tokens, { color, size, space } from '@dhan/design'

export const TOAST_DEFAULT_MS = 2400

export type ToastOptions = { glyph?: GlyphName; tone?: 'success' | 'ink'; duration?: number }

export type ToastHandle = {
  show: (message: string, options?: ToastOptions) => void
  hide: () => void
}

type Shown = { key: number; message: string; glyph: GlyphName; tone: 'success' | 'ink' }

// The tab bar's height, from its own parts (TabBar.tsx): 8 above a 32pt ring, 8 to a 13/18
// label, 4 below. Plus the 8 Cleo leaves between the banner and the bar. On a pushed route
// there is no bar and the banner simply floats that much higher, clear of a pinned button.
const TAB_BAR = space.sm + size.plateSm + space.sm + tokens.type.label.leading + space.xs
const LIFT = TAB_BAR + space.sm

const ToastContext = createContext<ToastHandle | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const count = useRef(0)

  const clear = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const hide = useCallback(() => {
    clear()
    setShown(null)
  }, [clear])

  const show = useCallback(
    (message: string, options?: ToastOptions) => {
      clear()
      // A new key even for the same words, so a second "Limit set" arrives as a second event
      // rather than as a banner that silently had its clock reset.
      count.current += 1
      setShown({
        key: count.current,
        message,
        glyph: options?.glyph ?? 'check',
        tone: options?.tone ?? 'success',
      })
      timer.current = setTimeout(() => {
        timer.current = null
        setShown(null)
      }, options?.duration ?? TOAST_DEFAULT_MS)
      if (Platform.OS === 'ios') {
        AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true })
      }
    },
    [clear],
  )

  // A timer left running after the provider unmounts would set state on nothing.
  useEffect(() => clear, [clear])

  // Stable, so a screen holding the handle does not re-render every time a toast comes and goes.
  const handle = useMemo<ToastHandle>(() => ({ show, hide }), [show, hide])

  return (
    <ToastContext.Provider value={handle}>
      {children}
      <Host shown={shown} onDismiss={hide} />
    </ToastContext.Provider>
  )
}

/** `show(message, { glyph, tone, duration })` then navigate; `hide()` to take it down early. */
export function useToast(): ToastHandle {
  const handle = useContext(ToastContext)
  if (handle === null) {
    throw new Error('useToast() needs a <ToastProvider> above it — it is mounted in app/_layout.')
  }
  return handle
}

function Host({ shown, onDismiss }: { shown: Shown | null; onDismiss: () => void }) {
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()

  return (
    // Touches pass through everywhere but the banner itself: the host spans the width of the
    // screen and must not swallow a tap on whatever is beside or behind it.
    <View
      aria-live="polite"
      className="absolute inset-x-0 items-center px-md"
      style={{ bottom: insets.bottom + LIFT, pointerEvents: 'box-none' }}
    >
      {shown === null ? null : (
        <Animated.View
          key={shown.key}
          // It rises into place and fades out where it stands. Under Reduce Motion it fades in
          // as well — still an arrival, with the travel removed.
          entering={reduced ? flat(0) : FadeInDown.duration(dur.move).easing(easeOut)}
          exiting={reduced ? flatOut(0) : FadeOut.duration(dur.state)}
          className="w-full"
        >
          <Banner shown={shown} onDismiss={onDismiss} />
        </Animated.View>
      )}
    </View>
  )
}

function Banner({ shown, onDismiss }: { shown: Shown; onDismiss: () => void }) {
  const ink = shown.tone === 'ink'
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={shown.message}
      accessibilityHint="Dismisses this message"
      haptic="none"
      // A full-width surface: 3% of it is a lurch, so it takes the large-surface press.
      scale={0.985}
      onPress={onDismiss}
      className={cn(
        'min-h-target w-full flex-row items-center gap-md rounded-lg px-lg py-lg',
        ink ? 'bg-ink' : 'bg-success',
      )}
    >
      <Glyph name={shown.glyph} size={18} tint={ink ? color.onInk : color.ink} />
      <Type role="body" weight="semibold" tone={ink ? 'onInk' : 'ink'} className="flex-1">
        {shown.message}
      </Type>
    </Tap>
  )
}
