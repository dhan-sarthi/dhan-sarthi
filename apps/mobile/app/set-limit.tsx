// Set a spending limit — Cleo's "Set your limit", on our engine.
//
// Cleo ask for one number and then, behind a toggle, a limit per category. Both are real here:
// the headline writes `session.spendLimit`, and each category row writes a `CategoryCap`.
// `buildDailyPlan` reads both, so safe-to-spend on the next view is measured against what was set
// here and a breached category is named on Today.
//
// The one place we differ from Cleo, and it is the important one: **the limit is held to what the
// month can actually afford**. Cleo will let a customer set any number they like. Ours stores the
// figure they chose and applies the lower of it and their real headroom, because every number
// downstream is computed off it — an app that agreed a customer had ₹80,000 to spend when they
// have ₹22,000 would be the only thing in the room lying to them. The line under the figure says
// so the moment the figure passes the headroom, rather than the engine clamping in silence.
//
// It opens on what is already true. The limit and the caps are read off the session, so a
// customer who comes back finds their own numbers, not the month's headroom again. The category
// toggle starts on when caps exist, or when the screen was opened to set them: Budget settings'
// "Category limits" row sends `?caps=1`, and a transaction's "Set a limit for Food & dining"
// sends `?category=`, which also scrolls to that row and tints it until it is touched. Both are
// one-shot and cleared from the route once read.
//
// With the toggle on, each category shows its cap if it has one and its monthly average if not,
// and the average says so. A row becomes a cap when its figure is moved, and only caps that
// changed are written. That is where we part from Cleo's reading of the switch, on purpose: a cap
// here is an alarm — Today names a category that has passed its cap — and writing the average
// into every row would ring it in about half of them in an ordinary month, for categories the
// customer never touched. With the toggle off, the caps are cleared, because the switch says so.
// The headline is written either way, and the button names the amount it will write. The wire
// takes a positive limit only, so the stepper's floor is its own step rather than a ₹0 the server
// would refuse — and a month with nothing left over opens on that floor too, never on ₹0.
//
// Both steppers move on a ₹500 grid, as Cleo's move in round dollars. The month's headroom is an
// odd figure (₹71,707), so the first suggestion is it rounded down to a step: round, and never over
// what is left. A figure that is already off the grid — a limit or a cap saved earlier — is shown
// as saved and steps onto the grid on its first press (₹1,341 → ₹1,500), instead of dragging its
// tail through every press after (₹1,841, ₹2,341).
//
// The toggle is the whole row, as Cleo draw it, and the platform switch inside it is a picture of
// the state. A switch nested inside a pressable row is two controls: on the web the switch is its
// own input, so a click flipped the value twice and a screen reader found two switches. So the row
// carries the role, the name and the checked state, and the switch is held out of touch and out of
// the accessibility tree.
//
// A commit toasts and then leaves, in one handler, so the toast is drawn on the screen the
// customer lands on. A failed commit stays put and says so; the button is the way to try again.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, View, useWindowDimensions } from 'react-native'
import { useLocalSearchParams, useNavigation } from 'expo-router'
import { Screen } from '~/ui/Screen'
import { leave } from '~/ui/NavRow'
import { Type } from '~/ui/Text'
import { Tap } from '~/ui/Tap'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { Row } from '~/ui/Row'
import { Section } from '~/ui/Section'
import { Reveal } from '~/ui/Reveal'
import { Thinking } from '~/ui/Thinking'
import { AmountStepper } from '~/ui/AmountStepper'
import { SwitchMark, switchKeys } from '~/ui/ToggleRow'
import { MerchantMark } from '~/ui/MerchantMark'
import { OFFLINE, RetryLine } from '~/ui/SnapshotScroll'
import { useToast } from '~/ui/Toast'
import { cn } from '~/ui/cn'
import { useReducedMotion } from '~/ui/motion'
import { useSnapshot } from '~/state/snapshot'
import { api } from '~/api/client'
import { parseDay, rupees, shortDate } from '~/lib/money'
import { goingOutRows } from '~/lib/spend'
import { size, space } from '@dhan/design'
import type { SessionState } from '@dhan/contracts'

