// Step 1 — who is signing in.
//
// The bank already knows this customer, so there is no account to create: a mobile
// number is the whole of it. Cleo's equivalent first step is one field and one
// button on an otherwise empty screen, and the emptiness is the point — it reads as
// a short flow rather than a form.
//
// The persona row underneath is the demo seam. Each synthetic customer gets a stable
// number so the flow stays a real login rather than a picker wearing a login's
// clothes, and tapping one fills the field the way a password manager would.
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '~/ui/Screen'
import { Type } from '~/ui/Text'
import { Field } from '~/ui/Field'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { SelectCard } from '~/ui/SelectCard'
import { api } from '~/api/client'
import { useOnboarding } from '~/state/onboarding'
import type { CustomerSummary } from '@dhan/contracts'

/** A stable demo number per persona, in the order the API returns them. */
const DEMO_NUMBERS = ['98200 10001', '98200 10002', '98200 10003']

export default function MobileStep() {
  const { draft, set } = useOnboarding()
  const [customers, setCustomers] = useState<CustomerSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .customers()
      .then(setCustomers)
      .catch(() => setError('Could not reach the bank. Is the API running on :3001?'))
  }, [])

  const digits = draft.mobile.replace(/\D/g, '')
  const ready = digits.length === 10 && draft.customer !== null

  return (
    <Screen
      step={1}
      steps={5}
      footer={
        <Button
          label="Send me a code"
          disabled={!ready}
          onPress={() => router.push('/(onboarding)/otp')}
        />
      }
    >
      <Type role="display">What's your{'\n'}mobile number?</Type>
      <Type role="body" tone="soft" className="mt-sm">
        The one registered with your IDBI account. We'll text you a code.
      </Type>

      <View className="mt-xl">
        <Field
          label="Mobile number"
          prefix="+91"
          value={draft.mobile}
          onChangeText={(mobile) => set({ mobile })}
          keyboardType="number-pad"
          textContentType="telephoneNumber"
          placeholder="98200 10001"
          maxLength={11}
        />
      </View>

      {error ? (
        <Type role="label" tone="danger" className="mt-md">
          {error}
        </Type>
      ) : null}

      {customers.length > 0 && (
        <View className="mt-xxl">
          <Type role="caption" tone="soft">
            DEMO — PICK A CUSTOMER
          </Type>
          <Card className="mt-sm overflow-hidden">
            {customers.map((c, i) => (
              <SelectCard
                key={c.cif}
                title={c.name}
                description={c.pitch}
                selected={draft.customer?.cif === c.cif}
                divide={i > 0}
                onPress={() => set({ customer: c, mobile: DEMO_NUMBERS[i] ?? '98200 10000' })}
              />
            ))}
          </Card>
        </View>
      )}
    </Screen>
  )
}
