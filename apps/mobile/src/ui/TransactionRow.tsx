// One statement line.
//
// The mark, the name, the category, the amount. Shared by the short list on Spend, a
// challenge's lines on Grow and the full statement, so the three cannot drift apart — which
// they would, because the full list also groups by day and it would be easy to restyle a row
// while doing it.
//
// Cleo's line: the name leads at row-title weight, and the amount is the figure, with its paise
// set small beside the rupees. Money in is the only green on the row and the only sign; a debit
// carries no minus, because a statement of spending is spending by default and a column of
// minus signs is noise the eye has to read past to reach the numbers.
//
// The name and the category each wrap to a second line rather than clipping. Cleo's full list
// wraps its long names, and one line cut Karan's salary to "Northwind Syste…"; "Food & dining ·
// 12 Aug · recurring" is longer than the column at 320pt, and the half that clips is the date.
// The divider is inset from both edges, the way Cleo rules a table inside a white card, and sits
// outside the pressable so it never shrinks with the press.
//
// A line reads as one sentence to VoiceOver — who, how much, what for, when — rather than as
// four fragments in reading order, and a pressable line is a button that opens its details.
import { View } from 'react-native'
import { Tap } from '~/ui/Tap'
import { Type } from '~/ui/Text'
import { MerchantMark } from '~/ui/MerchantMark'
import { merchantOf } from '~/lib/merchant'
import { shortDate, splitAmount } from '~/lib/money'
import { cn } from '~/ui/cn'
import { size } from '@dhan/design'
import type { Transaction } from '@dhan/contracts'

export function TransactionRow({
  txn,
  asOf,
  divide = false,
  showDate = true,
  highlighted = false,
  onPress,
}: {
  txn: Transaction
  /** The simulated today, so a date in another year prints its year. Absent where the
   *  snapshot has not arrived yet, which `shortDate` already takes as "assume this year". */
  asOf?: string | undefined
  divide?: boolean
  /** Off under a day heading that already says the date. */
  showDate?: boolean
  /** A lime wash for the line a link came here to show — the statement's `?highlight=income`. */
  highlighted?: boolean
  /** Opens the line's details; the row becomes a button. */
  onPress?: () => void
}) {
  const name = merchantOf(txn)
  const credit = txn.txnType === 'CREDIT'
  const { whole, paise } = splitAmount(txn.txnAmount)
  const when = shortDate(txn.txnDate, asOf)
  const detail = [txn.spendCategory, showDate ? when : null, txn.isRecurring ? 'recurring' : null]
    .filter((part) => part !== null)
    .join(' · ')
  const label = [
    name,
    `${credit ? 'received ' : ''}${whole}${paise}`,
    txn.spendCategory,
    when,
    ...(txn.isRecurring ? ['recurring'] : []),
  ].join(', ')

  const body = (
    <View
      className={cn(
        'min-h-control flex-row items-center gap-md px-lg py-md',
        highlighted && 'bg-success/20',
      )}
    >
      <MerchantMark merchant={name} category={txn.spendCategory} size={size.plateLg} />
      <View className="flex-1">
        <Type role="body" weight="semibold" numberOfLines={2}>
          {name}
        </Type>
        <Type role="caption" tone="mid" numberOfLines={2}>
          {detail}
        </Type>
      </View>
      <View className="flex-row items-baseline">
        <Type role="heading" plain tone={credit ? 'brand' : 'ink'}>
          {credit ? '+' : ''}
          {whole}
        </Type>
        {paise ? (
          <Type role="caption" plain tone={credit ? 'brand' : 'mid'}>
            {paise}
          </Type>
        ) : null}
      </View>
    </View>
  )

  const rule = divide ? <View className="mx-lg h-px bg-hairline" /> : null

  if (!onPress) {
    return (
      <View>
        {rule}
        <View accessible accessibilityLabel={label}>
          {body}
        </View>
      </View>
    )
  }
  return (
    <View>
      {rule}
      <Tap
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Shows the details of this line"
        onPress={onPress}
        scale={0.985}
      >
        {body}
      </Tap>
    </View>
  )
}
