// Add to your goal — the one deposit nothing automated.
//
// Everything else that fills this pot is a rule: round-ups fire on a purchase, set & forget
// fires on a Monday, the payday saver fires on a salary credit. This screen is the customer
// deciding, once, for a reason the engine has no way to know about — a bonus landed, an
// expensive month did not happen, they want the number to move today. That is why the source
// on the deposit is `manual` and why it reads differently in the Activity list: a rule firing
// and a person choosing are not the same event and the record should not flatten them.
//
// The stepper is the control and the chips are shortcuts to it, which is the opposite of the
// save-hack screens where the chips are the control and "Other" opens the stepper. The
// difference is what the number means. A weekly amount is a standing commitment and four
// sensible answers cover almost everyone; a one-off deposit is whatever happens to be spare
// this month, and ₹3,200 is as likely an answer as ₹2,500. So the dial is always there and
// the chips only save a few presses — which is also why `value` lets go the moment the
// stepper moves off a preset, exactly as `Chips` was built to.
//
// There is no confirmation step. The money is moving between the customer's own goal and
// their own balance on a simulated clock, the button says the figure, and a modal asking
// "are you sure you want to save ₹1,000" is a product being nervous on someone else's behalf.
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { NavRow } from '~/ui/NavRow'
import { Type } from '~/ui/Text'
import { Note } from '~/ui/Note'
import { Chips } from '~/ui/Chips'
import { Button } from '~/ui/Button'
import { Meter } from '~/ui/Meter'
import { AmountStepper } from '~/ui/AmountStepper'
import { useSnapshot } from '~/state/snapshot'
import { rupees } from '~/lib/money'
import { api } from '~/api/client'
import type { SaveView } from '@dhan/contracts'

/** The four figures a one-off deposit is usually one of. Typed as plain numbers so the chip
 *  row can be driven by the stepper's value rather than by the last chip that was tapped. */
const PRESETS: ReadonlyArray<{ value: number; label: string }> = [500, 1_000, 2_500, 5_000].map(
  (n) => ({ value: n, label: rupees(n) }),
)

const DEFAULT_AMOUNT = 1_000
const MIN_AMOUNT = 100

export default function Deposit() {
  // The pot is this screen's own payload, read here; the snapshot underneath it is the
  // provider's, and `refresh` is how the tabs are told the balance moved.
  const { refresh } = useSnapshot()
  const [save, setSave] = useState<SaveView | null>(null)
  const [amount, setAmount] = useState(DEFAULT_AMOUNT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .save()
      .then(setSave)
      .catch(() => setSave(null))
  }, [])

  const pot = save?.pot
  const preset = PRESETS.some((p) => p.value === amount) ? amount : null

  // What the pot looks like after this deposit, drawn under the one before it. The meter is
  // the only place on the screen where the size of what they are about to do is visible
  // against the size of the thing they are doing it for.
  const target = pot?.target ?? 0
  const after = (pot?.saved ?? 0) + amount
  const progress = target > 0 ? Math.min(1, after / target) : 0

  async function commit() {
    if (amount < MIN_AMOUNT) return
    setSaving(true)
    setError(null)
    try {
      const next = await api.addSaveDeposit(amount)
      setSave(next)
      // The tabs are still mounted underneath and the pot card is showing the old balance.
      await refresh()
      router.back()
    } catch {
      setError('Could not add that. Check the API and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow onClose={() => router.back()} />

      <ScrollView className="flex-1 px-pad" contentContainerClassName="pb-xxl">
        <Type role="display">Add to{'\n'}your goal</Type>
        <Type role="body" tone="soft" className="mt-sm">
          {pot === undefined
            ? 'Money you put aside by hand, on top of your save hacks.'
            : `Straight into ${pot.purpose}, on top of your save hacks.`}
        </Type>

        <View className="mt-xl">
          <AmountStepper
            value={amount}
            onChange={setAmount}
            min={MIN_AMOUNT}
            format={rupees}
            size="lg"
          />
        </View>

        <View className="mt-lg">
          <Chips options={PRESETS} value={preset} onChange={setAmount} />
        </View>

        {pot !== undefined && (
          <View className="mt-xxl">
            <Meter fraction={progress} />
            <View className="mt-sm flex-row items-center justify-between">
              <Type role="caption" tone="mid">
                {rupees(after)} of {rupees(pot.target)}
              </Type>
              <Type role="caption" tone="faint">
                {Math.round(progress * 100)}% after this
              </Type>
            </View>
          </View>
        )}

        <View className="mt-xxl">
          <Note title="Lands today. Take it back out whenever you want.">
            A deposit you make by hand is recorded against today and starts earning the account rate
            from the same day. Nothing here locks the money up — the goal is a plan for it, not a
            product it has been moved into.
          </Note>
        </View>

        {error !== null && (
          <Type role="label" tone="danger" className="mt-md">
            {error}
          </Type>
        )}
      </ScrollView>

      <View className="px-pad pt-md pb-sm">
        <Button
          label={`Add ${rupees(amount)}`}
          onPress={() => void commit()}
          loading={saving}
          disabled={amount < MIN_AMOUNT}
        />
      </View>
    </SafeAreaView>
  )
}
