// Smart insights — Cleo's carousel, on our engine's findings.
//
// Cleo paginate their insights one card at a time with a dot rail underneath, and each card
// ends in two controls: a way into the conversation about it, and a thumbs up/down that
// collapses into a thank-you once answered. Both are structural rather than decorative. The
// carousel is what lets the app show seven findings without a wall of cards, and the feedback
// is what stops an insight pool nobody can correct.
//
// Three measurements carry the whole component, and getting any of them wrong is what makes a
// carousel read as cheap:
//
// **The card is narrower than the page, so the next one shows.** Cleo's cards stop short of
// the right edge and the next card's corner sits in the gap — the only cue a first-time reader
// gets that there is more to swipe. The scroller is pulled full-bleed with `-mx-pad` and the
// gutter goes back on as content padding, so the first card starts on the screen's gutter and
// the last one ends on it. The page is measured on the scroller itself and seeded from the
// window width, so the **first painted frame is already correct**: a card with no width inside
// a horizontal scroller is laid out against an infinite main axis and resolves to max-content,
// which is one committed frame of a ~820pt card on a 393pt screen before the measurement lands.
//
// **Every card is as tall as the tallest.** A row of self-sizing cards steps up and down as
// you swipe and drags the dot rail with it. So each card reports its natural height, the
// tallest wins, and all of them take it as a floor. The spare height goes **under the words
// and above the controls**, which is where Cleo leave it: the pill and the feedback row are
// one block pinned to the bottom edge, so "Talk me through this" sits at the same height on
// every card and the thumbs sit a fixed step under it. Spent between the pill and the thumbs
// instead, the slack read as a missing line — an empty band between two controls on exactly
// the short cards a customer sees first. The floor only ever grows, so it is **reset whenever
// the insight set or the screen width changes**: without that, a list that gets shorter keeps
// the taller list's height and every card carries an empty band nothing will ever reclaim.
//
// **The page index is derived from the scroll offset, not from momentum.** `onMomentumScrollEnd`
// does not fire when a slow drag is released without throwing, and it does not fire when the
// OS clamps the offset because the content got shorter — both leave the rail pointing at a
// card that is not on screen. Reading `onScroll` covers all three, and the index is clamped to
// the list as well, because a clamp with no event is exactly the case the dots got wrong.
//
// Three differences from Cleo, all deliberate:
//
// **The card says the thing to do, with its number.** `findInsights` writes each finding as a
// statement; the card is worded by `copyOf` (lib/insight-copy.ts) instead — the action naming its
// amount, then one sentence of why — the same words /noticed prints for the same finding. Cleo's
// copy is a question ("Would you be open to…"); ours says what to do and lets the pill be the
// question. The engine's sentence is still the key the card is rated under.
//
// **"Talk me through this" hands Uday a question about the insight.** Not the headline: a
// headline is a statement, and handed to Uday word for word half of them came back "I am not
// sure what you are asking". The screen supplies the question (`lib/ask.ts`), worded so the
// engine answers on the card's subject. The finding about talking to a person gets the bank's
// own line instead, because a person is what it promises and Uday is not one; a finding with no
// question Uday can answer gets no pill at all rather than one that ends the flow.
//
// **Feedback stays in the app.** There is no route to record it and inventing one would mean a
// button that claims to teach a system it cannot reach. So the thank-you only promises what the
// app itself does: the screen that owns the answers draws a finding turned down at the back of
// this list the next time it opens. It says "this list" because that is all it moves — Noticed
// and Uday's opening still lead with the same finding, and the answers do not outlive the
// session. The answers live on that screen, not in here — Spend shows this
// carousel on two panes, and a rating kept inside the carousel was wiped by every pane switch.
// They are keyed by kind *and* headline: two price rises are two findings, and keyed on kind
// alone they shared one card's answer and one React key.
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  ScrollView,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { Type } from '~/ui/Text'
import { Tap } from '~/ui/Tap'
import { Button } from '~/ui/Button'
import { Glyph, GlyphPlate } from '~/ui/Glyph'
import { useToast } from '~/ui/Toast'
import { cn } from '~/ui/cn'
import { IDBI_CARE } from '~/lib/idbi'
import { copyOf } from '~/lib/insight-copy'
import { color, size, space } from '@dhan/design'
import { SEVERITY } from '~/ui/severity'
import type { Insight, Snapshot } from '@dhan/contracts'

export type Rating = 'up' | 'down'
export type Ratings = Readonly<Record<string, Rating>>

