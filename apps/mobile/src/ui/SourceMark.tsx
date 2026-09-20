// The mark for a place that holds your money.
//
// `@dhan/assets` carries retail logos, because that is what a statement line needs, and no
// institution among them: there is no Zerodha mark, no EPFO mark, no IDBI mark. So the
// alternatives here were a grey circle with a letter in it — five of those in a row is a
// legend, not a design — or drawing something that is actually true about the place. The kind
// is true. A custodian holding an EPF balance is a retirement account whatever it is called,
// and a customer scanning five rows learns more from that than from five initials.
//
// One of the marks is filled and the rest are not, and which one is filled is the reading:
// IDBI's own book is the only holding the bank read without asking anyone's permission. That
// is the distinction the whole screen is about, so it is carried by the strongest signal the
// component has rather than by a word underneath.
import { View } from 'react-native'
import { Glyph, type GlyphName } from '~/ui/Glyph'
import { Type } from '~/ui/Text'
import { cn } from '~/ui/cn'
import { color } from '@dhan/design'
import type { SourceKind } from '~/lib/sources'

const GLYPH: Record<SourceKind, GlyphName> = {
  home: 'ledger',
  market: 'coins',
  retirement: 'lock',
  cover: 'shield',
}

export function SourceMark({
  kind,
  size = 40,
  className,
}: {
  kind: SourceKind
  size?: number
  className?: string
}) {
  const home = kind === 'home'
  return (
    <View
      className={cn(
        'items-center justify-center rounded-pill',
        home ? 'bg-brand' : 'bg-ground-deep',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Glyph
        name={GLYPH[kind]}
        size={Math.round(size * 0.48)}
        tint={home ? color.onBrand : color.inkMid}
      />
    </View>
  )
}

/**
 * The same marks as a group rather than as a list.
 *
 * Laid side by side, five marks read as a legend to be decoded one at a time. Overlapped, they
 * read as one thing with a count — which is the question the strip answers, because a customer
 * glancing at Holdings wants to know *how many places* this is coming from before they want to
 * know which. The remainder rides on the last mark so the row is the same width at three
 * sources and at eleven.
 *
 * The ring is drawn in the colour of whatever is behind the stack rather than as a border,
 * because the two callers sit on different grounds — cream under the strip, white inside a
 * card — and a ring that matches its own background is what keeps the overlap legible on both
 * without this component having to know where it is.
 */
export function SourceStack({
  kinds,
  size = 34,
  max = 4,
  ring = 'bg-surface',
}: {
  kinds: readonly SourceKind[]
  size?: number
  max?: number
  /** The background the stack sits on, so the gap between marks reads as a gap. */
  ring?: string
}) {
  const shown = kinds.slice(0, max)
  const rest = kinds.length - shown.length
  const overlap = Math.round(size * 0.32)

  return (
    <View className="flex-row items-center">
      {shown.map((kind, i) => (
        <View
          key={`${kind}-${i}`}
          className={cn('rounded-pill p-[2px]', ring)}
          style={i === 0 ? undefined : { marginLeft: -overlap }}
        >
          <SourceMark kind={kind} size={size} />
        </View>
      ))}
      {rest > 0 && (
        <View className={cn('rounded-pill p-[2px]', ring)} style={{ marginLeft: -overlap }}>
          <View
            className="items-center justify-center rounded-pill border border-hairline bg-surface"
            style={{ width: size, height: size }}
          >
            <Type role="caption" tone="soft">
              +{rest}
            </Type>
          </View>
        </View>
      )}
    </View>
  )
}
