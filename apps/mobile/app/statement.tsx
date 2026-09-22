// The full statement.
//
// Cleo puts an arrow beside "Recent transactions" and it opens the lot. The short list on
// Spend answers "what just happened"; this answers "where did it all go". Different questions,
// different lengths: a handful of rows there, the whole ledger here. It closes with a ×, as
// Cleo's full list does — it is somewhere you look and put away — and `leave` makes the × land
// on Spend when a deep link opened it with nothing underneath.
//
// Grouped by day, and each day carries the balance it closed on, because a statement read
// without its balance is a list of amounts rather than a story about an account. That balance
// is summed across every account the lines come from. An aggregated customer's lines interleave
// four ledgers, and the line nearest a day's end belongs to whichever account moved last: read
// on its own, the day's balance jumped between ₹3,18,774 and ₹17,025 from one day to the next.
// So the walk starts from each account's balance today and steps back through the lines one
// account at a time, and the card at the top shows the same total the Savings card on Spend does.
//
// A customer who switched Transactions off on "What IDBI may read" sees no lines here either.
// The advice already stops reading them; a statement that went on listing them would make the
// switch look decorative. The route itself does not know about the switch, so the session says.
//
// Pages load as the list nears its end; there is nothing to press. A page that fails is said
// under the lines already shown, not instead of them — they are still true — and it waits for
// a tap to try again, so a dead connection is not retried on every scroll. Tapping a line opens
// its detail sheet over the list, which keeps its place.
//
// `?highlight=income` is Budget settings asking where the salary is: the list finds the income,
// looking a few pages back when the first does not reach it, scrolls it into view and tints it
// for the visit. The param is cleared once acted on, so it does not fire again on a re-render.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, RefreshControl, SectionList, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router'
import { NavRow, leave } from '~/ui/NavRow'
import { Type } from '~/ui/Text'
import { Card } from '~/ui/Card'
import { SourceMark } from '~/ui/SourceMark'
import { GlyphPlate } from '~/ui/Glyph'
import { TransactionRow } from '~/ui/TransactionRow'
import { TransactionSheet } from '~/ui/TransactionSheet'
import { EmptyState, OFFLINE, RetryLine } from '~/ui/SnapshotScroll'
import { cn } from '~/ui/cn'
import { useReducedMotion } from '~/ui/motion'
import { api } from '~/api/client'
import { rupees, shortDate, splitAmount } from '~/lib/money'
import { useSnapshot } from '~/state/snapshot'
import { color, size, space } from '@dhan/design'
import type { Account, Transaction } from '@dhan/contracts'

/** One day of lines, and what the accounts held between them when the day ended. */
type Day = { date: string; closing: number | null; data: Transaction[] }

/**
 * Each account's balance today, keyed the way a line names its account, and whether every one
 * of them is IDBI's own: the only total the filled IDBI mark may sit beside.
 */
type Ledgers = { primary: string; now: ReadonlyMap<string, number>; allHome: boolean }

/** Where a line sits in the list, in the terms `scrollToLocation` takes. */
type Spot = { sectionIndex: number; itemIndex: number }

/** How many older pages are read looking for the income before the highlight gives up. */
const HUNT = 4

const NBSP = '\u00a0'

