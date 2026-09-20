// Ask the gate about a product, before any money moves.
//
// This is the screen the whole product exists to be able to show. Every other app in the
// category answers "can I sell you this" — this one answers "should you buy this", and
// sometimes the answer is no about a product the bank itself distributes.
//
// The refusal is styled as seriously as the pass. It names the rule, quotes the advisor's
// own sentence, and where a rule knows a better product it names that too. It is also
// written to the audit trail either way: a verdict nobody recorded is one nobody can audit.
import { useState } from 'react'
import { Modal, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Tap } from '~/ui/Tap'
import { Reveal } from '~/ui/Reveal'
import { BEAT, Beat, VerdictFrame, VerdictSurface } from '~/ui/Verdict'
import { Type } from '~/ui/Text'
import { Button } from '~/ui/Button'
import { Field } from '~/ui/Field'
import { Chip } from '~/ui/Chip'
import { Card } from '~/ui/Card'
import { Row } from '~/ui/Row'
import { Glyph } from '~/ui/Glyph'
import { NavRow } from '~/ui/NavRow'
import { api } from '~/api/client'
import { rupees } from '~/lib/money'
import { color } from '@dhan/design'
import type { ShelfProduct, Verdict } from '@dhan/contracts'

export function GateSheet({
  product,
  onClose,
}: {
  product: ShelfProduct | null
  onClose: () => void
}) {
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [error, setError] = useState<string | null>(null)

  function close() {
    setAmount('')
    setVerdict(null)
    setError(null)
    onClose()
  }

  async function check() {
    if (!product) return
    const value = Number.parseInt(amount.replace(/\D/g, ''), 10)
    if (!Number.isFinite(value) || value <= 0) return
    setBusy(true)
    setError(null)
    try {
      const out = await api.evaluate(product.productId, value)
      setVerdict(out.verdict)
    } catch {
      setError('Could not reach the bank. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const blocked = verdict?.verdict === 'BLOCKED'

  return (
    <Modal
      visible={product !== null}
      animationType="slide"
      onRequestClose={close}
      transparent={false}
    >
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
        <NavRow onClose={close} />
        {product && (
          <ScrollView
            className="flex-1 px-pad"
            contentContainerClassName="pb-xxl"
            keyboardShouldPersistTaps="handled"
          >
            <Reveal>
              <Type role="display">{product.name}</Type>
            </Reveal>

            <View className="mt-md flex-row flex-wrap gap-sm">
              <Chip tone="ground">{product.category}</Chip>
              <Chip tone={product.riskometer === 'Low' ? 'budget' : 'streak'}>
                {product.riskometer} risk
              </Chip>
              {product.lockInYears > 0 && (
                <Chip tone="ground">{product.lockInYears}-year lock-in</Chip>
              )}
            </View>

            <Card className="mt-lg">
              <Row label="Who runs it" value={product.manufacturer} />
              {product.indicativeReturn !== undefined && (
                <Row label="Indicative return" value={`${product.indicativeReturn}%`} divide />
              )}
              <Row label="Minimum" value={rupees(product.minInvestment)} divide />
            </Card>

            {product.note && (
              <Type role="caption" tone="faint" className="mt-md">
                {product.note}
              </Type>
            )}

            {!verdict && (
              <>
                <View className="mt-xl">
                  <Field
                    label="How much a month?"
                    prefix="₹"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="number-pad"
                    placeholder={String(product.minInvestment)}
                    maxLength={9}
                  />
                </View>
                <View className="mt-lg">
                  <Button
                    label="Check if this suits me"
                    loading={busy}
                    onPress={() => void check()}
                  />
                </View>
                <Type role="caption" tone="faint" className="mt-md">
                  Nine rules run against your statement. Whatever they say is written to your
                  record.
                </Type>
              </>
            )}

            {error && (
              <Type role="label" tone="danger" className="mt-md">
                {error}
              </Type>
            )}

            {/* The sequence in `Verdict.tsx`, on the screen it was designed for. The customer
                asked a direct question about a product on the bank's own shelf and is waiting
                on the answer; letting it arrive in beats is the difference between a ruling
                and a form field turning red. */}
            {verdict && (
              <VerdictFrame>
                <VerdictSurface
                  tone={blocked ? 'blocked' : 'passed'}
                  className={
                    blocked
                      ? 'mt-xl rounded-lg border border-danger bg-danger-soft p-lg'
                      : 'mt-xl rounded-lg bg-success p-lg'
                  }
                >
                  <Beat at={BEAT.ruling}>
                    <View className="flex-row items-center gap-sm">
                      {!blocked && <Glyph name="check" size={18} tint={color.ink} />}
                      <Type role="caption" tone={blocked ? 'danger' : 'ink'}>
                        {blocked
                          ? `NOT SUITABLE · ${verdict.ruleId ?? ''}`
                          : 'ALL NINE RULES PASSED'}
                      </Type>
                    </View>

                    <Type role="title" className="mt-xs">
                      {blocked ? 'I am not going to sell you that' : 'This one fits'}
                    </Type>
                  </Beat>

                  <Beat at={BEAT.reasoning}>
                    <Type role="body" className="mt-sm opacity-85">
                      {verdict.spoken ?? verdict.recorded}
                    </Type>

                    {/* The one refusal in the book that names a subject and then terminates
                        nowhere. `suitability.ts:137-141` tells the customer their missed
                        repayment is worth more than any investment right now — a sentence about
                        their credit standing, delivered while saying no, with no surface behind
                        it to go and look at. This turns that into a door.

                        `onClose()` before the push because this is a `Modal`: a route pushed
                        behind a presented sheet arrives underneath it, and the customer is left
                        looking at the refusal they just tapped away from. */}
                    {verdict.ruleId === 'MISSED_REPAYMENT' && (
                      <Tap
                        accessibilityRole="button"
                        onPress={() => {
                          onClose()
                          router.push('/credit')
                        }}
                        dim
                        className="mt-md self-start"
                      >
                        <Type role="caption" tone="brand">
                          See what your IDBI file actually shows
                        </Type>
                      </Tap>
                    )}

                    {verdict.alternative && (
                      <View className="mt-lg rounded-md bg-surface p-md">
                        <Type role="caption" tone="soft">
                          TAKE THIS INSTEAD
                        </Type>
                        <Type role="heading" className="mt-xs">
                          {verdict.alternative.name}
                        </Type>
                        <Type role="body" tone="soft" className="mt-xs">
                          {rupees(verdict.alternative.monthly)} a month
                        </Type>
                      </View>
                    )}
                  </Beat>

                  <Beat at={BEAT.provenance}>
                    <Type role="caption" tone="mid" className="mt-lg opacity-75">
                      {blocked
                        ? `Passed ${verdict.passed.length} of 9 checks. Failed ${verdict.ruleId}.`
                        : 'Saved, with the evidence behind it.'}
                    </Type>

                    <View className="mt-lg">
                      <Button
                        label="Check a different amount"
                        variant="secondary"
                        onPress={() => {
                          setVerdict(null)
                          setAmount('')
                        }}
                      />
                    </View>
                  </Beat>
                </VerdictSurface>
              </VerdictFrame>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  )
}

/** A tappable shelf row. A `Tap` rather than a card so the whole row is the target, and so it
 *  takes the same 1.5% under a finger as every other pressable surface in the app. */
export function ProductRow({
  product,
  onPress,
  divide,
}: {
  product: ShelfProduct
  onPress: () => void
  divide: boolean
}) {
  return (
    <Tap
      accessibilityRole="button"
      haptic="selection"
      onPress={onPress}
      scale={0.985}
      className={
        divide
          ? 'flex-row items-center gap-md border-t border-hairline px-lg py-lg'
          : 'flex-row items-center gap-md px-lg py-lg'
      }
    >
      <View className="flex-1">
        <Type role="heading">{product.name}</Type>
        <Type role="caption" tone="soft" className="mt-xs">
          {product.riskometer} risk
          {product.indicativeReturn !== undefined ? ` · about ${product.indicativeReturn}%` : ''}
          {product.lockInYears > 0 ? ` · ${product.lockInYears}y lock-in` : ''}
        </Type>
      </View>
      <Glyph name="chevronRight" size={18} tint={color.inkFaint} />
    </Tap>
  )
}
