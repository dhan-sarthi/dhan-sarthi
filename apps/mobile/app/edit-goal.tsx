// Set your target — the one number in the Save flow that is the customer's to move, under the one
// choice that is theirs to make: which goal it is.
//
// Cleo put three editable fields on this screen: the goal's name, its target, and the date
// they want to hit it by. Ours has the same three rows, and neither the name nor the date can
// be typed into, and the reason is not that they were hard.
//
// **The name is the roadmap's; the choice is the customer's.** A goal here is not a label on a
// jar — it is the stage the ladder is sequenced around, the thing `roadmapVersion` is cut against
// and the reason the engine puts the emergency fund before the SIP. Letting someone rename
// "Emergency fund" to "Goa" on a settings sheet would leave the plan reasoning about one thing and
// the app printing another. So the row shows what the roadmap calls it and opens the one choice
// the roadmap is built on: the five goal kinds the ladder can plan, the same five onboarding asks
// about. Picking another re-cuts the plan around it — "Goal chosen by the customer" on the
// record — and takes the target typed for the old goal with it. A kind with nothing to aim at
// (nothing costly owed, no gap in the cover, savings already past three months) is listed with
// the reason and not offered: the engine would keep its own goal, and the receipt would say
// otherwise.
//
// **The date is derived, not chosen.** Cleo's date picker sets an intention; ours would have
// to set a *funding rate*, because a target date the money cannot reach is the one number in
// a planning app that must never be allowed to lie. "On track for" is asked of the route,
// because the route is what puts money towards the goal — the Plan tab's hero prints the same
// date. It used to be asked of the save hacks' inflow, which told a customer paying ₹21,516 a
// month off a card that nothing goes in and a save hack would help; a save hack does not pay
// down a card. Per goal (`trackOf`): a buffer lands when the route's monthly covers what the
// balance does not, so it moves the moment the stepper does; a growth goal keeps its date and
// asks whether what goes in reaches the new figure; a payoff clears when its balance does,
// which the target does not move. With nothing going in there is no date, and the row says so
// rather than borrowing the goal's.
//
// **The target is theirs.** `PATCH /api/v1/session/goal` takes it, and the next `/view` cuts a
// new roadmap version with "Target changed by the customer" on it, so the change is on the
// record rather than applied quietly. The receipt is a toast on the screen the customer goes
// back to, where the new figure is already counting into place.
//
// It goes with the kind of the goal it was typed on. A target belongs to the stored kind, and the
// plan can be on a different one — a safety net chosen with the buffer already past three months
// leaves the plan on the long game. Sent alone, a figure typed on the long game would have been
// stored as the safety net's and sprung onto it the month the buffer dipped; sent beside the kind
// on screen, it pins that kind to the figure.
//
// The pot is read with its three states kept apart. A failed read used to be swallowed into
// "no pot", which drew a ₹0 goal with a live Save button under it — a screen inviting someone
// to overwrite a target it had never seen.
//
// The floor under the stepper is what is already in the pot. A target below the balance is
// not a smaller goal, it is a completed one, and a settings screen is the wrong place to
// discover that by accident.
import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '~/ui/Screen'
import { leave } from '~/ui/NavRow'
import { Type } from '~/ui/Text'
import { Card } from '~/ui/Card'
import { Button } from '~/ui/Button'
import { Note } from '~/ui/Note'
import { SettingRow } from '~/ui/SettingRow'
import { AmountStepper } from '~/ui/AmountStepper'
import { RetryLine } from '~/ui/SnapshotScroll'
import { Tap } from '~/ui/Tap'
import { Sheet } from '~/ui/Sheet'
import { SelectCard } from '~/ui/SelectCard'
import { useToast } from '~/ui/Toast'
import { GOALS, type GoalKind } from '~/state/onboarding'
import { useSnapshot } from '~/state/snapshot'
import { usePayload } from '~/state/payload'
import { duration } from '~/lib/duration'
import { rupees, shortDate } from '~/lib/money'
import { api } from '~/api/client'
import { addMonths, elapsedMonths, fundingRatePct, requiredMonthly, suggestGoal } from '@dhan/core'
import type { SavePot, View as ViewModel } from '@dhan/contracts'

/** Nothing below this is a goal worth cutting a roadmap version for. */
const MIN_TARGET = 1_000

/**
 * Why the plan cannot be built around a kind for this customer: the three that can have nothing
 * to aim at, in the terms `suggestGoal` falls back on them. A payoff is the expensive debt or
 * nothing — a loan at an ordinary rate is already being cleared by its instalment.
 */