export default function Statement() {
  // Cursor pagination over /transactions is this screen's own concern and stays here. The
  // as-of date is not: it is the one clock the whole app runs on, so it comes from the
  // snapshot. The /session read below is for the Transactions switch only, never the clock.
  const { data: view, asOf } = useSnapshot()
  const today = asOf ?? undefined
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  const { highlight } = useLocalSearchParams<{ highlight?: string }>()
  const navigation = useNavigation<{
    setParams: (params: Record<string, string | undefined>) => void
  }>()
  const listRef = useRef<SectionList<Transaction, Day>>(null)

  const [items, setItems] = useState<Transaction[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [switchedOff, setSwitchedOff] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [stale, setStale] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState(false)
  const [openTxn, setOpenTxn] = useState<Transaction | null>(null)
  const [tinted, setTinted] = useState(false)
  const [spot, setSpot] = useState<Spot | null>(null)

  // Bumped by every first-page read, so an older page that lands after a refresh began is
  // dropped rather than appended to a list it no longer belongs to.
  const generation = useRef(0)
  // A ref, not state: `onEndReached` can fire twice before the render that would say "busy".
  const fetching = useRef(false)
  const found = useRef(false)
  const hunted = useRef(0)
  const aims = useRef(0)

  // `focus` is the quiet re-read on coming back from "What IDBI may read": no spinner, and a
  // failure keeps what is on screen, the same as a pull. `check` is the empty statement's "Check
  // again": back to the spinner, so the press shows even when the answer is still "nothing".
  const loadFirst = useCallback((how: 'mount' | 'pull' | 'retry' | 'focus' | 'check') => {
    const gen = ++generation.current
    const keeps = how === 'pull' || how === 'focus'
    fetching.current = false
    setLoadingMore(false)
    setMoreError(false)
    if (how === 'pull') setRefreshing(true)
    if (how === 'retry') setRetrying(true)
    if (how === 'check') setPhase('loading')
    // A session that cannot be read is not evidence of a withdrawal, so it shows the lines.
    Promise.all([api.transactions(), api.session().catch(() => null)])
      .then(
        ([page, session]) => {
          if (gen !== generation.current) return
          const off = session?.scopeOverrides.includes('TXN') ?? false
          setSwitchedOff(off)
          setItems(off ? [] : page.items)
          setCursor(off ? null : page.nextCursor)
          setStale(false)
          setPhase('ready')
        },
        () => {
          if (gen !== generation.current) return
          // A pull that fails leaves the lines where they are, marked as possibly behind; only
          // a list with nothing on it yet turns into the retry screen.
          if (keeps) setStale(true)
          setPhase((was) => (keeps && was === 'ready' ? 'ready' : 'error'))
        },
      )
      .finally(() => {
        if (gen !== generation.current) return
        setRefreshing(false)
        setRetrying(false)
      })
  }, [])

  useEffect(() => {
    loadFirst('mount')
  }, [loadFirst])

  // Back from "What IDBI may read" with the switch turned on again, the empty list should fill.
  // Only a list with nothing on it re-reads: one the customer has scrolled keeps its pages.
  const returned = useRef(false)
  const bare = useRef(false)
  useEffect(() => {
    bare.current = items.length === 0 && phase === 'ready'
  }, [items, phase])
  useFocusEffect(
    useCallback(() => {
      if (returned.current && bare.current) loadFirst('focus')
      returned.current = true
    }, [loadFirst]),
  )

  const loadMore = useCallback(() => {
    if (cursor === null || fetching.current) return
    fetching.current = true
    const gen = generation.current
    setLoadingMore(true)
    setMoreError(false)
    api
      .transactions(cursor)
      .then(
        (page) => {
          if (gen !== generation.current) return
          setItems((prev) => append(prev, page.items))
          setCursor(page.nextCursor)
        },
        () => {
          if (gen === generation.current) setMoreError(true)
        },
      )
      .finally(() => {
        if (gen !== generation.current) return
        fetching.current = false
        setLoadingMore(false)
      })
  }, [cursor])

  const ledgers = useMemo(() => ledgersOf(view?.accounts, items), [view, items])
  const sections = useMemo(() => byDay(items, ledgers), [items, ledgers])

  // The income a link came here for. Salary lands once a month, so the first page can start
  // after it; a few older pages are read before giving up, and the param goes either way.
  useEffect(() => {
    if (highlight !== 'income' || found.current || phase !== 'ready' || loadingMore) return
    const at = locate(sections, isIncome)
    if (at === null) {
      if (cursor !== null && !moreError && hunted.current < HUNT) {
        hunted.current += 1
        loadMore()
      } else {
        navigation.setParams({ highlight: undefined })
      }
      return
    }
    found.current = true
    setTinted(true)
    setSpot(at)
    navigation.setParams({ highlight: undefined })
  }, [highlight, phase, loadingMore, sections, cursor, moreError, loadMore, navigation])

  useEffect(() => {
    if (spot === null) return
    // After the frame that laid the rows out, or the list has nothing measured to aim at.
    const timer = setTimeout(() => {
      listRef.current?.scrollToLocation({ ...spot, viewPosition: 0.3, animated: !reduced })
    }, 80)
    return () => clearTimeout(timer)
  }, [spot, reduced])

  const total = ledgers === null ? null : sum(ledgers.now.values())
  const figure = total === null ? null : splitAmount(total)
  const count = ledgers?.now.size ?? 0
  // Karan's total includes HDFC, ICICI and Kotak, so it gets the unfilled plate another bank's
  // card gets on Spend; the filled IDBI mark would say the figure is IDBI's alone.
  const home = ledgers?.allHome ?? false
  const scope = count > 1 ? `Balance across ${count} accounts` : 'Balance'
  // "as of 1 Sept" is held together, so a narrow screen breaks the caption before it, not
  // between the month and its day.
  const stamp = today === undefined ? null : `as of ${shortDate(today, today)}`.replace(/ /g, NBSP)
  const caption = stamp === null ? scope : `${scope} · ${stamp}`
  const showCard = figure !== null || (phase === 'ready' && items.length > 0)

  const header = (
    <View className="pb-xs">
      <Type role="display">Statement</Type>
      {showCard ? (
        <Card
          accessible
          accessibilityLabel={
            figure === null
              ? `${caption}, not known yet`
              : `${caption}, ${figure.whole}${figure.paise}`
          }
          className="mt-lg flex-row items-center gap-md p-lg"
        >
          {home ? (
            <SourceMark kind="home" size={size.target} />
          ) : (
            <GlyphPlate
              name="ledger"
              size={size.target}
              fill="bg-ground-deep"
              tint={color.inkMid}
            />
          )}
          <View className="flex-1">
            <View className="flex-row items-baseline">
              <Type role="title" plain>
                {figure === null ? '—' : figure.whole}
              </Type>
              {figure?.paise ? (
                <Type role="label" tone="mid" plain>
                  {figure.paise}
                </Type>
              ) : null}
            </View>
            <Type role="caption" tone="mid">
              {caption}
            </Type>
          </View>
        </Card>
      ) : null}
      {stale && phase === 'ready' ? (
        <View className="mt-md">
          <RetryLine
            compact
            message={OFFLINE}
            busy={refreshing}
            onRetry={() => loadFirst('pull')}
          />
        </View>
      ) : null}
      {items.length > 0 ? (
        <Type role="caption" tone="mid" className="mt-md">
          Newest first
        </Type>
      ) : null}
    </View>
  )

  const footer = loadingMore ? (
    <View className="items-center py-lg">
      <ActivityIndicator color={color.inkMid} accessibilityLabel="Loading older lines" />
    </View>
  ) : moreError ? (
    <View className="pt-lg">
      <RetryLine compact message="Couldn't load more." onRetry={loadMore} />
    </View>
  ) : phase === 'ready' && items.length > 0 && cursor === null ? (
    <Type role="caption" tone="mid" className="py-lg text-center">
      That&apos;s all of it.
    </Type>
  ) : null

  const empty =
    phase === 'loading' ? (
      <View className="items-center py-xxl">
        <ActivityIndicator color={color.inkMid} accessibilityLabel="Loading your statement" />
      </View>
    ) : phase === 'error' ? (
      <RetryLine
        message={OFFLINE}
        detail="Your statement didn't load."
        busy={retrying}
        onRetry={() => loadFirst('retry')}
      />
    ) : switchedOff ? (
      <EmptyState
        glyph="receipt"
        title="Transactions are switched off"
        body="You asked me not to read them. Switch them back on to see your statement here."
        action={{ label: 'Check what IDBI may read', onPress: () => router.push('/connections') }}
      />
    ) : (
      // The switch has its own branch above, so this one only ever means an empty ledger.
      <EmptyState
        glyph="receipt"
        title="No transactions to show"
        body="Nothing has posted yet."
        action={{ label: 'Check again', onPress: () => loadFirst('check') }}
      />
    )

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <NavRow onClose={() => leave('/(tabs)/spend')} />
      <SectionList
        ref={listRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: space.pad,
          paddingBottom: insets.bottom + space.xxl,
        }}
        sections={sections}
        keyExtractor={(txn) => txn.txnId}
        stickySectionHeadersEnabled={false}
        onEndReached={() => {
          if (!moreError) loadMore()
        }}
        onEndReachedThreshold={0.6}
        onScrollToIndexFailed={(info) => {
          // The line is further down than the list has measured. Get near it, then aim again.
          listRef.current
            ?.getScrollResponder()
            ?.scrollTo({ y: info.averageItemLength * info.index, animated: false })
          if (aims.current < 3) {
            aims.current += 1
            setSpot((was) => (was === null ? null : { ...was }))
          }
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={color.inkSoft}
            onRefresh={() => loadFirst('pull')}
          />
        }
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={empty}
        renderSectionHeader={({ section }) => (
          <View
            accessible
            accessibilityRole="header"
            accessibilityLabel={
              section.closing === null
                ? shortDate(section.date, today)
                : `${shortDate(section.date, today)}, balance ${rupees(section.closing)}`
            }
            className="flex-row items-baseline justify-between gap-md pb-sm pt-xl"
          >
            <Type role="body" tone="mid">
              {shortDate(section.date, today)}
            </Type>
            {section.closing === null ? null : (
              <Type role="caption" tone="mid">
                Balance {rupees(section.closing)}
              </Type>
            )}
          </View>
        )}
        renderItem={({ item, index, section }) => (
          // The day's white card, drawn a slice per row so the list stays virtualised: the
          // first slice takes the top corners, the last the bottom ones.
          <View
            className={cn(
              'overflow-hidden border-x border-hairline bg-surface',
              index === 0 && 'rounded-t-card border-t',
              index === section.data.length - 1 && 'rounded-b-card border-b',
            )}
          >
            <TransactionRow
              txn={item}
              asOf={today}
              divide={index > 0}
              showDate={false}
              highlighted={tinted && isIncome(item)}
              onPress={() => setOpenTxn(item)}
            />
          </View>
        )}
      />
      <TransactionSheet txn={openTxn} asOf={today} onClose={() => setOpenTxn(null)} />
    </SafeAreaView>
  )
}

