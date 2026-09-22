import '../global.css'
import '~/ui/interop'
import { useEffect } from 'react'
import { Stack, router, useSegments } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { OnboardingProvider } from '~/state/onboarding'
import { SnapshotProvider } from '~/state/snapshot'
import { PhoneFrame, showPhoneFrame } from '~/ui/PhoneFrame'
import { ToastProvider } from '~/ui/Toast'
import { useReducedMotion } from '~/ui/motion'
import { getToken } from '~/api/client'
import { color } from '@dhan/design'

// The routes that close with a × rather than a back chevron. They rise from the bottom as
// sheets, the way Cleo presents a task you finish and dismiss; a screen with a back chevron
// is a place you went to, and it slides in from the right like every other push.
const SHEETS = [
  'profile',
  'noticed',
  'set-limit',
  'deposit',
  'challenge',
  'challenge-generating',
] as const

export default function RootLayout() {
  // A laptop's or desktop's browser shows the app inside a phone rather than stretched across the
  // window. The phone holds this same layout, which inside it renders exactly as on a phone:
  // src/ui/PhoneFrame.tsx.
  return showPhoneFrame ? <PhoneFrame /> : <App />
}

function App() {
  // The stack animates with React Native's own driver, which does not check the accessibility
  // setting on its own; a fade is the honest transition when travel has been asked off.
  const reduced = useReducedMotion()

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* The toast host sits inside SafeAreaProvider so it can read the bottom inset, and
            above the navigator so a toast raised on a sheet outlives the sheet's dismissal —
            "Limit set" is shown on the screen you land on, not the one you left. */}
        <ToastProvider>
          {/* Inside OnboardingProvider so nothing about the signup draft depends on the
              snapshot, and above Stack so the modal routes pushed over the tabs are inside it.
              Mounting it here rather than on the tab layout is safe because the provider gates
              its read on there being a bearer — see src/state/snapshot.tsx. */}
          <OnboardingProvider>
            <SnapshotProvider>
              <BearerGate />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: color.ground },
                  animation: reduced ? 'fade' : 'slide_from_right',
                }}
              >
                {SHEETS.map((name) => (
                  <Stack.Screen
                    key={name}
                    name={name}
                    options={{
                      presentation: 'modal',
                      animation: reduced ? 'fade' : 'slide_from_bottom',
                    }}
                  />
                ))}
              </Stack>
            </SnapshotProvider>
          </OnboardingProvider>
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

/**
 * A link past the way in, opened with no bearer.
 *
 * Without one the snapshot sits idle and reads nothing (src/state/snapshot.tsx), and every screen
 * outside onboarding waits on it — so /spend opened from a link on a signed-out phone, or after
 * the browser's storage was cleared, said "Reading your money…" for good. The splash decides for
 * itself and onboarding is where a customer without a bearer belongs; anywhere else goes back to
 * the way in. Asked once on arriving outside onboarding, not on every move: a bearer read once is
 * still there on the next screen, and one that expires is the snapshot's 401, which already goes
 * back to welcome. A failed read counts as none, as it does on the splash.
 */
function BearerGate() {
  const first = useSegments()[0]
  const outside = first !== undefined && first !== '(onboarding)'

  useEffect(() => {
    if (!outside) return
    let cancelled = false
    void getToken()
      .catch(() => null)
      .then((token) => {
        if (!cancelled && !token) router.replace('/(onboarding)/welcome')
      })
    return () => {
      cancelled = true
    }
  }, [outside])

  return null
}
