// Where my data comes from — the provenance of the portfolio, and the switch behind it.
//
// Three things the app knew and never showed. `HoldingSchema.custodian` names the place every
// holding actually sits at. `meta.provenance` says, per block of the file, whether a figure was
// read from IDBI, declared by the customer, or seeded for a demo. `session.scopeOverrides` is
// the list of blocks the customer has switched off, and the engine genuinely recomputes without
// them — switching HOLDINGS off here really does take the funds out of net worth and out of the
// plan, which is what makes this a consent screen rather than a settings page.
//
// It is its own route rather than a sixth pill on Grow for that reason. Five pills is already a
// crowded bar, and more to the point: switching consent off is not something a customer should
// be able to do by accident while scrolling a portfolio.
//
// The order is deliberate. What the bank holds, then who holds it, then what the bank may read
// — facts first and the control last, so nobody is offered a switch before they have been told
// what it turns off. The total, its composition and the sentence naming the biggest place are
// one block on the page ground, the way Cleo sets a balance: a figure, then what it is made of.
// The consent artefact itself is not repeated here; `record.tsx` owns it, carries the reference
// and the seal, and is one row away at the foot rather than copied.
//
// A switch answers at once and confirms when the file does. It flips under the thumb, holds the
// other four while the engine recomputes, and says so in a toast only once the snapshot has been
// read again — the honest confirmation is the advice changing. If the bank refuses, the switch
// goes back and the toast says so; a switch that quietly reverts looks like a tap that did not
// register.
//
// The holdings are read on their own and say which of three things happened. They used to fold
// a failed read into an empty list, which drew "held in 0 places" over a portfolio the bank had
// simply not returned.
import { useEffect, useState } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { router, useNavigation } from 'expo-router'
import { NavRow, leave } from '~/ui/NavRow'
import { Type } from '~/ui/Text'
import { Count } from '~/ui/Count'
import { Card } from '~/ui/Card'
import { Chip } from '~/ui/Chip'
import { Note } from '~/ui/Note'
import { Section } from '~/ui/Section'
import { ToggleRow } from '~/ui/ToggleRow'
import { SourceMark } from '~/ui/SourceMark'
import { MenuGroup, MenuRow } from '~/ui/MenuRow'
import { RetryLine } from '~/ui/SnapshotScroll'
import { useToast } from '~/ui/Toast'
import { type GlyphName } from '~/ui/Glyph'
import { dur } from '~/ui/motion'
import { cn } from '~/ui/cn'
import { api } from '~/api/client'
import { useSnapshot } from '~/state/snapshot'
import { usePayload } from '~/state/payload'
import { fullDate, rupees, rupeesShort } from '~/lib/money'
import { provenanceLabel, sourcesOf, type Source } from '~/lib/sources'
import { color, size } from '@dhan/design'
import type { ConsentScope } from '@dhan/contracts'

/**
 * The five blocks, in the order they build on each other: who you are, what you hold, what
 * moves, what you owe, what you own. Each `costs` line is the real consequence of the switch
 * beside it, because a consent control that does not say what it costs is not consent.
 */
const BLOCKS: ReadonlyArray<{
  scope: ConsentScope
  glyph: GlyphName
  title: string
  reads: string
  costs: string
}> = [
  {
    scope: 'PROFILE',
    glyph: 'person',
    title: 'Who you are',
    reads: 'Your age, dependants and the risk answers you gave.',
    costs: 'Nothing can be recommended, because no product can be checked against you.',
  },
  {
    scope: 'ACCOUNTS',
    glyph: 'ledger',
    title: 'What you hold here',
    reads: 'Your IDBI savings and deposit balances.',
    costs: 'No safe-to-spend figure and no buffer, because both are read off the balance.',
  },
  {
    scope: 'TXN',
    glyph: 'receipt',
    title: 'What moves',
    reads: 'Two years of credits and debits on those accounts.',
    costs: 'The budget, the insights and the daily action all stop.',
  },
  {
    scope: 'LIABILITIES',
    glyph: 'coins',
    title: 'What you owe',
    reads: 'Cards, loans and their rates.',
    costs: 'The plan stops putting expensive borrowing before investing.',
  },
  {
    scope: 'HOLDINGS',
    glyph: 'grow',
    title: 'What you own',
    reads: 'Funds, retirement balances and cover — here and at the places above.',
    costs: 'Net worth counts only your balances, and the plan stops seeing what you already hold.',
  },
]

/**
 * The composition ramp, positional rather than semantic.
 *
 * The same three tones the Net worth pane already allocates with, continued far enough to
 * carry a sixth place. Which rung a place lands on says only where it sits in the list; none of
 * these colours means anything on its own. The two dark rungs are the first and the fifth, and
 * the fifth is the near-black ink rather than the mid green: `ink-mid` sits within a shade of
 * `brand`, and with five places the swatch meant to tell two rows apart could not. A sixth place
 * is the only way two greens share the bar.
 */
const RAMP = ['bg-brand', 'bg-streak', 'bg-budget', 'bg-success', 'bg-ink', 'bg-ink-faint']

