// Smart insights — Cleo's carousel, on our engine's findings.
//
// Cleo paginate their insights one card at a time with a dot rail underneath, and each card
// ends in two controls: a way into the conversation about it, and a thumbs up/down that
// collapses into "Thanks for your feedback!" once answered. Both are structural rather than
// decorative. The carousel is what lets the app show six findings without a wall of cards,
// and the feedback is what stops an insight pool nobody can correct.
//
// Three measurements carry the whole component, and getting any of them wrong is what makes a
// carousel read as cheap:
//
// **The page is the scroller's own width, measured on the scroller.** This wrapper sits inside
// the screen's 20pt gutter and the scroller is pulled full-bleed with `-mx-pad`, so the page
// is *not* the wrapper's width — a page sized to the wrapper is 40pt short, which puts 40pt of
// the next card on screen and pushes every card after the first a further 40pt off its stop.
// Measuring the ScrollView itself says so directly instead of inferring it. It is seeded from
// the window width so the **first painted frame is already correct**: a page with no width
// inside a horizontal scroller is laid out against an infinite main-axis constraint and
// resolves to max-content, which is one committed frame of a ~820pt card on a 393pt screen
// before the measurement lands.
//
// **Every card is as tall as the tallest.** A row of self-sizing cards steps up and down as
// you swipe and drags the dot rail with it. So each card reports its natural height, the
// tallest wins, and all of them take it as a floor — with the feedback row pushed down by a
// flex spacer, so the extra height reads as a deliberate footer rather than slack under the
// text. The floor only ever grows, which is why it is **reset whenever the insight set or the
// screen width changes**: without that, a list that gets shorter keeps the taller list's
// height and every card carries an empty band nothing will ever reclaim.
//
// **The page index is derived from the scroll offset, not from momentum.** `onMomentumScrollEnd`
// does not fire when a slow drag is released without throwing, and it does not fire when the
// OS clamps the offset because the content got shorter — both leave the rail pointing at a
// card that is not on screen. Reading `onScroll` covers all three, and the index is clamped to
// the list as well, because a clamp with no event is exactly the case the dots got wrong.
//
// Three differences from Cleo, all deliberate:
//
// **The headline carries the number.** `findInsights` writes one sentence with the figure in
// it, and that sentence is the card. Cleo's copy is a question ("Would you be open to…");
// ours states the finding and lets the action be the question.
//
// **"Talk me through this" hands Uday the insight.** It is not a generic deep link into chat:
// it carries the headline as the opening question, so the avatar starts on the thing the
// customer tapped rather than on "how can I help".
//
// **Feedback is local.** There is no route to record it and inventing one would mean a button
// that claims to teach a system it cannot reach. It is kept per insight *kind*, which is
// stable while a headline's figure is not, so a refresh that moves a number does not silently
// un-answer a card the customer already rated. The honest next step is a route that records it.
import { useEffect, useRef, useState } from 'react'
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
import { Glyph, GlyphPlate } from '~/ui/Glyph'
import { cn } from '~/ui/cn'
import { color } from '@dhan/design'
import { SEVERITY } from '~/ui/severity'
import type { Insight } from '@dhan/contracts'

