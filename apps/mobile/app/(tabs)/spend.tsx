// Spend — the home tab.
//
// Cleo's Spend opens on a title, three pills and a horizontal carousel of accounts.
// Ours keeps that skeleton and puts today's one action above the carousel, because the
// balance is a fact the customer can already get from GO Mobile+ and the action is the
// only thing here they cannot.
//
// Three panes, mapping one-to-one onto Cleo's Overview / Budget / Debt — which the file
// claimed before it was true. A fourth, `savings`, sat between Budget and Debt and drew the
// roadmap's goal card a second time. It has gone to the Grow tab, which is the slot Cleo's
// Save tab occupies in our five, and it is a real savings pot there rather than a repeat of
// the plan: deposits, save hacks and the interest the balance earns. Nothing on this tab
// links to it, because the tab bar already does. That rule is about a pane the tab bar can
// already reach; the credit strip in the Debt pane below points at `/credit`, a pushed route
// with no tab of its own, so a link from here is the only door a customer has to it.
import { useRef } from 'react'
import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { TabHeader } from '~/ui/TabHeader'
import { Pills, usePane } from '~/ui/Pills'
import { Pane, Reveal } from '~/ui/Reveal'
import { Type } from '~/ui/Text'
import { Count, useCountUp } from '~/ui/Count'
import { Card } from '~/ui/Card'
import { Section } from '~/ui/Section'
import { SnapshotScroll } from '~/ui/SnapshotScroll'
import { Meter } from '~/ui/Meter'
import { Tap } from '~/ui/Tap'
import { dur } from '~/ui/motion'
import { ActionCard } from '~/ui/ActionCard'
import { InsightCarousel } from '~/ui/InsightCarousel'
import { Glyph } from '~/ui/Glyph'
import { MerchantMark } from '~/ui/MerchantMark'
import { TransactionRow } from '~/ui/TransactionRow'
import { useSnapshot } from '~/state/snapshot'
import { api } from '~/api/client'
import { monthlyByCategory } from '~/lib/spend'
import { rupees, rupeesShort, splitAmount, shortDate } from '~/lib/money'
import { color } from '@dhan/design'
import type { DecisionKind, DecisionResponse, View as ViewModel } from '@dhan/contracts'

type Pane = 'overview' | 'budget' | 'debt'

const PANES = [
  { value: 'overview' as const, label: 'Overview' },
  { value: 'budget' as const, label: 'Budget' },
  { value: 'debt' as const, label: 'Debt' },
]

export default function Spend() {
  const { refresh } = useSnapshot()
  const { pane, dir, set } = usePane<Pane>('overview')
  const scroller = useRef<ScrollView>(null)

  // A decision changes the plan, so the view is refetched after it lands. The card shows
  // its own confirmation first, which means the refresh can take its time without the
  // screen appearing to do nothing.
  async function decide(actionId: string, kind: DecisionKind) {
    const outcome = await api.decideAction(actionId, kind)
    void refresh()
    return outcome
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <TabHeader title="Home" />
      <Pills
        options={PANES}
        value={pane}
        onChange={(next, d) => {
          set(next, d)
          // Jumping the scroll before the new pane enters, not after: the pane animates in from
          // the top of its own content, so an animated scroll would be a second motion racing it.
          scroller.current?.scrollTo({ y: 0, animated: false })
        }}
      />

      <SnapshotScroll ref={scroller} loading="Reading your money…">
        {(view) => (
          // Keyed on the pane so the remount is what runs the entrance, and entering from the
          // side the customer reached for: Overview → Debt comes in from the right, back from
          // Debt comes in from the left.
          <Pane key={pane} dir={dir} className="gap-md">
            {pane === 'overview' ? (
              <Overview view={view} onDecide={decide} />
            ) : pane === 'budget' ? (
              <Budget view={view} />
            ) : (
              <Debt view={view} />
            )}
          </Pane>
        )}
      </SnapshotScroll>
    </SafeAreaView>
  )
}

