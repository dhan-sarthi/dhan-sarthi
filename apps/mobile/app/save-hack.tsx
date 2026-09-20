// One save hack, configured. All five of them, on one screen.
//
// Cleo ship five separate screens and they are the same screen five times: back chevron,
// display title, a soft line of what the hack is for, the switch card, the hack's own
// control, the ⓘ note, Save. Only the middle band differs, and it differs by about fifteen
// lines each. Five files would mean five copies of the fetch, five copies of the patch
// builder, five copies of the "held to the month's headroom" note and five places to forget
// to refresh the tabs underneath. So there is one file and a `Control` switch, and the shared
// skeleton is shared by construction rather than by everyone remembering it.
//
// The route is flat with `?id=` rather than `/save-hack/[id]`, because `typedRoutes` is on
// and this app's rule is that every pushed screen is a flat file with query params. `id`
// arrives as a string from a deep link like any other query param, so it is checked against
// `SAVE_HACK_IDS` at runtime before anything reads it — the generic on
// `useLocalSearchParams` is a convenience for the call site, not a guarantee about what
// actually came down the URL.
//
// **Save is disabled until the configuration is both valid and changed.** Valid is the
// obvious half: a swear jar with no merchant is not a swear jar, and a payday saver on an
// income the categoriser calls variable has no payday to ride. Changed is the half worth
// arguing. Every one of Cleo's captures shows the button greyed out on arrival, and it is
// greyed because nothing has been decided yet, not because the screen is broken — a live
// Save on an untouched screen invites a write that sets the hack to exactly what it already
// is, which round-trips the whole SaveView and re-renders four other cards to say nothing.
// Comparing the built patch against the patch the current state would build is the cheapest
// honest test of that: both sides come out of `patchFor`, so the key order is identical and
// a string compare is a field compare.
//
// **The controls only exist while the switch is on.** A disabled amount stepper under an off
// switch is a control the customer can see and cannot use, which is how a form teaches people
// to stop trusting what it shows them. Off means the configuration is not in play, so it is
// not on screen; it is still in `draft`, so turning the switch back on brings the customer's
// last choice back rather than a default they have to re-make.
//
// **Two figures are computed here rather than read off the wire, and both are deliberate.**
// The smart-save levels print `recommendedWeekly × SMART_SAVE_FACTOR`, imported from
// `@dhan/core` rather than retyped, because a level that says "Tough" without saying ₹2,090
// is asking the customer to choose between three adjectives. And the payday percentages print
// `monthly × pct`, which is arithmetic the customer can check against their own payslip. Both
// are display-only: the server recomputes them when it accrues, and a rounding disagreement
// of a rupee between this screen and the ledger is not a disagreement about what was agreed.
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { NavRow } from '~/ui/NavRow'
import { Type } from '~/ui/Text'
import { Card } from '~/ui/Card'
import { Note } from '~/ui/Note'
import { Chips } from '~/ui/Chips'
import { Button } from '~/ui/Button'
import { Reveal } from '~/ui/Reveal'
import { ToggleRow } from '~/ui/ToggleRow'
import { SelectCard } from '~/ui/SelectCard'
import { SettingRow } from '~/ui/SettingRow'
import { AmountStepper } from '~/ui/AmountStepper'
import { useSnapshot } from '~/state/snapshot'
import { rupees, shortDate } from '~/lib/money'
import { api } from '~/api/client'
import { isEnabled, isValid, patchFor, withEnabled } from '~/lib/savehack'
import { SAVE_HACK_IDS, SMART_SAVE_FACTOR } from '@dhan/core'
import type { GlyphName } from '~/ui/Glyph'
import type { SaveHackId, SaveHacks, SaveView, SmartSaveLevel } from '@dhan/contracts'

/** Weeks in a month, the same 4.345 the engine divides a monthly surplus by. */
const WEEKS_PER_MONTH = 4.345

type Copy = {
  glyph: GlyphName
  /** The display title. Broken by hand where the two-line shape reads better than a wrap. */
  title: string
  subtitle: string
  /** The switch card's own line — what the hack does, not what it is set to. */
  toggle: string
  noteTitle: string
  noteBody: string
}

