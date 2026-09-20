// Step 2 — the code.
//
// Six boxes, a resend link, and nothing else. The session is created here rather
// than on the previous screen so that the bearer token and the moment of
// authentication are the same event.
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '~/ui/Screen'
import { Type } from '~/ui/Text'
import { Button } from '~/ui/Button'
import { OtpInput } from '~/ui/OtpInput'
import { api } from '~/api/client'
import { useOnboarding } from '~/state/onboarding'

export default function OtpStep() {
  const { draft } = useOnboarding()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function verify() {
    if (!draft.customer) return
    setBusy(true)
    setError(null)
    try {
      await api.createSession(draft.customer.cif)
      router.push('/(onboarding)/consent')
    } catch {
      setError('That did not work. Try again.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (code.length === 6 && !busy) void verify()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  return (
    <Screen
      step={2}
      steps={5}
      onBack={() => router.back()}
      footer={
        <Button
          label="Verify"
          loading={busy}
          disabled={code.length < 6}
          onPress={() => void verify()}
        />
      }
    >
      <Type role="display">Enter your code</Type>
      <Type role="body" tone="soft" className="mt-sm">
        Sent to +91 {draft.mobile || '—'}
      </Type>

      <View className="mt-xl">
        <OtpInput value={code} onChange={setCode} />
      </View>

      <Type role="label" tone="soft" className="mt-lg">
        Didn't get it? Check your messages, or resend in 30s.
      </Type>
      <Type role="caption" tone="faint" className="mt-xl">
        Demo build — any six digits will do.
      </Type>

      {error ? (
        <Type role="label" tone="danger" className="mt-md">
          {error}
        </Type>
      ) : null}
    </Screen>
  )
}