function nothingToAimAt(kind: GoalKind, snapshot: ViewModel['snapshot']): string | null {
  switch (kind) {
    case 'emergency_fund':
      return 'Your savings already cover three months'
    case 'debt_payoff':
      return snapshot.debt.total > 0
        ? 'Nothing costly to clear. Your EMIs are paying it off'
        : "You don't owe anything to clear"
    case 'protection':
      return 'No gap in your cover to close'
    default:
      return null
  }
}

/** `duration` says "This month" for one, which reads wrongly ahead of "at ₹X a month". */
function span(months: number): string {
  return months === 1 ? '1 month' : duration(months)
}

/** The "On track for" row's value, the line under the stepper, and whether a save hack helps. */
type Track = { value: string; line: string; hack: boolean }

const NOT_YET = 'Not yet'

/**
 * When the target in the stepper lands, asked of the route's goal stage — the same stage, and
 * the same arithmetic, as the Plan tab's hero, so the two screens print one date.
 *
 * - A stage up to the goal whose payment is under its interest has no end, and nothing after it
 *   has a date either.
 * - A buffer: what the balance does not cover, over what the route puts in a month, from the
 *   day the stage starts. The engine's own sum, run to this target rather than to its three
 *   months, so it moves with the stepper. Where that lands after the goal's own date, the line
 *   is what more a month lands it on that date — the Plan tab's shortfall, with the date named,
 *   because this screen does not print it — and it shrinks as the stepper comes down until the
 *   months come back.
 * - A growth goal keeps the customer's date; what moves is whether what goes in reaches the new
 *   figure by then, at the rate the engine funds it at.
 * - A payoff, or cover: the stage's own date. The target does not move a card balance.
 *
 * The pot's own inflow is the fallback, for a moment with no route to ask.
 */
function trackOf(
  view: ViewModel | null,
  pot: SavePot,
  target: number,
  changed: boolean,
  asOf: string | null,
): Track {
  const stages = view?.roadmap.stages ?? []
  const stage = [...stages].reverse().find((s) => s.isGoal)
  if (view === null || stage === undefined || asOf === null) return potTrack(pot, target, asOf)
  const { roadmap } = view
  const upto = stages.slice(0, stages.indexOf(stage) + 1)
  const stuck = upto.find((s) => s.monthsToComplete === 0)
  if (stuck !== undefined) {
    return {
      value: NOT_YET,
      // The other stage with no end is cover the shelf has no policy to place for.
      line:
        stuck.kind === 'get_cover'
          ? 'No policy I can place yet.'
          : `Doesn't clear at ${rupees(stuck.monthly)} a month.`,
      hack: false,
    }
  }
  const dated = (date: string, monthly: number): Track => ({
    value: shortDate(date, asOf),
    line: `${span(Math.max(1, elapsedMonths(asOf, date)))} at ${rupees(monthly)} a month.`,
    hack: false,
  })

  if (stage.kind === 'build_buffer' && stage.monthly > 0) {
    const left = Math.max(0, target - view.snapshot.balances.total)
    if (left === 0) return { value: 'Already there', line: 'Your balance covers it.', hack: false }
    const lands = addMonths(stage.startsOn, Math.max(1, Math.ceil(left / stage.monthly)))
    const due = roadmap.goal.targetDate
    // Months from the stage's start to the goal's date; none, and no monthly lands it there.
    const months = elapsedMonths(stage.startsOn, due)
    const needed = months > 0 ? Math.ceil(left / months) : 0
    if (lands > due && needed > stage.monthly) {
      // The date held together: at 320pt the line broke between "1 Sept" and "2028".
      const by = shortDate(due, asOf).replace(/ /g, '\u00a0')
      return {
        value: shortDate(lands, asOf),
        line: `${rupees(needed - stage.monthly)} more a month lands it by ${by}.`,
        hack: false,
      }
    }
    return dated(lands, stage.monthly)
  }

  if (stage.kind === 'grow') {
    if (stage.monthly <= 0) {
      return {
        value: NOT_YET,
        line: 'Nothing goes in yet.',
        hack: roadmap.goal.kind === 'emergency_fund',
      }
    }
    const p = roadmap.projection
    // What the new figure needs a month, where it can be asked; the engine's own shortfall for
    // the figure it was cut against.
    const needed =
      changed && p !== null
        ? requiredMonthly(target, p.years, fundingRatePct(roadmap.goal, p.years), p.existingCorpus)
        : null
    const short =
      needed === null ? (changed ? null : roadmap.shortfallMonthly) : needed - stage.monthly
    if (short === null) {
      return { value: NOT_YET, line: 'Save, and your plan works out the new monthly.', hack: false }
    }
    return short > 0
      ? { value: NOT_YET, line: `${rupees(short)} a month short of the target.`, hack: false }
      : dated(stage.completesOn, needed ?? stage.monthly)
  }

  return stage.monthsToComplete > 0 && stage.monthly > 0
    ? dated(stage.completesOn, stage.monthly)
    : potTrack(pot, target, asOf)
}