// The five scripts. Cleo's copy, translated into rupees and into a bank's voice: no
// "guilty pleasure", no exclamation marks, and the note says what actually governs the
// transfer rather than what happens when a card declines.
const COPY: Record<SaveHackId, Copy> = {
  roundups: {
    glyph: 'coins',
    title: 'Round-ups',
    subtitle: 'Every purchase rounded up. The change goes to your goal.',
    toggle: 'Round every purchase up',
    noteTitle: 'Collected as you spend, moved every Monday',
    noteBody: 'Round-ups build up all week and move in one transfer, not forty.',
  },
  set_forget: {
    glyph: 'clock',
    title: 'Set & forget',
    subtitle: 'One amount, once a week. Nothing else to decide.',
    toggle: 'Save a set amount every week',
    noteTitle: 'One transfer, every Monday',
    noteBody: 'The amount you pick moves to your goal at the start of each week.',
  },
  smart_save: {
    glyph: 'star',
    title: 'Smart save',
    subtitle: 'I work out what you can spare each week from your spending.',
    toggle: 'I pick the amount from your spending',
    noteTitle: 'Worked out fresh every week',
    noteBody:
      'Read off what you have spare each Monday, so a heavy week saves less instead of leaving you short.',
  },
  swear_jar: {
    glyph: 'moneybag',
    title: 'Swear jar',
    subtitle: 'Pick the place you overdo. Spend there, and a set amount goes to your goal.',
    toggle: 'Save every time you spend there',
    noteTitle: 'Collected as you spend, moved every Monday',
    noteBody: 'Every spend there adds to the jar. The jar empties into your goal each Monday.',
  },
  payday_saver: {
    glyph: 'paycheck',
    title: 'Payday saver',
    subtitle: 'Set aside part of every salary before the month gets to it.',
    toggle: 'Save part of your salary',
    noteTitle: 'Taken on payday',
    noteBody: 'Moved the moment your salary lands — the one day the money is definitely there.',
  },
}

const WEEKLY_PRESETS = [100, 250, 500, 1_000] as const
const PER_SPEND_PRESETS = [20, 50, 100, 200] as const
const PERCENT_PRESETS = [1, 3, 5] as const

// The shares "Set your own" offers, typed as plain numbers rather than inferred as their own
// literals: the chip row is driven by `percent`, which is whatever the server last stored, and
// a `Chips<2 | 4 | 7 | 10 | 15 | 20>` could not be handed a percentage that is none of them.
const CUSTOM_PERCENT_CHIPS: ReadonlyArray<{ value: number; label: string }> = [
  2, 4, 7, 10, 15, 20,
].map((p) => ({ value: p, label: `${p}%` }))

// `number | 'other'` rather than two rows of controls: Cleo put "Other" at the end of the
// amount chips, and it belongs there — it is one of the answers to "how much", not a separate
// question. `Chips` is generic over `string | number` precisely so this union can ride
// through `onChange` without being stringified and parsed back.
type AmountChoice = number | 'other'

const SMART_SAVE_LEVELS: ReadonlyArray<{ level: SmartSaveLevel; title: string; why: string }> = [
  { level: 'gentle', title: 'Gentle', why: 'Well under what I would suggest' },
  { level: 'normal', title: 'Normal', why: 'Exactly what I would suggest' },
  { level: 'tough', title: 'Tough', why: 'A bit more than I would suggest' },
]

function amountChips(
  presets: readonly number[],
): ReadonlyArray<{ value: AmountChoice; label: string }> {
  return [
    ...presets.map((n) => ({ value: n as AmountChoice, label: rupees(n) })),
    { value: 'other' as AmountChoice, label: 'Other' },
  ]
}