function Overview({
  view,
  onDecide,
}: {
  view: ViewModel
  onDecide: (id: string, kind: DecisionKind) => Promise<DecisionResponse>
}) {
  const { snapshot, accounts, plan } = view
  return (
    <>
      {plan.primary && (
        <ActionCard action={plan.primary} onDecide={(kind) => onDecide(plan.primary!.id, kind)} />
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-md pr-pad"
        className="-mx-pad px-pad"
        style={{ flexGrow: 0, flexShrink: 0 }}
      >
        <BalanceCard
          label="Savings"
          sub={accounts[0]?.accountNumberMasked.slice(-8) ?? ''}
          amount={snapshot.balances.savings}
          dark
        />
        {snapshot.balances.deposits > 0 && (
          <BalanceCard
            label="Deposits"
            sub={
              snapshot.balances.maturingSoon
                ? `Matures ${shortDate(snapshot.balances.maturingSoon.maturityDate, snapshot.asOf)}`
                : 'Fixed'
            }
            amount={snapshot.balances.deposits}
          />
        )}
        <BalanceCard
          label="Investments"
          sub={`SIP ${rupeesShort(snapshot.holdings.sipMonthly)}/mo`}
          amount={snapshot.holdings.total}
        />
      </ScrollView>

      <Section title="Since last week" onMore={() => router.push('/statement')} />
      <Card>
        {plan.since.transactions.slice(0, 6).map((t, i) => (
          <Reveal key={t.txnId} i={i} delay={dur.state}>
            <TransactionRow txn={t} asOf={snapshot.asOf} divide={i > 0} />
          </Reveal>
        ))}
        {plan.since.transactions.length === 0 && (
          <View className="px-lg py-lg">
            <Type role="body" tone="soft">
              Nothing since {shortDate(plan.since.from, snapshot.asOf)}.
            </Type>
          </View>
        )}
      </Card>
    </>
  )
}

function Budget({ view }: { view: ViewModel }) {
  const { safeToSpend } = view.plan
  const { discretionary, quality } = view.snapshot

  const { months, perMonth, largest } = monthlyByCategory(
    discretionary.byCategory,
    quality.monthsOfHistory,
  )

  const spent = Math.max(0, safeToSpend.envelope - safeToSpend.pot)
  const reserved = safeToSpend.reserved.filter((r) => r.label !== 'Spent so far this month')
  const due = reserved.reduce((sum, r) => sum + r.amount, 0)
  const over = safeToSpend.pot <= 0

  return (
    <>
      {/* Cleo's budget hero: one number, how long it has to last, and the two figures that
          explain it. The gear is the only way into the settings, exactly as Cleo has it. */}
      <View className="rounded-xl bg-budget p-lg">
        <View className="flex-row items-start justify-between">
          <View>
            <Type role="heading">Budget</Type>
            <Type role="caption" className="mt-0.5 opacity-70">
              {shortDate(view.plan.date, view.snapshot.asOf)} to{' '}
              {shortDate(safeToSpend.nextSalaryDate, view.snapshot.asOf)}
            </Type>
          </View>
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Budget settings"
            onPress={() => router.push('/budget-settings')}
            scale={0.9}
            className="h-9 w-9 items-center justify-center rounded-pill bg-ink/10"
          >
            <Glyph name="sliders" size={18} />
          </Tap>
        </View>

        <View className="mt-lg">
          <Count value={safeToSpend.pot} format={rupees} role="display" delay={dur.enter} />
          <Type role="body" className="mt-xs opacity-80">
            {over
              ? 'Over your limit this month'
              : safeToSpend.limit === null
                ? 'Left to spend on yourself'
                : `Left of the ${rupees(safeToSpend.limit)} you set`}
          </Type>
        </View>

        <View className="mt-lg flex-row items-center justify-between">
          <Type role="caption" className="opacity-70">
            {safeToSpend.daysToSalary} days to go
          </Type>
          <Type role="caption" className="opacity-70">
            {rupees(safeToSpend.perDay)} a day
          </Type>
        </View>
        <View className="mt-sm">
          <Meter
            fraction={spent / Math.max(1, safeToSpend.envelope)}
            tone={over ? 'bg-danger' : 'bg-ink'}
            delay={dur.enter}
          />
        </View>

        <View className="mt-lg flex-row gap-md">
          <Tile label="Spent" amount={spent} />
          <Tile label="Due" amount={due} />
        </View>
      </View>

      {/* The findings, as Cleo's paginated Smart insights rather than a stack of cards. */}
      {view.insights.length > 0 && (
        <>
          <Section title="Your smart insights" />
          <InsightCarousel
            insights={view.insights}
            onTalk={(insight) =>
              router.push({ pathname: '/(tabs)/uday', params: { ask: insight.headline } })
            }
          />
        </>
      )}

      <Section title="Already spoken for" />
      <Card>
        {reserved.map((r, i) => (
          <View
            key={r.label}
            className={
              i > 0
                ? 'flex-row justify-between border-t border-hairline px-lg py-md'
                : 'flex-row justify-between px-lg py-md'
            }
          >
            <Type role="body" tone="mid" className="flex-1">
              {r.label}
            </Type>
            <Type role="label">{rupees(r.amount)}</Type>
          </View>
        ))}
        <View className="flex-row justify-between border-t border-hairline bg-ground-deep px-lg py-md">
          <Type role="label">Left over each month</Type>
          <Type role="label" tone="brand">
            {rupees(view.snapshot.surplus.deployable)}
          </Type>
        </View>
      </Card>

      <Section title={`Where it goes · ${rupees(discretionary.monthly)} a month`} />
      <Type role="caption" tone="faint" className="-mt-xs">
        Monthly average across {months} months of statement.
      </Type>
      <Card>
        {perMonth.slice(0, 6).map(([name, amount], i) => (
          <View
            key={name}
            className={i > 0 ? 'border-t border-hairline px-lg py-md' : 'px-lg py-md'}
          >
            <View className="flex-row items-center gap-md">
              <MerchantMark merchant={null} category={name} size={32} />
              <Type role="body" tone="mid" className="flex-1">
                {name}
              </Type>
              <Type role="label">{rupees(amount)}</Type>
            </View>
            <View className="mt-sm">
              <Meter
                fraction={amount / largest}
                tone="bg-brand"
                track="bg-ground-deep"
                delay={dur.state}
              />
            </View>
          </View>
        ))}
      </Card>
    </>
  )
}

/** One of the two figures under the budget bar. */
function Tile({ label, amount }: { label: string; amount: number }) {
  return (
    <View className="flex-1 rounded-md bg-ink/10 px-md py-sm">
      <Type role="caption" className="opacity-70">
        {label}
      </Type>
      <Type role="heading" className="mt-0.5">
        {rupees(amount)}
      </Type>
    </View>
  )
}

function Debt({ view }: { view: ViewModel }) {
  const { debt } = view.snapshot
  if (debt.total === 0) {
    return (
      <View className="rounded-lg bg-success p-lg">
        <Type role="title">Nothing owed</Type>
        <Type role="body" className="mt-sm opacity-80">
          No loans, no card balance, no missed repayments on record.
        </Type>
      </View>
    )
  }
  return (
    <>
      <View
        className={
          debt.hasHighInterest ? 'rounded-lg bg-danger-soft p-lg' : 'rounded-lg bg-hero p-lg'
        }
      >
        <Type role="caption" tone={debt.hasHighInterest ? 'ink' : 'onInk'} className="opacity-85">
          OUTSTANDING
        </Type>
        <Count
          value={debt.total}
          format={rupees}
          role="display"
          tone={debt.hasHighInterest ? 'ink' : 'onInk'}
          className="mt-xs"
          delay={dur.enter}
        />
        <Type
          role="body"
          tone={debt.hasHighInterest ? 'ink' : 'onInk'}
          className="mt-sm opacity-85"
        >
          {rupees(debt.monthlyOutgo)} a month · highest rate {debt.highestRate}%
        </Type>
      </View>

      <CreditStrip late={debt.missedRepayment} />

      {debt.hasHighInterest && (
        <View className="rounded-lg border border-danger bg-surface p-lg">
          <Type role="heading" tone="danger">
            This comes first
          </Type>
          <Type role="body" tone="soft" className="mt-xs">
            Nothing is recommended to you while borrowing at {debt.highestRate}% is outstanding. No
            market return reliably beats it.
          </Type>
        </View>
      )}

      {debt.endingSoon && (
        <Card>
          <View className="px-lg py-lg">
            <Type role="heading">{debt.endingSoon.loanType} ends soon</Type>
            <Type role="body" tone="soft" className="mt-xs">
              {debt.endingSoon.monthsLeft} payments left at {rupees(debt.endingSoon.emiAmount)}.
              That is {rupees(debt.endingSoon.emiAmount)} a month back in your hands from then.
            </Type>
          </View>
        </Card>
      )}
    </>
  )
}

/**
 * The door to `/credit`, and on the demo path the only one there is.
 *
 * Built here in `SourceStrip.tsx:38-54`'s shape rather than by parameterising that component:
 * it is about custodians and the consent behind them, and a second subject bolted onto it is
 * how one strip turns into a switch on what it is a strip of.
 *
 * The late headline says "on your IDBI file", never "on your credit file". The screen behind
 * this link spends its whole length arguing that nobody here has asked a bureau anything, and a
 * strip that claims the bureau's file has contradicted it before it opens.
 */
function CreditStrip({ late }: { late: boolean }) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel="Open what IDBI can see about how you borrow."
      onPress={() => router.push('/credit')}
      scale={0.99}
      className="flex-row items-center gap-md rounded-lg border border-hairline bg-surface px-lg py-lg"
    >
      <View className="h-9 w-9 items-center justify-center rounded-pill bg-ground-deep">
        <Glyph name="gauge" size={19} tint={color.ink} />
      </View>
      <View className="flex-1">
        <Type role="heading">
          {late ? 'A late repayment on your IDBI file' : 'How you borrow with IDBI'}
        </Type>
        <Type role="body" tone="soft" className="mt-[2px]">
          What we can see, and what we cannot
        </Type>
      </View>
      <Glyph name="chevronRight" size={20} tint={color.inkSoft} />
    </Tap>
  )
}

