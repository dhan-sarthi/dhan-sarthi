// Budget settings — Cleo's four-row sheet.
//
// Cleo list Linked paycheck, Review bills, Spending limit and Essential spends. Ours are the
// same four, because the same four facts decide a budget: what comes in, what is already
// promised, what the customer chose to keep for themselves, and which of their spending they
// consider non-negotiable.
//
// Three of the four are **read-outs of what the engine already derived** rather than forms.
// The paycheck is the salary credit the categoriser found; the bills are the recurring series
// `recurring.ts` detected. Asking a customer to type either would be asking them to re-enter
// what their own statement already says, and would let the two disagree. Only the spending
// limit is genuinely theirs to set, which is why it is the only row that opens an editor.
//
// The four rows were a private `Row` in this file for as long as this was the only sheet built
// out of them. It is not any more — the save settings, the save-hacks list and the goal editor
// are the same object — so the row moved to `~/ui/SettingRow` and this screen became one of its
// callers rather than its owner. The one thing that changed in the move is that `detail` and
// `value` went optional, which is why the paycheck row now withholds its figure while the view
// is loading instead of handing over an empty string: an empty `<Type>` still claims a line box
// and the row would sit taller than its neighbours for no reason a customer can see.
import { ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { NavRow } from '~/ui/NavRow'
import { Type } from '~/ui/Text'
import { Card } from '~/ui/Card'
import { SettingRow } from '~/ui/SettingRow'
import { Glyph } from '~/ui/Glyph'
import { useSnapshot } from '~/state/snapshot'
import { rupees, shortDate } from '~/lib/money'
import { color } from '@dhan/design'

export default function BudgetSettings() {
  const { data: view } = useSnapshot()

  // `undefined` rather than null while the read is in flight, which is what the conditional
  // spread below is testing for. This screen writes nothing, so there is no refresh to wire.
  const snapshot = view?.snapshot
  const plan = view?.plan

  const limit = plan?.safeToSpend.limit ?? null
  const essentials = snapshot?.commitments.total ?? 0

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow onBack={() => router.back()} />

      <ScrollView className="flex-1 px-pad" contentContainerClassName="pb-xxl">
        <Type role="title">Budget settings</Type>
        <Type role="body" tone="soft" className="mt-xs">
          Three of these are read off your statements. Only the limit is yours to choose.
        </Type>

        <Card className="mt-xl">
          <SettingRow
            glyph="paycheck"
            title="Linked paycheck"
            detail={
              snapshot
                ? `${snapshot.income.stability === 'regular' ? 'Every month' : 'Irregular'} · next ${shortDate(snapshot.income.nextPayDate, snapshot.asOf)}`
                : 'Reading your statements'
            }
            // Withheld rather than blanked while the view is in flight. `exactOptionalPropertyTypes`
            // would reject an explicit `undefined` here anyway, and the conditional spread says the
            // truer thing: there is no figure yet, rather than the figure is nothing.
            {...(snapshot === undefined ? {} : { value: rupees(snapshot.income.monthly) })}
            onPress={() => router.push('/statement')}
          />
          <SettingRow
            glyph="receipt"
            title="Rent, bills and EMIs"
            detail="Every recurring payment we found"
            value={rupees(essentials)}
            onPress={() => router.push('/statement')}
            divide
          />
          <SettingRow
            glyph="gauge"
            title="Spending limit"
            detail={limit === null ? 'Not set — using whatever the month leaves' : 'You set this'}
            value={limit === null ? rupees(plan?.safeToSpend.envelope ?? 0) : rupees(limit)}
            onPress={() => router.push('/set-limit')}
            divide
          />
          <SettingRow
            glyph="basket"
            title="Essential spends"
            detail="Which categories you cannot cut"
            value={`${snapshot?.discretionary.byCategory.length ?? 0} categories`}
            onPress={() => router.push('/set-limit')}
            divide
          />
        </Card>

        {view && (
          <View className="mt-lg flex-row items-center justify-center gap-sm">
            <Glyph name="check" size={14} tint={color.inkFaint} />
            <Type role="caption" tone="faint">
              Read from {view.snapshot.quality.monthsOfHistory} months of statement
            </Type>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