export default function SaveHack() {
  const params = useLocalSearchParams<{ id: SaveHackId }>()
  // Checked, not trusted. The generic above describes what this screen is pushed with; a
  // deep link can carry anything, and `COPY[id]` on an unknown key is a blank screen with a
  // Save button on it rather than an error anyone can act on.
  const id: SaveHackId | null = SAVE_HACK_IDS.includes(params.id) ? params.id : null

  // The save view is this screen's own payload, read here; the snapshot underneath it is
  // the provider's, and `refresh` is how the tabs are told the inflow moved.
  const { refresh } = useSnapshot()
  const [view, setView] = useState<SaveView | null>(null)
  // The whole `SaveHacks` block rather than this hack's slice, so `patchFor` and the
  // comparison against the server's copy can both take the same shape and stay honest about
  // which branch they are reading.
  const [draft, setDraft] = useState<SaveHacks | null>(null)
  // One flag for whichever "Other" is on screen. Exactly one hack renders at a time, so a
  // flag per control would be four booleans of which three are always false.
  const [custom, setCustom] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .save()
      .then((next) => {
        setView(next)
        setDraft(next.hacks)
      })
      .catch(() => setView(null))
  }, [])

  const copy = id === null ? null : COPY[id]
  const card = id === null ? undefined : view?.cards.find((c) => c.id === id)
  const enabled = id === null || draft === null ? false : isEnabled(id, draft)

  const valid = id !== null && draft !== null && view !== null && isValid(id, draft, view)
  const changed =
    id !== null &&
    draft !== null &&
    view !== null &&
    JSON.stringify(patchFor(id, draft)) !== JSON.stringify(patchFor(id, view.hacks))

  async function commit() {
    if (id === null || draft === null || !valid || !changed) return
    setSaving(true)
    setError(null)
    try {
      // The answer is the whole SaveView, so the screen takes it even though it is about to
      // leave: `router.back()` does nothing when this was opened cold from a link, and a
      // screen that stayed put showing the pre-save state would look like the save failed.
      const next = await api.setSaveHack(patchFor(id, draft))
      setView(next)
      setDraft(next.hacks)
      // The tabs are still mounted underneath and the Save pane is showing the old inflow.
      await refresh()
      router.back()
    } catch {
      setError('Could not save that. Check the API and try again.')
    } finally {
      setSaving(false)
    }
  }

  if (id === null || copy === null) {
    return (
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
        <StatusBar style="dark" />
        <NavRow onBack={() => router.back()} />
        <View className="flex-1 px-pad">
          <Type role="title">No such save hack</Type>
          <Type role="body" tone="soft" className="mt-xs">
            That link points at something this app does not have. The five that exist are on the
            save hacks list.
          </Type>
        </View>
        <View className="px-pad pt-md pb-sm">
          <Button label="Back to save hacks" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow onBack={() => router.back()} />

      <ScrollView
        className="flex-1 px-pad"
        contentContainerClassName="pb-xxl"
        keyboardShouldPersistTaps="handled"
      >
        <Type role="display">{copy.title}</Type>
        <Type role="body" tone="soft" className="mt-sm">
          {copy.subtitle}
        </Type>

        <View className="mt-xl">
          <ToggleRow
            glyph={copy.glyph}
            title={copy.title}
            detail={copy.toggle}
            value={enabled}
            onValueChange={(next) => {
              setCustom(false)
              setDraft((prev) => (prev === null ? prev : withEnabled(id, prev, next)))
            }}
          />
        </View>

        {enabled && draft !== null && view !== null && (
          <Reveal className="mt-xl">
            <Control
              id={id}
              view={view}
              draft={draft}
              setDraft={setDraft}
              custom={custom}
              setCustom={setCustom}
              lastFourWeeks={card?.lastFourWeeks ?? 0}
            />
          </Reveal>
        )}

        <View className="mt-xxl">
          <Note title={copy.noteTitle}>
            {`${copy.noteBody} Whatever your hacks add up to is held to what the month actually leaves after rent, EMIs and what you invest — about ${rupees(
              view?.recommendedWeekly ?? 0,
            )} a week — so saving can never be the reason you come up short.`}
          </Note>
        </View>

        {error !== null && (
          <Type role="label" tone="danger" className="mt-md">
            {error}
          </Type>
        )}
      </ScrollView>

      <View className="px-pad pt-md pb-sm">
        <Button
          label="Save"
          onPress={() => void commit()}
          loading={saving}
          disabled={!valid || !changed}
        />
      </View>
    </SafeAreaView>
  )
}

type ControlProps = {
  id: SaveHackId
  view: SaveView
  draft: SaveHacks
  setDraft: (update: (prev: SaveHacks | null) => SaveHacks | null) => void
  custom: boolean
  setCustom: (next: boolean) => void
  lastFourWeeks: number
}

function Control(props: ControlProps) {
  switch (props.id) {
    case 'roundups':
      return <RoundUps {...props} />
    case 'set_forget':
      return <SetForget {...props} />
    case 'smart_save':
      return <SmartSave {...props} />
    case 'swear_jar':
      return <SwearJar {...props} />
    case 'payday_saver':
      return <PaydaySaver {...props} />
  }
}