/** One press of either stepper, and the floor of both: the wire refuses a limit of ₹0. */
const STEP = 500

/**
 * Below this width a category's name cannot sit beside its stepper — at 320 it would have 40pt —
 * so the stepper drops under the name. Past a large text size the same is true at any width.
 */
const NARROW = 360
const LARGE_TEXT = 1.2

type CapWrite = { category: string; cap: number | null }

/** Where a view sits inside its parent, as `onLayout` reports it. */
type Box = { y: number; height: number }

export default function SetLimit() {
  const { data: view, state, refresh } = useSnapshot()
  const toast = useToast()
  const reduced = useReducedMotion()
  const { width, fontScale } = useWindowDimensions()
  const navigation = useNavigation<{
    setParams: (params: Record<string, string | undefined>) => void
  }>()
  const params = useLocalSearchParams<{ category?: string; caps?: string }>()
  // Read once, on the first render: the route is cleared as soon as it has been acted on, and a
  // later render must not see the category go and take the tint with it.
  const [asked] = useState(() => ({
    category:
      typeof params.category === 'string' && params.category.length > 0 ? params.category : null,
    caps: params.caps === '1',
  }))

  const [session, setSession] = useState<SessionState | null>(null)
  const [sessionRead, setSessionRead] = useState(false)
  const [edited, setEdited] = useState<number | null>(null)
  // Null until the customer touches the toggle; until then it follows what the session and the
  // route say, so the session landing a beat after the view can still switch it on.
  const [byCategory, setByCategory] = useState<boolean | null>(null)
  const [edits, setEdits] = useState<Record<string, number>>({})
  const [tinted, setTinted] = useState<string | null>(asked.category)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const scroller = useRef<ScrollView>(null)
  const viewport = useRef<number | null>(null)
  const switchBox = useRef<Box | null>(null)
  const listTop = useRef<number | null>(null)
  const rowBoxes = useRef<Record<string, Box>>({})
  const scrolled = useRef(false)

  useEffect(() => {
    let cancelled = false
    api
      .session()
      .then((next) => {
        if (!cancelled) setSession(next)
      })
      // A session that did not come back leaves the view's own copy of the limit to seed from,
      // and no caps. The screen still works; it just cannot show caps it could not read.
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setSessionRead(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (asked.category !== null || asked.caps) {
      navigation.setParams({ category: undefined, caps: undefined })
    }
  }, [asked, navigation])

  const plan = view?.plan ?? null
  const snapshot = view?.snapshot
  const asOf = snapshot?.asOf
  const months = Math.max(1, snapshot?.quality.monthsOfHistory ?? 1)

  const saved = useMemo(
    () => new Map((session?.caps ?? []).map((c) => [c.category, c.monthlyLimit] as const)),
    [session],
  )

  // Monthly averages, so a cap and the spending it limits are the same kind of number, rounded to
  // a hundred so the stepper moves between figures a person would say. A category capped earlier
  // that no longer makes the list keeps its row: hiding a live cap is how it gets forgotten.
  const categories = useMemo(() => {
    const listed = (snapshot?.discretionary.byCategory ?? [])
      .filter(([, total]) => total > 0)
      .slice(0, 8)
      .map(([name, total]): { name: string; average: number } => ({
        name,
        average: toHundred(total / months),
      }))
    const extra = [...saved.entries()]
      .filter(([name]) => !listed.some((c) => c.name === name))
      .map(([name, cap]) => ({ name, average: cap }))
    return [...listed, ...extra]
  }, [snapshot, months, saved])

  const affordable = plan?.safeToSpend.affordable ?? null
  const savedLimit = session?.spendLimit ?? plan?.safeToSpend.limit ?? null
  const ready = plan !== null && affordable !== null && sessionRead
  // The customer's figure, else the one they saved, else what the month already leaves them rounded
  // down to a step — the first press should adjust their budget, not begin it.
  const current = edited ?? savedLimit ?? floorToStep(affordable ?? 0)
  const over = ready && current > (affordable ?? 0)

  const known = asked.category !== null && categories.some((c) => c.name === asked.category)
  const on = byCategory ?? (saved.size > 0 || asked.caps || known)
  const capOf = (name: string, average: number): number => edits[name] ?? saved.get(name) ?? average
  const capped = (name: string): boolean => edits[name] !== undefined || saved.has(name)
  const caps = categories.filter((c) => capped(c.name))
  const sum = caps.reduce((total, c) => total + capOf(c.name, c.average), 0)

  // The same rows as Budget's "Going out this month", from the same facts, so the two screens
  // name the month's commitments alike.
  const reserved =
    snapshot && view
      ? goingOutRows(
          snapshot.commitments,
          view.roadmap.monthlyCommitment,
          snapshot.holdings.sipMonthly,
        )
      : []

  /** Every cap the customer moved away from what the session holds, or the clearing of all. */
  function capWrites(): CapWrite[] {
    if (!on) return [...saved.keys()].map((category) => ({ category, cap: null }))
    return Object.entries(edits).flatMap(([category, cap]) =>
      saved.get(category) === cap ? [] : [{ category, cap }],
    )
  }

  async function commit() {
    if (!ready || busy) return
    setBusy(true)
    setFailed(false)
    const writes = capWrites()
    try {
      await api.setSpendLimit(current)
      await Promise.all(writes.map((w) => api.setCategoryCap(w.category, w.cap)))
      // The tabs underneath are still showing the old month; they catch up behind the toast.
      void refresh()
      toast.show(toastLine(current, writes))
      leave('/(tabs)/spend')
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  // Brings the asked-for category into view once every measurement it needs has landed — the
  // scroller, the switch, the list and the row each report separately, in no fixed order.
  //
  // As far as it takes to show the whole row and no further: the heading and the switch above the
  // list are what say what the tinted row is for, so a row already on the first screen is not
  // scrolled at all, and a deeper one only until its foot clears the button. The one thing the
  // scroll will not do is stop with the switch cut in half; when the row cannot be shown with the
  // switch whole, the switch goes off the top entirely and the list starts the screen.
  function scrollToAsked() {
    if (scrolled.current || tinted === null) return
    const seen = viewport.current
    const toggle = switchBox.current
    const top = listTop.current
    const row = rowBoxes.current[tinted]
    if (seen === null || toggle === null || top === null || row === undefined) return
    scrolled.current = true
    const needed = top + row.y + row.height + space.xl - seen
    if (needed <= 0) return
    const halfCut = needed > toggle.y - space.md && needed < toggle.y + toggle.height
    const y = halfCut ? Math.min(toggle.y + toggle.height, top + row.y) : needed
    scroller.current?.scrollTo({ y, animated: !reduced })
  }

  const stacked = width < NARROW || fontScale > LARGE_TEXT
  const span =
    plan === null
      ? 'Reading your month…'
      : `${spanOf(plan.date, plan.safeToSpend.nextSalaryDate, asOf)} · yours to spend`

  return (
    <Screen
      onClose={() => leave('/(tabs)/spend')}
      scroll={false}
      footer={
        <View className="gap-md">
          {failed ? (
            <Type
              role="label"
              tone="danger"
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              Couldn't save. Try again.
            </Type>
          ) : null}
          <Button
            label={ready ? `Set the limit at ${rupees(current)}` : 'Set the limit'}
            loading={busy}
            disabled={busy || !ready}
            haptic="none"
            onPress={() => void commit()}
          />
        </View>
      }
    >
      {/* Screen's own scroller has no handle to scroll with, and the asked-for row needs one. The
          bleed puts the scroll bar back on the screen's edge; the gutter moves onto the content. */}
      <ScrollView
        ref={scroller}
        className="-mx-pad flex-1"
        contentContainerClassName="px-pad pt-xl pb-xxl"
        keyboardShouldPersistTaps="handled"
        onLayout={(e) => {
          viewport.current = e.nativeEvent.layout.height
          scrollToAsked()
        }}
      >
        <Type role="display">Set a spending limit</Type>
        <Type role="body" tone="mid" className="mt-sm">
          {span}
        </Type>

        {!ready ? (
          plan === null && state === 'error' ? (
            <RetryLine message={OFFLINE} onRetry={() => void refresh()} />
          ) : (
            <Thinking accessibilityLabel="Reading your month…" className="mt-xxl self-center" />
          )
        ) : (
          <>
            <View className="mt-xl">
              <AmountStepper
                value={current}
                min={STEP}
                step={STEP}
                format={rupees}
                size="lg"
                label="Spending limit"
                onChange={(next) => {
                  setEdited(onGrid(next, current))
                  setFailed(false)
                }}
              />
            </View>
            <Type role="body" tone={over ? 'danger' : 'mid'} className="mt-md text-center">
              {over
                ? `${rupees(affordable ?? 0)} is what's left after what's already taken out. We'll plan against that, not the number above.`
                : `${rupees(affordable ?? 0)} left after what's already taken out.`}
            </Type>

            <Tap
              accessibilityRole="switch"
              accessibilityLabel="Limit by category"
              accessibilityHint={`Based on your average over ${months} months`}
              accessibilityState={{ checked: on }}
              aria-checked={on}
              haptic="none"
              onPress={() => setByCategory(!on)}
              {...switchKeys(() => setByCategory(!on))}
              onLayout={(e) => {
                const { y, height } = e.nativeEvent.layout
                switchBox.current = { y, height }
                scrollToAsked()
              }}
              className="mt-xxl min-h-target flex-row items-center justify-between gap-lg"
            >
              <View className="flex-1">
                <Type role="heading" plain>
                  Limit by category
                </Type>
                <Type role="body" tone="mid" className="mt-xxs">
                  Based on your average over {months} months.
                </Type>
              </View>
              {/* ToggleRow's switch, so the app has one: the platform's own on a phone, the drawn
                  one on the web, the off track at 4.7:1 rather than a hairline that vanished. */}
              <SwitchMark on={on} />
            </Tap>

            {on ? (
              <View
                className="mt-md"
                onLayout={(e) => {
                  listTop.current = e.nativeEvent.layout.y
                  scrollToAsked()
                }}
              >
                {categories.length === 0 ? (
                  <Type role="body" tone="mid" className="py-md">
                    Not enough statement yet to average a category.
                  </Type>
                ) : (
                  categories.map((c, i) => (
                    <View
                      key={c.name}
                      onLayout={(e) => {
                        const { y, height } = e.nativeEvent.layout
                        rowBoxes.current[c.name] = { y, height }
                        scrollToAsked()
                      }}
                    >
                      <Reveal i={i}>
                        <CategoryRow
                          name={c.name}
                          value={capOf(c.name, c.average)}
                          average={!capped(c.name)}
                          stacked={stacked}
                          tinted={tinted === c.name}
                          onChange={(next) => {
                            const from = capOf(c.name, c.average)
                            setEdits((prev) => ({ ...prev, [c.name]: onGrid(next, from) }))
                            setFailed(false)
                            if (tinted === c.name) setTinted(null)
                          }}
                        />
                      </Reveal>
                    </View>
                  ))
                )}
                {categories.length === 0 ? null : (
                  <Type role="body" tone="mid" className="mt-sm">
                    {caps.length === 0
                      ? 'Move a figure to set a cap.'
                      : sum > current
                        ? `Caps add up to ${rupees(sum)}, more than the limit.`
                        : `Caps add up to ${rupees(sum)}.`}
                  </Type>
                )}
              </View>
            ) : null}

            {reserved.length === 0 ? null : (
              <>
                <Section title="Already taken out" />
                <Card className="mt-sm">
                  {reserved.map((r, i) => (
                    <Row
                      key={r.key}
                      label={r.label}
                      value={rupees(r.amount)}
                      {...(r.detail === undefined ? {} : { detail: r.detail })}
                      divide={i > 0}
                    />
                  ))}
                </Card>
              </>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

/**
 * One category and its cap: Cleo's row, a tinted plate, the name, and the compact stepper.
 *
 * The plate is the 36pt size, not the 40: beside a stepper whose plates are full 44pt targets, the
 * four points are what lets "Entertainment" stay one word at 375 instead of breaking in the middle.
 */
function CategoryRow({
  name,
  value,
  average,
  stacked,
  tinted,
  onChange,
}: {
  name: string
  value: number
  /** Not a cap yet: the figure is the category's average, and says so. */
  average: boolean
  stacked: boolean
  tinted: boolean
  onChange: (next: number) => void
}) {
  const head = (
    <>
      <MerchantMark merchant={null} category={name} size={size.plateMd} />
      <View className="flex-1">
        <Type role="body" plain>
          {name}
        </Type>
        {average ? (
          <Type role="caption" tone="mid">
            Your average
          </Type>
        ) : null}
      </View>
    </>
  )
  const stepper = (
    <AmountStepper
      size="sm"
      layout="inline"
      value={value}
      min={STEP}
      step={STEP}
      format={rupees}
      label={`${name} limit`}
      onChange={onChange}
    />
  )

  return (
    <View className={cn('-mx-sm rounded-md px-sm py-sm', tinted && 'bg-success/20')}>
      {stacked ? (
        <>
          <View className="flex-row items-center gap-md">{head}</View>
          <View className="mt-xs">{stepper}</View>
        </>
      ) : (
        <View className="flex-row items-center gap-sm">
          {head}
          {stepper}
        </View>
      )}
    </View>
  )
}

/** To the nearest ₹100, and never below it: a cap the stepper can move from in whole steps. */
function toHundred(n: number): number {
  return Math.max(100, Math.round(n / 100) * 100)
}

/** Down to a whole step, and never below the one step the wire will take. */
function floorToStep(n: number): number {
  return Math.max(STEP, Math.floor(n / STEP) * STEP)
}

/**
 * Where a press lands: the next ₹500 mark in the direction it moved. From a figure on the grid
 * that is exactly one step; from one off it (₹1,341), the nearest mark that way (₹1,500 or
 * ₹1,000). The stepper's own floor is a mark, so the clamp below it only ever holds it there.
 */
function onGrid(next: number, from: number): number {
  const mark = next > from ? Math.floor(next / STEP) : Math.ceil(next / STEP)
  return Math.max(STEP, mark * STEP)
}

/**
 * "1 Sept to 30 Sept": today to the last day before the next salary, which is the stretch this
 * limit covers — Cleo's "May 1 - May 31". Ending on payday itself would count that day twice, in
 * this month and in the one it starts. On the eve of payday the stretch is just today.
 */
function spanOf(today: string, payday: string, asOf: string | undefined): string {
  const eve = parseDay(payday)
  eve.setDate(eve.getDate() - 1)
  const last = isoDay(eve)
  const from = shortDate(today, asOf)
  return last > today ? `${from} to ${shortDate(last, asOf)}` : from
}

/** A local calendar day as the wire writes one, "2026-09-30". */
function isoDay(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function toastLine(limit: number, writes: CapWrite[]): string {
  const set = writes.filter((w) => w.cap !== null).length
  if (set > 0) return `Limit set · ${set} category ${set === 1 ? 'cap' : 'caps'}`
  if (writes.length > 0) return `Limit set to ${rupees(limit)} · category caps off`
  return `Limit set to ${rupees(limit)}`
}
