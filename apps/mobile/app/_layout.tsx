import '../global.css'
import '~/ui/interop'
import { Stack } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { OnboardingProvider } from '~/state/onboarding'
import { SnapshotProvider } from '~/state/snapshot'
import { color } from '@dhan/design'

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Inside OnboardingProvider so nothing about the signup draft depends on the
            snapshot, and above Stack so the modal routes pushed over the tabs are inside it.
            Mounting it here rather than on the tab layout is safe because the provider gates
            its read on there being a bearer — see src/state/snapshot.tsx. */}
        <OnboardingProvider>
          <SnapshotProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: color.ground },
                animation: 'slide_from_right',
              }}
            />
          </SnapshotProvider>
        </OnboardingProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
