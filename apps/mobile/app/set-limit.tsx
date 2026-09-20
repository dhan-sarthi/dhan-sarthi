// Set your limit — Cleo's budget-limit sheet, on our engine.
//
// Cleo ask for one number and then, behind a toggle, a limit per category. Both are real
// here: the headline writes `session.spendLimit`, and each category row writes a
// `CategoryCap`. `buildDailyPlan` reads both, so safe-to-spend on the next view is measured
// against what was set here and a breached category is named on Today.
//
// The one place we differ from Cleo, and it is the important one: **the limit is held to what
// the month can actually afford**. Cleo will let a customer set any number they like. Ours
// stores the figure they typed and applies the lower of it and their real headroom, because
// every number downstream is computed off it — an app that agreed a customer had ₹80,000 to
// spend when they have ₹22,000 would be the only thing in the room lying to them. The screen
// says so rather than silently clamping.
import { useMemo, useState } from 'react'
import { ScrollView, Switch, View } from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { NavRow } from '~/ui/NavRow'
import { Type } from '~/ui/Text'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { AmountStepper } from '~/ui/AmountStepper'
import { MerchantMark } from '~/ui/MerchantMark'
import { useSnapshot } from '~/state/snapshot'
import { api } from '~/api/client'
import { rupees } from '~/lib/money'
import { color } from '@dhan/design'

export default function SetLimit() {
  const { data: view, refresh } = useSnapshot()
  const [limit, setLimit] = useState<number | null>(null)
  const [byCategory, setByCategory] = useState(false)
  const [caps, setCaps] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  const plan = view?.plan
  const snapshot = view?.snapshot

  // The month's real headroom, and where the stepper starts. A customer who has never set a
  // limit is shown what they are already working with rather than a zero they have to climb
  // out of — the first press should adjust their budget, not begin it.
  const affordable = plan?.safeToSpend.affordable ?? 0
  const current = limit ?? plan?.safeToSpend.limit ?? affordable

  // Monthly averages, so a cap and the spending it limits are the same kind of number.
  const months = Math.max(1, snapshot?.quality.monthsOfHistory ?? 1)
  const categories = useMemo(
    () =>
      (snapshot?.discretionary.byCategory ?? [])
        .map(([name, total]) => ({ name, monthly: Math.round(total / months) }))
        .filter((c) => c.monthly > 0)
        .slice(0, 8),
    [snapshot, months],
  )

  const capOf = (name: string, fallback: number): number => caps[name] ?? fallback

  async function commit() {
    setSaving(true)
    try {
      await api.setSpendLimit(current)
      // Only the categories the customer actually moved. Writing every row would turn a
      // screen they opened to change one number into eight limits they never chose.
      await Promise.all(
        Object.entries(caps).map(([category, monthlyLimit]) =>
          api.setCategoryCap(category, byCategory ? monthlyLimit : null),
        ),
      )
      // The tabs are still mounted underneath and are showing the old envelope.
      await refresh()
      router.back()
    } finally {
      setSaving(false)
    }
  }

  const over = current > affordable

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow onClose={() => router.back()} />

      <ScrollView className="flex-1 px-pad" contentContainerClassName="pb-xxl">
        <Type role="title">Set your limit</Type>
        <Type role="body" tone="soft" className="mt-xs">
          {plan ? `${plan.date.slice(0, 7)} · yours to spend this month` : ''}
        </Type>

        <View className="mt-xl">
          <AmountStepper value={current} onChange={setLimit} min={0} format={rupees} size="lg" />
        </View>

        <Type role="caption" tone={over ? 'danger' : 'faint'} className="mt-md text-center">
          {over
            ? `Your month only leaves ${rupees(affordable)} after rent, EMIs and investing. We will plan against that.`
            : `Rent, EMIs and investing are already taken out. ${rupees(affordable)} is what is left.`}
        </Type>

        <View className="mt-xxl flex-row items-center justify-between">
          <View className="flex-1 pr-lg">
            <Type role="heading">Category limits</Type>
            <Type role="body" tone="soft" className="mt-xs">
              Based on what you have averaged over {months} months.
            </Type>
          </View>
          <Switch
            value={byCategory}
            onValueChange={setByCategory}
            trackColor={{ false: color.hairline, true: color.brand }}
            thumbColor={color.surface}
          />
        </View>

        {byCategory && (
          <Card className="mt-lg">
            {categories.map((c, i) => (
              <View
                key={c.name}
                className={i > 0 ? 'border-t border-hairline px-lg py-md' : 'px-lg py-md'}
              >
                <View className="flex-row items-center gap-md">
                  <MerchantMark merchant={null} category={c.name} size={32} />
                  <Type role="body" tone="mid" className="flex-1">
                    {c.name}
                  </Type>
                </View>
                <View className="mt-sm">
                  <AmountStepper
                    value={capOf(c.name, c.monthly)}
                    onChange={(next) => setCaps((prev) => ({ ...prev, [c.name]: next }))}
                    min={0}
                    format={rupees}
                    size="sm"
                  />
                </View>
              </View>
            ))}
            {categories.length === 0 && (
              <View className="px-lg py-lg">
                <Type role="body" tone="soft">
                  Not enough statement yet to average a category.
                </Type>
              </View>
            )}
          </Card>
        )}
      </ScrollView>

      <View className="px-pad pt-md pb-sm">
        <Button label="Alright, I can do this" onPress={commit} loading={saving} />
      </View>
    </SafeAreaView>
  )
}
