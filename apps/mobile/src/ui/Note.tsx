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
// Two decisions worth naming.
//
// **The mark is a ring, not a plate.** `GlyphPlate` fills a circle, and this app's filled
// circles all mean something is live — a hack is on, a step is done, a category is over. A
// callout is none of those; it is the page talking, and a hairline ring around an ⓘ is the
// quietest way to say so. It is also why it stays 28pt against the 36 a settings row gives its
// mark: this one is punctuation, not a subject.
//
// **The body is typeset as prose rather than laid out.** `children` is a `ReactNode` and it is
// wrapped in one `Type`, which means a bare string works — the common case, and the one that
// would otherwise throw, since React Native will not render a loose string — and so does an
// emphasised run or a link, because those nest inside a `Text` the way they do in HTML. What
// does not work is a `View`, and that is the point: a Note is a sentence with a mark beside
// it. Anything that wants rows and columns wants a `Card`, which is the thing this is built on
// and one import away.
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Card } from '~/ui/Card'
import { Type } from '~/ui/Text'
import { Glyph, type GlyphName } from '~/ui/Glyph'
import { cn } from '~/ui/cn'
import { color } from '@dhan/design'

export function Note({
  children,
  title,
  glyph = 'info',
}: {
  children: ReactNode
  title?: string
  glyph?: GlyphName
}) {
  return (
    <Card>
      {/* `items-start`, so the mark stays level with the first line of a sentence that runs to
          three rather than drifting to the middle of the paragraph. */}
      <View className="flex-row items-start gap-md px-lg py-lg">
        <View className="h-[28px] w-[28px] items-center justify-center rounded-pill border border-hairline">
          <Glyph name={glyph} size={15} tint={color.inkMid} />
        </View>
        <View className="flex-1">
          {title === undefined ? null : <Type role="heading">{title}</Type>}
          <Type role="body" tone="mid" className={cn(title !== undefined && 'mt-xs')}>
            {children}
          </Type>
        </View>
      </View>
    </Card>
  )
}
