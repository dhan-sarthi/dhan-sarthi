// The door from Holdings to where the holdings came from.
//
// Holdings answers "what do I own". The question sitting immediately behind it — and the one
// the list could not answer until now — is "says who". Eleven rows, some of them at brokers
// and retirement bodies IDBI has never seen, all drawn in the same weight as the bank's own
// deposit book, with one flat chip reading "Held elsewhere" doing the whole job of provenance.
//
// So: a strip, not a pane. The status belongs beside the holdings it explains rather than
// behind a sixth pill, and the detail belongs on its own screen because withdrawing consent is
// not something to do by accident while scrolling a portfolio.
//
// The second line names the places instead of restating the total. The total is already the
// display figure two cards up, and a strip that repeats it is decoration; a strip that says
// "Zerodha, EPFO, HDFC Life and 2 more" has told the customer something the screen above it
// genuinely could not.
import { View } from 'react-native'
import { Type } from '~/ui/Text'
import { Tap } from '~/ui/Tap'
import { Glyph } from '~/ui/Glyph'
import { SourceStack } from '~/ui/SourceMark'
import { color } from '@dhan/design'
import type { Source } from '~/lib/sources'

export function SourceStrip({
  sources,
  withdrawn,
  onPress,
}: {
  sources: readonly Source[]
  /** HOLDINGS consent is withdrawn, so the list above this is empty by the customer's own choice. */
  withdrawn: boolean
  onPress: () => void
}) {
  if (withdrawn) {
    return (
      <Tap
        accessibilityRole="button"
        accessibilityLabel="Holdings are switched off. Open where your information comes from."
        onPress={onPress}
        scale={0.99}
        className="flex-row items-center gap-md rounded-lg bg-streak px-lg py-lg"
      >
        <View className="h-9 w-9 items-center justify-center rounded-pill bg-black/10">
          <Glyph name="lock" size={19} tint={color.ink} />
        </View>
        <View className="flex-1">
          <Type role="heading">Holdings are switched off</Type>
          <Type role="body" className="mt-[2px] opacity-80">
            You withdrew this block, so nothing here counts towards your net worth or your plan.
          </Type>
        </View>
        <Glyph name="chevronRight" size={20} tint={color.ink} />
      </Tap>
    )
  }

  if (sources.length === 0) return null

  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${sources.length} places hold this. Open where your information comes from.`}
      onPress={onPress}
      scale={0.99}
      className="flex-row items-center gap-md rounded-lg border border-hairline bg-surface px-lg py-lg"
    >
      <SourceStack kinds={sources.map((s) => s.kind)} ring="bg-surface" />
      <View className="flex-1">
        <Type role="heading">
          {sources.length === 1 ? 'One place holds this' : `${sources.length} places hold this`}
        </Type>
        <Type role="body" tone="soft" className="mt-[2px]">
          {nameList(sources)}
        </Type>
      </View>
      <Glyph name="chevronRight" size={20} tint={color.inkSoft} />
    </Tap>
  )
}

/**
 * Three names and a count, rather than all of them.
 *
 * A strip that lists eleven custodians wraps to four lines and stops being a strip. Three is
 * what fits beside the stack at the narrowest phone width the app supports, and the remainder
 * is the same count the stack is already showing — said once in each language.
 */
function nameList(sources: readonly Source[]): string {
  const names = sources.map((s) => s.name)
  if (names.length <= 3) {
    if (names.length === 1) return names[0] as string
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] as string}`
  }
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
}
