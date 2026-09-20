// Step 3 — consent.
//
// Cleo's equivalent screen sells the bank connection with three benefits and a
// "Secured by Plaid" chip. Ours is the same screen with the trust marks a bank
// actually has to show, and the three rows say what we read rather than what we
// unlock — the customer is already a customer, so there is nothing to unlock.
//
// Consent is recorded per scope because the engine genuinely recomputes without a
// block that was withdrawn; this is not a checkbox that only changes the copy.
import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '~/ui/Screen'
import { Type } from '~/ui/Text'
import { Button, ButtonStack } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { Chip } from '~/ui/Chip'
import { GlyphPlate } from '~/ui/Glyph'
import { api } from '~/api/client'

const SCOPES = ['PROFILE', 'ACCOUNTS', 'TXN', 'LIABILITIES', 'HOLDINGS'] as const

const ROWS = [
  {
    glyph: 'ledger' as const,
    title: 'Two years of your statement',
    body: 'Every credit and debit, so the advice fits your money',
  },
  {
    glyph: 'shield' as const,
    title: 'What you already hold',
    body: 'Deposits, funds, loans and cover, so nothing is suggested twice',
  },
  {
    glyph: 'compass' as const,
    title: 'One thing worth doing today',
    body: 'Checked against nine rules before you ever see it',
  },
]

export default function ConsentStep() {
  const [busy, setBusy] = useState(false)

  async function grant() {
    setBusy(true)
    try {
      await Promise.all(SCOPES.map((s) => api.setConsent(s, true)))
      router.push('/(onboarding)/reading')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      step={3}
      steps={5}
      onBack={() => router.back()}
      footer={
        <ButtonStack>
          <Button label="Read my statement" loading={busy} onPress={() => void grant()} />
          <Button
            label="What exactly do you read?"
            variant="secondary"
            onPress={() => router.push('/(onboarding)/reading')}
          />
        </ButtonStack>
      }
    >
      <Type role="display">Let me read{'\n'}your statement</Type>

      <Chip className="mt-lg">DPDP consent · revocable any time</Chip>

      <Card className="mt-xl overflow-hidden">
        {ROWS.map((r, i) => (
          <View
            key={r.title}
            className={
              i > 0
                ? 'flex-row gap-lg border-t border-hairline px-lg py-lg'
                : 'flex-row gap-lg px-lg py-lg'
            }
          >
            <GlyphPlate name={r.glyph} />
            <View className="flex-1">
              <Type role="heading">{r.title}</Type>
              <Type role="body" tone="soft" className="mt-[2px]">
                {r.body}
              </Type>
            </View>
          </View>
        ))}
      </Card>

      <Type role="caption" tone="faint" className="mt-lg">
        Nothing leaves the bank. You can withdraw any block later and the advice is recomputed
        without it.
      </Type>
    </Screen>
  )
}