/** How much of the next card shows past the current one: the gap plus the peek. */
const PEEK = space.xxl + space.sm

/** The key a finding is rendered and rated under. */
export function insightKey(insight: Pick<Insight, 'kind' | 'headline'>): string {
  return `${insight.kind}:${insight.headline}`
}

export function InsightCarousel({
  insights,
  snapshot,
  questionOf,
  onAsk,
  rated,
  onRate,
}: {
  insights: readonly Insight[]
  /** The snapshot the findings came from: each card's figures are worded from it. */
  snapshot: Snapshot
  /** What "Talk me through this" asks about a finding, or null where Uday has no answer to it. */
  questionOf: (insight: Insight) => string | null
  /** Hands the question to Uday. Stable, so the memoised cards are not redrawn by it. */
  onAsk: (question: string) => void
  /**
   * The answers so far, by `insightKey`. A screen that shows the carousel in more than one place
   * owns them, so an answer outlives a pane switch; left out, the carousel keeps its own.
   */
  rated?: Ratings
  onRate?: (key: string, rating: Rating) => void
}) {
  const { width: windowWidth } = useWindowDimensions()
  const [measured, setMeasured] = useState(0)
  const [page, setPage] = useState(0)
  const [tallest, setTallest] = useState(0)
  const [own, setOwn] = useState<Ratings>({})
  const scroller = useRef<ScrollView>(null)

  const answers = rated ?? own
  const rateOwn = useCallback(
    (key: string, rating: Rating) =>
      setOwn((prev) => (prev[key] === undefined ? { ...prev, [key]: rating } : prev)),
    [],
  )
  const rate = onRate ?? rateOwn

  // The scroller is full-bleed, so the window width is the right page width from the first
  // frame; the measurement then replaces the assumption with the fact.
  const pageWidth = measured > 0 ? measured : windowWidth
  const cardWidth = Math.max(0, pageWidth - space.pad - PEEK)
  const stride = cardWidth + space.md

  /*
   * What this carousel is currently showing, and the trigger for starting over.
   *
   * The width is in it as well as the list: a rotation reflows every card, and a height floor
   * measured in portrait is simply wrong in landscape. Adjusted during render rather than in
   * an effect, so the frame that shows a new list is already using that list's own floor
   * instead of painting once with the previous one's.
   */
  const signature = `${pageWidth}|${insights.map(insightKey).join(',')}`
  const [shown, setShown] = useState(signature)
  if (shown !== signature) {
    setShown(signature)
    setTallest(0)
    setPage(0)
  }

  // The offset has to come back with it. State alone would leave the rail on card 1 while the
  // scroller stayed where the last list left it.
  useEffect(() => {
    scroller.current?.scrollTo({ x: 0, animated: false })
  }, [signature])

  // Only ever grows within one signature, and applied to every card, so the second pass
  // measures the floor it was just given and settles there. A functional update because
  // several cards lay out in the same frame and the last writer would otherwise win. Stable,
  // so the memoised cards are not redrawn by a sibling's measurement.
  const measure = useCallback((h: number) => setTallest((prev) => (h > prev ? h : prev)), [])

  if (insights.length === 0) return null

  const onScrollerLayout = (e: LayoutChangeEvent) => setMeasured(e.nativeEvent.layout.width)

  // Clamped, because the OS clamps the offset itself when the content gets shorter and does
  // so without firing anything — an index past the end lights no dot at all.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (stride <= 0) return
    const next = Math.round(e.nativeEvent.contentOffset.x / stride)
    setPage(Math.max(0, Math.min(insights.length - 1, next)))
  }

  const active = Math.min(page, insights.length - 1)

  return (
    <View>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={stride}
        decelerationRate="fast"
        onLayout={onScrollerLayout}
        onScroll={onScroll}
        scrollEventThrottle={16}
        className="-mx-pad"
        style={{ flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={{ paddingHorizontal: space.pad, gap: space.md }}
      >
        {insights.map((insight) => {
          const key = insightKey(insight)
          const copy = copyOf(insight, snapshot)
          return (
            <View key={key} style={{ width: cardWidth }}>
              <InsightPane
                insight={insight}
                title={copy.title}
                why={copy.why}
                rateKey={key}
                rating={answers[key] ?? null}
                minHeight={tallest}
                onRate={rate}
                onMeasure={measure}
                question={questionOf(insight)}
                onAsk={onAsk}
              />
            </View>
          )
        })}
      </ScrollView>

      {insights.length > 1 && (
        <DotRail
          count={insights.length}
          active={active}
          label={`Insight ${active + 1} of ${insights.length}`}
          className="mt-md"
        />
      )}
    </View>
  )
}

/**
 * The page dots under a carousel: Cleo's row of 8pt dots, the current one filled.
 *
 * One element for a screen reader, announcing where the reader is ("Account 2 of 4") and
 * announcing it again, politely, as the page changes; the dots themselves are drawing.
 */
export function DotRail({
  count,
  active,
  label,
  className,
}: {
  count: number
  active: number
  label: string
  className?: string
}) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      className={cn('flex-row items-center justify-center gap-sm', className)}
    >
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          className={cn('h-sm w-sm rounded-pill', i === active ? 'bg-ink' : 'bg-ink/20')}
        />
      ))}
    </View>
  )
}

