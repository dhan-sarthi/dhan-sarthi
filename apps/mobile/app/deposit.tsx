// Add to your goal — the one deposit nothing automated.
//
// Everything else that fills this goal is a rule: round-ups fire on a purchase, set & forget on a
// Monday, the payday saver on a salary credit. This screen is the customer deciding, once, for a
// reason the engine cannot know — a bonus landed, an expensive month did not happen, they want
// the number to move today. That is why the deposit's source is `manual` and why it reads
// differently in the Activity list: a rule firing and a person choosing are not the same event.
//
// The stepper is the control and the chips are shortcuts to it — the opposite of the save-hack
// editors, where the chips come first. A weekly amount is a standing commitment and four sensible
// answers cover almost everyone; a one-off deposit is whatever happens to be spare, and ₹3,200 is
// as likely as ₹2,500. So the dial is always there and the chips only save presses, letting go
// the moment the stepper moves off a preset.
//
// **The dial stops where the goal does.** Putting in more than is left would read on the goal as
// "105% saved", which is a goal quietly finished and overfilled at once. So the ceiling is what is
// left to save, the line under the figure names that amount, and at the ceiling it says the
// deposit finishes the goal. With less than the usual ₹100 minimum left, the dial is held on
// exactly what is left. With nothing left there is nothing to add: the screen says the goal is
// fully saved and offers the one thing that would make room, a bigger target — it re-reads on
// focus, so coming back from the goal editor brings the dial back.
//
// **The goal is read here, and the deposit does not depend on it.** A failed read of the goal
// loses the meter and the goal's name; it does not stop the money landing, and the screen says
// exactly that — with a way to ask again — rather than refusing a deposit it can make.
//
// There is no confirmation step. The money moves between the customer's own goal and their own
// balance, the button says the figure, and a modal asking "are you sure you want to save ₹1,000"
// is a product being nervous on someone else's behalf. The toast on the Save pane is the receipt.
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { NavRow, leave } from '~/ui/NavRow'
import { Type } from '~/ui/Text'
import { Note } from '~/ui/Note'
import { Chips } from '~/ui/Chips'
import { Button } from '~/ui/Button'
import { Meter } from '~/ui/Meter'
import { AmountStepper } from '~/ui/AmountStepper'
import { RetryLine } from '~/ui/SnapshotScroll'
import { useToast } from '~/ui/Toast'
import { useSnapshot } from '~/state/snapshot'
import { useSaveView } from '~/state/save'
import { rupees } from '~/lib/money'
import { api } from '~/api/client'

/** Shortcuts to the dial, not the control. Only the ones under the ceiling are offered. */
const PRESETS: readonly number[] = [500, 1_000, 2_000, 5_000]

const DEFAULT_AMOUNT = 1_000
const MIN_AMOUNT = 100

