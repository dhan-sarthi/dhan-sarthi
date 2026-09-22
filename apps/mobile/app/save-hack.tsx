// One save hack, configured. All five of them, on one screen.
//
// Cleo ship five separate screens and they are the same screen five times: back chevron, display
// title, a line of what the hack is for, the switch card, the hack's own control, the ⓘ note,
// Save. Only the middle band differs. Five files would mean five copies of the read, the patch
// builder, the note and the toast, and five places to forget one of them. So there is one file
// and a `Control` switch, and the skeleton is shared by construction.
//
// The route is flat with `?id=` rather than `/save-hack/[id]`, because every pushed screen in this
// app is a flat file with query params. `id` is checked against `SAVE_HACK_IDS` before anything
// reads it — a deep link can carry anything — and a link that matches nothing gets an empty state
// with the way to the list, not a blank screen with a Save button on it. The editor is keyed by
// the id, so "Open Set & forget instead" starts a clean editor rather than inheriting the payday
// saver's half-made edits.
//
// **The switch card says how the hack runs, in the engine's terms.** Round-ups and the swear jar
// land the same day as the purchase that caused them, Set & forget and Smart save land on
// Mondays, the payday saver on the salary credit — which is what `packages/core/src/save.ts`
// actually does. The card used to say round-ups "move in one transfer, not forty", which the
// engine has never done.
//
// **Save is live only when the configuration is both valid and changed.** Valid is the obvious
// half: a swear jar with no place is not a swear jar, and when it is not valid the screen says
// what is missing above the dead button instead of leaving the customer to guess. Changed is the
// half worth arguing: Cleo's captures show the button greyed on arrival, because nothing has been
// decided yet, and a live Save on an untouched screen invites a write that sets the hack to what
// it already is. Both sides of that comparison come out of `patchFor`, so the key order is
// identical and a string compare is a field compare.
//
// **The controls exist only while the switch is on.** A disabled amount under an off switch is a
// control the customer can see and cannot use. Off keeps the configuration in the draft, so
// turning the switch back on brings their last choice back. Round-ups is the one editor whose
// middle band is not a control but a figure — what the switch would have moved over the last four
// weeks — so it shows either way: off is exactly when the customer needs the number they are
// agreeing to. The payday saver on an income with no steady payday is held off instead: the
// screen says why, with the way to the hack that does the same job, and the Save button goes,
// because a switch that can never be saved on is a dead end the customer should not have to find
// by trying it.
//
// The switch card is Cleo's, mark and all — which is to say no mark, and a title that says what
// the switch does ("Round up every purchase") rather than repeating the hack's name, the way
// Cleo's "Repay gradually" sits under "Cash advance settings". The display title already names
// the hack; the same name again one line down said nothing the second time.
//
// **Each amount is chips and a dial together.** The chips are the four answers most people give;
// the dial beside them is the figure itself, for everyone else. It replaced an "Other" chip that
// opened a second control, which made the customer's own figure a mode to enter rather than a
// number to move.
//
// **The note under the controls is guidance, not a promise.** The engine runs each hack on its
// own and nothing holds their sum to what the month can spare; the old note said everything was
// "held to" that figure, and the ledger would have contradicted it the first week two hacks ran
// together. It now says what is spare and asks the customer to stay under it.
//
// A save shows its toast and leaves, and the list it lands on re-reads on focus, so the chip has
// flipped by the time the toast is read. Two figures are computed here rather than read off the
// wire: Smart save's `recommendedWeekly × SMART_SAVE_FACTOR` and the payday saver's
// `monthly × pct`. Both are display arithmetic the server repeats when it accrues.
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { NavRow, leave } from '~/ui/NavRow'
import { Type } from '~/ui/Text'
import { Card } from '~/ui/Card'
import { Note } from '~/ui/Note'
import { Chips } from '~/ui/Chips'
import { Count } from '~/ui/Count'
import { Button } from '~/ui/Button'
import { AskUday } from '~/ui/AskUday'
import { Reveal } from '~/ui/Reveal'
import { Section } from '~/ui/Section'
import { ToggleRow } from '~/ui/ToggleRow'
import { SettingRow } from '~/ui/SettingRow'
import { AmountStepper } from '~/ui/AmountStepper'
import { EmptyState, RetryLine } from '~/ui/SnapshotScroll'
import { useToast } from '~/ui/Toast'
import { layoutMove, useReducedMotion } from '~/ui/motion'
import { usePayload } from '~/state/payload'
import { useSnapshot } from '~/state/snapshot'
import { swearJarQuestion } from '~/lib/ask'
import { rupees, shortDate } from '~/lib/money'
import { api } from '~/api/client'
import {
  HACK_NAME,
  hackToast,
  invalidReason,
  isEnabled,
  ordinal,
  patchFor,
  withEnabled,
} from '~/lib/savehack'
import { SAVE_HACK_IDS, SMART_SAVE_FACTOR } from '@dhan/core'
import type { SaveHackId, SaveHacks, SaveView, SmartSaveLevel } from '@dhan/contracts'