/** The switch just flipped, drawn in its new position until the file agrees. */
type Flip = { scope: ConsentScope; on: boolean }

export default function Connections() {
  const toast = useToast()
  const navigation = useNavigation()
  const { data: view, refresh } = useSnapshot()
  const holdings = usePayload(api.holdings, view)
  const session = usePayload(api.session, view)
  const [busy, setBusy] = useState<ConsentScope | null>(null)
  const [flip, setFlip] = useState<Flip | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [retrying, setRetrying] = useState<'holdings' | 'session' | null>(null)

  // The flip stays drawn until the session read agrees with it — not merely until the request
  // returns. A re-read that fails after a switch that succeeded would otherwise draw the switch
  // back in its old position, beside a toast saying it had moved.
  useEffect(() => {
    if (flip === null || busy !== null || session.data === null) return
    if (session.data.scopeOverrides.includes(flip.scope) === !flip.on) setFlip(null)
  }, [flip, busy, session.data])

  const withdrawn = new Set<ConsentScope>(session.data?.scopeOverrides ?? [])
  if (flip !== null) {
    if (flip.on) withdrawn.delete(flip.scope)
    else withdrawn.add(flip.scope)
  }
  const holdingsOff = withdrawn.has('HOLDINGS')
  const sources = sourcesOf(holdings.data?.holdings ?? [])

  async function setScope(scope: ConsentScope, on: boolean) {
    if (busy !== null) return
    setFlip({ scope, on })
    setBusy(scope)
    try {
      await api.setConsent(scope, on)
      // The engine rebuilds the whole view without the block, so the honest confirmation is
      // the figures changing — the snapshot is read again before the toast says so.
      await Promise.all([refresh(), session.reload(), holdings.reload()])
      toast.show(on ? 'Switched on · advice recomputed' : 'Switched off · advice recomputed')
    } catch {
      setFlip(null)
      // Ink, with the alert mark: the lime banner and its tick mean "done", and this is not.
      toast.show("Couldn't change that. Try again.", { glyph: 'alert', tone: 'ink' })
    } finally {
      setBusy(null)
    }
  }

  function pull() {
    setRefreshing(true)
    void Promise.all([refresh(), holdings.reload(), session.reload()]).finally(() =>
      setRefreshing(false),
    )
  }

  // Back to the record when it is already under this screen — its scope rows open this one —
  // rather than stacking a second copy, so the two never loop into a pile of × presses.
  function openRecord() {
    const href = { pathname: '/record', params: { pane: 'data' } } as const
    const below = navigation.getState()?.routes.some((route) => route.name === 'record')
    if (below) router.dismissTo(href)
    else router.push(href)
  }

  function retry(which: 'holdings' | 'session') {
    setRetrying(which)
    void (which === 'holdings' ? holdings.reload() : session.reload()).finally(() =>
      setRetrying(null),
    )
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow onClose={() => leave('/(tabs)/spend')} />

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-pad pb-xxl gap-md"
        refreshControl={
          <RefreshControl refreshing={refreshing} tintColor={color.inkSoft} onRefresh={pull} />
        }
      >
        <Type role="display">Where my data comes from</Type>

        <View className="mt-sm">
          {holdingsOff ? (
            <>
              <Type role="heading">Holdings switched off</Type>
              <Type role="body" tone="mid" className="mt-xs">
                Nothing here counts towards your net worth or plan until you switch it back on.
              </Type>
            </>
          ) : holdings.data === null ? (
            holdings.state === 'error' || retrying === 'holdings' ? (
              <RetryLine
                compact
                message="Couldn't read your holdings."
                busy={retrying === 'holdings'}
                onRetry={() => retry('holdings')}
              />
            ) : (
              <Type role="body" tone="mid">
                Reading where your money is held…
              </Type>
            )
          ) : sources.length === 0 ? (
            <Type role="body" tone="mid">
              Nothing held here or anywhere else yet.
            </Type>
          ) : (
            <Composition
              sources={sources}
              stamp={
                view === null
                  ? null
                  : `${provenanceLabel(view.meta.provenance.HOLDINGS)} · last read ${fullDate(view.meta.dataFreshnessDate)}`
              }
            />
          )}
        </View>

        {!holdingsOff && sources.length > 0 && (
          <>
            <Section title="Where it's held" />
            <Card>
              {sources.map((s, i) => (
                <SourceRow
                  key={s.name}
                  source={s}
                  swatch={RAMP[i % RAMP.length] as string}
                  divide={i > 0}
                />
              ))}
            </Card>
            <View className="gap-xs">
              <Type role="label" tone="mid">
                {sources.some((s) => !s.isHome)
                  ? "Holdings away from IDBI come from your consolidated statement. IDBI can't act on them or see them move."
                  : 'Nothing held away from IDBI.'}
              </Type>
              {/* The one row a customer cannot act on, said once and plainly rather than left
                  looking like a company called "Place not recorded". */}
              {sources.some((s) => !s.named) ? (
                <Type role="label" tone="mid">
                  Place not recorded: your statement doesn&apos;t say who holds these, so
                  there&apos;s nowhere to send you.
                </Type>
              ) : null}
            </View>
          </>
        )}

        {/* Facts first, control last: nothing above this point asked the customer for anything. */}
        <Section title="What IDBI may read" />
        {session.data === null ? (
          session.state === 'error' || retrying === 'session' ? (
            <RetryLine
              compact
              message="Couldn't read what IDBI may read."
              busy={retrying === 'session'}
              onRetry={() => retry('session')}
            />
          ) : (
            <Type role="body" tone="mid">
              Reading your switches…
            </Type>
          )
        ) : (
          BLOCKS.map((b) => {
            const off = withdrawn.has(b.scope)
            return (
              <ToggleRow
                key={b.scope}
                glyph={b.glyph}
                title={b.title}
                detail={off ? `Switched off. ${b.costs}` : b.reads}
                value={!off}
                onValueChange={(v) => void setScope(b.scope, v)}
                disabled={busy !== null && busy !== b.scope}
                busy={busy === b.scope}
              />
            )
          })
        )}

        <Note glyph="lock" title="Nothing is deleted">
          Each block switches off on its own. Switch one off and the advice is recomputed without
          it.
        </Note>

        <MenuGroup className="mt-lg">
          <MenuRow
            glyph="ledger"
            label="The consent record"
            detail="Reference, validity and every verdict"
            onPress={openRecord}
          />
        </MenuGroup>
      </ScrollView>
    </SafeAreaView>
  )
}

