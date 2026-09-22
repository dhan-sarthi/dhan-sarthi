// Step 3 — consent.
//
// Cleo's equivalent screen sells the bank connection with three benefits and a
// "Secured by Plaid" chip. Ours is the same screen with the trust marks a bank
// actually has to show, and the three rows say what we read rather than what we
// unlock — the customer is already a customer, so there is nothing to unlock.
//
// Consent is recorded per scope because the engine genuinely recomputes without a
// block that was withdrawn; this is not a checkbox that only changes the copy.
//
// One button. "What exactly do you read?" used to be a second full-width pill that skipped the
// grant and went straight to the reading screen — a second primary that consented to nothing
// and looked like the way on. It is a question, so it is a link now, and it is answered in a
// sheet on this screen: the five blocks, by the names Where my data comes from uses, so the
// customer meets the same words again when they go to switch one off.
//
// Five grants, one request each, settled together. They used to race: the first refusal
// rejected the whole batch, the button stopped spinning and nothing on screen said a thing.
// Now every answer lands, and a refusal is a sentence above the button, which sends all five
// again — granting a block twice is the same grant, so there is nothing to untangle. It is not
// a second Try again beside the button: two controls doing one thing make the customer choose.
//
// Back goes to the number, not the code: the code step replaces itself once it has worked.
import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '~/ui/Screen'
import { Type } from '~/ui/Text'
import { Tap } from '~/ui/Tap'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { Chip } from '~/ui/Chip'
import { GlyphPlate, type GlyphName } from '~/ui/Glyph'
import { Sheet } from '~/ui/Sheet'
import { leave } from '~/ui/NavRow'
import { cn } from '~/ui/cn'
import { api } from '~/api/client'
import { color, size } from '@dhan/design'
import type { ConsentScope } from '@dhan/contracts'

/** The five blocks, named as Where my data comes from names them. */
const SCOPE_ROWS: ReadonlyArray<{
  scope: ConsentScope
  glyph: GlyphName
  title: string
  detail: string
}> = [
  {
    scope: 'PROFILE',
    glyph: 'person',
    title: 'Who you are',
    detail: 'Your age, dependants and risk answers',
  },
  {
    scope: 'ACCOUNTS',
    glyph: 'ledger',
    title: 'What you hold here',
    detail: 'Your IDBI savings and deposit balances',
  },
  {
    scope: 'TXN',
    glyph: 'receipt',
    title: 'What moves',
    detail: 'Two years of credits and debits',
  },
  {
    scope: 'LIABILITIES',
    glyph: 'coins',
    title: 'What you owe',
    detail: 'Cards, loans and their rates',
  },
  {
    scope: 'HOLDINGS',
    glyph: 'grow',
    title: 'What you own',
    detail: 'Funds, retirement savings and cover',
  },
]

const ROWS: ReadonlyArray<{ glyph: GlyphName; title: string; body: string }> = [
  {
    glyph: 'ledger',
    title: 'Two years of your statement',
    body: 'Every credit and debit, so the advice fits your money',
  },
  {
    glyph: 'shield',
    title: 'What you already hold',
    body: 'Deposits, funds, loans and cover, so nothing is suggested twice',
  },
  {
    glyph: 'person',
    title: 'Who depends on you',
    body: 'Your age and dependants, so any cover fits your family',
  },
]

export default function ConsentStep() {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)

  async function grant() {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const results = await Promise.allSettled(SCOPE_ROWS.map((r) => api.setConsent(r.scope, true)))
    setBusy(false)
    if (results.some((r) => r.status === 'rejected')) setFailed(true)
    else router.push('/(onboarding)/reading')
  }

  return (
    <Screen
      step={3}
      steps={6}
      onBack={() => leave('/(onboarding)/mobile')}
      title={'Let me read\nyour statement'}
      footer={
        <View className="gap-md">
          {failed && !busy ? (
            <Type
              role="caption"
              tone="danger"
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              Couldn't record your consent. Try again.
            </Type>
          ) : null}
          <Button
            label="Read my statement"
            loading={busy}
            haptic="none"
            onPress={() => void grant()}
          />
        </View>
      }
    >
      <Chip glyph="lock" className="mt-lg">
        Consent you can withdraw any time
      </Chip>

      <Card className="mt-xl overflow-hidden">
        {ROWS.map((r, i) => (
          <View
            key={r.title}
            className={cn('flex-row gap-lg px-lg py-lg', i > 0 && 'border-t border-hairline')}
          >
            <GlyphPlate name={r.glyph} />
            <View className="flex-1">
              <Type role="heading">{r.title}</Type>
              <Type role="body" tone="mid" className="mt-xxs">
                {r.body}
              </Type>
            </View>
          </View>
        ))}
      </Card>

      <Tap
        accessibilityRole="button"
        accessibilityLabel="What exactly do you read?"
        accessibilityHint="Lists the five blocks of your file I read"
        onPress={() => setOpen(true)}
        dim
        className="mt-sm min-h-target justify-center self-start"
      >
        <Type role="body" weight="semibold" className="underline">
          What exactly do you read?
        </Type>
      </Tap>

      <View className="mt-md flex-row items-start gap-md">
        <GlyphPlate name="info" size={size.ring} plain tint={color.inkMid} />
        <Type role="body" tone="mid" className="flex-1">
          Nothing leaves the bank. Switch any block off later on Where my data comes from; the
          advice recomputes without it.
        </Type>
      </View>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="What I read"
        footer={<Button label="Got it" haptic="none" onPress={() => setOpen(false)} />}
      >
        <Card className="overflow-hidden">
          {SCOPE_ROWS.map((r, i) => (
            <View
              key={r.scope}
              accessible
              accessibilityLabel={`${r.title}. ${r.detail}`}
              className={cn(
                'flex-row items-center gap-md px-lg py-md',
                i > 0 && 'border-t border-hairline',
              )}
            >
              <GlyphPlate name={r.glyph} size={size.plateMd} fill="bg-ground" />
              <View className="flex-1">
                <Type role="body" weight="semibold" plain>
                  {r.title}
                </Type>
                <Type role="body" tone="mid">
                  {r.detail}
                </Type>
              </View>
            </View>
          ))}
        </Card>
        <Type role="caption" tone="mid" className="mt-md">
          Switch any block off later on Where my data comes from; the advice recomputes without it.
        </Type>
      </Sheet>
    </Screen>
  )
}
