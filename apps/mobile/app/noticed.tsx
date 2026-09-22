// Everything the engine spotted — what the bell opens.
//
// Spend shows the top three because a home screen that lists eight findings is a to-do
// list, and the product's whole posture is that there is one thing worth doing today. The
// rest are not hidden, though — they are here, grouped by how much they matter and ordered
// within that by what they cost, with the evidence each was derived from.
//
// This is what the bell means. There are no push notifications in this build and inventing
// some would be dishonest; what a notification would have been about is exactly this list.
//
// Shaped like Cleo's notifications: a display title, a plain label over each group, and white
// cards carrying a mark on a plate, the sentence, and one pill that does something about it. Cleo
// groups by date; these are grouped by severity, because a finding has no date — it is true of
// the whole statement — and the ranking is what the customer came for. The severity is said
// twice, in the label over the group and in the colour of the plate, so it never rests on
// colour alone.
//
// The card itself is not a button. It used to be one that only toggled the evidence, which is
// a disclosure dressed as a destination. Now each card carries one pill, to the place it can be
// acted on — the debt pane, a limit, the cover shelf, the safety net, the savings pane — and the
// finding about talking to a person carries the bank's toll-free line, because a person is what
// it promises. The evidence stays one tap away under its own named control.
//
// Uday is asked once, at the foot, rather than on every card. Seven identical "Talk me through
// this" pills were a second row of noise under the real ones, and a headline is a statement, not
// a question: handed to Uday word for word, half of them came back unanswered. The questions at
// the foot are ones he answers, one per subject on this list, most severe first, worded by
// `lib/ask.ts` with each finding's own figures.
//
// A card says the thing to do, not the finding. The engine writes each finding as a statement
// ("You have a missed loan repayment on record."), and a statement is something to read. So the
// title is the action naming its amount and the line under it is one sentence of why, leading
// with the number (D13): "Cut ₹2,421 a month of fast food spending", then "30% of the ₹8,070 a
// month it costs". `copyOf` (lib/insight-copy.ts, shared with Spend's Smart insights) words them
// from the snapshot the finding came from, so every figure is still the engine's. The engine's
// sentence is not lost: it leads the evidence word for word, and it is still the key each card is
// filed under. A shape that module does not know keeps the engine's words rather than a guess.
//
// Every rupee figure on a card says what it is, and the total at the top adds up exactly the
// ones the cards print. A maturing deposit's and idle cash's monthly figures are left out of
// both: core guesses them at a better rate to break ties, and says they are never a promise.
import { useState } from 'react'
import { RefreshControl, ScrollView, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { router } from 'expo-router'
import { NavRow, leave } from '~/ui/NavRow'
import { Tap } from '~/ui/Tap'
import { Type } from '~/ui/Text'
import { Card } from '~/ui/Card'
import { Button } from '~/ui/Button'
import { Count } from '~/ui/Count'
import { Evidence } from '~/ui/Evidence'
import { Glyph, GlyphPlate, type GlyphName } from '~/ui/Glyph'
import { EmptyState } from '~/ui/SnapshotScroll'
import { AskUdayRows } from '~/ui/Suggestion'
import { useToast } from '~/ui/Toast'
import { SEVERITY } from '~/ui/severity'
import { layoutMove, useReducedMotion } from '~/ui/motion'
import { useSnapshot } from '~/state/snapshot'
import { IDBI_CARE } from '~/lib/idbi'
import { FIRST_THING, SAFE_TO_SPEND, leadQuestions, questionForInsight } from '~/lib/ask'
import { rupees } from '~/lib/money'
import { copyOf, type InsightCopy } from '~/lib/insight-copy'
import tokens, { color, size } from '@dhan/design'
import type { Insight } from '@dhan/contracts'

const ORDER: ReadonlyArray<Insight['severity']> = ['urgent', 'important', 'opportunity']

/** The mark on each card's plate: what the finding is about, drawn, not worded. */
const GLYPH_BY_KIND: Partial<Record<Insight['kind'], GlyphName>> = {
  expensive_debt: 'coins',
  missed_repayment: 'bell',
  protection_gap: 'shield',
  subscription_review: 'receipt',
  price_increase: 'receipt',
  habit_cost: 'basket',
  category_drift: 'basket',
  idle_cash: 'moneybag',
  deposit_maturing: 'moneybag',
  buffer_thin: 'gauge',
  emi_ending: 'calendar',
  human_handoff: 'uday',
}

/** A pill: a place in the app (`go`), or a line out of it (`href`). */
type Action = {
  label: string
  go?: () => void
  href?: string
  hint?: string
  /** What the toast says when the phone cannot open `href`. */
  failed?: string
}

const SEE_DEBT: Action = {
  label: 'See your debt',
  go: () => router.dismissTo({ pathname: '/(tabs)/spend', params: { pane: 'debt' } }),
}
const SET_LIMIT: Action = { label: 'Set a limit', go: () => router.push('/set-limit') }
const SEE_COVER: Action = {
  label: 'See cover',
  go: () => router.dismissTo({ pathname: '/(tabs)/protect', params: { pane: 'cover' } }),
}
const SEE_SAFETY_NET: Action = {
  label: 'See your safety net',
  go: () => router.dismissTo({ pathname: '/(tabs)/protect', params: { pane: 'buffer' } }),
}
const SEE_GROW: Action = {
  label: 'See Grow',
  go: () => router.dismissTo({ pathname: '/(tabs)/grow', params: { pane: 'save' } }),
}
const SEE_PLAN: Action = {
  label: 'See the plan',
  go: () =>
    router.dismissTo({
      pathname: '/(tabs)/plan',
      params: { pane: 'roadmap', stage: 'clear_debt' },
    }),
}
const CALL_IDBI: Action = {
  label: IDBI_CARE.label,
  href: IDBI_CARE.href,
  hint: IDBI_CARE.hint,
  failed: IDBI_CARE.failed,
}

function talkMeThrough(question: string): Action {
  return {
    label: 'Talk me through this',
    go: () => router.dismissTo({ pathname: '/(tabs)/uday', params: { ask: question } }),
  }
}

const LIMIT_KINDS = new Set<Insight['kind']>([
  'subscription_review',
  'price_increase',
  'habit_cost',
  'category_drift',
])
const COVER = new Set<Insight['suggests']>(['buy_term_cover', 'enrol_pmjjby', 'buy_health_cover'])
const SAVE = new Set<Insight['suggests']>(['open_sweep_in', 'start_ssp', 'move_to_liquid_fund'])

/**
 * Where a finding can be acted on. The kind decides first, because it says what the finding is
 * about; what the engine suggests decides only where the kind does not. A thin buffer goes to
 * the safety net, which is where months-covered is drawn against its target. The hand-off to a
 * person dials one — Uday is not a person, and handing him that sentence got no answer. A kind
 * the app has nowhere to send goes to Uday with a question he answers about it, or, for a kind
 * this build has never seen, with the one he always can: what comes first, and why.
 */
function actionFor(insight: Insight): Action {
  const { kind, suggests } = insight
  if (kind === 'human_handoff') return CALL_IDBI
  if (kind === 'expensive_debt' || kind === 'missed_repayment' || kind === 'emi_ending') {
    return SEE_DEBT
  }
  if (kind === 'buffer_thin') return SEE_SAFETY_NET
  if (LIMIT_KINDS.has(kind) || suggests === 'set_category_cap') return SET_LIMIT
  if (kind === 'protection_gap' || COVER.has(suggests)) return SEE_COVER
  if (kind === 'idle_cash' || kind === 'deposit_maturing' || SAVE.has(suggests)) return SEE_GROW
  if (suggests === 'pay_down_card') return SEE_PLAN
  return talkMeThrough(questionForInsight(insight) ?? FIRST_THING)
}

/**
 * The line under the sentence: how long is left, and — only where the card has not said it —
 * the figure the total counts, labelled with the total's own words. Unlabelled, a monthly figure
 * under a yearly one read as a contradiction.
 */
function metaOf(insight: Insight, copy: InsightCopy): string {
  const figure = rupees(copy.worth)
  const said = copy.title.includes(figure) || copy.why.includes(figure)
  const days = insight.deadlineDays
  return [
    copy.worth > 0 && !said ? `${figure} a month on the table` : null,
    days === undefined || copy.saysDays
      ? null
      : days <= 0
        ? 'Due today'
        : days === 1
          ? '1 day left'
          : `${days} days left`,
  ]
    .filter((part) => part !== null)
    .join(' · ')
}

const keyOf = (insight: Insight) => `${insight.kind}:${insight.headline}`

export default function Noticed() {
  const { data: view, state, refresh } = useSnapshot()
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)

  const insights = view?.insights ?? []
  const cards =
    view === null
      ? []
      : insights.map((insight) => ({ insight, copy: copyOf(insight, view.snapshot) }))
  const worth = cards.reduce((t, c) => t + c.copy.worth, 0)

  function toggle(key: string) {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function pull() {
    setRefreshing(true)
    void refresh().finally(() => setRefreshing(false))
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow onClose={() => leave('/(tabs)/spend')} />

      <ScrollView
        className="flex-1"
        contentContainerClassName="grow px-pad pb-xxl gap-md"
        refreshControl={
          <RefreshControl refreshing={refreshing} tintColor={color.inkSoft} onRefresh={pull} />
        }
      >
        <Type role="display">What I noticed</Type>

        {/* Three outcomes, three renderings, and `data` is tested before `state`. This
            screen used to branch on emptiness alone, so a read still in flight and a read
            that failed both said "nothing needs your attention" — a claim about the
            customer's money, made without having looked. Branching on `state` first was the
            other half of the same mistake: the module keeps a view standing when a refresh
            fails, so a failed pull on the tab underneath would blank the findings here while
            they were still on screen behind this one. The error arm is for having nothing,
            and it carries its own retry because pulling to refresh does nothing on the web. */}
        {view === null && state === 'error' ? (
          <EmptyState
            glyph="bell"
            title="Couldn't reach the bank"
            body="Nothing loaded."
            action={{ label: 'Try again', onPress: () => void refresh() }}
          />
        ) : view === null ? (
          <Type role="body" tone="mid">
            Reading what I found…
          </Type>
        ) : insights.length === 0 ? (
          <EmptyState
            glyph="bell"
            title="Nothing to act on"
            body="Nothing needs your attention right now. When something does, it lands here."
            action={{
              label: "Ask Uday what's safe to spend",
              onPress: () =>
                router.dismissTo({ pathname: '/(tabs)/uday', params: { ask: SAFE_TO_SPEND } }),
            }}
          />
        ) : (
          <>
            {worth > 0 && (
              <View className="mt-sm">
                <Count value={worth} format={rupees} role="display" plain id="noticed.total" />
                <Type role="body" tone="mid" className="mt-xs">
                  a month on the table, across {insights.length} things in your statement.
                </Type>
              </View>
            )}

            {ORDER.map((severity) => {
              const group = cards.filter((c) => c.insight.severity === severity)
              if (group.length === 0) return null
              return (
                <View key={severity} className="mt-lg gap-md">
                  {/* Cleo's date line over a run of notifications: the same size as the text
                      it heads, softer, and a heading for anyone moving by headings. */}
                  <Type role="body" tone="mid" accessibilityRole="header">
                    {SEVERITY[severity].label}
                  </Type>
                  {group.map(({ insight, copy }) => {
                    const key = keyOf(insight)
                    return (
                      <InsightCard
                        key={key}
                        insight={insight}
                        copy={copy}
                        asOf={view.snapshot.asOf}
                        open={open.has(key)}
                        onToggle={() => toggle(key)}
                      />
                    )
                  })}
                </View>
              )
            })}

            <AskUdayRows
              className="mt-xl"
              questions={leadQuestions(insights, view.snapshot.discretionary.topHabits)}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function InsightCard({
  insight,
  copy,
  asOf,
  open,
  onToggle,
}: {
  insight: Insight
  copy: InsightCopy
  asOf: string
  open: boolean
  onToggle: () => void
}) {
  const reduced = useReducedMotion()
  const toast = useToast()
  const action = actionFor(insight)
  const meta = metaOf(insight, copy)
  const failed = action.failed
  // The engine's own sentence leads the evidence wherever the card has reworded it.
  const evidence = copy.reworded ? [insight.headline, ...insight.evidence] : insight.evidence

  return (
    // The card grows into the evidence rather than jumping to its new height, and the cards
    // under it move down with it. A disclosure that snaps open makes the reader re-find the
    // line they were on; one that opens keeps it under their eye. Under Reduce Motion the card
    // simply takes its new height.
    <Animated.View layout={layoutMove(reduced)}>
      <Card className="px-lg py-lg">
        <View className="flex-row items-start gap-md">
          <GlyphPlate
            name={GLYPH_BY_KIND[insight.kind] ?? 'sparkle'}
            size={size.plateMd}
            fill={SEVERITY[insight.severity].plate}
          />
          <View className="flex-1">
            <Type role="heading">{copy.title}</Type>
            <Type role="body" tone="mid" className="mt-xs">
              {copy.why}
            </Type>
            {meta === '' ? null : (
              <Type role="caption" tone="mid" className="mt-sm">
                {meta}
              </Type>
            )}

            {/* One pill, on the text's left edge, so the card reads down a single line: the
                claim, then what to do about it. Above the evidence, so opening the evidence
                never moves it out from under the thumb. */}
            <Button
              size="sm"
              variant="secondary"
              haptic="none"
              label={action.label}
              className="mt-md"
              {...(action.go === undefined ? {} : { onPress: action.go })}
              {...(action.href === undefined ? {} : { href: action.href })}
              {...(action.hint === undefined ? {} : { accessibilityHint: action.hint })}
              {...(failed === undefined ? {} : { onOpenFail: () => toast.show(failed) })}
            />

            {/* Collapsed by default and one tap away. Always open would make every card four
                lines longer; never shown would make the claim unverifiable. */}
            {evidence.length === 0 ? null : (
              <>
                <Tap
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  accessibilityLabel={open ? 'Hide the evidence' : 'Show the evidence'}
                  haptic="none"
                  dim
                  onPress={onToggle}
                  className="mt-xs min-h-target flex-row items-center gap-xs self-start"
                >
                  <Type role="label" tone="brand">
                    {open ? 'Hide the evidence' : 'Show the evidence'}
                  </Type>
                  {/* An inline turn rather than a rotate utility NativeWind does not register
                      here — see the stage chevron in plan.tsx. Drawn at the line's own height. */}
                  <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
                    <Glyph name="chevronDown" size={tokens.type.label.leading} tint={color.brand} />
                  </View>
                </Tap>
                {open ? <Evidence lines={evidence} asOf={asOf} className="mb-xs" /> : null}
              </>
            )}
          </View>
        </View>
      </Card>
    </Animated.View>
  )
}
