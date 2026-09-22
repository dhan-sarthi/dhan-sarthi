// The screen scaffold every onboarding step sits in.
//
// Cleo's steps share one skeleton: an optional progress rail and back/close row at
// the top, content left-aligned against a 20pt gutter, and the primary action pinned
// to the bottom above the home indicator. Putting that here means a step file is
// only its own content, and the rhythm cannot drift between steps.
//
// The title and its one-line subtitle are part of that skeleton too, and a screen that passes
// them gets them in the one place and size every other screen uses — the first thing in the
// scroll, display over body — instead of hand-setting its own pair a few points off everyone
// else's.
//
// The footer rides the keyboard. The body and the footer sit in one KeyboardAvoidingView, so on
// a step with a field the Next button is lifted above the keys rather than hidden under them —
// the step's only way forward cannot be the thing the keyboard covers. The scroll gives the
// keyboard up on a drag and keeps a tap on a button a tap on the button. It does not also inset
// itself for the keyboard: the avoiding view has already shrunk it clear of the keys, and a
// second adjustment is a band of empty scroll at the bottom of every form.
//
// `edges` is which sides the screen keeps clear of the system's furniture. A step presented as
// a sheet has no status bar over it and wants `['bottom']`.
//
// On the web the screen itself can take focus (never by Tab, never with a ring), because a
// screen shown inside a dialog — the product gate — is focused first when the dialog opens, and
// without that the first thing to take focus was the × in the row above, ringed in dark.
import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { SafeAreaView, type Edge } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { ProgressRail } from '~/ui/ProgressRail'
import { NavRow } from '~/ui/NavRow'
import { DIALOG_FOCUS, NO_RING } from '~/ui/Tap'
import { Type } from '~/ui/Text'
import { cn } from '~/ui/cn'

const TOP_AND_BOTTOM: readonly Edge[] = ['top', 'bottom']

export function Screen({
  children,
  footer,
  step,
  steps,
  onBack,
  onClose,
  scroll = true,
  dark = false,
  edges = TOP_AND_BOTTOM,
  title,
  subtitle,
  titleRole = 'display',
}: {
  children?: ReactNode
  footer?: ReactNode
  step?: number
  steps?: number
  onBack?: () => void
  onClose?: () => void
  scroll?: boolean
  dark?: boolean
  edges?: readonly Edge[]
  /** The screen's title, set first in the body. */
  title?: string
  /** One sentence under the title. */
  subtitle?: string
  titleRole?: 'display' | 'title'
}) {
  const ground = dark ? 'bg-hero' : 'bg-ground'

  const head =
    title === undefined && subtitle === undefined ? null : (
      <>
        {title === undefined ? null : (
          <Type role={titleRole} tone={dark ? 'onInk' : 'ink'}>
            {title}
          </Type>
        )}
        {subtitle === undefined ? null : (
          <Type
            role="body"
            tone={dark ? 'onInk' : 'mid'}
            className={cn(title !== undefined && 'mt-sm')}
          >
            {subtitle}
          </Type>
        )}
      </>
    )

  return (
    <SafeAreaView className={cn('flex-1', ground)} edges={edges} {...DIALOG_FOCUS} style={NO_RING}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {(onBack || onClose) && <NavRow onBack={onBack} onClose={onClose} dark={dark} />}
      {typeof step === 'number' && typeof steps === 'number' && (
        <ProgressRail step={step} steps={steps} tone={dark ? 'light' : 'ink'} />
      )}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        {scroll ? (
          <ScrollView
            className="flex-1 px-pad"
            contentContainerClassName="pt-xl pb-xxl"
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            {head}
            {children}
          </ScrollView>
        ) : (
          <View className="flex-1 px-pad">
            {head}
            {children}
          </View>
        )}
        {footer ? <View className={cn('px-pad pt-md pb-lg', ground)}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
