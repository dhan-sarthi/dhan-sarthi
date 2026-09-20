// One statement line.
//
// The mark, the name, the category and date, the amount. Shared between the short list on
// Spend and the full statement, so the two cannot drift apart — which they would, because
// the full list also groups by day and it would be easy to restyle a row while doing it.
import { View } from 'react-native'
import { Tap } from '~/ui/Tap'
import { Type } from '~/ui/Text'
import { MerchantMark } from '~/ui/MerchantMark'
import { merchantOf } from '~/lib/merchant'
import { rupees, shortDate } from '~/lib/money'
import { cn } from '~/ui/cn'
import type { Transaction } from '@dhan/contracts'

export function TransactionRow({
  txn,
  asOf,
  divide = false,
  showDate = true,
  onPress,
}: {
  txn: Transaction
  /** The simulated today, so a date in another year prints its year. Absent where the
   *  snapshot has not arrived yet, which `shortDate` already takes as "assume this year". */
  asOf?: string
  divide?: boolean
  showDate?: boolean
  onPress?: () => void
}) {
  const name = merchantOf(txn)
  const credit = txn.txnType === 'CREDIT'

  const body = (
    <View
      className={cn(
        'flex-row items-center gap-md px-lg py-md',
        divide && 'border-t border-hairline',
      )}
    >
      <MerchantMark merchant={name} category={txn.spendCategory} />
      <View className="flex-1">
        <Type role="label" numberOfLines={1}>
          {name}
        </Type>
        <Type role="caption" tone="soft" numberOfLines={1}>
          {txn.spendCategory}
          {showDate ? ` · ${shortDate(txn.txnDate, asOf)}` : ''}
          {txn.isRecurring ? ' · recurring' : ''}
        </Type>
      </View>
      <Type role="label" tone={credit ? 'brand' : 'ink'}>
        {credit ? '+' : '−'}
        {rupees(txn.txnAmount)}
      </Type>
    </View>
  )

  if (!onPress) return body
  return (
    <Tap accessibilityRole="button" onPress={onPress} scale={0.985}>
      {body}
    </Tap>
  )
}