/** Income as a customer means it: the salary, or any credit filed under Income. */
const isIncome = (txn: Transaction): boolean =>
  txn.isSalaryCredit || (txn.txnType === 'CREDIT' && txn.spendCategory === 'Income')

/** A later page appended, without a line the server sent twice across a page boundary. */
function append(prev: readonly Transaction[], next: readonly Transaction[]): Transaction[] {
  const seen = new Set(prev.map((txn) => txn.txnId))
  return [...prev, ...next.filter((txn) => !seen.has(txn.txnId))]
}

function sum(values: Iterable<number>): number {
  let total = 0
  for (const value of values) total += value
  return total
}

/**
 * Today's balance of every account the statement's lines can come from.
 *
 * From the view's accounts where it has them: the savings and current accounts, which are
 * where lines post (a deposit has no statement lines to walk). A line with no account number is
 * the customer's primary account, which is IDBI's own. With no view yet — a cold open of this
 * route — a single ledger can still be read off its own newest line; several cannot, and a
 * figure taken from one of them would be a guess about the rest.
 */
function ledgersOf(
  accounts: readonly Account[] | undefined,
  items: readonly Transaction[],
): Ledgers | null {
  const spendable = (accounts ?? []).filter(
    (a) => a.accountType === 'Savings' || a.accountType === 'Current',
  )
  const home = spendable.find((a) => a.institution?.isHome ?? true) ?? spendable[0]
  if (home !== undefined) {
    return {
      primary: home.accountNumberMasked,
      now: new Map(spendable.map((a) => [a.accountNumberMasked, a.currentBalance])),
      allHome: spendable.every((a) => a.institution?.isHome ?? true),
    }
  }
  const newest = items[0]
  const ledgerCount = new Set(items.map((txn) => txn.accountNumberMasked ?? '')).size
  if (newest === undefined || ledgerCount !== 1 || newest.balanceAfterTxn === null) return null
  const key = newest.accountNumberMasked ?? ''
  return { primary: key, now: new Map([[key, newest.balanceAfterTxn]]), allHome: key === '' }
}

