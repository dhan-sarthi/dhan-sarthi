// Pick your save hacks — the five ways money gets into the goal.
//
// Cleo's list, one for one, and the order is the server's rather than this file's: `cards`
// arrives from `/api/v1/save` already sequenced, and the copy under each title is written
// there too. That looks like an odd place to keep five sentences until you notice that the
// same five have to appear on the Save pane, in the config screen's toggle row and here, and
// that a hack's subtitle is not a label — it is the *configuration*, read back. "₹500 every
// week" and "Normal level" are facts about the customer's setup, and a client that composed
// them itself would be a second implementation of the engine's own rounding, drifting the
// first time either side changed. So this screen prints what it is given.
//
// The row is `SettingRow` and the On state is the chip alone, where Cleo also tints the glyph
// plate lime. That is a deliberate loss. The plate's fill is not a prop on the shared row, and
// the two honest ways to get it — widening `SettingRow` for one caller, or hand-rolling a
// sixth kind of settings row here — both cost more than the tint is worth when the chip
// already says the same thing in words, in the place the eye is looking for a row's state.
//
// It refetches on focus rather than once on mount. This screen's whole job is to be left and
// come back to: the customer taps Round-ups, turns it on, comes back, and a list still saying
// Off is the screen contradicting the one they just used. `useFocusEffect` is the cheap
// version of that — there is no push notification to be had, and a hack cannot change while
// this screen is in front of them.
//
// Nothing is written here, so there is nothing to refresh on the way out: the config screen
// did that when it saved. `Done` is `router.back()` and nothing else, which is the right
// shape for a list whose every row already committed on its own screen.
import { ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { NavRow } from '~/ui/NavRow'
import { Type } from '~/ui/Text'
import { Card } from '~/ui/Card'
import { Chip } from '~/ui/Chip'
import { Button } from '~/ui/Button'
import { SettingRow } from '~/ui/SettingRow'
import { rupees } from '~/lib/money'
import { useSaveView } from '~/state/save'
import type { GlyphName } from '~/ui/Glyph'
import type { SaveHackId } from '@dhan/contracts'

// The mark each hack carries.
//
// Keyed by the wire id and not by the list index, so the marks cannot slide out of step with
// the rows if the server ever reorders them. A `Record` over the literal union is also the
// only version of this the compiler will hold to five: adding a sixth hack to `SaveHackId`
// breaks this file until someone draws it a glyph.
//
// `save-hack.tsx` carries the same five marks inside its own copy table, and the two are not
// shared. They should be — the right home is a module under `src/`, beside the other things
// both screens read — but neither of these is a route the other can sensibly import from, and
// a route file exporting a lookup for a sibling route is a worse shape than two tables the
// compiler will at least hold to the same five keys.
const GLYPH: Record<SaveHackId, GlyphName> = {
  roundups: 'coins',
  set_forget: 'clock',
  smart_save: 'star',
  swear_jar: 'moneybag',
  payday_saver: 'paycheck',
}

export default function SaveHacks() {
  // /save is a payload of its own, not part of the snapshot. `useSaveView` is where the
  // reading of it lives — including the refetch on focus this screen's docblock argues for,
  // which the settings sheet and the Save pane need for the same reason.
  const { data: save, state } = useSaveView()

  const cards = save?.cards ?? []
  const live = cards.filter((c) => c.enabled).length

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow onBack={() => router.back()} />

      <ScrollView className="flex-1 px-pad" contentContainerClassName="pb-xxl">
        <Type role="display">Pick your{'\n'}save hacks</Type>
        <Type role="body" tone="soft" className="mt-sm">
          Five ways to fill your goal without thinking. Turn on as many as you like.
        </Type>

        <Card className="mt-xl">
          {cards.map((card, i) => (
            <SettingRow
              key={card.id}
              glyph={GLYPH[card.id]}
              title={card.title}
              detail={card.detail}
              // Only the hacks that are on get the chip. An `Off` badge on the other four
              // would make the card read as four warnings rather than four invitations, and
              // the absence of a chip already says it.
              {...(card.enabled ? { badge: <Chip tone="success">On</Chip> } : {})}
              onPress={() => router.push({ pathname: '/save-hack', params: { id: card.id } })}
              divide={i > 0}
            />
          ))}
          {/* Three sentences for three outcomes. An empty list under "reading your
              statements" while the read is dead is the screen waiting for something that is
              never coming, and an empty list from a read that *did* come back is a real
              answer about this customer's five hacks. */}
          {cards.length === 0 && (
            <View className="px-lg py-lg">
              {save === null && state === 'error' ? (
                <Type role="body" tone="danger">
                  Could not read your save hacks. Start the API on :3001 and reopen this screen.
                </Type>
              ) : save === null ? (
                <Type role="body" tone="soft">
                  Reading your statements.
                </Type>
              ) : (
                <Type role="body" tone="soft">
                  No save hacks are available on your account yet.
                </Type>
              )}
            </View>
          )}
        </Card>

        {save && (
          <Type role="caption" tone="faint" className="mt-md">
            {live === 0
              ? `Nothing is on yet. Over the last four weeks these would have put ${rupees(
                  cards.reduce((sum, c) => sum + c.lastFourWeeks, 0),
                )} into ${save.pot.purpose}.`
              : `${live} of 5 on · about ${rupees(save.pot.monthlyInflow)} a month into ${save.pot.purpose}.`}
          </Type>
        )}
      </ScrollView>

      <View className="px-pad pt-md pb-sm">
        <Button label="Done" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  )
}
