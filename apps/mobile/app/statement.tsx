// The full statement.
//
// Cleo puts an arrow beside "Recent transactions" and it opens the lot. The short list on
// Spend answers "what just happened"; this answers "where did it all go", and they are
// different questions, which is why one is four rows and the other is the whole ledger.
//
// Grouped by day with the running balance on each header, because a statement read without
// the balance beside it is a list of amounts rather than a story about an account.
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { router } from 'expo-router'
import { NavRow } from '~/ui/NavRow'
import { Type } from '~/ui/Text'
import { Card } from '~/ui/Card'
import { Button } from '~/ui/Button'
import { TransactionRow } from '~/ui/TransactionRow'
import { api } from '~/api/client'
import { rupees, shortDate } from '~/lib/money'
import { color } from '@dhan/design'
import { useSnapshot } from '~/state/snapshot'
import type { Transaction } from '@dhan/contracts'

export default function Statement() {
  // Cursor pagination over /transactions is this screen's own concern and stays here. The
  // as-of date is not: it is the one clock the whole app runs on, so it comes from the
  // snapshot rather than from a second read of /session that could disagree with it.
  const { asOf } = useSnapshot()
  const [items, setItems] = useState<Transaction[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .transactions()
      .then((page) => {
        setItems(page.items)
        setCursor(page.nextCursor)
      })
      .catch(() => setError('Could not load your statement.'))
      .finally(() => setLoading(false))
  }, [])

  const loadMore = useCallback(() => {
    if (!cursor || more) return
    setMore(true)
    api
      .transactions(cursor)
      .then((page) => {
        setItems((prev) => [...prev, ...page.items])
        setCursor(page.nextCursor)
      })
      .catch(() => setError('Could not load more.'))
      .finally(() => setMore(false))
  }, [cursor, more])

  const days = groupByDay(items)

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow onBack={() => router.back()} />
      <View className="px-pad pb-lg">
        <Type role="display">Statement</Type>
        {items.length > 0 && (
          <Type role="body" tone="soft" className="mt-xs">
            {items.length} lines, newest first.
          </Type>
        )}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-pad pb-xxl gap-lg">
        {loading ? (
          <ActivityIndicator color={color.inkSoft} />
        ) : error ? (
          <Type role="body" tone="danger">
            {error}
          </Type>
        ) : (
          <>
            {days.map(([date, rows]) => (
              <View key={date} className="gap-sm">
                <View className="flex-row items-baseline justify-between">
                  <Type role="heading">{shortDate(date, asOf ?? undefined)}</Type>
                  {/* The balance after the last line of that day: what the account was worth
                      when the day ended. */}
                  <Type role="caption" tone="soft">
                    {rupees(rows[rows.length - 1]?.balanceAfterTxn ?? 0)}
                  </Type>
                </View>
                <Card>
                  {rows.map((txn, i) => (
                    <TransactionRow
                      key={txn.txnId}
                      txn={txn}
                      asOf={asOf ?? undefined}
                      divide={i > 0}
                      showDate={false}
                    />
                  ))}
                </Card>
              </View>
            ))}

            {cursor && (
              <Button
                label={more ? 'Loading…' : 'Load more'}
                variant="secondary"
                loading={more}
                onPress={loadMore}
              />
            )}
            {!cursor && items.length > 0 && (
              <Type role="caption" tone="faint" className="text-center">
                That is the whole statement I was given.
              </Type>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

/** Newest first, preserving the order the server sent. */
function groupByDay(items: Transaction[]): Array<[string, Transaction[]]> {
  const days = new Map<string, Transaction[]>()
  for (const txn of items) {
    const list = days.get(txn.txnDate) ?? []
    list.push(txn)
    days.set(txn.txnDate, list)
  }
  return [...days.entries()]
}