/** Weeks in a month, the same 4.345 the engine divides a monthly surplus by. */
const WEEKS_PER_MONTH = 4.345

// What the hack is for (under the title), what the switch does (its title, which VoiceOver reads
// as its name) and how it runs (under the switch, read as its hint). The last is the engine's
// behaviour in plain words, not a pitch.
const COPY: Record<SaveHackId, { subtitle: string; switch: string; detail: string }> = {
  roundups: {
    subtitle: 'Saves the spare change from everything you buy.',
    switch: 'Round up every purchase',
    detail: 'Each purchase rounds up, and the difference moves to your goal the same day.',
  },
  set_forget: {
    subtitle: 'One amount, once a week. Nothing else to decide.',
    switch: 'Save every Monday',
    detail: 'The amount you pick moves to your goal every Monday.',
  },
  smart_save: {
    subtitle: 'I work out what you can spare each week from your spending.',
    switch: 'Save what you can spare',
    detail: 'The amount moves every Monday and follows your spending week to week.',
  },
  swear_jar: {
    subtitle: 'Pick the place you overdo. Spend there, and a set amount goes to your goal.',
    switch: 'Save when you give in',
    detail: 'Every spend at the place you pick moves your amount to the goal, the same day.',
  },
  payday_saver: {
    subtitle: 'Set aside part of every salary before the month gets to it.',
    switch: 'Save on payday',
    detail: 'Moved the day your salary lands — the one day the money is definitely there.',
  },
}

const WEEKLY_PRESETS: readonly number[] = [100, 250, 500, 1_000]
const PER_SPEND_PRESETS: readonly number[] = [20, 50, 100, 200]
const PERCENT_PRESETS: readonly number[] = [1, 3, 5, 10]
/** A fifth of a salary is already a savings plan; past it the dial stops. */
const MAX_PERCENT = 20

// Named against Normal, which is the figure the customer can actually spare: "Less" and "More"
// say which way the dial moves from it, where "Gentle" and "Tough" asked them to pick a mood.
const LEVELS: ReadonlyArray<{ value: SmartSaveLevel; label: string }> = [
  { value: 'gentle', label: 'Less' },
  { value: 'normal', label: 'Normal' },
  { value: 'tough', label: 'More' },
]

const percent = (n: number) => `${n}%`

export default function SaveHack() {
  const { id: raw } = useLocalSearchParams<{ id?: string }>()
  // Checked, not trusted: the generic describes what this screen is pushed with, and a deep link
  // can carry anything.
  const id = SAVE_HACK_IDS.find((h) => h === raw) ?? null

  if (id === null) {
    return (
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
        <StatusBar style="dark" />
        <NavRow onBack={() => leave('/save-hacks')} />
        <EmptyState
          glyph="sparkle"
          title="That link doesn't match a save hack"
          body="The five that exist are on the list."
          // Replace, not back: "See the list" has to land on the list, and the screen under a
          // bad link is whatever the customer came from.
          action={{ label: 'See the list', onPress: () => router.replace('/save-hacks') }}
        />
      </SafeAreaView>
    )
  }

  return <Editor key={id} id={id} />
}

type Edit = (change: (h: SaveHacks) => SaveHacks) => void

