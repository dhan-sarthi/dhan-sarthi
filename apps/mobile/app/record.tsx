// The record — what the bank told you, and why.
//
// Nothing in Cleo corresponds to this, and nothing needs to: a third-party budgeting app
// owes its user no account of its reasoning. A bank giving investment advice in India does.
// SEBI's Investment Adviser regulations require the suitability assessment, the rationale
// and the record to be kept for five years and produced on demand — so this screen is not
// a trust gesture, it is the obligation, shown to the person it is about.
//
// Three panes, named for what is on them. Advice is every verdict, the refusals included.
// Rules is the nine as data rather than as marketing. Consent is what the whole thing runs on:
// its scopes, its expiry, where the ledger came from, and the clock. `?pane=` opens any of
// them, which is how the profile's clock row and the consent row on Where my data comes from
// both land on Consent.
//
// Each pane owns the read it depends on and says so when that read fails, with the retry
// beside the sentence. There used to be one gate over all three, so a record that would not
// load also hid the rules, which come with the snapshot and were sitting right there; and a
// failure printed a sentence with nothing to press, which on the web build is a dead end.
//
// Every card here ends in a way to ask about it, because the one question a record raises is
// "why" — and Uday answers that with the same evidence the entry was written from.
import { useMemo, useState } from 'react'
import { FlatList, RefreshControl, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { router, useNavigation } from 'expo-router'
import { NavRow, leave } from '~/ui/NavRow'
import { Pills, usePane } from '~/ui/Pills'
import { Pane } from '~/ui/Reveal'
import { Type } from '~/ui/Text'
import { Card } from '~/ui/Card'
import { Row } from '~/ui/Row'
import { Section } from '~/ui/Section'
import { Chip, type ChipTone } from '~/ui/Chip'
import { Button } from '~/ui/Button'
import { AskUday } from '~/ui/AskUday'
import { RulesChip } from '~/ui/RulesChip'
import { Note } from '~/ui/Note'
import { GlyphPlate } from '~/ui/Glyph'
import { EmptyState, RetryLine } from '~/ui/SnapshotScroll'
import { MenuGroup, MenuRow } from '~/ui/MenuRow'
import { RULE_ORDER, ruleIndex, ruleName } from '~/ui/GateSheet'
import { TimeMachine } from '~/ui/TimeMachine'
import { cn } from '~/ui/cn'
import { api } from '~/api/client'
import { useSnapshot, type SnapshotState } from '~/state/snapshot'
import { usePayload, type Payload } from '~/state/payload'
import { headline } from '~/lib/headline'
import { askFacts, questionForAdvice } from '~/lib/ask'
import { fullDate, rupees } from '~/lib/money'
import { color } from '@dhan/design'
import type {
  AdviceRecord,
  Consent,
  ConsentScope,
  RecordView,
  Rule,
  SessionState,
} from '@dhan/contracts'

type Pane = 'advice' | 'rules' | 'data'

const PANES = [
  { value: 'advice' as const, label: 'Advice' },
  { value: 'rules' as const, label: 'Rules' },
  { value: 'data' as const, label: 'Consent' },
]

/** The same five names Where my data comes from gives its switches, so a block is one thing. */
const SCOPE_LABEL: Record<ConsentScope, string> = {
  PROFILE: 'Who you are',
  ACCOUNTS: 'What you hold here',
  TXN: 'What moves',
  LIABILITIES: 'What you owe',
  HOLDINGS: 'What you own',
}

const STATUS: Record<Consent['status'], { tone: ChipTone; label: string }> = {
  ACTIVE: { tone: 'success', label: 'Active' },
  EXPIRED: { tone: 'ground', label: 'Expired' },
  REVOKED: { tone: 'danger', label: 'Revoked' },
}

/** A read that is being asked again, so its retry line can show that it is working. */
function useRetry(read: () => Promise<unknown>): [boolean, () => void] {
  const [busy, setBusy] = useState(false)
  return [
    busy,
    () => {
      setBusy(true)
      void read().finally(() => setBusy(false))
    },
  ]
}

export default function RecordScreen() {
  const { pane, dir, set } = usePane<Pane>('advice', PANES)
  // The rules and the shelf are both already in the snapshot — `ViewSchema` carries them —
  // so this screen reads them from the one module every other screen reads rather than
  // re-fetching two routes it would then have to fail quietly. The record and the session are
  // not in it, so they are read beside it and re-read whenever it changes: a moved clock
  // refreshes the snapshot, and the record and the date follow.
  const { data: view, state: viewState, refresh } = useSnapshot()
  const record = usePayload(api.record, view)
  const session = usePayload(api.session, view)
  const [refreshing, setRefreshing] = useState(false)
  const [retryingRecord, retryRecord] = useRetry(record.reload)

  const names = useMemo(
    () => new Map((view?.shelf ?? []).map((p) => [p.productId, p.name])),
    [view],
  )
  // What each entry hands Uday: the rule that refused it, the action it recommended, or the kind
  // of product it checked — never "Why was '<title>' refused?", which he answered with whatever
  // finding ranked first. Null where no rule of his speaks to it; the entry's own reason stands.
  const facts = view === null ? null : askFacts(view.snapshot)
  const askOf = (entry: AdviceRecord): string | null => {
    if (facts === null) return null
    const product =
      entry.productId === null
        ? undefined
        : view?.shelf.find((p) => p.productId === entry.productId)
    return questionForAdvice(entry, product, facts)
  }

  function pull() {
    setRefreshing(true)
    void Promise.all([refresh(), record.reload(), session.reload()]).finally(() =>
      setRefreshing(false),
    )
  }

  // Moving the clock moves it for the whole app, not for this card. The tabs stay mounted and
  // re-fetch nothing on their own, so the snapshot is refreshed here — without it, "move it and
  // watch them change" would be false — and the record and the session follow it.
  function onClockMoved() {
    void refresh()
    void session.reload()
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
        <Type role="display">Your record</Type>
        {/* The strip draws its own gutter so a fifth pill can scroll edge to edge. */}
        <View className="-mx-pad mt-sm">
          <Pills options={PANES} value={pane} onChange={set} />
        </View>

        <Pane key={pane} dir={dir} className="mt-sm gap-md">
          {pane === 'rules' ? (
            <Rules rules={view?.rules ?? []} state={viewState} onRetry={refresh} />
          ) : record.data === null ? (
            record.state === 'error' || retryingRecord ? (
              <RetryLine
                compact
                message="Couldn't open your record."
                busy={retryingRecord}
                onRetry={retryRecord}
              />
            ) : (
              <Type role="body" tone="mid">
                Reading your record…
              </Type>
            )
          ) : pane === 'advice' ? (
            <Advice record={record.data} names={names} askOf={askOf} />
          ) : (
            <Data record={record.data} session={session} onClockMoved={onClockMoved} />
          )}
        </Pane>
      </ScrollView>
    </SafeAreaView>
  )
}

function Advice({
  record,
  names,
  askOf,
}: {
  record: RecordView
  names: ReadonlyMap<string, string>
  askOf: (entry: AdviceRecord) => string | null
}) {
  // Newest first: the entry a customer comes here to check is the one they were just given.
  const entries = useMemo(() => record.adviceRecords.slice().reverse(), [record])

  if (entries.length === 0) {
    return (
      <EmptyState
        glyph="ledger"
        title="Nothing recorded yet"
        body="Every piece of advice lands here with its evidence."
        action={{
          label: "See today's action",
          onPress: () =>
            router.dismissTo({ pathname: '/(tabs)/spend', params: { pane: 'overview' } }),
        }}
      />
    )
  }

  const intact = record.chainVerified
  return (
    <>
      {/* The seal is the claim. Each entry carries the hash of the one before it, so an entry
          cannot be altered or removed later without every one after it failing — and the
          screen says out loud whether that check passes right now. */}
      <Card className="p-lg">
        <View className="flex-row items-center gap-md">
          <GlyphPlate
            name={intact ? 'check' : 'alert'}
            fill={intact ? 'bg-success/50' : 'bg-danger-soft'}
          />
          <View className="flex-1 flex-row flex-wrap items-center justify-between gap-sm">
            <Type role="heading">{intact ? 'Record intact' : 'Record has been altered'}</Type>
            <Chip
              tone="ground"
              label={entries.length === 1 ? '1 entry' : `${entries.length} entries`}
            />
          </View>
        </View>
        <Type role="body" tone="mid" className="mt-md">
          {intact
            ? 'Each sealed against the one before. Kept five years. Nothing can be changed later without this check failing.'
            : "An entry no longer matches the seal on the one before it, so this record can't be relied on until it is checked."}
        </Type>
      </Card>

      {/* A list inside the page's own scroller, so it does not scroll by itself — and it
          renders every entry at once, because windowing a list that is never scrolled would
          leave the bottom of the record blank until something asked for it. */}
      <FlatList
        data={entries}
        keyExtractor={(entry) => entry.id}
        scrollEnabled={false}
        initialNumToRender={entries.length}
        ItemSeparatorComponent={Gap}
        renderItem={({ item, index }) => (
          <Entry
            entry={item}
            names={names}
            question={askOf(item)}
            day={index === 0 || entries[index - 1]?.atSim !== item.atSim ? item.atSim : null}
            first={index === 0}
          />
        )}
      />
    </>
  )
}

function Gap() {
  return <View className="h-md" />
}

function Entry({
  entry,
  names,
  question,
  day,
  first,
}: {
  entry: AdviceRecord
  names: ReadonlyMap<string, string>
  question: string | null
  /** The date to print above this entry, when it starts a new day. */
  day: string | null
  first: boolean
}) {
  const title = headline(entry.actionKind, entry.productId, names)
  const refused = entry.verdict === 'BLOCKED'
  const unknown = entry.verdict === 'UNKNOWN_PRODUCT'
  const rule = ruleIndex(entry.ruleId)
  const nine = RULE_ORDER.length

  return (
    <View className="gap-md">
      {day === null ? null : (
        <Type role="body" tone="mid" accessibilityRole="header" className={cn(!first && 'mt-md')}>
          {fullDate(day)}
        </Type>
      )}
      <Card className="p-lg">
        <View className="flex-row items-center justify-between gap-md">
          {/* The gate sheet's own chip, so a verdict reads the same here as where it was given.
              A product no longer on the shelf was never judged, so it keeps a plain chip. */}
          {unknown ? (
            <Chip tone="ground" label="Not on the shelf" />
          ) : (
            <RulesChip blocked={refused} of={nine} at={rule} />
          )}
          {entry.amount !== null && entry.amount > 0 ? (
            <Type role="label">{rupees(entry.amount)}</Type>
          ) : null}
        </View>

        <Type role="heading" className="mt-md">
          {title}
        </Type>
        <Type role="body" tone="mid" className="mt-xs">
          {entry.spoken ?? entry.recorded}
        </Type>

        {entry.alternative === null ? null : (
          <View className="mt-md rounded-lg bg-ground p-md">
            <Type role="body">
              <Type role="body" weight="semibold">
                Instead:{' '}
              </Type>
              {entry.alternative.name} · {rupees(entry.alternative.monthly)} a month
            </Type>
          </View>
        )}

        {/* The auditor's line, not the customer's, byte for byte as the engine wrote it. Kept
            on screen deliberately: the person the record is about should see exactly what a
            reviewer sees. */}
        {entry.spoken !== null && entry.recorded !== entry.spoken ? (
          <View className="mt-md rounded-lg bg-ground p-md">
            <Type role="caption" tone="mid">
              As recorded
            </Type>
            <Type role="label" tone="mid" className="mt-xxs">
              {entry.recorded}
            </Type>
          </View>
        ) : null}

        {/* No footer. The seal is a hash — what the check at the top of the list compares, not
            something a person reads — and `seq` is the entry's place in the bank-wide chain,
            so "59" under a chip saying 16 entries would only raise a question. */}
        {question === null ? null : <AskUday question={question} className="mt-sm" />}
      </Card>
    </View>
  )
}

function Rules({
  rules,
  state,
  onRetry,
}: {
  rules: readonly Rule[]
  state: SnapshotState
  onRetry: () => Promise<void>
}) {
  const [retrying, retry] = useRetry(onRetry)

  // A compliance screen may not assert that a set of rules exists and then list none. If the
  // snapshot is not holding them, say which it is — still reading, or could not read — with
  // the way to read again, rather than rendering an empty card under a sentence that claims nine.
  if (rules.length === 0) {
    return state === 'error' || retrying ? (
      <RetryLine compact message="Couldn't load the rules." busy={retrying} onRetry={retry} />
    ) : (
      <Type role="body" tone="mid">
        Reading the rules…
      </Type>
    )
  }

  return (
    <>
      <Type role="body" tone="mid">
        They run in order on every product, every time. The first to fail stops it — so a refusal
        names the first problem, not the only one.
      </Type>
      <Card>
        {rules.map((rule, i) => {
          const name = ruleName(rule.id)
          return (
            <View
              key={rule.id}
              accessible
              accessibilityLabel={`Rule ${i + 1} of ${rules.length}. ${name === null ? '' : `${name}. `}${rule.description}`}
              className={cn('flex-row gap-md px-lg py-md', i > 0 && 'border-t border-hairline')}
            >
              {/* A fixed column, so "1" does not pull its rule's text left of the other eight. */}
              <Type role="label" tone="mid" className="mt-xxs w-md text-center">
                {i + 1}
              </Type>
              <View className="flex-1">
                {name === null ? null : (
                  <Type role="body" weight="semibold">
                    {name}
                  </Type>
                )}
                <Type role="body" tone="mid">
                  {rule.description}
                </Type>
              </View>
            </View>
          )
        })}
      </Card>
      <Button
        size="sm"
        variant="secondary"
        label="Check a product against them"
        haptic="none"
        className="mt-sm"
        onPress={() => router.dismissTo({ pathname: '/(tabs)/grow', params: { pane: 'invest' } })}
      />
    </>
  )
}

function Data({
  record,
  session,
  onClockMoved,
}: {
  record: RecordView
  session: Payload<SessionState>
  onClockMoved: () => void
}) {
  const { consent, provenance } = record
  const off = new Set<ConsentScope>(record.scopeOverrides)
  const [retryingClock, retryClock] = useRetry(session.reload)
  const navigation = useNavigation()
  // Back to Where my data comes from when it is already under this screen — its consent row
  // opens this pane — rather than stacking a second copy on top, so × never has to be pressed
  // twice to get out of a loop between the two.
  const openConnections = () => {
    const below = navigation.getState()?.routes.some((route) => route.name === 'connections')
    if (below) router.dismissTo('/connections')
    else router.push('/connections')
  }

  return (
    <>
      {/* Null where no consent artefact was ever written against this session. Saying so is
          the honest answer — optional-chaining the fields into blanks would print a consent
          card with no consent behind it, on the one screen that exists to be audited. */}
      {consent === null ? (
        <Note action={{ label: 'See what IDBI may read', onPress: openConnections }}>
          No consent record yet. It is written the first time you grant one.
        </Note>
      ) : (
        <>
          <Card>
            <View className="px-lg pb-sm pt-lg">
              <View className="flex-row items-center justify-between gap-md">
                <Type role="heading" className="flex-1">
                  Consent
                </Type>
                <Chip tone={STATUS[consent.status].tone} label={STATUS[consent.status].label} />
              </View>
              <Type role="body" tone="mid" className="mt-xs">
                {consent.purpose}
              </Type>
            </View>
            <Row label="Valid from" value={fullDate(consent.validFrom)} divide />
            <Row label="Valid to" value={fullDate(consent.validTo)} divide />
            <Row label="Reference" value={consent.consentId} divide />
          </Card>

          {/* Each block is a way into its switch. The chip is the state the engine is running
              on now, overrides included, not the state the artefact was granted in. */}
          <Section title="What IDBI may read" />
          <Card>
            {consent.scopes.map((scope, i) => {
              const state = off.has(scope) ? 'Switched off' : 'Granted'
              return (
                <Row
                  key={scope}
                  label={SCOPE_LABEL[scope]}
                  value={state}
                  trailing={<Chip tone={off.has(scope) ? 'ground' : 'success'} label={state} />}
                  divide={i > 0}
                  onPress={openConnections}
                />
              )
            })}
          </Card>
          {/* The switches live on one screen, and this is the labelled way to it — the rows
              above lead there too, but a row reads as the block, not as "change". */}
          <MenuGroup>
            <MenuRow
              glyph="sliders"
              label="Change what IDBI may read"
              detail="Switch any block off; the advice recomputes without it."
              onPress={openConnections}
            />
          </MenuGroup>
        </>
      )}

      {/* Null under a real bank feed, where the ledger was lived rather than seeded. The
          "this is synthetic data" sentence is guarded along with the figures, because it is a
          claim about where the rows came from and not a fixed piece of copy — printing it over
          an empty card would be the same untruth in the other direction. Said plainly rather
          than buried: a product whose argument is "we show our reasoning" cannot be coy about
          the numbers that reasoning is built on. The generator's version and the ledger's
          content hash stay on the wire for whoever audits the build; on screen they read as
          debug output. */}
      {provenance === null ? null : (
        <>
          <Section title="Where this ledger came from" />
          <Card>
            <View className="px-lg pb-sm pt-lg">
              <Type role="heading">This is synthetic data</Type>
              <Type role="body" tone="mid" className="mt-xs">
                Every transaction here was generated, not lived. The engine, the rules and the
                record are real.
              </Type>
            </View>
            <Row label="Ledger from" value={fullDate(provenance.historyFrom)} divide />
            <Row label="Ledger to" value={fullDate(provenance.horizonTo)} divide />
            <Row label="Clock starts on" value={fullDate(provenance.anchor)} divide />
          </Card>
        </>
      )}

      {session.data !== null ? (
        <TimeMachine session={session.data} onMoved={onClockMoved} />
      ) : session.state === 'error' || retryingClock ? (
        <RetryLine
          compact
          message="Couldn't read the clock."
          busy={retryingClock}
          onRetry={retryClock}
        />
      ) : null}
    </>
  )
}
