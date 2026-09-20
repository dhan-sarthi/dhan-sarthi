// Everything the engine spotted.
//
// Spend shows the top three because a home screen that lists eight findings is a to-do
// list, and the product's whole posture is that there is one thing worth doing today. The
// rest are not hidden, though — they are here, ordered by how much they are costing, with
// the evidence each was derived from.
//
// This is what the bell means. There are no push notifications in this build and inventing
// some would be dishonest; what a notification would have been about is exactly this list.
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { router } from 'expo-router'
import { NavRow } from '~/ui/NavRow'
import { Tap } from '~/ui/Tap'
import { Reveal } from '~/ui/Reveal'
import { dur, easeOut } from '~/ui/motion'
import { Type } from '~/ui/Text'
import { Card } from '~/ui/Card'
import { Chip } from '~/ui/Chip'
import { Glyph } from '~/ui/Glyph'
import { useSnapshot } from '~/state/snapshot'
import { SEVERITY } from '~/ui/severity'
import { rupees } from '~/lib/money'
import { color } from '@dhan/design'
import type { Insight } from '@dhan/contracts'

export default function Noticed() {
  const { data: view, state } = useSnapshot()
  const [open, setOpen] = useState<string | null>(null)

  const insights = view?.insights ?? []
  const worth = insights.reduce((t, i) => t + i.monthlyValue, 0)

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow onBack={() => router.back()} />
      <View className="px-pad pb-lg">
        <Type role="display">What I noticed</Type>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-pad pb-xxl gap-md">
        {/* Three outcomes, three renderings, and `data` is tested before `state`. This
            screen used to branch on emptiness alone, so a read still in flight and a read
            that failed both said "nothing needs your attention" — a claim about the
            customer's money, made without having looked. Branching on `state` first was the
            other half of the same mistake: the module keeps a view standing when a refresh
            fails, so a failed pull on the tab underneath would blank the findings here while
            they were still on screen behind this one. The error line is for having nothing. */}
        {view === null && state === 'error' ? (
          <Type role="body" tone="danger">
            Could not load what I found. Check the API on :3001.
          </Type>
        ) : view === null ? (
          <Type role="body" tone="soft">
            Reading what I found…
          </Type>
        ) : insights.length === 0 ? (
          <Type role="body" tone="soft">
            Nothing needs your attention. That is a real answer, not an empty screen.
          </Type>
        ) : (
          <>
            {worth > 0 && (
              <View className="rounded-lg bg-hero p-lg">
                <Type role="caption" tone="onInk" className="opacity-85">
                  WORTH ACTING ON
                </Type>
                <Type role="display" tone="onInk" className="mt-xs">
                  {rupees(worth)}
                </Type>
                <Type role="body" tone="onInk" className="mt-sm opacity-85">
                  a month, across {insights.length} things I found in your statement.
                </Type>
              </View>
            )}

            {insights.map((insight) => (
              <InsightRow
                key={insight.kind + insight.headline}
                insight={insight}
                open={open === insight.headline}
                onToggle={() => setOpen(open === insight.headline ? null : insight.headline)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function InsightRow({
  insight,
  open,
  onToggle,
}: {
  insight: Insight
  open: boolean
  onToggle: () => void
}) {
  const s = SEVERITY[insight.severity]
  return (
    // The card grows into the evidence rather than jumping to its new height. A disclosure that
    // snaps open makes the reader re-find the line they were on; one that opens keeps it under
    // their eye, which is the whole reason the evidence is collapsible and not simply absent.
    <Animated.View layout={LinearTransition.duration(dur.move).easing(easeOut)}>
      <Card>
        {/* A real pressable, not a View with onTouchEnd: the latter never fires for a mouse, has
            no press state and announces nothing to a screen reader. */}
        <Tap
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          haptic="selection"
          onPress={onToggle}
          scale={0.99}
          className="px-lg py-lg"
        >
          <View className="flex-row items-center justify-between gap-md">
            <Chip tone={s.tone}>{s.label}</Chip>
            <View className="flex-row items-center gap-md">
              {insight.monthlyValue > 0 && (
                <Type role="caption" tone="brand">
                  {rupees(insight.monthlyValue)}/mo
                </Type>
              )}
              {insight.deadlineDays !== undefined && (
                <Type role="caption" tone="soft">
                  {insight.deadlineDays}d left
                </Type>
              )}
            </View>
          </View>

          <Type role="heading" className="mt-md">
            {insight.headline}
          </Type>
          <Type role="body" tone="soft" className="mt-xs">
            {insight.detail}
          </Type>

          {/* Evidence is collapsed by default and one tap away. Always visible would make
            every card four lines longer; never visible would make the claim unverifiable. */}
          {insight.evidence.length > 0 && (
            <>
              <Type role="caption" tone="brand" className="mt-md">
                {open ? 'Hide what this is based on' : 'What is this based on?'}
              </Type>
              {open && (
                <View className="mt-md gap-xs rounded-md bg-ground-deep p-md">
                  {insight.evidence.map((line, i) => (
                    <Reveal key={line} i={i} className="flex-row items-start gap-sm">
                      <View className="mt-[5px]">
                        <Glyph name="check" size={11} tint={color.inkSoft} />
                      </View>
                      <Type role="caption" tone="mid" className="flex-1">
                        {line}
                      </Type>
                    </Reveal>
                  ))}
                </View>
              )}
            </>
          )}
        </Tap>
      </Card>
    </Animated.View>
  )
}