function BalanceCard({
  label,
  sub,
  amount,
  dark = false,
}: {
  label: string
  sub: string
  amount: number
  dark?: boolean
}) {
  // The balance counts, and the paise count with it — splitting the *animated* figure rather
  // than the final one means the decimals settle at the same instant the rupees do. Splitting
  // the final one and counting only the whole part leaves a static ".85" hanging off a moving
  // number, which is worse than not animating at all.
  const { whole, paise } = splitAmount(useCountUp(amount, { delay: dur.enter }))
  return (
    <View
      className={
        dark
          ? 'w-[240px] rounded-lg bg-ink p-lg'
          : 'w-[240px] rounded-lg border border-hairline bg-surface p-lg'
      }
    >
      <Type
        role="caption"
        tone={dark ? 'onInk' : 'soft'}
        className={dark ? 'opacity-70' : undefined}
      >
        {label.toUpperCase()}
      </Type>
      <View className="mt-lg flex-row items-baseline">
        <Type role="title" tone={dark ? 'onInk' : 'ink'}>
          {whole}
        </Type>
        {paise ? (
          <Type role="body" tone={dark ? 'onInk' : 'soft'} className="opacity-85">
            {paise}
          </Type>
        ) : null}
      </View>
      <Type
        role="caption"
        tone={dark ? 'onInk' : 'soft'}
        className={dark ? 'mt-xs opacity-60' : 'mt-xs'}
      >
        {sub}
      </Type>
    </View>
  )
}