export function InsightCarousel({
  insights,
  onTalk,
}: {
  insights: readonly Insight[]
  onTalk: (insight: Insight) => void
}) {
  const { width: windowWidth } = useWindowDimensions()
  const [measured, setMeasured] = useState(0)
  const [page, setPage] = useState(0)
  const [tallest, setTallest] = useState(0)
  const [rated, setRated] = useState<readonly string[]>([])
  const scroller = useRef<ScrollView>(null)

  // The scroller is full-bleed, so the window width is the right page width from the first
  // frame; the measurement then replaces the assumption with the fact.
  const pageWidth = measured > 0 ? measured : windowWidth

  /*
   * What this carousel is currently showing, and the trigger for starting over.
   *
   * The width is in it as well as the list: a rotation reflows every card, and a height floor
   * measured in portrait is simply wrong in landscape. Adjusted during render rather than in
   * an effect, so the frame that shows a new list is already using that list's own floor
   * instead of painting once with the previous one's.
   */
  const signature = `${pageWidth}|${insights.map((i) => i.kind).join(',')}`
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

  if (insights.length === 0) return null

  const onScrollerLayout = (e: LayoutChangeEvent) => setMeasured(e.nativeEvent.layout.width)

  // Clamped, because the OS clamps the offset itself when the content gets shorter and does
  // so without firing anything — an index past the end lights no dot at all.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth <= 0) return
    const next = Math.round(e.nativeEvent.contentOffset.x / pageWidth)
    setPage(Math.max(0, Math.min(insights.length - 1, next)))
  }

  // Only ever grows within one signature, and applied to every card, so the second pass
  // measures the floor it was just given and settles there. A functional update because
  // several cards lay out in the same frame and the last writer would otherwise win.
  const measure = (h: number) => setTallest((prev) => (h > prev ? h : prev))

  const active = Math.min(page, insights.length - 1)

  return (
    <View>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        onLayout={onScrollerLayout}
        onScroll={onScroll}
        scrollEventThrottle={16}
        className="-mx-pad"
      >
        {insights.map((insight) => (
          <View
            // The kind, not the headline: a headline carries a figure that moves on every
            // refresh, and keying on it would remount the card and wipe its answered state.
            key={insight.kind}
            // The page is the scroller's full width; the card takes the gutter back inside it,
            // so it lands at exactly the width of every other card on the screen.
            style={{ width: pageWidth }}
            className="px-pad"
          >
            <InsightPane
              insight={insight}
              minHeight={tallest}
              rated={rated.includes(insight.kind)}
              onRate={() =>
                setRated((prev) => (prev.includes(insight.kind) ? prev : [...prev, insight.kind]))
              }
              onMeasure={measure}
              onTalk={() => onTalk(insight)}
            />
          </View>
        ))}
      </ScrollView>

      {insights.length > 1 && (
        <View className="mt-md flex-row items-center justify-center gap-xs">
          {insights.map((insight, i) => (
            <View
              key={insight.kind}
              className={cn('h-1.5 rounded-pill', i === active ? 'w-5 bg-ink' : 'w-1.5 bg-ink/20')}
            />
          ))}
        </View>
      )}
    </View>
  )
}

function InsightPane({
  insight,
  minHeight,
  rated,
  onRate,
  onMeasure,
  onTalk,
}: {
  insight: Insight
  minHeight: number
  rated: boolean
  onRate: () => void
  onMeasure: (height: number) => void
  onTalk: () => void
}) {
  return (
    <View
      onLayout={(e) => onMeasure(e.nativeEvent.layout.height)}
      style={minHeight > 0 ? { minHeight } : undefined}
      className="rounded-lg border border-hairline bg-surface p-lg"
    >
      {/* Takes the slack, so the footer below sits on the bottom edge of every card rather
          than floating wherever its own text happens to end. */}
      <View className="flex-1">
        <GlyphPlate name="sparkle" fill={SEVERITY[insight.severity].plate} size={34} />

        <Type role="body" className="mt-md">
          {insight.headline}
        </Type>
        <Type role="body" tone="soft" className="mt-xs">
          {insight.detail}
        </Type>

        <Tap
          accessibilityRole="button"
          accessibilityLabel={`Talk to Uday about: ${insight.headline}`}
          haptic="light"
          onPress={onTalk}
          className="mt-lg flex-row items-center gap-sm self-start rounded-pill border border-ink px-lg py-sm"
        >
          <Type role="label">Talk me through this</Type>
          <Glyph name="arrowRight" size={16} />
        </Tap>
      </View>

      <View className="mt-lg flex-row items-center justify-between border-t border-hairline pt-md">
        {rated ? (
          <>
            <Type role="label" tone="soft">
              Thanks for your feedback!
            </Type>
            <Glyph name="check" size={18} tint={color.brand} />
          </>
        ) : (
          <>
            <Type role="label" tone="soft">
              Was this useful?
            </Type>
            <View className="flex-row gap-lg">
              <Tap
                accessibilityRole="button"
                accessibilityLabel="This insight was helpful"
                haptic="selection"
                onPress={onRate}
                hitSlop={10}
              >
                <Glyph name="thumbUp" size={20} tint={color.inkMid} />
              </Tap>
              <Tap
                accessibilityRole="button"
                accessibilityLabel="This insight was not helpful"
                haptic="selection"
                onPress={onRate}
                hitSlop={10}
              >
                <Glyph name="thumbDown" size={20} tint={color.inkMid} />
              </Tap>
            </View>
          </>
        )}
      </View>
    </View>
  )
}
