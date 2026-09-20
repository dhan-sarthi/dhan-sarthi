// Tweak your goal — the one number in the Save flow that is the customer's to move.
//
// Cleo put three editable fields on this screen: the goal's name, its target, and the date
// they want to hit it by. Ours has the same three rows and only the middle one is a control,
// and the reason is not that the other two were hard.
//
// **The name is the roadmap's.** A goal here is not a label on a jar — it is the stage the
// ladder is sequenced around, the thing `roadmapVersion` is cut against and the reason the
// engine puts the emergency fund before the SIP. Letting someone rename "Emergency fund" to
// "Goa" on a settings sheet would leave the plan reasoning about one thing and the app
// printing another. So the row shows what the roadmap calls it and opens the roadmap, where
// changing it means changing the plan and the plan says what that costs.
//
// **The date is derived, not chosen.** Cleo's date picker sets an intention; ours would have
// to set a *funding rate*, because a target date the money cannot reach is the one number in
// a planning app that must never be allowed to lie. `targetDate` falls out of the target and
// what the roadmap can actually put aside each month, and it moves on this screen the moment
// the target does — which is the honest version of a date picker, and the more useful one:
// the customer sees what raising the target costs them in months before they commit to it.
//
// **The target is theirs.** `PATCH /api/v1/session/goal` takes exactly this and nothing else,
// and the next `/view` cuts a new roadmap version with "Target changed by the customer" on
// it, so the change is on the record rather than applied quietly.
//
// The floor under the stepper is what is already in the pot. A target below the balance is
// not a smaller goal, it is a completed one, and a settings screen is the wrong place to
// discover that by accident.
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { NavRow } from '~/ui/NavRow'
import { Type } from '~/ui/Text'
import { Card } from '~/ui/Card'
import { Button } from '~/ui/Button'
import { Note } from '~/ui/Note'
import { SettingRow } from '~/ui/SettingRow'
import { AmountStepper } from '~/ui/AmountStepper'
import { useSnapshot } from '~/state/snapshot'
import { rupees, fullDate } from '~/lib/money'
import { api } from '~/api/client'
import type { SaveView } from '@dhan/contracts'

/** Nothing below this is a goal worth cutting a roadmap version for. */
const MIN_TARGET = 1_000

export default function EditGoal() {
  // The pot is this screen's own payload, read here; the snapshot underneath it is the
  // provider's, and `refresh` is how the tabs are told the target moved.
  const { refresh } = useSnapshot()
  const [save, setSave] = useState<SaveView | null>(null)
  // Null until the customer moves it, so the screen can tell "they chose this figure" from
  // "this is what the roadmap says" without keeping a second copy of the original to compare
  // against.
  const [target, setTarget] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .save()
      .then(setSave)
      .catch(() => setSave(null))
  }, [])

  const pot = save?.pot
  const floor = Math.max(MIN_TARGET, Math.ceil(pot?.saved ?? 0))
  const current = Math.max(floor, target ?? pot?.target ?? MIN_TARGET)
  const changed = pot !== undefined && current !== pot.target

  const remaining = Math.max(0, current - (pot?.saved ?? 0))
  const inflow = pot?.monthlyInflow ?? 0
  const months = inflow > 0 ? Math.ceil(remaining / inflow) : null

  async function commit() {
    if (!changed) return
    setSaving(true)
    setError(null)
    try {
      await api.setGoal(current)
      // The tabs are still mounted underneath and the roadmap, the pot card and every figure
      // derived from the target are showing the old one.
      await refresh()
      router.back()
    } catch {
      setError('Could not change the target. Check the API and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow onBack={() => router.back()} />

      <ScrollView className="flex-1 px-pad" contentContainerClassName="pb-xxl">
        <Type role="display">Tweak your goal</Type>
        <Type role="body" tone="soft" className="mt-sm">
          The target is yours to move. The name and the date come out of your plan.
        </Type>

        <Card className="mt-xl">
          <SettingRow
            glyph="target"
            title="Goal"
            detail="Named by your roadmap"
            {...(pot === undefined ? {} : { value: pot.purpose })}
            onPress={() => router.push('/(tabs)/plan')}
          />
          <SettingRow
            glyph="calendar"
            title="On track for"
            detail={
              pot === undefined ? 'Worked out from what goes in' : `${pot.daysLeft} days away`
            }
            {...(pot === undefined ? {} : { value: fullDate(pot.targetDate) })}
            onPress={() => router.push('/(tabs)/plan')}
            divide
          />
        </Card>

        <Type role="label" tone="mid" className="mt-xl">
          I want to reach
        </Type>
        <View className="mt-sm">
          <AmountStepper
            value={current}
            onChange={setTarget}
            min={floor}
            format={rupees}
            size="lg"
          />
        </View>

        <Type role="caption" tone="faint" className="mt-md text-center">
          {months === null
            ? `${rupees(remaining)} to go, and nothing is going in yet. Turn on a save hack to start filling it.`
            : `${rupees(remaining)} still to go · about ${months} ${
                months === 1 ? 'month' : 'months'
              } at the ${rupees(inflow)} a month going in now.`}
        </Type>

        {floor > MIN_TARGET && (
          <Type role="caption" tone="faint" className="mt-sm text-center">
            {rupees(floor)} is already in the pot, so the target cannot go below it.
          </Type>
        )}

        <View className="mt-xxl">
          <Note title="This changes your plan, not just this screen">
            Moving the target cuts a new version of your roadmap, recorded as changed by you. Every
            stage after this goal shifts with it, and the Plan tab will show what moved.
          </Note>
        </View>

        {error !== null && (
          <Type role="label" tone="danger" className="mt-md">
            {error}
          </Type>
        )}
      </ScrollView>

      <View className="px-pad pt-md pb-sm">
        <Button label="Save" onPress={() => void commit()} loading={saving} disabled={!changed} />
      </View>
    </SafeAreaView>
  )
}