/** The save hacks' inflow into the pot, over what the pot still needs. */
function potTrack(pot: SavePot, target: number, asOf: string | null): Track {
  const inflow = pot.monthlyInflow
  if (inflow <= 0 || asOf === null) {
    return { value: NOT_YET, line: 'Nothing goes in yet.', hack: true }
  }
  const months = Math.max(1, Math.ceil(Math.max(0, target - pot.saved) / inflow))
  return {
    value: shortDate(addMonths(asOf, months), asOf),
    line: `${span(months)} at ${rupees(inflow)} a month.`,
    hack: false,
  }
}

export default function EditGoal() {
  // The pot is this screen's own payload, read here; the snapshot underneath it is the
  // provider's, and `refresh` is how the tabs are told the target moved.
  const { data: view, state: viewState, refresh } = useSnapshot()
  const goal = usePayload(api.save)
  const toast = useToast()
  // Null until the customer moves it, so the screen can tell "they chose this figure" from
  // "this is what the roadmap says" without keeping a second copy of the original.
  const [target, setTarget] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retrying, setRetrying] = useState(false)
  // The goal picker: whether it is open, the kind selected in it, and its own save.
  const [picking, setPicking] = useState(false)
  const [kind, setKind] = useState<GoalKind | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [chooseFailed, setChooseFailed] = useState(false)

  const pot = goal.data?.pot ?? null
  const asOf = goal.data?.asOf ?? view?.snapshot.asOf ?? null
  const floor = Math.max(MIN_TARGET, Math.ceil(pot?.saved ?? 0))
  const current = pot === null ? null : Math.max(floor, target ?? pot.target)
  const changed = pot !== null && target !== null && current !== pot.target
  // The date is the route's, so the screen waits for the route as well as the pot — drawn from
  // the pot alone first, it said "Nothing goes in yet" and then changed its mind. A route that
  // cannot be read leaves the pot's own arithmetic, which is still true of the pot.
  const ready = pot !== null && (view !== null || viewState === 'error')
  const track = pot === null || current === null ? null : trackOf(view, pot, current, changed, asOf)
  // The kind the plan is for now: what the picker opens on, and the one choice that saves nothing.
  const planned = view?.goal.kind ?? null
  // Whether the engine would build the plan around a kind, asked of the function the server asks.
  // With no route to ask it of, every kind is offered and the server decides.
  const plannable = (k: GoalKind): boolean =>
    view === null || suggestGoal(view.snapshot, view.meta.asOf, null, null, k).kind === k

  const close = () => leave('/(tabs)/plan')

  async function commit() {
    if (!changed || current === null) return
    setSaving(true)
    setFailed(false)
    try {
      // With the kind on screen, so the figure is stored for the goal it was typed on.
      await api.setGoal(
        planned === null ? { targetAmount: current } : { kind: planned, targetAmount: current },
      )
      // Shown before leaving: the host sits above the navigator, so the toast lands on the
      // screen underneath rather than going down with this one.
      toast.show(`Target set to ${rupees(current)}`)
      // The tabs are still mounted underneath, and the roadmap, the pot card and every figure
      // derived from the target are showing the old one. Not awaited: the Plan tab counts the
      // new figure in when it lands, which is the receipt the toast points at.
      void refresh()
      close()
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const pick = () => {
    setKind(planned)
    setChooseFailed(false)
    setPicking(true)
  }

  async function choose() {
    if (kind === null || kind === planned) return
    setChoosing(true)
    setChooseFailed(false)
    try {
      await api.setGoal({ kind })
      // The target's receipt, for the same reasons: shown before leaving, with the plan refreshed
      // underneath and not awaited — the Plan tab takes the route re-cut around the goal when it
      // lands. Only kinds the plan can be built around are offered, so this sentence is true.
      const said = GOALS.find((g) => g.kind === kind)?.readBack ?? 'your new goal'
      toast.show(`Now working towards ${said}`)
      void refresh()
      setPicking(false)
      close()
    } catch {
      setChooseFailed(true)
    } finally {
      setChoosing(false)
    }
  }

  const retry = () => {
    setRetrying(true)
    void goal.reload().finally(() => setRetrying(false))
  }

  return (
    <Screen
      onClose={close}
      title="Set your target"
      subtitle="The target is yours to move. The name and the date come out of your plan."
      footer={
        <>
          {failed ? (
            <Type
              role="caption"
              tone="danger"
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              className="mb-sm text-center"
            >
              Couldn&apos;t save. Try again.
            </Type>
          ) : null}
          <Button label="Save" onPress={() => void commit()} loading={saving} disabled={!changed} />
        </>
      }
    >
      {!ready || pot === null || track === null ? (
        goal.state === 'error' ? (
          <View className="mt-xl">
            <RetryLine compact message="Couldn't read your goal." onRetry={retry} busy={retrying} />
          </View>
        ) : (
          <Type role="body" tone="mid" className="mt-xl">
            Reading your goal…
          </Type>
        )
      ) : (
        <>
          <Card className="mt-xl">
            {/* The name goes under the title rather than beside it: a goal is a sentence
                ("Clear the expensive debt"), and the trailing slot is sized for a figure. The
                date goes under its title too — at 320pt the trailing slot cut "1 Aug 2027" to
                "1 Aug 2…". A row's label is its title alone, so each fact is also its `state`,
                which VoiceOver reads as the row's value; as a detail it was never said. */}
            <SettingRow
              glyph="target"
              title="Goal"
              detail={pot.purpose}
              state={pot.purpose}
              accessibilityHint="Choose what your plan is for"
              onPress={pick}
            />
            <SettingRow
              glyph="calendar"
              title="On track for"
              detail={track.value}
              state={track.value}
              accessibilityHint="Shows the numbers on your plan"
              onPress={() =>
                router.dismissTo({ pathname: '/(tabs)/plan', params: { pane: 'projection' } })
              }
              divide
            />
          </Card>

          <Type role="label" tone="mid" className="mt-xl">
            I want to reach
          </Type>
          <View className="mt-sm">
            <AmountStepper
              value={current ?? floor}
              onChange={setTarget}
              min={floor}
              format={rupees}
              size="lg"
              label="Target"
            />
          </View>

          <Type role="label" tone="mid" className="mt-md text-center">
            {track.line}
          </Type>
          {/* With nothing going into a savings goal, the date above cannot move, and the stepper
              is a number with no clock behind it. The save hacks are where that money starts —
              and only that money: a save hack does not pay down a card. */}
          {track.hack ? (
            <Tap
              accessibilityRole="link"
              accessibilityLabel="Turn on a save hack"
              haptic="none"
              dim
              onPress={() => router.push('/save-hacks')}
              className="min-h-target justify-center self-center"
            >
              <Type role="body" weight="semibold" tone="mid" className="underline">
                Turn on a save hack
              </Type>
            </Tap>
          ) : null}

          {floor > MIN_TARGET ? (
            <Type role="label" tone="mid" className="mt-sm text-center">
              Can&apos;t go under {rupees(floor)} — that&apos;s what&apos;s already in the pot.
            </Type>
          ) : null}

          <View className="mt-xxl">
            <Note>
              Moving the target cuts a new version of your plan, recorded as changed by you. Every
              later stage shifts with it; the Plan tab shows what moved.
            </Note>
          </View>

          <Sheet
            open={picking}
            onClose={() => setPicking(false)}
            title="What are you working towards?"
            subtitle="Your plan is rebuilt around it. What has to come first still comes first."
            footer={
              <>
                {chooseFailed ? (
                  <Type
                    role="caption"
                    tone="danger"
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                    className="mb-sm text-center"
                  >
                    Couldn&apos;t save. Try again.
                  </Type>
                ) : null}
                <Button
                  label="Save"
                  onPress={() => void choose()}
                  loading={choosing}
                  disabled={kind === null || kind === planned}
                />
              </>
            }
          >
            <Card
              accessibilityRole="radiogroup"
              accessibilityLabel="What you're working towards"
              className="overflow-hidden"
            >
              {GOALS.map((g, i) => {
                const open = plannable(g.kind)
                const closed = open || view === null ? null : nothingToAimAt(g.kind, view.snapshot)
                return (
                  <SelectCard
                    key={g.kind}
                    title={g.title}
                    description={closed ?? g.description}
                    selected={kind === g.kind}
                    disabled={!open}
                    divide={i > 0}
                    onPress={() => {
                      setKind(g.kind)
                      setChooseFailed(false)
                    }}
                  />
                )
              })}
            </Card>
          </Sheet>
        </>
      )}
    </Screen>
  )
}