/**
 * The total and what it is made of: the figure, one bar split by place, and the sentence that
 * names the biggest share. Eleven holdings across five places is a composition, and read as
 * five separate meters it is five facts rather than one shape.
 */
function Composition({ sources, stamp }: { sources: Source[]; stamp: string | null }) {
  const total = sources.reduce((sum, s) => sum + s.value, 0)
  const largest = sources.reduce((a, b) => (b.value > a.value ? b : a))
  const pct = (s: Source) => Math.round(s.share * 100)

  return (
    <>
      <View className="flex-row items-baseline gap-sm">
        <Count
          value={total}
          format={rupeesShort}
          role="display"
          delay={dur.enter}
          id="connections.total"
        />
        <Type role="body" tone="mid" numberOfLines={1} adjustsFontSizeToFit className="shrink">
          held in {sources.length === 1 ? 'one place' : `${sources.length} places`}
        </Type>
      </View>
      {stamp === null ? null : (
        <Type role="label" tone="mid" className="mt-xs">
          {stamp}
        </Type>
      )}

      {sources.length > 1 ? (
        <>
          {/* One element for a screen reader: the shares, in the order they are drawn. */}
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={sources.map((s) => `${s.name} ${pct(s)} percent`).join(', ')}
            className="mt-lg h-sm w-full flex-row gap-xs"
          >
            {sources.map((s, i) => (
              <View
                key={s.name}
                className={cn('h-full rounded-pill', RAMP[i % RAMP.length])}
                style={{ flexGrow: Math.max(s.share, 0.02), flexBasis: 0 }}
              />
            ))}
          </View>
          {/* Of the investments, not of everything owned: the bar is the holdings alone, and Net
              worth adds the bank balances to them, so "of what you own" put EPFO at 32% on a
              page whose own total made it 23%. Grow calls this money "Investments" too. */}
          <Type role="label" tone="mid" className="mt-sm">
            {largest.name} holds {pct(largest)}% of your investments.
          </Type>
        </>
      ) : null}
    </>
  )
}

function SourceRow({
  source,
  swatch,
  divide,
}: {
  source: Source
  swatch: string
  divide: boolean
}) {
  const pct = Math.round(source.share * 100)
  const count = source.count === 1 ? '1 holding' : `${source.count} holdings`
  const classes = source.classes.join(', ')

  return (
    <View
      accessible
      accessibilityLabel={`${source.name}, ${rupees(source.value)}, ${pct}% of your investments. ${count}, ${classes}.${source.isHome ? ' Held at IDBI.' : ''}`}
      className={cn(
        'flex-row items-center gap-md px-lg py-md',
        divide && 'border-t border-hairline',
      )}
    >
      <SourceMark kind={source.kind} size={size.plateLg} />
      <View className="flex-1">
        {/* The swatch is a key, not a second bar: the bar above draws every share as a length,
            and what a row needs is the thing a shared axis cannot give it — which segment up
            there is this one. */}
        <View className="flex-row items-center gap-sm">
          <View className={cn('h-sm w-sm rounded-pill', swatch)} />
          <Type
            role="body"
            weight="semibold"
            tone={source.named ? 'ink' : 'mid'}
            numberOfLines={2}
            className="shrink"
          >
            {source.name}
          </Type>
        </View>
        <Type role="label" tone="mid" className="mt-xs">
          {count} · {classes}
        </Type>
        {source.isHome ? <Chip tone="ground" label="Held at IDBI" className="mt-sm" /> : null}
      </View>
      <View className="items-end">
        <Type role="body" weight="semibold">
          {rupees(source.value)}
        </Type>
        <Type role="label" tone="mid">
          {pct}%
        </Type>
      </View>
    </View>
  )
}