// Round-ups has no control, and that is the finished design rather than a gap. The only thing
// left to decide would be what to round to, and ₹10 is the answer for every customer this app
// has — a ₹100 round-up on a ₹120 auto fare is not a round-up, it is a second fare. What the
// screen owes them instead is the number they are actually agreeing to, so it prints what the
// last four weeks of their own statement would have collected.
function RoundUps({ draft, view, lastFourWeeks }: ControlProps) {
  return (
    <View>
      <Type role="label" tone="mid">
        Over the last four weeks
      </Type>
      <View className="mt-sm rounded-lg bg-ground-deep px-lg py-lg">
        <Type role="display">{rupees(lastFourWeeks)}</Type>
        <Type role="body" tone="soft" className="mt-xs">
          is what rounding every purchase up to the next {rupees(draft.roundups.toNearest)} would
          have put into {view.pot.purpose}.
        </Type>
      </View>
    </View>
  )
}

function SetForget({ draft, view, setDraft, custom, setCustom }: ControlProps) {
  const weekly = draft.setForget.weekly
  // "Other" stays selected while the stepper is in use, and a stored amount that is not one
  // of the four presets opens on the stepper rather than showing four chips none of which is
  // the customer's own figure. Zero is excluded from that second test on purpose: an
  // unconfigured hack has chosen nothing, and a stepper sitting at ₹0 is not the same
  // statement as a chip row with nothing taken.
  const off = custom || (weekly > 0 && !WEEKLY_PRESETS.some((p) => p === weekly))
  const set = (next: number) =>
    setDraft((prev) =>
      prev === null ? prev : { ...prev, setForget: { ...prev.setForget, weekly: next } },
    )

  return (
    <View>
      <Type role="label" tone="mid">
        Once a week, put this much towards {view.pot.purpose}
      </Type>
      <View className="mt-sm">
        <Chips
          options={amountChips(WEEKLY_PRESETS)}
          value={off ? 'other' : weekly}
          onChange={(v) => {
            if (v === 'other') setCustom(true)
            else {
              setCustom(false)
              set(v)
            }
          }}
        />
      </View>

      {off && (
        <View className="mt-lg">
          <AmountStepper value={weekly} onChange={set} min={50} format={rupees} size="sm" />
        </View>
      )}

      <Type role="caption" tone="faint" className="mt-md">
        About {rupees(Math.round(weekly * WEEKS_PER_MONTH))} a month.
        {weekly > view.recommendedWeekly
          ? ` That is above the ${rupees(view.recommendedWeekly)} a week you can spare, so some weeks will save less.`
          : ''}
      </Type>
    </View>
  )
}

function SmartSave({ draft, view, setDraft }: ControlProps) {
  return (
    <View>
      <Type role="label" tone="mid">
        Choose a smart save level
      </Type>
      <Card className="mt-sm overflow-hidden">
        {SMART_SAVE_LEVELS.map((l, i) => (
          <SelectCard
            key={l.level}
            title={l.title}
            // The rupee figure, not the adjective. "Tough" is a mood; ₹2,090 a week is a
            // decision, and it is the one the customer is actually taking.
            description={`${rupees(
              Math.round(view.recommendedWeekly * SMART_SAVE_FACTOR[l.level]),
            )} a week · ${l.why}`}
            selected={draft.smartSave.level === l.level}
            divide={i > 0}
            onPress={() =>
              setDraft((prev) =>
                prev === null
                  ? prev
                  : { ...prev, smartSave: { ...prev.smartSave, level: l.level } },
              )
            }
          />
        ))}
      </Card>
      <Type role="caption" tone="faint" className="mt-md">
        Normal is the exact amount your surplus supports. It is read again every week, so it moves
        with your spending rather than staying where you left it.
      </Type>
    </View>
  )
}