/**
 * The lines in days, newest first as the server sent them, each with its closing balance.
 *
 * The walk runs backwards from today. Before a day's lines are stepped over, the running
 * figures are what each account held when that day ended; stepping over a line puts back what
 * it moved, re-anchored on the bank's own "balance after" wherever the line carries one. An
 * account outside the total — a deposit, a block the customer withdrew — is left out rather
 * than half-counted.
 */
function byDay(items: readonly Transaction[], ledgers: Ledgers | null): Day[] {
  const days: Day[] = []
  for (const txn of items) {
    const last = days[days.length - 1]
    if (last !== undefined && last.date === txn.txnDate) last.data.push(txn)
    else days.push({ date: txn.txnDate, closing: null, data: [txn] })
  }
  if (ledgers === null) return days

  const running = new Map(ledgers.now)
  for (const day of days) {
    day.closing = sum(running.values())
    for (const txn of day.data) {
      const key = txn.accountNumberMasked ?? ledgers.primary
      const held = running.get(key)
      if (held === undefined) continue
      const after = txn.balanceAfterTxn ?? held
      running.set(key, after + (txn.txnType === 'CREDIT' ? -txn.txnAmount : txn.txnAmount))
    }
  }
  return days
}

/** The first line that matches, as a list position. A section's index 0 is its heading. */
function locate(days: readonly Day[], match: (txn: Transaction) => boolean): Spot | null {
  for (const [sectionIndex, day] of days.entries()) {
    const at = day.data.findIndex(match)
    if (at >= 0) return { sectionIndex, itemIndex: at + 1 }
  }
  return null
}
