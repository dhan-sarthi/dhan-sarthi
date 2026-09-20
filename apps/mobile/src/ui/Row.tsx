import { View } from 'react-native'
import { Type } from '~/ui/Text'

/**
 * A label on the left, a figure on the right. The row five screens were each declaring.
 *
 * `divide` draws the hairline Cleo puts between stacked rows, so a Card's first row leaves it
 * off and every row under it turns it on. The tone union is the union of what the callers
 * ask for: `brand` on a projection figure, `danger` on a shortfall, `soft` on the record's
 * provenance, `ink` everywhere else.
 */
export function Row({
  label,
  value,
  divide = false,
  tone = 'ink',
}: {
  label: string
  value: string
  divide?: boolean
  tone?: 'ink' | 'brand' | 'danger' | 'soft'
}) {
  return (
    <View
      className={
        divide
          ? 'flex-row justify-between gap-md border-t border-hairline px-lg py-md'
          : 'flex-row justify-between gap-md px-lg py-md'
      }
    >
      <Type role="body" tone="mid" className="flex-1">
        {label}
      </Type>
      <Type role="label" tone={tone}>
        {value}
      </Type>
    </View>
  )
}
