// Budget settings — Cleo's four-row sheet, over the four facts a month's budget is built from.
//
// Cleo list Linked paycheck, Review bills, Spending limit and Essential spends. Ours are Salary,
// Regular payments, Spending limit and Category limits, because those are the four things the
// engine actually builds the month out of: what comes in, what is already promised, the ceiling
// the customer chose, and the caps they put on single categories.
//
// "Essential spends" is the row that did not survive the translation. The wire carries no
// essentials flag, so the row counted every category it could find and opened the limit editor —
// a promise about a feature that does not exist, next to a number that meant the opposite of its
// label. The fourth row is now what that editor really holds: a cap per category, counted off the
// session, opening the editor with its category toggle already on.
//
// Two of the four are read-outs of what the engine derived, not forms. The salary is the credit
// the categoriser found and the bills are the recurring series `recurring.ts` detected; asking a
// customer to type either would be asking them to re-enter what their statement already says. So
// those rows open the evidence instead of an editor — the statement scrolled to the salary credit,
// and the Budget pane, whose card lists everything already spoken for. The Budget pane is reached
// by popping back to the tabs rather than pushing them: a second tab navigator on top of the first
// is a second tab bar, and a back gesture that lands on the first.
//
// Figures are withheld while the reads are in flight rather than printed as ₹0. An absent figure
// says "not yet" and a zero says "nothing", and only one of those is true. A read that failed says
// so with a way to ask again; the stamp at the foot is the same ask on purpose — Cleo's "Last
// refreshed" chip, which is a button there too.
//
// On a narrow phone the figures take their short form (₹1.92L). The row gives its figure two
// fifths of the width, and at 320 a full figure was cut off mid-number — a rounded amount is
// still true, and "₹1,92,0…" is not an amount at all.
import { useCallback, useState } from 'react'
import { View, useWindowDimensions } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Screen } from '~/ui/Screen'
import { leave } from '~/ui/NavRow'
import { Card } from '~/ui/Card'
import { Chip } from '~/ui/Chip'
import { Tap } from '~/ui/Tap'
import { SettingRow } from '~/ui/SettingRow'
import { OFFLINE, RetryLine } from '~/ui/SnapshotScroll'
import { useSnapshot } from '~/state/snapshot'
import { api } from '~/api/client'
import { rupees, rupeesShort, shortDate } from '~/lib/money'
import { ordinal } from '~/lib/savehack'
import type { CategoryCap } from '@dhan/contracts'

/** Below this width a full rupee figure no longer fits the row's figure slot. */
const NARROW = 360

export default function BudgetSettings() {
  const { data: view, state, refresh } = useSnapshot()
  const { width } = useWindowDimensions()
  const money = width < NARROW ? rupeesShort : rupees
  // The caps live on the session, not the view. Null until the read lands, and the row's count is
  // withheld until then for the same reason the figures are.
  const [caps, setCaps] = useState<CategoryCap[] | null>(null)
  const [capsFailed, setCapsFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const readCaps = useCallback(async () => {
    try {
      const session = await api.session()
      setCaps(session.caps)
      setCapsFailed(false)
    } catch {
      setCapsFailed(true)
    }
  }, [])

  // On focus, not on mount: the way back here from the limit editor is a pop, and the count has to
  // say what was just saved there.
  useFocusEffect(
    useCallback(() => {
      void readCaps()
    }, [readCaps]),
  )

  const again = () => {
    setRefreshing(true)
    void Promise.all([refresh(), readCaps()]).finally(() => setRefreshing(false))
  }

  const snapshot = view?.snapshot
  const limit = view?.plan.safeToSpend.limit
  const income = snapshot?.income
  const months = snapshot?.quality.monthsOfHistory ?? 0

  // A salary lands on a day; income that comes in when it comes in does not, and saying "the 1st"
  // for it would be inventing a payday.
  const payLine =
    income === undefined
      ? state === 'error'
        ? undefined
        : 'Reading your statement…'
      : income.stability === 'regular' && income.payDay !== null
        ? `Lands on the ${ordinal(income.payDay)}`
        : 'Varies month to month'

  return (
    <Screen
      onBack={() => leave('/(tabs)/spend')}
      title="Budget settings"
      subtitle="What the budget is built from."
    >
      {state === 'error' || capsFailed ? (
        <View className="mt-lg">
          <RetryLine compact message={OFFLINE} onRetry={again} busy={refreshing} />
        </View>
      ) : null}

      <Card className="mt-xl">
        <SettingRow
          glyph="paycheck"
          title={income?.source === 'monthly-credits' ? 'Income' : 'Salary'}
          {...(payLine === undefined ? {} : { detail: payLine })}
          {...(income === undefined ? {} : { value: money(income.monthly) })}
          onPress={() => router.push({ pathname: '/statement', params: { highlight: 'income' } })}
        />
        {/* Every commitment, not only rent, bills and EMIs: the figure carries transfers, fees,
            SIPs and subscriptions too, and Budget's "Going out this month" — which this row
            opens — splits it by those names. Titled "Rent, bills and EMIs", the whole sat
            beside a Budget row of that name for a part of it. */}
        <SettingRow
          glyph="receipt"
          title="Regular payments"
          detail="Paid every month"
          {...(snapshot === undefined ? {} : { value: money(snapshot.commitments.total) })}
          onPress={() =>
            router.dismissTo({ pathname: '/(tabs)/spend', params: { pane: 'budget' } })
          }
          divide
        />
        <SettingRow
          glyph="gauge"
          title="Spending limit"
          detail="Yours to choose"
          {...(limit === undefined ? {} : { value: limit === null ? 'Not set' : money(limit) })}
          onPress={() => router.push('/set-limit')}
          divide
        />
        <SettingRow
          glyph="basket"
          title="Category limits"
          detail="A cap per category"
          {...(caps === null ? {} : { value: capsLine(caps.length) })}
          onPress={() => router.push({ pathname: '/set-limit', params: { caps: '1' } })}
          divide
        />
      </Card>

      {snapshot === undefined ? null : (
        <Tap
          accessibilityRole="button"
          accessibilityLabel={`Refresh. As of ${shortDate(snapshot.asOf)}, ${months} months of statement`}
          accessibilityState={{ busy: refreshing, disabled: refreshing }}
          disabled={refreshing}
          haptic="none"
          onPress={again}
          className="mt-lg min-h-target justify-center self-start"
        >
          <Chip tone="ground" glyph="refresh">
            {refreshing
              ? 'Refreshing…'
              : `As of ${shortDate(snapshot.asOf)} · ${months} months of statement`}
          </Chip>
        </Tap>
      )}
    </Screen>
  )
}

/**
 * "2 caps" rather than the plan's "2 categories": the row's detail already says a cap is per
 * category, and the longer figure pushes that detail onto a second line at 375.
 */
function capsLine(n: number): string {
  if (n === 0) return 'None set'
  return `${n} ${n === 1 ? 'cap' : 'caps'}`
}
