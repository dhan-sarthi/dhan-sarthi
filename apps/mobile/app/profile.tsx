// Profile — what the person button in every tab header opens.
//
// Cleo's profile sheet is the shape: a display title, who you are in a few plain lines, one dark
// card that opens the conversation, the settings as grouped rows, the links after them, and "Log
// out" as underlined text at the foot — the quiet way out, not a button competing with the rows
// for the thumb.
//
// Everything on it already existed and had nowhere to live. The record, the connections and the
// statement were reachable only from inside other screens, and the budget and save settings only
// from the cards they configure. This is the one place that lists them.
//
// A row opens its page over this sheet, so closing the page comes back here, as Cleo's profile
// rows do. iOS is the exception: react-native-screens puts every card-presented screen on the
// root navigation controller, under whatever modal is showing, so a push from this sheet would
// open the record behind it where nobody could see it. There the page replaces the sheet, and
// closing it goes back to the tab the sheet was opened from.
//
// The identity lines and the clock row wait for the session: the CIF prints a dash until it is
// read, and a row that promises "Today is …" is not drawn before the date is known, or at all
// when the clock is real. A read that fails says so beside a retry rather than leaving the dash
// standing for good. Logging out drops the token, pops the stack back to its root and puts the
// welcome carousel in that root's place. Replacing only this sheet would leave the tabs mounted
// underneath: a back swipe from the carousel would reach them with no token, and signing in
// again would stack a second tab navigator on the first. The onboarding draft resets itself on
// the token change, so this screen does not reach into it.
import { useState } from 'react'
import { Platform, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { router, type Href } from 'expo-router'
import { UDAY_PORTRAIT } from '@dhan/assets'
import { NavRow, leave } from '~/ui/NavRow'
import { Type } from '~/ui/Text'
import { Chip } from '~/ui/Chip'
import { PromoCard } from '~/ui/PromoCard'
import { MenuGroup, MenuLink, MenuRow } from '~/ui/MenuRow'
import { RetryLine } from '~/ui/SnapshotScroll'
import { api, setToken } from '~/api/client'
import { useSnapshot } from '~/state/snapshot'
import { usePayload } from '~/state/payload'
import { fullDate } from '~/lib/money'
import { IDBI_CONTACT } from '~/lib/idbi'

/** The bank's own site. Its privacy page is not linked: that address answers with a 404. */
const IDBI_WEBSITE = 'https://www.idbi.bank.in/'

function open(href: Href) {
  if (Platform.OS === 'ios') router.replace(href)
  else router.push(href)
}

async function logout() {
  await setToken(null)
  if (router.canDismiss()) router.dismissAll()
  router.replace('/(onboarding)/welcome')
}

export default function Profile() {
  const { data: view } = useSnapshot()
  const session = usePayload(api.session, view)
  const [retrying, setRetrying] = useState(false)
  const s = session.data
  const name = view?.snapshot.customer.name ?? null
  const asOf = s?.asOf ?? view?.snapshot.asOf ?? null

  function retry() {
    setRetrying(true)
    void session.reload().finally(() => setRetrying(false))
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow onClose={() => leave('/(tabs)/spend')} />

      <ScrollView className="flex-1" contentContainerClassName="px-pad pb-xxl gap-md">
        <Type role="display">Profile</Type>

        <View className="mt-sm">
          {name === null ? null : (
            // Cleo's name-and-badge line. It wraps rather than squeezing: at 320 a long name
            // keeps its one line and the chip drops under it.
            <View className="mb-sm flex-row flex-wrap items-center justify-between gap-sm">
              <Type role="heading">{name}</Type>
              <Chip tone="ground" label="IDBI customer" />
            </View>
          )}
          {/* A dash while the read is out; once it has failed, the line that says so and the
              way to ask again take its place, rather than a dash that never resolves. */}
          {s === null && (session.state === 'error' || retrying) ? (
            <View className="my-xs">
              <RetryLine
                compact
                message="Couldn't read your customer ID."
                busy={retrying}
                onRetry={retry}
              />
            </View>
          ) : (
            <Type role="body" tone="mid">
              CIF {s === null ? '—' : s.cif}
            </Type>
          )}
          {asOf === null ? null : (
            <Type role="body" tone="mid">
              As of {fullDate(asOf)}
            </Type>
          )}
        </View>

        <PromoCard
          className="mt-lg"
          title="Ask Uday anything"
          body="Every answer comes with the figures it was worked out from."
          image={UDAY_PORTRAIT}
          action={{ label: "Let's talk", onPress: () => router.dismissTo('/(tabs)/uday') }}
        />

        <MenuGroup title="Manage your settings">
          <MenuRow glyph="ledger" label="Your record" onPress={() => open('/record')} />
          <MenuRow
            glyph="compass"
            label="Where my data comes from"
            onPress={() => open('/connections')}
          />
          <MenuRow glyph="receipt" label="Statement" onPress={() => open('/statement')} />
          <MenuRow
            glyph="sliders"
            label="Budget settings"
            onPress={() => open('/budget-settings')}
          />
          <MenuRow glyph="moneybag" label="Save settings" onPress={() => open('/save-settings')} />
          {s !== null && s.capabilities.simulatedClock ? (
            <MenuRow
              glyph="clock"
              label="The clock"
              detail={`Today is ${fullDate(s.asOf)}`}
              onPress={() => open({ pathname: '/record', params: { pane: 'data' } })}
            />
          ) : null}
        </MenuGroup>

        {/* Cleo's links carry no leading mark: the trailing plate is what says the row leaves
            the app, and a second mark in front would only repeat it. The contact page is the way
            to a person from anywhere in the app — the phone lines, and the branch where a
            relationship manager sits — on a phone that cannot dial as well as one that can. */}
        <MenuGroup title="Links">
          <MenuRow
            label="IDBI Bank website"
            href={IDBI_WEBSITE}
            trailing="link"
            accessibilityHint="Opens in your browser"
          />
          <MenuRow
            label={IDBI_CONTACT.label}
            href={IDBI_CONTACT.url}
            trailing="link"
            accessibilityHint={IDBI_CONTACT.hint}
          />
        </MenuGroup>

        <MenuLink label="Log out" onPress={() => void logout()} className="mt-xl self-center" />
      </ScrollView>
    </SafeAreaView>
  )
}