export default function Deposit() {
  // On focus as well as on mount: "Raise the target" pushes the goal editor, and coming back to a
  // screen still saying the goal is full would be this screen arguing with that one.
  const save = useSaveView()
  const { refresh } = useSnapshot()
  const toast = useToast()
  const [picked, setPicked] = useState(DEFAULT_AMOUNT)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [rereading, setRereading] = useState(false)

  const pot = save.data?.pot
  const rate = save.data?.interest.ratePct
  // A goal with no target has no ceiling to hold to; one with a target stops the dial at it.
  const remaining = pot !== undefined && pot.target > 0 ? Math.max(0, pot.target - pot.saved) : null
  const full = remaining === 0
  // Under the usual minimum only the last few rupees are left, and the dial is held on them.
  const min = remaining !== null && remaining > 0 && remaining < MIN_AMOUNT ? remaining : MIN_AMOUNT
  const max = remaining !== null && remaining > 0 ? remaining : undefined
  // Held to the ceiling as it is read rather than corrected by an effect after the fact: the
  // goal can arrive after the default was chosen, and a figure above the ceiling must never be
  // on screen, even for a frame.
  const amount = Math.max(min, max === undefined ? picked : Math.min(picked, max))
  const finishes = max !== undefined && amount === max

  const shortcuts = PRESETS.filter((n) => max === undefined || n <= max).map((n) => ({
    value: n,
    label: rupees(n),
  }))
  const preset = shortcuts.some((c) => c.value === amount) ? amount : null

  const after = (pot?.saved ?? 0) + (full ? 0 : amount)
  const fraction = pot && pot.target > 0 ? Math.min(1, after / pot.target) : 0
  // Floored, so 99.6% never reads as done and 0.5% never reads as 1%. The nudge keeps a float
  // such as 0.29 × 100 = 28.999… on the whole number it means.
  const pct = Math.floor(fraction * 100 + 1e-9)

  function reread() {
    setRereading(true)
    void save.reload().finally(() => setRereading(false))
  }

  async function commit() {
    if (full || amount <= 0 || saving) return
    setSaving(true)
    setFailed(false)
    try {
      await api.addSaveDeposit(amount)
      // The tabs underneath are showing the old balance; they catch up on their own clock.
      void refresh()
      toast.show(`${rupees(amount)} added to ${pot?.purpose ?? 'your goal'}`)
      leave('/(tabs)/grow')
    } catch {
      setFailed(true)
      setSaving(false)
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow onClose={() => leave('/(tabs)/grow')} />

      <ScrollView className="flex-1" contentContainerClassName="px-pad pb-xxl">
        <Type role="display">Add to your goal</Type>
        <Type role="body" tone="mid" className="mt-sm">
          {pot === undefined
            ? 'Money you put aside by hand, on top of your save hacks.'
            : full
              ? `All ${rupees(pot.target)} is in. Raise the target to keep adding.`
              : `Straight into ${pot.purpose}, on top of your save hacks.`}
        </Type>
        {save.state === 'error' && save.data === null ? (
          <View className="mt-md">
            <RetryLine
              compact
              message="Couldn't read your goal — the deposit still lands."
              busy={rereading}
              onRetry={reread}
            />
          </View>
        ) : null}

        {full ? null : (
          <>
            <View className="mt-xl">
              <AmountStepper
                value={amount}
                onChange={setPicked}
                min={min}
                {...(max === undefined ? {} : { max })}
                step={100}
                format={rupees}
                size="lg"
                label="Amount"
                {...(max === undefined
                  ? {}
                  : {
                      hint: finishes
                        ? 'That finishes the goal'
                        : `${rupees(max)} finishes the goal`,
                    })}
              />
            </View>

            {shortcuts.length > 0 ? (
              // Seen whole, not scrolled: four amounts fit one line at 375pt, and at 320pt the
              // last one breaks onto a second line instead of being cut at the screen's edge.
              <View className="mt-lg">
                <Chips wrap options={shortcuts} value={preset} onChange={setPicked} />
              </View>
            ) : null}
          </>
        )}

        {pot !== undefined && pot.target > 0 ? (
          <View className="mt-xxl">
            {/* The pot's share of the target, named as Grow's Save hero names it ("in your
                pot"): Plan's "N% there" counts savings outside the pot too. */}
            <Meter fraction={fraction} label={full ? 'Your pot' : 'Your pot after this'} />
            <View className="mt-sm flex-row items-center justify-between gap-md">
              <Type role="caption" tone="mid">
                {rupees(after)} of {rupees(pot.target)}
              </Type>
              <Type role="caption" tone="mid">
                {full
                  ? 'Fully saved'
                  : `${pct === 0 && after > 0 ? 'Under 1%' : `${pct}%`} after this`}
              </Type>
            </View>
          </View>
        ) : null}

        {full ? null : (
          <View className="mt-xxl">
            {rate === undefined ? (
              <Note title="Lands today.">
                Recorded against today and earning the account rate from today. Nothing is locked;
                the goal is a plan, not a product.
              </Note>
            ) : (
              <Note title={`Earns ${rate.toFixed(2)}% from today`}>
                It stays in your own savings account. Nothing is locked; the goal is a plan, not a
                product.
              </Note>
            )}
          </View>
        )}
      </ScrollView>

      <View className="gap-md px-pad pt-md pb-sm">
        {failed ? (
          <RetryLine
            compact
            message="Couldn't save. Try again."
            busy={saving}
            onRetry={() => void commit()}
          />
        ) : null}
        {full ? (
          // The one thing that makes room: this screen re-reads on the way back.
          <Button
            label="Raise the target"
            haptic="none"
            onPress={() => router.push('/edit-goal')}
          />
        ) : (
          <Button label={`Add ${rupees(amount)}`} onPress={() => void commit()} loading={saving} />
        )}
      </View>
    </SafeAreaView>
  )
}
