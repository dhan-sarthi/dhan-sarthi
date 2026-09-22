// Save hacks — the five ways money gets into the goal on its own.
//
// Cleo's list, one for one: a mark, a name and an On/Off chip per row, and nothing under the
// name. The order is the server's (`cards` arrives already sequenced); the names are the app's
// own sentence case (`HACK_NAME`), the same words the editor's title and its toast use — the
// server's titles said "Smart Save" here and the editor "Smart save" one tap later. The sentence
// the server writes under each hack (the pitch while it is off, its configuration read back while
// it is on) ran to three or four lines at 375, and five of them pushed the last row and "Start
// with Round-ups" under the Done button. So it is each row's VoiceOver hint instead, and the
// editor a tap away says it in full. The line under the card still reads back what the hacks
// that are on have been moving.
//
// Every row carries its state as a chip, On in lime and Off in the quiet fill, which is Cleo's
// Save-hacks card exactly. An earlier version showed only the On chips, on the theory that four
// Off chips read as four warnings; beside Cleo's card they read as what they are, a switchboard,
// and a row with no chip left the customer to infer its state from an absence. The state is
// given in words too, for VoiceOver, which reads it as the row's value.
//
// The line under the card is guidance, not a guarantee. The engine accrues each hack on its own —
// a Monday transfer, a round-up per purchase, a slice of each salary — and nothing holds their sum
// to what the month can spare, so this screen does not claim anything does. It prints what the
// month leaves spare each week beside what the hacks that are on have been moving, and lets the
// customer see when the second outgrows the first.
//
// With every hack off the screen offers one to start with. The server's first card is its
// editorial pick of the one a customer is likeliest to keep, so "Start with Round-ups" is that
// order acted on, not a recommendation made up here.
//
// It re-reads on focus rather than once on mount. Its whole job is to be left and come back to:
// the customer opens Round-ups, turns it on, saves, and a list still saying Off would be the
// screen contradicting the one they just used.
import { ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { NavRow, leave } from '~/ui/NavRow'
import { Type } from '~/ui/Text'
import { Card } from '~/ui/Card'
import { Chip } from '~/ui/Chip'
import { Button } from '~/ui/Button'
import { SettingRow } from '~/ui/SettingRow'
import { RetryLine } from '~/ui/SnapshotScroll'
import { rupees } from '~/lib/money'
import { HACK_GLYPH, HACK_NAME } from '~/lib/savehack'
import { useSaveView } from '~/state/save'
import type { SaveHackCard } from '@dhan/contracts'

export default function SaveHacks() {
  const { data: save, state, reload } = useSaveView()

  const cards = save?.cards ?? []
  const best = cards[0]
  const allOff = cards.length > 0 && cards.every((c) => !c.enabled)

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow onBack={() => leave('/save-settings')} />

      <ScrollView className="flex-1" contentContainerClassName="px-pad pb-xxl">
        <Type role="display">Save hacks</Type>
        <Type role="body" tone="mid" className="mt-sm">
          Each one moves a little into your goal on its own. Turn on the ones that fit.
        </Type>

        {state === 'error' ? (
          <View className="mt-lg">
            <RetryLine
              compact
              message="Couldn't read your save hacks."
              onRetry={() => void reload()}
            />
          </View>
        ) : null}

        {cards.length > 0 ? (
          <Card className="mt-xl">
            {cards.map((card, i) => (
              <SettingRow
                key={card.id}
                glyph={HACK_GLYPH[card.id]}
                title={HACK_NAME[card.id]}
                accessibilityHint={card.detail}
                badge={
                  <Chip size="md" tone={card.enabled ? 'success' : 'ground'}>
                    {card.enabled ? 'On' : 'Off'}
                  </Chip>
                }
                state={card.enabled ? 'On' : 'Off'}
                onPress={() => router.push({ pathname: '/save-hack', params: { id: card.id } })}
                divide={i > 0}
              />
            ))}
          </Card>
        ) : save === null ? (
          // The read has not landed. Failed is said above, by the retry line; this is only ever
          // the first read in flight, so it may say it is reading.
          state === 'error' ? null : (
            <Type role="body" tone="mid" className="mt-xl">
              Reading your save hacks…
            </Type>
          )
        ) : (
          <Type role="body" tone="mid" className="mt-xl">
            Nothing to switch on yet.
          </Type>
        )}

        {save && cards.length > 0 ? (
          <Type role="caption" tone="mid" className="mt-md">
            {spareLine(cards, save.recommendedWeekly)}
          </Type>
        ) : null}

        {allOff && best ? (
          <Button
            label={`Start with ${HACK_NAME[best.id]}`}
            haptic="none"
            className="mt-lg"
            onPress={() => router.push({ pathname: '/save-hack', params: { id: best.id } })}
          />
        ) : null}
      </ScrollView>

      <View className="px-pad pt-md pb-sm">
        <Button
          variant="secondary"
          label="Done"
          haptic="none"
          onPress={() => leave('/save-settings')}
        />
      </View>
    </SafeAreaView>
  )
}

/**
 * What the month leaves spare each week, beside what the hacks that are on have been moving.
 *
 * `lastFourWeeks` over four is the weekly pace each live hack actually ran at on this customer's
 * own statement, so the comparison is two measured figures rather than a promise. A spare figure
 * of zero is its own sentence: "keep them under ₹0" is not advice anyone can take.
 */
function spareLine(cards: readonly SaveHackCard[], spare: number): string {
  const on = cards.filter((c) => c.enabled)
  const weekly = Math.round(on.reduce((sum, c) => sum + c.lastFourWeeks, 0) / 4)
  const who = on.length === 1 && on[0] ? `${HACK_NAME[on[0].id]} moves` : `${on.length} hacks move`

  if (spare <= 0) {
    return on.length === 0
      ? 'Nothing is spare after bills and your usual spending right now, so a hack would dip into money you need.'
      : `${who} about ${rupees(weekly)} a week, and nothing is spare after bills and your usual spending right now.`
  }
  if (on.length === 0) {
    return `About ${rupees(spare)} a week is usually left after bills and your usual spending. Keep your hacks under that together.`
  }
  return weekly > spare
    ? `${who} about ${rupees(weekly)} a week — more than the ${rupees(spare)} a week your month leaves spare.`
    : `${who} about ${rupees(weekly)} a week, inside the ${rupees(spare)} a week your month leaves spare.`
}