function Editor({ id }: { id: SaveHackId }) {
  // Read once, not on focus: the draft is built on top of it, and a refetch under a customer's
  // half-made edit would be the screen moving the ground they are standing on.
  const save = usePayload(api.save)
  const { refresh } = useSnapshot()
  const toast = useToast()
  const reduced = useReducedMotion()
  // The customer's edits, over the server's copy. Null until they touch something, so the
  // screen follows the read until then and never has to be seeded from an effect.
  const [edited, setEdited] = useState<SaveHacks | null>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const view = save.data
  const base = view?.hacks ?? null
  const draft = edited ?? base
  const copy = COPY[id]
  const name = HACK_NAME[id]
  const on = draft !== null && isEnabled(id, draft)
  const reason = draft !== null && view !== null ? invalidReason(id, draft, view) : null
  const changed =
    draft !== null &&
    base !== null &&
    JSON.stringify(patchFor(id, draft)) !== JSON.stringify(patchFor(id, base))
  const irregular = id === 'payday_saver' && view !== null && view.payday.stability !== 'regular'
  // A switch that can never be saved on is held off rather than left to fail at Save. One that is
  // already on stays movable, so it can still be turned off.
  const locked = irregular && base !== null && !isEnabled(id, base)

  // The whole `SaveHacks` block rather than this hack's slice, so `patchFor` and the comparison
  // with the server's copy take the same shape. Built on the latest edit, not the one this render
  // saw: the dial's hold-to-repeat fires faster than the screen re-renders.
  const edit: Edit = (change) => {
    setFailed(false)
    setEdited((prev) => {
      const from = prev ?? base
      return from === null ? prev : change(from)
    })
  }

  async function commit() {
    if (draft === null || view === null || reason !== null || !changed || saving) return
    setSaving(true)
    setFailed(false)
    try {
      await api.setSaveHack(patchFor(id, draft))
      // The Save pane and the plan read the inflow; they catch up on their own clock.
      void refresh()
      toast.show(hackToast(id, draft, rupees, view))
      leave('/save-hacks')
    } catch {
      setFailed(true)
      setSaving(false)
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow onBack={() => leave('/save-hacks')} />

      <ScrollView className="flex-1" contentContainerClassName="px-pad pb-xxl">
        <Type role="display">{name}</Type>
        <Type role="body" tone="mid" className="mt-sm">
          {copy.subtitle}
        </Type>

        <View className="mt-xl">
          <ToggleRow
            title={copy.switch}
            detail={copy.detail}
            value={on}
            onValueChange={(next) => edit((h) => withEnabled(id, h, next))}
            disabled={draft === null || saving || locked}
            busy={view === null && save.state === 'loading'}
          />
        </View>

        {view === null ? (
          save.state === 'error' ? (
            <View className="mt-lg">
              <RetryLine
                compact
                message="Couldn't read this save hack."
                onRetry={() => void save.reload()}
              />
            </View>
          ) : (
            <Type role="body" tone="mid" className="mt-lg">
              Reading…
            </Type>
          )
        ) : null}

        {irregular && view !== null ? <Irregular view={view} /> : null}

        {/* Round-ups' figure is a readout, not a control, so it stands whatever the switch says. */}
        {id === 'roundups' && view !== null && draft !== null ? (
          <RoundUps id={id} view={view} draft={draft} edit={edit} />
        ) : null}

        {on && view !== null && draft !== null && !irregular ? (
          <Reveal exiting>
            <Control id={id} view={view} draft={draft} edit={edit} />
            {/* Moves rather than jumps when the control above it grows — a warning line
                appearing under the amount, a place being chosen. */}
            <Animated.View layout={layoutMove(reduced)} className="mt-xl">
              <Note>{spareNote(view.recommendedWeekly)}</Note>
            </Animated.View>
          </Reveal>
        ) : null}
      </ScrollView>

      {/* Held off for good, there is nothing to save; the way forward is the button above. */}
      {locked ? null : (
        <View className="gap-md px-pad pt-md pb-sm">
          {failed ? (
            <RetryLine
              compact
              message="Couldn't save that. Try again."
              busy={saving}
              onRetry={() => void commit()}
            />
          ) : reason !== null ? (
            <Type role="caption" tone="danger">
              {reason}
            </Type>
          ) : null}
          <Button
            label="Save"
            onPress={() => void commit()}
            loading={saving}
            disabled={reason !== null || !changed}
          />
        </View>
      )}
    </SafeAreaView>
  )
}

/** What the month leaves spare, as advice. The engine does not hold the hacks to it. */
function spareNote(spare: number): string {
  return spare > 0
    ? `About ${rupees(spare)} a week is usually left after bills and your usual spending. Keep all your hacks together under that and saving never leaves you short.`
    : 'Nothing is spare after bills and your usual spending right now. Anything a hack moves would come out of money you need.'
}

type ControlProps = { id: SaveHackId; view: SaveView; draft: SaveHacks; edit: Edit }

function Control(props: ControlProps) {
  switch (props.id) {
    case 'roundups':
      // Its readout stands above, outside the switch; there is nothing more to reveal.
      return null
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
// has — a ₹100 round-up on a ₹120 auto fare is a second fare. What the screen owes them instead
// is the number they are agreeing to, read off their own last four weeks.
function RoundUps({ view, draft }: ControlProps) {
  const lastFourWeeks = view.cards.find((c) => c.id === 'roundups')?.lastFourWeeks ?? 0
  return (
    <Card className="mt-xl px-lg py-lg">
      <Count role="title" value={lastFourWeeks} format={rupees} />
      <Type role="body" tone="mid" className="mt-xxs">
        would have gone to {view.pot.purpose} over the last four weeks, rounding each purchase up to{' '}
        {rupees(draft.roundups.toNearest)}.
      </Type>
    </Card>
  )
}

function SetForget({ view, draft, edit }: ControlProps) {
  const weekly = draft.setForget.weekly
  const spare = view.recommendedWeekly
  return (
    <View>
      <Section title="How much each Monday" />
      <AmountPicker
        options={WEEKLY_PRESETS}
        value={weekly}
        onChange={(n) => edit((h) => ({ ...h, setForget: { ...h.setForget, weekly: n } }))}
        min={50}
        step={50}
        label="Weekly amount"
        caption="Every Monday"
      />
      <Type role="body" tone="mid" className="mt-md">
        About {rupees(Math.round(weekly * WEEKS_PER_MONTH))} a month into {view.pot.purpose}.
        {spare > 0 && weekly > spare
          ? ` That's more than the ${rupees(spare)} a week your month leaves spare.`
          : ''}
      </Type>
    </View>
  )
}

function SmartSave({ view, draft, edit }: ControlProps) {
  const level = draft.smartSave.level
  // The rupee figure, not the adjective: "More" is a direction, ₹5,720 a week is the decision.
  const weekly = Math.round(view.recommendedWeekly * SMART_SAVE_FACTOR[level])
  return (
    <View>
      <Section title="How much to save" />
      <View className="mt-sm">
        <Chips
          options={LEVELS}
          value={level}
          onChange={(l) => edit((h) => ({ ...h, smartSave: { ...h.smartSave, level: l } }))}
        />
      </View>
      <Card className="mt-lg px-lg py-lg">
        <Count role="title" value={weekly} format={rupees} />
        <Type role="body" tone="mid" className="mt-xxs">
          {weekly > 0
            ? `a week into ${view.pot.purpose}, every Monday.`
            : 'a week, until your month has something spare.'}
        </Type>
      </Card>
      <Type role="body" tone="mid" className="mt-md">
        Normal is exactly what you can spare. It&apos;s re-read every week, so it moves with your
        spending.
      </Type>
    </View>
  )
}

function SwearJar({ view, draft, edit }: ControlProps) {
  const jar = draft.swearJar
  const places = view.swearJarCandidates
  const chosen = places.find((p) => p.merchant === jar.merchant)
  // Uday cannot say which habits a jar "would catch" — nothing in his rules reads a habit by name.
  // He can total the chosen place's category (or the top habit's, before one is picked) for last
  // month and name where most of it went, which is where a jar would bite.
  const { data } = useSnapshot()
  const question = swearJarQuestion(jar.merchant, data?.snapshot.discretionary.topHabits ?? [])
  // A jar set on a place that has since dropped out of the top five still fires on it, so the
  // place stays on the row — lit — rather than the row claiming nothing is chosen.
  const names = [
    ...places.map((p) => p.merchant),
    ...(jar.merchant !== null && chosen === undefined ? [jar.merchant] : []),
  ]
  return (
    <View>
      <Section title="Every time I spend at" />
      {names.length === 0 ? (
        <Type role="body" tone="mid" className="mt-sm">
          Nothing in the last four weeks repeats often enough to be worth a jar. Come back when
          there&apos;s more statement to read.
        </Type>
      ) : (
        // Cleo open a searchable picker here. Ours is the places themselves, because they arrive
        // ranked by four-week spend off the customer's own statement and the one worth a jar is
        // in the top handful by definition. Wrapped rather than scrolled: five names are a set to
        // be read whole, and a scroller opened on the chosen one hid the biggest spend off-screen.
        <>
          <View className="mt-sm">
            <Chips
              wrap
              options={names.map((m) => ({ value: m, label: m }))}
              value={jar.merchant}
              onChange={(m) => edit((h) => ({ ...h, swearJar: { ...h.swearJar, merchant: m } }))}
            />
          </View>
          <Type role="body" tone="mid" className="mt-md">
            {chosen
              ? `${rupees(chosen.fourWeekSpend)} spent there over the last four weeks.`
              : jar.merchant !== null
                ? `${jar.merchant} isn't among your biggest spends right now.`
                : 'Your biggest spends over the last four weeks, biggest first.'}
          </Type>
        </>
      )}
      {question === null ? null : (
        <AskUday question={question} label="Ask Uday where a jar would bite" className="mt-sm" />
      )}

      <Section title="Put this much aside" />
      <AmountPicker
        options={PER_SPEND_PRESETS}
        value={jar.perSpend}
        onChange={(n) => edit((h) => ({ ...h, swearJar: { ...h.swearJar, perSpend: n } }))}
        min={10}
        step={10}
        label="Amount each time"
        caption="Each time"
      />
    </View>
  )
}

// Cleo ask the customer to type their employer and confirm when they are paid. We do not: the
// statement already has the salary credit, it is the figure the budget is built on, and asking
// someone to re-enter what their own statement says is asking for a second version of it that
// can disagree with the first. So the salary is a read-out with a way through to its lines.
function PaydaySaver({ view, draft, edit }: ControlProps) {
  const share = draft.paydaySaver.percent
  const { monthly, payDay, nextPayDate } = view.payday
  return (
    <View>
      <Card className="mt-xl">
        <SettingRow
          glyph="paycheck"
          title="Your salary"
          detail={`Lands on the ${ordinal(payDay)} · next ${shortDate(nextPayDate, view.asOf)}`}
          value={rupees(monthly)}
          onPress={() => router.push('/statement')}
        />
      </Card>
      <Section title="Save this much of it" />
      <AmountPicker
        options={PERCENT_PRESETS}
        value={share}
        onChange={(n) => edit((h) => ({ ...h, paydaySaver: { ...h.paydaySaver, percent: n } }))}
        min={1}
        max={MAX_PERCENT}
        step={1}
        format={percent}
        label="Share of each salary"
        caption="Of each salary"
      />
      <Type role="body" tone="mid" className="mt-md">
        {rupees(Math.round((monthly * share) / 100))} on the {ordinal(payDay)} of every month,
        before it&apos;s spendable.
      </Type>
    </View>
  )
}

/** The payday saver on an income with no steady payday: the reason, and the hack that works. */
function Irregular({ view }: { view: SaveView }) {
  return (
    <View className="mt-xl">
      <Card>
        <SettingRow
          glyph="paycheck"
          title="Your income"
          detail="The amount and the day both move"
          value={rupees(view.payday.monthly)}
          onPress={() => router.push('/statement')}
        />
      </Card>
      <Type role="body" tone="mid" className="mt-lg">
        A payday saver needs a steady payday, and yours isn&apos;t yet. Set & forget does the same
        job every Monday.
      </Type>
      <Button
        size="sm"
        variant="secondary"
        label="Open Set & forget instead"
        haptic="none"
        className="mt-md"
        onPress={() => router.replace({ pathname: '/save-hack', params: { id: 'set_forget' } })}
      />
    </View>
  )
}

/**
 * An amount as chips and a dial: the usual answers one tap away, the customer's own figure one
 * press from wherever they are. The dial always shows the figure; a chip is lit only when the
 * figure is one of them, so moving the dial off ₹500 lets the ₹500 chip go.
 */
function AmountPicker({
  options,
  value,
  onChange,
  min,
  max,
  step,
  format = rupees,
  label,
  caption,
}: {
  options: readonly number[]
  value: number
  onChange: (next: number) => void
  min: number
  max?: number
  step: number
  format?: (n: number) => string
  /** What the figure is, for VoiceOver: "Weekly amount". */
  label: string
  /** The words beside the dial, saying when the figure applies: "Every Monday". */
  caption: string
}) {
  return (
    <View>
      {/* Seen whole, as on /deposit: at 320pt ₹100–₹1,000 do not fit one line, and a scrolled
          row cuts the first or last amount at the screen's edge. */}
      <View className="mt-sm">
        <Chips
          wrap
          options={options.map((n) => ({ value: n, label: format(n) }))}
          value={options.includes(value) ? value : null}
          onChange={onChange}
        />
      </View>
      <View className="mt-md flex-row items-center justify-between gap-md">
        <Type role="body" tone="mid" className="flex-1">
          {caption}
        </Type>
        <AmountStepper
          value={value}
          onChange={onChange}
          min={min}
          {...(max === undefined ? {} : { max })}
          step={step}
          format={format}
          size="sm"
          layout="inline"
          label={label}
        />
      </View>
    </View>
  )
}