/**
 * One finding. Memoised, because a swipe re-renders the carousel on every scroll event and seven
 * cards redrawn sixty times a second is the stutter under a finger; its props are a finding, a
 * rating and three stable callbacks, so a card redraws only when its own answer changes.
 */
const InsightPane = memo(function InsightPane({
  insight,
  title,
  why,
  rateKey,
  rating,
  minHeight,
  onRate,
  onMeasure,
  question,
  onAsk,
}: {
  insight: Insight
  /** The thing to do, naming its amount. */
  title: string
  /** One sentence of why, leading with the number. */
  why: string
  rateKey: string
  rating: Rating | null
  minHeight: number
  onRate: (key: string, rating: Rating) => void
  onMeasure: (height: number) => void
  question: string | null
  onAsk: (question: string) => void
}) {
  const toast = useToast()
  return (
    <View
      onLayout={(e) => onMeasure(e.nativeEvent.layout.height)}
      style={minHeight > 0 ? { minHeight } : undefined}
      className="rounded-card border border-hairline bg-surface p-lg"
    >
      {/* Takes the slack, so the pill and the feedback row under it sit on the bottom edge of
          every card as one block, rather than floating wherever the words happen to end. */}
      <View className="flex-1">
        <GlyphPlate
          name="sparkle"
          shape="bubble"
          size={size.plateSm}
          fill={SEVERITY[insight.severity].plate}
        />

        <Type role="body" weight="semibold" className="mt-md">
          {title}
        </Type>
        <Type role="body" tone="mid" className="mt-xs">
          {why}
        </Type>
      </View>

      {insight.kind === 'human_handoff' ? (
        <Button
          size="sm"
          variant="secondary"
          label={IDBI_CARE.label}
          haptic="none"
          href={IDBI_CARE.href}
          accessibilityHint={IDBI_CARE.hint}
          onOpenFail={() => toast.show(IDBI_CARE.failed)}
          className="mt-lg"
        />
      ) : question === null ? null : (
        <Button
          size="sm"
          variant="secondary"
          glyph="arrowRight"
          label="Talk me through this"
          haptic="none"
          accessibilityHint={`Asks Uday: ${question}`}
          onPress={() => onAsk(question)}
          className="mt-lg"
        />
      )}

      <View className="mt-lg min-h-target flex-row items-center justify-between gap-md border-t border-hairline pt-md">
        {rating !== null ? (
          <>
            <Type role="label" tone="mid" className="flex-1" accessibilityLiveRegion="polite">
              {rating === 'up'
                ? "Thanks — I'll keep an eye on this one"
                : "Noted — I'll put it at the back of this list"}
            </Type>
            <Glyph name="check" size={18} tint={color.brand} />
          </>
        ) : (
          <>
            <Type role="label" tone="mid" className="flex-1">
              Was this useful?
            </Type>
            {/* 24 apart, Cleo's spacing, which is also what keeps the two 44pt targets from
                overlapping: each thumb reaches 12 past its 20pt glyph. */}
            <View className="flex-row gap-xl">
              <Tap
                accessibilityRole="button"
                accessibilityLabel="This insight was useful"
                haptic="selection"
                onPress={() => onRate(rateKey, 'up')}
                hitSlop={12}
              >
                <Glyph name="thumbUp" size={20} tint={color.inkMid} />
              </Tap>
              <Tap
                accessibilityRole="button"
                accessibilityLabel="This insight was not useful"
                haptic="selection"
                onPress={() => onRate(rateKey, 'down')}
                hitSlop={12}
              >
                <Glyph name="thumbDown" size={20} tint={color.inkMid} />
              </Tap>
            </View>
          </>
        )}
      </View>
    </View>
  )
})
