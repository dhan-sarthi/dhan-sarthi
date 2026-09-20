// Save settings — the gear on the pot card.
//
// Cleo's sheet has three rows: Edit goal, Manage accounts, Statements. Ours has three too and
// only two of them are theirs.
//
// **Manage accounts is gone, and it is the most considered omission in this flow.** It is the
// way into Cleo's whole bank-connection path — link an account, pick which one the hacks pull
// from, re-authorise when the aggregator's token dies. None of that exists here and none of it
// should: this is a bank's own app, the account is the customer's account with that bank, and
// there is nothing to connect or disconnect. A row that opened a screen saying so would be a
// row whose entire content is an apology for existing.
//
// **Save hacks takes its place**, which is not a swap for the sake of keeping three rows. The
// five hacks are the only thing on the Save pane a customer changes more than once, and Cleo
// reach them through the pane's own section chevron alone. Two ways in to the thing people
// actually come back to change is the right number; one way in to the thing that does not
// exist here is not.
//
// **Statements points at `/statement`, which already exists**, rather than at Cleo's CSV
// download. The screen that lists every line we read is worth more than a file the customer
// has to open something else to look at, and it is the same evidence.
//
// The row values are read live rather than hard-coded, because "3 of 5 on" is the one thing
// that makes this sheet worth opening — a settings list whose rows never say anything is a
// menu, and a menu does not need a screen of its own.
import { ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { NavRow } from '~/ui/NavRow'
import { Type } from '~/ui/Text'
import { Card } from '~/ui/Card'
import { Glyph } from '~/ui/Glyph'
import { SettingRow } from '~/ui/SettingRow'
import { rupees, shortDate } from '~/lib/money'
import { useSaveView } from '~/state/save'
import { color } from '@dhan/design'

export default function SaveSettings() {
  // /save is a payload of its own, not part of the snapshot. `useSaveView` holds the read —
  // including the refetch on focus this sheet needs, because both rows below lead to screens
  // that change what those rows say and coming back to "3 of 5 on" after turning a fourth one
  // on is the sheet arguing with the screen the customer just used.
  const { data: save } = useSaveView()

  const pot = save?.pot
  const live = save?.cards.filter((c) => c.enabled).length ?? 0

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow onBack={() => router.back()} />

      <ScrollView className="flex-1 px-pad" contentContainerClassName="pb-xxl">
        <Type role="title">Save settings</Type>
        <Type role="body" tone="soft" className="mt-xs">
          What you are saving for, how it gets there, and where every rupee came from.
        </Type>

        <Card className="mt-xl">
          <SettingRow
            glyph="target"
            title="Edit goal"
            detail={pot === undefined ? 'What you are saving for' : pot.purpose}
            // Withheld rather than blanked while the view is in flight. `exactOptionalPropertyTypes`
            // would reject an explicit `undefined` here anyway, and the conditional spread says the
            // truer thing: there is no figure yet, rather than the figure is nothing.
            {...(pot === undefined ? {} : { value: rupees(pot.target) })}
            onPress={() => router.push('/edit-goal')}
          />
          <SettingRow
            glyph="sparkle"
            title="Save hacks"
            detail="Five ways to fill it without thinking"
            {...(save === null ? {} : { value: `${live} of 5 on` })}
            onPress={() => router.push('/save-hacks')}
            divide
          />
          <SettingRow
            glyph="ledger"
            title="Statements"
            detail="Every line we read to work this out"
            onPress={() => router.push('/statement')}
            divide
          />
        </Card>

        {save && (
          <View className="mt-lg flex-row items-center justify-center gap-sm">
            <Glyph name="check" size={14} tint={color.inkFaint} />
            <Type role="caption" tone="faint">
              Worked out from your statement as of {shortDate(save.asOf)}
            </Type>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
