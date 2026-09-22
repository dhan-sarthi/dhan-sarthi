// Step 2 — the code.
//
// Six boxes and one button. The session is created here rather than on the previous
// screen so that the bearer token and the moment of authentication are the same event.
//
// There is no "send it again in 30s" line. It promised a timer and a second code that did not
// exist; what this demo can say honestly is that any six digits work, so it says that, once. The one
// thing the screen can do for someone who never got a code is let them fix the number, so that
// is the only link on it.
//
// It never draws without a number to have sent a code to. Opened cold — a refresh, a deep
// link — it redirects to the mobile step before its first frame, instead of printing
// "Sent to +91" over boxes that could only fail.
//
// A failure says which failure it was. Only the bank refusing the sign-in (400, 401, 403) is
// "That code didn't work". Too many sign-ins (429, twenty an hour) and a bank that is down or
// unreachable are not the code's fault and do not say they are.
//
// A code that worked is spent, so the screen replaces itself with consent rather than stacking
// under it. Back from consent used to land here on six empty boxes, and typing a code again
// signed the customer in a second time; now it goes to the number, the one thing worth changing.
import { useState } from 'react'
import { Keyboard, View } from 'react-native'
import { Redirect, router } from 'expo-router'
import { Screen } from '~/ui/Screen'
import { Type } from '~/ui/Text'
import { Tap } from '~/ui/Tap'
import { Button } from '~/ui/Button'
import { OtpInput } from '~/ui/OtpInput'
import { leave } from '~/ui/NavRow'
import { ApiError, api } from '~/api/client'
import { useOnboarding } from '~/state/onboarding'

const LENGTH = 6

/** What a failed sign-in says, by who failed: the code, the rate limit, or the connection. */
function failureOf(err: unknown): string {
  if (err instanceof ApiError && [400, 401, 403].includes(err.status)) {
    return "That code didn't work. Try again."
  }
  if (err instanceof ApiError && err.status === 429) {
    return 'Too many sign-ins in the last hour. Try again later.'
  }
  return "Couldn't reach the bank. Try again."
}

export default function OtpStep() {
  const { draft } = useOnboarding()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const customer = draft.customer
  if (customer === null) return <Redirect href="/(onboarding)/mobile" />

  async function verify() {
    if (busy || customer === null) return
    setBusy(true)
    setError(null)
    // The code field keeps focus when the sixth digit submits it, and on a phone the keyboard then
    // rides over to the consent step and covers its button. A browser has no keyboard to leave up.
    Keyboard.dismiss()
    try {
      await api.createSession(customer.cif)
      router.replace('/(onboarding)/consent')
    } catch (err) {
      setError(failureOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      step={2}
      steps={6}
      onBack={() => leave('/(onboarding)/mobile')}
      title="Enter your code"
      subtitle={`Sent to +91 ${draft.mobile}`}
      footer={
        <Button
          label="Verify"
          loading={busy}
          haptic="none"
          disabled={code.length < LENGTH}
          onPress={() => void verify()}
        />
      }
    >
      <View className="mt-xl">
        <OtpInput
          value={code}
          onChange={(next) => {
            setCode(next)
            setError(null)
            // The last digit is the submit. Autofill drops all six at once and lands here too.
            if (next.length === LENGTH) void verify()
          }}
        />
      </View>

      {error === null ? null : (
        <Type role="caption" tone="danger" accessibilityRole="alert" className="mt-md">
          {error}
        </Type>
      )}

      <Type role="caption" tone="mid" className="mt-lg">
        Didn't get it? In this demo any six digits work.
      </Type>

      <Tap
        accessibilityRole="link"
        accessibilityLabel="Wrong number? Go back"
        onPress={() => leave('/(onboarding)/mobile')}
        dim
        className="mt-sm min-h-target justify-center self-start"
      >
        <Type role="body" weight="semibold" className="underline">
          Wrong number? Go back
        </Type>
      </Tap>
    </Screen>
  )
}
