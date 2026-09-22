// Step 4 — the two facts the engine cannot infer.
//
// Everything else comes from the statement. Dependants and declared income cannot:
// the ledger shows money arriving, not who relies on it, and the protection rule
// turns on exactly that number. Two fields, because a third would be one we could
// have derived and did not.
//
// Income is asked by the month, the way people here say it — "₹85,000 a month" — and recorded
// as the year the profile keeps. It is grouped the Indian way as it is typed, so 1234567 reads
// back as 12,34,567 before anyone has to count zeros.
//
// Income first, then dependants, and the keyboard's own Next walks from one to the other. Each
// field says what it wants under it and, when the answer cannot be right, what is wrong
// instead, and Next stays off until both can be sent. The income check waits until the field
// is left: every figure under ₹1,000 is on its way to a real one while it is being typed.
//
// No placeholders. "85,000" and "2" in grey read as answers already given, over a Next that
// stayed off; the label and the line under each field already say what goes in.
import { useRef, useState } from 'react'
import { View, type TextInput } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '~/ui/Screen'
import { Type } from '~/ui/Text'
import { Field } from '~/ui/Field'
import { Button } from '~/ui/Button'
import { GlyphPlate } from '~/ui/Glyph'
import { leave } from '~/ui/NavRow'
import { useOnboarding } from '~/state/onboarding'
import { color, size } from '@dhan/design'

/** Below this a month's income is a typo, or a year typed in thousands. */
const MIN_MONTHLY = 1000
/** `ProfilePatchSchema`'s ceiling, enforced here rather than met as a 400 at the goal step. */
const MAX_DEPENDANTS = 20
/** Eight digits is ₹9,99,99,999 a month — room for anyone, and a cap on a runaway paste. */
const INCOME_DIGITS = 8

const INDIAN = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

/** "1234567" → "12,34,567": lakhs and crores, not thousands and millions. */
function groupIndian(digits: string): string {
  return digits === '' ? '' : INDIAN.format(Number(digits))
}

function digitsOf(text: string): string {
  return text.replace(/\D/g, '')
}

export default function AboutStep() {
  const { draft, set } = useOnboarding()
  const [income, setIncome] = useState(
    draft.annualIncome === null ? '' : String(Math.round(draft.annualIncome / 12)),
  )
  const [dependants, setDependants] = useState(
    draft.dependents === null ? '' : String(draft.dependents),
  )
  // A figure carried back from the draft has been left once already.
  const [incomeLeft, setIncomeLeft] = useState(draft.annualIncome !== null)
  const dependantsField = useRef<TextInput>(null)

  const monthly = income === '' ? null : Number(income)
  const dep = dependants === '' ? null : Number(dependants)

  const incomeError =
    incomeLeft && monthly !== null && monthly < MIN_MONTHLY ? 'Enter a monthly figure' : undefined
  const dependantsError = dep !== null && dep > MAX_DEPENDANTS ? 'Up to 20' : undefined
  const ready = monthly !== null && monthly >= MIN_MONTHLY && dep !== null && dep <= MAX_DEPENDANTS

  function next() {
    if (monthly === null || dep === null || !ready) return
    set({ dependents: dep, annualIncome: monthly * 12 })
    router.push('/(onboarding)/risk')
  }

  return (
    <Screen
      step={4}
      steps={6}
      onBack={() => leave('/(onboarding)/checklist')}
      title={"Two things I\ncan't work out"}
      subtitle={"Your statement tells me the rest. These two it\u00a0can't."}
      footer={<Button label="Next" haptic="none" disabled={!ready} onPress={next} />}
    >
      <View className="mt-xl gap-md">
        <Field
          label="Your income"
          prefix="₹"
          hint="A month, before tax"
          {...(incomeError === undefined ? {} : { error: incomeError })}
          value={groupIndian(income)}
          onChangeText={(text) => setIncome(digitsOf(text).slice(0, INCOME_DIGITS))}
          onBlur={() => setIncomeLeft(true)}
          keyboardType="number-pad"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => dependantsField.current?.focus()}
        />
        <Field
          ref={dependantsField}
          label="Dependants"
          hint="People who rely on your income"
          {...(dependantsError === undefined ? {} : { error: dependantsError })}
          value={dependants}
          onChangeText={(text) => setDependants(digitsOf(text).slice(0, 2))}
          keyboardType="number-pad"
          maxLength={2}
          returnKeyType="done"
          onSubmitEditing={next}
        />
      </View>

      <View className="mt-lg flex-row items-start gap-md">
        <GlyphPlate name="info" size={size.ring} plain tint={color.inkMid} />
        <Type role="body" tone="mid" className="flex-1">
          Dependants decide whether you need cover at all. Nothing here is shared outside the bank.
        </Type>
      </View>
    </Screen>
  )
}
