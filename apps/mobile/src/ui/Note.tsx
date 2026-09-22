// The ⓘ callout.
//
// Nine screens in the save and challenge flows end the same way: one white card, low on the
// page, just above the button, carrying the sentence the customer needs before they commit.
// It is not an error and it is not a tip — it is the condition attached to the thing they are
// about to turn on, and Cleo put it in exactly that position on every one of those screens for
// exactly that reason. It reads as the small print because it *is* the small print, and a
// product that hides its small print behind a chevron is making a choice about what it wants
// read.
//
// Three decisions worth naming.
//
// **The mark is a ring, not a plate.** `GlyphPlate` fills a circle, and this app's filled
// circles all mean something is live — a hack is on, a step is done, a category is over. A
// callout is none of those; it is the page talking, and a hairline ring around the mark is the
// quietest way to say so. A mark that is already a circle — the ⓘ, the clock, the target — is
// drawn at the ring's size and takes no second ring, which is how Section draws its ⓘ too: a
// ring inside a ring is a target, not a footnote. It stays 28pt against the 36 a settings row
// gives its mark: this one is punctuation, not a subject.
//
// **Except when it is a tip.** Cleo's challenge tips carry a lime plate, because a tip is the
// app cheering, not the small print, and it earns the fill. `mark="plate"` is that card, and
// `fill` retints it for a tip that is a warning rather than a cheer.
//
// **The body is typeset as prose rather than laid out.** `children` is a `ReactNode` and it is
// wrapped in one `Type`, which means a bare string works — the common case, and the one that
// would otherwise throw, since React Native will not render a loose string — and so does an
// emphasised run or a link, because those nest inside a `Text` the way they do in HTML. What
// does not work is a `View`, and that is the point: a Note is a sentence with a mark beside
// it. Anything that wants rows and columns wants a `Card`, which is the thing this is built on
// and one import away. The one thing a Note may add under its sentence is a single `action`,
// the next step the sentence points at.
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Card } from '~/ui/Card'
import { Button } from '~/ui/Button'
import { Type } from '~/ui/Text'
import { Glyph, GlyphPlate, type GlyphName } from '~/ui/Glyph'
import { cn } from '~/ui/cn'
import { color, size } from '@dhan/design'

// The marks whose own outline is a circle on the 24 grid.
const SELF_RINGED: ReadonlySet<GlyphName> = new Set<GlyphName>(['info', 'clock', 'target'])

export function Note({
  children,
  title,
  glyph = 'info',
  mark = 'ring',
  fill,
  action,
}: {
  children: ReactNode
  title?: string
  glyph?: GlyphName
  mark?: 'ring' | 'plate'
  /** The plate's fill class, `bg-success` unless said otherwise. */
  fill?: string
  action?: { label: string; onPress: () => void }
}) {
  return (
    <Card>
      {/* `items-start`, so the mark stays level with the first line of a sentence that runs to
          three rather than drifting to the middle of the paragraph. */}
      <View className="flex-row items-start gap-md px-lg py-lg">
        {mark === 'plate' ? (
          <GlyphPlate name={glyph} size={size.plateMd} fill={fill ?? 'bg-success'} />
        ) : SELF_RINGED.has(glyph) ? (
          <GlyphPlate name={glyph} size={size.ring} plain tint={color.inkMid} />
        ) : (
          <View className="h-ring w-ring items-center justify-center rounded-pill border border-hairline">
            <Glyph name={glyph} size={15} tint={color.inkMid} />
          </View>
        )}
        <View className="flex-1">
          {title === undefined ? null : <Type role="heading">{title}</Type>}
          <Type role="body" tone="mid" className={cn(title !== undefined && 'mt-xs')}>
            {children}
          </Type>
          {action === undefined ? null : (
            <Button
              label={action.label}
              onPress={action.onPress}
              size="sm"
              variant="secondary"
              haptic="none"
              className="mt-md"
            />
          )}
        </View>
      </View>
    </Card>
  )
}
