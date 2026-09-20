// The screen scaffold every onboarding step sits in.
//
// Cleo's steps share one skeleton: an optional progress rail and back/close row at
// the top, content left-aligned against a 20pt gutter, and the primary action pinned
// to the bottom above the home indicator. Putting that here means a step file is
// only its own content, and the rhythm cannot drift between steps.
import type { ReactNode } from 'react'
import { View, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { ProgressRail } from '~/ui/ProgressRail'
import { NavRow } from '~/ui/NavRow'

export function Screen({
  children,
  footer,
  step,
  steps,
  onBack,
  onClose,
  scroll = true,
  dark = false,
}: {
  children: ReactNode
  footer?: ReactNode
  step?: number
  steps?: number
  onBack?: () => void
  onClose?: () => void
  scroll?: boolean
  dark?: boolean
}) {
  const Body = scroll ? ScrollView : View
  return (
    <SafeAreaView
      className={dark ? 'flex-1 bg-hero' : 'flex-1 bg-ground'}
      edges={['top', 'bottom']}
    >
      <StatusBar style={dark ? 'light' : 'dark'} />
      {(onBack || onClose) && <NavRow onBack={onBack} onClose={onClose} dark={dark} />}
      {typeof step === 'number' && typeof steps === 'number' && (
        <ProgressRail step={step} steps={steps} />
      )}
      <Body
        className="flex-1 px-pad"
        {...(scroll
          ? {
              contentContainerClassName: 'pt-xl pb-xxl',
              keyboardShouldPersistTaps: 'handled' as const,
            }
          : {})}
      >
        {children}
      </Body>
      {footer && <View className="px-pad pt-md pb-sm">{footer}</View>}
    </SafeAreaView>
  )
}
