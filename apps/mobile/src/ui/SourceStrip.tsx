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
//
// Read out, the strip is one sentence with the places in it — "5 places hold this: Zerodha,
// EPFO, HDFC Life and 2 more" — and the way in is the hint, not the label. It used to announce
// only the count and an instruction, which left the one thing the strip exists to say, whose
// money this is, as the only part a screen reader never reached.
import { View } from 'react-native'
import { Type } from '~/ui/Text'
import { Tap } from '~/ui/Tap'
import { Glyph } from '~/ui/Glyph'
import { SourceStack } from '~/ui/SourceMark'
import { color } from '@dhan/design'
import type { Source } from '~/lib/sources'

/** Where either strip leads, said once for VoiceOver after the strip's own sentence. */
const OPENS = 'Opens where your information comes from'

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
        accessibilityLabel="Holdings are switched off. Nothing here counts towards your net worth or your plan."
        accessibilityHint={OPENS}
        onPress={onPress}
        scale={0.99}
        className="flex-row items-center gap-md rounded-lg bg-streak px-lg py-lg"
      >
        <View className="h-plate-md w-plate-md items-center justify-center rounded-pill bg-ink/10">
          <Glyph name="lock" size={19} tint={color.ink} />
        </View>
        <View className="flex-1">
          <Type role="heading" tone="ink" plain>
            Holdings are switched off
          </Type>
          <Type role="body" tone="ink" className="mt-xxs">
            You withdrew this block, so nothing here counts towards your net worth or your plan.
          </Type>
        </View>
        <Glyph name="chevronRight" size={20} tint={color.ink} />
      </Tap>
    )
  }

  if (sources.length === 0) return null
  const title = sources.length === 1 ? 'One place holds this' : `${sources.length} places hold this`

  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${nameList(sources)}`}
      accessibilityHint={OPENS}
      onPress={onPress}
      scale={0.99}
      className="flex-row items-center gap-md rounded-lg border border-hairline bg-surface px-lg py-lg"
    >
      {/* The marks above the words rather than beside them: five overlapped marks are 140pt
          wide, and beside them "5 places hold this" broke over two lines and the names over
          three. */}
      <View className="flex-1">
        <SourceStack kinds={sources.map((s) => s.kind)} ring="bg-surface" />
        <Type role="heading" plain className="mt-md">
          {title}
        </Type>
        <Type role="body" tone="mid" className="mt-xxs">
          {nameList(sources)}
        </Type>
      </View>
      <Glyph name="chevronRight" size={20} tint={color.ink} />
    </Tap>
  )
}

/**
 * Three names and a count, rather than all of them.
 *
 * A strip that lists eleven custodians wraps to four lines and stops being a strip. Three is
 * what fits beside the stack at the narrowest phone width the app supports, and the remainder
 * is the same count the stack is already showing — said once in each language.
 *
 * Only real names are printed as names. Holdings whose statement never said who keeps them
 * group under a placeholder, and the strip used to list it like an institution — "Place not
 * recorded and IDBI Bank" — which is the one line on the screen a customer could not go and
 * check. It is counted instead, as the title already counts it, and sorts after every name
 * (`sourcesOf`), so when the list runs past three it is simply one of the "more".
 */
function nameList(sources: readonly Source[]): string {
  const names = sources.filter((s) => s.named).map((s) => s.name)
  const unnamed = sources.length > names.length
  if (names.length === 0) return 'Not named on your statement'
  if (sources.length <= 3) {
    const items = unnamed ? [...names, 'one unnamed place'] : names
    if (items.length === 1) return items[0] as string
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] as string}`
  }
  return `${names.slice(0, 3).join(', ')} and ${sources.length - 3} more`
}
