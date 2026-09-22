// Save settings — the gear on the goal card.
//
// Cleo's "Add cash" sheet is the shape: a display title, then short groups under plain headings —
// Automatic, Manual — each a white card of chevron rows. Money reaches this goal the same two ways,
// so the sheet says it in the same words: the goal itself, the hacks that move money on their own,
// the deposit a person makes by hand, and the statement all of it was read from. Four headings over
// four one-row cards reads as more scaffolding than one card of four rows, and it is still the
// right trade: each heading is the answer to "how does money get in", which one card of four rows
// never says out loud.
//
// **Manage accounts is gone, and it is the most considered omission here.** It is the way into
// Cleo's whole bank-connection path — link an account, pick the one the hacks pull from,
// re-authorise when the aggregator's token dies. None of that exists in a bank's own app: the
// account is the customer's account with this bank, and there is nothing to connect. A row that
// opened a screen saying so would be a row whose whole content is an apology for existing.
//
// **Statement points at `/statement`**, not at Cleo's CSV download: the screen that lists every
// line we read is the same evidence, without a file to open somewhere else.
//
// The row values are read live — "2 of 5 on", the goal's size — because a settings list whose rows
// never say anything is a menu, and a menu does not need a screen of its own. While the read is in
// flight they are withheld rather than blanked; if it fails, the sheet says so above the rows and
// every row still opens, because none of them needs this read to work.
//
// The stamp at the foot is Cleo's "Last refreshed" chip, and a button like Cleo's and like the
// same chip on budget settings: it carries the refresh mark, so pressing it reads the pot again.
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { NavRow, leave } from '~/ui/NavRow'
import { Type } from '~/ui/Text'
import { Card } from '~/ui/Card'
import { Chip } from '~/ui/Chip'
import { Tap } from '~/ui/Tap'
import { Section } from '~/ui/Section'
import { SettingRow } from '~/ui/SettingRow'
import { RetryLine } from '~/ui/SnapshotScroll'
import { rupeesShort, shortDate } from '~/lib/money'
import { useSaveView } from '~/state/save'

export default function SaveSettings() {
  // `useSaveView` re-reads on focus: every row below leads to a screen that changes what the rows
  // say, and coming back to "2 of 5 on" after turning a third one on is the sheet arguing with the
  // screen the customer just used.
  const { data: save, state, reload } = useSaveView()
  const [refreshing, setRefreshing] = useState(false)

  const again = () => {
    setRefreshing(true)
    void reload().finally(() => setRefreshing(false))
  }

  const pot = save?.pot
  const cards = save?.cards
  const live = cards?.filter((c) => c.enabled).length ?? 0

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow onBack={() => leave('/(tabs)/grow')} />

      <ScrollView className="flex-1" contentContainerClassName="px-pad pb-xxl">
        <Type role="display">Save settings</Type>

        {state === 'error' ? (
          <View className="mt-lg">
            <RetryLine
              compact
              message="Couldn't read your savings."
              onRetry={() => void reload()}
            />
          </View>
        ) : null}

        <Section title="Goal" />
        <Card>
          <SettingRow
            glyph="target"
            title="Edit goal"
            detail={pot === undefined ? "What you're saving for" : pot.purpose}
            // Withheld rather than blanked while the read is in flight: there is no figure yet,
            // which is a different statement from the figure being nothing.
            {...(pot === undefined ? {} : { value: rupeesShort(pot.target) })}
            onPress={() => router.push('/edit-goal')}
          />
        </Card>

        <Section title="Automatic" />
        <Card>
          <SettingRow
            glyph="sparkle"
            title="Save hacks"
            detail="Small amounts, moved in on their own"
            {...(cards === undefined ? {} : { value: `${live} of ${cards.length} on` })}
            onPress={() => router.push('/save-hacks')}
          />
        </Card>

        <Section title="Manual" />
        <Card>
          <SettingRow
            glyph="plus"
            title="Add money"
            detail="Straight into the goal"
            onPress={() => router.push('/deposit')}
          />
        </Card>

        <Section title="Records" />
        <Card>
          <SettingRow
            glyph="ledger"
            title="Statement"
            detail="Every line we read"
            onPress={() => router.push('/statement')}
          />
        </Card>

        {save ? (
          // Cleo's "Last refreshed" chip, saying the thing that is true here instead: these
          // figures are worked out from a statement, and the statement has a date. The small size
          // is Cleo's (a 21pt pill); the larger one broke the date onto a second line at 375. The
          // press target around it is the full 44pt.
          <Tap
            accessibilityRole="button"
            accessibilityLabel={`Refresh. Worked out from your statement, ${shortDate(save.asOf)}`}
            accessibilityState={{ busy: refreshing, disabled: refreshing }}
            disabled={refreshing}
            haptic="none"
            onPress={again}
            className="mt-lg min-h-target justify-center self-start"
          >
            <Chip tone="ground" size="sm" glyph="refresh">
              {refreshing
                ? 'Refreshing…'
                : `Worked out from your statement · ${shortDate(save.asOf)}`}
            </Chip>
          </Tap>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}
