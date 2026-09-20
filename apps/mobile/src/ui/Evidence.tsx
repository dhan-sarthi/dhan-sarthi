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
import { View } from 'react-native'
import { Type } from '~/ui/Text'
import { cn } from '~/ui/cn'

export function Evidence({ lines, className }: { lines: string[]; className?: string }) {
  if (lines.length === 0) return null

  return (
    <View
      // One node to VoiceOver, with a label that says what the rows are evidence *for*.
      // Six ungrouped fragments is what it read as before.
      accessible
      accessibilityLabel={`Worked out from ${lines.length} ${
        lines.length === 1 ? 'figure' : 'figures'
      } in your file`}
      className={cn('border-l border-hairline-soft pl-lg', className)}
    >
      <View className="gap-xs">
        {lines.map((line) => (
          <Type key={line} role="label" tone="mid">
            {line}
          </Type>
        ))}
      </View>
    </View>
  )
}
