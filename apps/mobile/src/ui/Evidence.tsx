// What the answer was computed from.
//
// This is the thing that makes Uday an advisor rather than a chatbot, so it stays on screen
// under every answer — but it was being shouted. It used to be a white card on the cream
// ground carrying six rows, each with its own check mark: 134pt of surface, 32pt of padding
// and six identical ticks. None of those ticks ever carried information — nothing here is
// ever unchecked — so they were sixty-odd points of vertical rhythm spent on decoration,
// and the card around them was a container drawn at 1.12:1 against the ground, which is to
// say barely drawn at all.
//
// The figures also failed to be readable: `caption` at `inkSoft` measured 3.78:1 on white,
// under the 4.5:1 floor. The material that exists specifically to make a number defensible
// was set at the size and colour reserved for small print.
//
// So: no card, no repeated marks, one hairline rule to group the block, and `label` at
// `inkMid` — 5.9:1 over the bloom at its hottest, 8.2:1 where the canvas is pale. The rule
// is the only thing left that says "these belong together", and that is enough, because the
// answer immediately above them is the thing they belong to.
//
// The list renders at its natural length. It used to `slice(0, 6)` and the opening answer
// emits seven or eight lines, so the product's first screen was silently discarding proof
// on a screen whose whole argument is that it can point at everything.
//
// The lines arrive in the engine's words, and two of those words were the database's rather
// than the customer's: ISO dates ("Looked at 2026-08-01 to 2026-09-01") and series ids
// ("coming in (salary-series)"). The engine's strings are its audit trail and stay as they
// are on the wire; `evidenceLine` (`~/lib/evidence`) puts them into English where they are
// read — "Looked at 1 Aug to 31 Aug", "coming in · Salary". The engine's windows stop short of
// their second date, so a range ends on the day before it. The figures are never touched.
//
// VoiceOver hears the lines themselves, as one element. It used to hear "Worked out from five
// figures in your file", which told a customer who cannot see the screen that there was
// proof and then withheld it.
import { View } from 'react-native'
import { Type } from '~/ui/Text'
import { cn } from '~/ui/cn'
import { evidenceLine } from '~/lib/evidence'

// ActionCard reads its evidence through the same words.
export { evidenceLine }

export function Evidence({
  lines,
  asOf,
  className,
}: {
  lines: string[]
  /** The snapshot's date, so a date in this year drops its year. */
  asOf?: string | null
  className?: string
}) {
  if (lines.length === 0) return null
  const shown = lines.map((line) => evidenceLine(line, asOf))

  return (
    <View
      accessible
      accessibilityLabel={`Evidence: ${shown.join('. ')}`}
      className={cn('border-l border-hairline-soft pl-lg', className)}
    >
      <View className="gap-xs">
        {shown.map((line, i) => (
          <Type key={`${i}:${line}`} role="label" tone="mid">
            {line}
          </Type>
        ))}
      </View>
    </View>
  )
}