function SwearJar({ draft, view, setDraft, custom, setCustom }: ControlProps) {
  const perSpend = draft.swearJar.perSpend
  const off = custom || (perSpend > 0 && !PER_SPEND_PRESETS.some((p) => p === perSpend))
  const setAmount = (next: number) =>
    setDraft((prev) =>
      prev === null ? prev : { ...prev, swearJar: { ...prev.swearJar, perSpend: next } },
    )

  return (
    <View>
      <Type role="label" tone="mid">
        Put this much towards {view.pot.purpose}
      </Type>
      <View className="mt-sm">
        <Chips
          options={amountChips(PER_SPEND_PRESETS)}
          value={off ? 'other' : perSpend}
          onChange={(v) => {
            if (v === 'other') setCustom(true)
            else {
              setCustom(false)
              setAmount(v)
            }
          }}
        />
      </View>

      {off && (
        <View className="mt-lg">
          <AmountStepper value={perSpend} onChange={setAmount} min={10} format={rupees} size="sm" />
        </View>
      )}

      <Type role="label" tone="mid" className="mt-xl">
        Every time I spend at
      </Type>
      {/* Cleo open a searchable merchant picker here. Ours is a list, because the candidates
          are already ranked by four-week spend off the customer's own statement and the
          merchant worth putting a jar on is in the top handful by definition. A search box
          over five rows is a search box that mostly returns all five. */}
      <Card className="mt-sm overflow-hidden">
        {view.swearJarCandidates.map((c, i) => (
          <SelectCard
            key={c.merchant}
            title={c.merchant}
            description={`${rupees(c.fourWeekSpend)} over the last four weeks`}
            selected={draft.swearJar.merchant === c.merchant}
            divide={i > 0}
            onPress={() =>
              setDraft((prev) =>
                prev === null
                  ? prev
                  : { ...prev, swearJar: { ...prev.swearJar, merchant: c.merchant } },
              )
            }
          />
        ))}
        {view.swearJarCandidates.length === 0 && (
          <View className="px-lg py-lg">
            <Type role="body" tone="soft">
              Nothing in the last four weeks repeats often enough to be worth a jar. Come back when
              there is more statement to read.
            </Type>
          </View>
        )}
      </Card>
    </View>
  )
}

function PaydaySaver({ draft, view, setDraft, custom, setCustom }: ControlProps) {
  const percent = draft.paydaySaver.percent
  const regular = view.payday.stability === 'regular'
  const own = custom || (percent > 0 && !PERCENT_PRESETS.some((p) => p === percent))
  const perPayday = (pct: number) => rupees(Math.round((view.payday.monthly * pct) / 100))
  const setPercent = (next: number) =>
    setDraft((prev) =>
      prev === null ? prev : { ...prev, paydaySaver: { ...prev.paydaySaver, percent: next } },
    )

  return (
    <View>
      <Type role="label" tone="mid">
        Save from this income
      </Type>
      {/* Cleo ask the customer to type their employer and confirm when they are paid. We
          refuse to: the categoriser already found the salary credit, it is the same figure
          the budget is built on, and asking someone to re-enter what their own statement says
          is asking them to create a second version of it that can disagree with the first.
          So this is a read-out with a way through to the lines it was read from. */}
      <Card className="mt-sm">
        <SettingRow
          glyph="paycheck"
          title="Your salary"
          detail={
            regular
              ? `Every month on the ${view.payday.payDay}th · next ${shortDate(view.payday.nextPayDate, view.asOf)}`
              : 'Irregular — both the amount and the day move'
          }
          value={rupees(view.payday.monthly)}
          onPress={() => router.push('/statement')}
        />
      </Card>

      {!regular ? (
        <Type role="caption" tone="danger" className="mt-md">
          A payday saver needs a payday. Your credits do not land on a steady day or for a steady
          amount yet, so there is nothing for this to ride on — set & forget does the same job on a
          schedule you control.
        </Type>
      ) : (
        <View>
          <Type role="label" tone="mid" className="mt-xl">
            When I get paid, save this much
          </Type>
          <Card className="mt-sm overflow-hidden">
            {PERCENT_PRESETS.map((p, i) => (
              <SelectCard
                key={p}
                title={`${p}%`}
                description={`${perPayday(p)} every payday`}
                selected={!own && percent === p}
                divide={i > 0}
                onPress={() => {
                  setCustom(false)
                  setPercent(p)
                }}
              />
            ))}
            <SelectCard
              title="Set your own"
              description="Choose how much of it to set aside"
              selected={own}
              divide
              onPress={() => setCustom(true)}
            />
          </Card>

          {own && (
            <View className="mt-lg">
              <Chips options={CUSTOM_PERCENT_CHIPS} value={percent} onChange={setPercent} />
              <Type role="caption" tone="faint" className="mt-md">
                {perPayday(percent)} every payday, out of {rupees(view.payday.monthly)}.
              </Type>
            </View>
          )}
        </View>
      )}
    </View>
  )
}
