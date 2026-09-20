// Step 4 — the two facts the engine cannot infer.
//
// Everything else comes from the statement. Dependants and declared income cannot:
// the ledger shows money arriving, not who relies on it, and the protection rule
// turns on exactly that number. Two fields, because a third would be one we could
// have derived and did not.
import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '~/ui/Screen'
import { Type } from '~/ui/Text'
import { Field } from '~/ui/Field'
import { Button } from '~/ui/Button'
import { useOnboarding } from '~/state/onboarding'

export default function AboutStep() {
  const { draft, set } = useOnboarding()
  const [dependents, setDependents] = useState(draft.dependents?.toString() ?? '')
  const [income, setIncome] = useState(draft.annualIncome ? String(draft.annualIncome) : '')

  const dep = Number.parseInt(dependents, 10)
  const inc = Number.parseInt(income.replace(/\D/g, ''), 10)
  // 20 is `ProfilePatchSchema`'s ceiling. Enforcing it here rather than discovering it as a
  // 400 three screens later, at the one step that commits the whole draft.
  const ready = Number.isFinite(dep) && dep >= 0 && dep <= 20 && Number.isFinite(inc) && inc > 0

  return (
    <Screen
      step={4}
      steps={5}
      onBack={() => router.back()}
      footer={
        <Button
          label="Next"
          disabled={!ready}
          onPress={() => {
            set({ dependents: dep, annualIncome: inc })
            router.push('/(onboarding)/risk')
          }}
        />
      }
    >
      <Type role="display">Two things I{'\n'}can't work out</Type>
      <Type role="body" tone="soft" className="mt-sm">
        Your statement tells me the rest. These two it cannot.
      </Type>

      <View className="mt-xl gap-md">
        <Field
          label="People who depend on your income"
          value={dependents}
          onChangeText={setDependents}
          keyboardType="number-pad"
          placeholder="2"
          maxLength={2}
        />
        <Field
          label="Annual income, before tax"
          prefix="₹"
          value={income}
          onChangeText={setIncome}
          keyboardType="number-pad"
          placeholder="10,20,000"
          maxLength={12}
        />
      </View>

      {Number.isFinite(dep) && dep > 20 && (
        <Type role="caption" tone="danger" className="mt-md">
          Twenty is the most we can record.
        </Type>
      )}

      <Type role="caption" tone="faint" className="mt-lg">
        Dependants decide whether you need cover at all. Nothing here is shared outside the bank.
      </Type>
    </Screen>
  )
}
