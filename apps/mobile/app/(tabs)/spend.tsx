// The Home tab. Its route and file are still `spend`; the tab bar and the header say Home.
//
// Four panes. Overview, Budget and Debt map one-to-one onto Cleo's three; Credit sits beside
// Debt the way Cleo's Request tab pairs "Cash advance" with "Credit score". Credit used to be a
// strip inside the Debt pane pointing at `/credit`, a pushed route with no tab of its own — the
// only door to it, and one most customers scrolled past. The pane renders the same
// `CreditContent` the route does, so the two cannot drift. The gate sheet and the plan open
// this pane now; the route stays for deep links.
//
// Every pane can be asked for by link: `/spend?pane=credit` opens on Credit, cold or with the
// tab already mounted. A card on this tab that points at another pane of it switches the pane
// directly instead of linking, so the scroll comes back to the top in the same frame, exactly
// as a pill tap does.
//
// The Overview leads with today's action, above the balances — the one deliberate divergence
// from Cleo, who lead with their own card. The balance is a fact the customer can already get
// from GO Mobile+; the action is the only thing on this screen they cannot get anywhere else.
// Under it, Cleo's order: a card per account, the dial of things to do from here, one promo,
// what cleared since last week, and the findings.
//
// A fifth pane, `savings`, once sat between Budget and Debt and drew the roadmap's goal card a
// second time. It went to the Grow tab, which is Cleo's Save slot in our five, and nothing here
// links to it, because the tab bar already does.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Circle, Path } from 'react-native-svg'
import { router, useFocusEffect } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { UDAY_PORTRAIT } from '@dhan/assets'
import { color, size, space, stroke } from '@dhan/design'
import type {
  CategoryCap,
  DecisionKind,
  DecisionResponse,
  Insight,
  Stage,
  Transaction,
  View as ViewModel,
} from '@dhan/contracts'
import { TabHeader } from '~/ui/TabHeader'
import { Pills, usePane } from '~/ui/Pills'
import { Pane, Reveal } from '~/ui/Reveal'
import { Type } from '~/ui/Text'
import { Count, useCountUp } from '~/ui/Count'
import { Card } from '~/ui/Card'
import { Chip } from '~/ui/Chip'
import { Row } from '~/ui/Row'
import { Button } from '~/ui/Button'
import { Section } from '~/ui/Section'
import { SnapshotScroll } from '~/ui/SnapshotScroll'
import { Meter } from '~/ui/Meter'
import { Tap } from '~/ui/Tap'
import { Glyph, GlyphPlate } from '~/ui/Glyph'
import { SourceMark } from '~/ui/SourceMark'
import { ActionDial, type DialAction } from '~/ui/ActionDial'
import { PromoCard } from '~/ui/PromoCard'
import { Checklist, type ChecklistState, type ChecklistStep } from '~/ui/Checklist'
import { AskUday } from '~/ui/AskUday'
import { ActionCard } from '~/ui/ActionCard'
import {
  DotRail,
  InsightCarousel,
  insightKey,
  type Rating,
  type Ratings,
} from '~/ui/InsightCarousel'
import { MerchantMark } from '~/ui/MerchantMark'
import { TransactionRow } from '~/ui/TransactionRow'
import { TransactionSheet } from '~/ui/TransactionSheet'
import { CreditContent } from '~/screens/CreditContent'
import { cn } from '~/ui/cn'
import { dur } from '~/ui/motion'
import { useSnapshot } from '~/state/snapshot'
import { api } from '~/api/client'
import { balanceByMonth, goingOutRows, monthlyByCategory, newestFirst } from '~/lib/spend'
import { monthYear, rupees, rupeesShort, splitAmount, shortDate } from '~/lib/money'
import {
  MISSED_REPAYMENT,
  PAY_FIRST,
  SPARE_SAVINGS,
  debtPayoffQuestion,
  depositQuestion,
  emiEndingQuestion,
  prepayQuestion,
  questionForInsight,
} from '~/lib/ask'

type Pane = 'overview' | 'budget' | 'debt' | 'credit'

const PANES = [
  { value: 'overview' as const, label: 'Overview' },
  { value: 'budget' as const, label: 'Budget' },
  { value: 'debt' as const, label: 'Debt' },
  { value: 'credit' as const, label: 'Credit' },
]

/** Hands Uday a question and switches to the chat — one tab bar, because it navigates. */
function askUday(question: string) {
  router.navigate({ pathname: '/(tabs)/uday', params: { ask: question } })
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Below this a phone is the 320pt class, where a lakh figure beside a label stops fitting. */
const NARROW = 360

/**
 * The hairline between rows in a white card, inset to the text as Cleo draws it and as the
 * statement rows beside these draw theirs. Drawn between rows, not on them, so a row that
 * presses in does not take the rule with it.
 */
function Rule() {
  return <View className="mx-lg h-px bg-hairline" />
}

export default function Spend() {
  const { refresh } = useSnapshot()
  const { pane, dir, set } = usePane<Pane>('overview', PANES)
  const scroller = useRef<ScrollView>(null)
  const { caps, reload: reloadCaps } = useCaps()

  // The answers to the insight cards live here, above both panes that show the carousel. Kept
  // inside it, they went with every pane switch — rate a card on Overview, open Budget, come
  // back, and it asked again.
  const [rated, setRated] = useState<Ratings>({})
  const rate = useCallback(
    (key: string, rating: Rating) =>
      setRated((prev) => (prev[key] === undefined ? { ...prev, [key]: rating } : prev)),
    [],
  )

  // A pane reached by a link lands at its own top, the same as one reached by a pill. The
  // pill path jumps before the pane enters (below); this covers `?pane=` arriving from another
  // tab, where nothing else would move the scroll.
  useEffect(() => {
    scroller.current?.scrollTo({ y: 0, animated: false })
  }, [pane])

  const goTo = (next: Pane) => {
    const from = PANES.findIndex((o) => o.value === pane)
    const to = PANES.findIndex((o) => o.value === next)
    scroller.current?.scrollTo({ y: 0, animated: false })
    set(next, Math.sign(to - from))
  }

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
          // Jumping the scroll before the new pane enters, not after: the pane animates in from
          // the top of its own content, so an animated scroll would be a second motion racing it.
          scroller.current?.scrollTo({ y: 0, animated: false })
          set(next, d)
        }}
      />

      <SnapshotScroll ref={scroller} loading="Reading your money…" alsoRefresh={reloadCaps}>
        {(view) => (
          // Keyed on the pane so the remount is what runs the entrance, and entering from the
          // side the customer reached for: Overview → Debt comes in from the right, back from
          // Debt comes in from the left.
          <Pane key={pane} dir={dir} className="gap-md">
            {pane === 'overview' ? (
              <Overview view={view} rated={rated} onRate={rate} onDecide={decide} />
            ) : pane === 'budget' ? (
              <Budget view={view} caps={caps} rated={rated} onRate={rate} />
            ) : pane === 'debt' ? (
              <Debt view={view} onOpenCredit={() => goTo('credit')} />
            ) : (
              <CreditContent credit={view.snapshot.credit} />
            )}
          </Pane>
        )}
      </SnapshotScroll>
    </SafeAreaView>
  )
}

/**
 * The customer's category limits, read each time the tab comes into focus.
 *
 * They live on the session, not the view, so nothing else on this screen carries them; and
 * `/set-limit` is where they change, which is a pushed route this tab comes back into focus
 * from. `null` until the first read lands, so the budget pane can hold back what it cannot yet
 * say — a "Next steps" card drawn before the read would tick the cap step off a moment late,
 * in front of the customer.
 */
function useCaps() {
  const [caps, setCaps] = useState<readonly CategoryCap[] | null>(null)
  const reload = useCallback(
    () =>
      api
        .session()
        .then((s) => setCaps(s.caps))
        .catch(() => undefined),
    [],
  )
  useFocusEffect(
    useCallback(() => {
      let live = true
      api
        .session()
        .then((s) => {
          if (live) setCaps(s.caps)
        })
        .catch(() => undefined)
      return () => {
        live = false
      }
    }, []),
  )
  return { caps, reload }
}

/**
 * The findings in the order this visit of the pane leads with.
 *
 * "I'll put it at the back of this list" is a promise, so a finding rated down goes to the back —
 * but only the next time the pane opens. Sorting on every answer would pull the card out from
 * under the finger that just rated it, so the set is taken once, when the pane mounts. The
 * promise names this list because this list is all it moves.
 */
function useLeadOrder(insights: readonly Insight[], rated: Ratings): readonly Insight[] {
  const [down] = useState(() => new Set(Object.keys(rated).filter((key) => rated[key] === 'down')))
  return useMemo(
    () =>
      down.size === 0
        ? insights
        : [...insights].sort(
            (a, b) => Number(down.has(insightKey(a))) - Number(down.has(insightKey(b))),
          ),
    [insights, down],
  )
}

/* ------------------------------------------------------------------ *
 * Overview
 * ------------------------------------------------------------------ */

const DIAL: ReadonlyArray<DialAction> = [
  {
    id: 'statement',
    glyph: 'ledger',
    label: 'Statement',
    onPress: () => router.push('/statement'),
  },
  {
    id: 'limit',
    glyph: 'sliders',
    label: 'Set a limit',
    onPress: () => router.push('/set-limit'),
  },
  {
    id: 'sources',
    glyph: 'link',
    // The destination's own title, spoken; two words drawn, because a dial caption gets two
    // lines in a quarter of the row and "Where it comes from" ran out of both at 320.
    label: 'My data',
    accessibilityLabel: 'Where my data comes from',
    onPress: () => router.push('/connections'),
  },
]

function Overview({
  view,
  rated,
  onRate,
  onDecide,
}: {
  view: ViewModel
  rated: Ratings
  onRate: (key: string, rating: Rating) => void
  onDecide: (id: string, kind: DecisionKind) => Promise<DecisionResponse>
}) {
  const { snapshot, plan } = view
  const primary = plan.primary
  const insights = useLeadOrder(view.insights, rated)
  const recent = useMemo(() => newestFirst(plan.since.transactions), [plan.since.transactions])
  const [open, setOpen] = useState<Transaction | null>(null)

  return (
    <>
      {/* Keyed on the action, so tomorrow's action is a fresh card rather than today's card
          still showing its "Done". */}
      {primary && (
        <ActionCard
          key={primary.id}
          action={primary}
          asOf={snapshot.asOf}
          shelf={view.shelf}
          onDecide={(kind) => onDecide(primary.id, kind)}
        />
      )}

      <Balances view={view} />

      <ActionDial actions={DIAL} className="mt-lg" />

      <HomePromo view={view} />

      {/* Newest first, the statement's order: the engine sends these oldest first, and the
          first six of that were the six oldest — the spend that had just cleared was cut. */}
      <Section title="Since last week" onMore={() => router.push('/statement')} />
      <Card>
        {recent.slice(0, 6).map((t, i) => (
          <Reveal key={t.txnId} i={i} delay={dur.state}>
            <TransactionRow
              txn={t}
              asOf={snapshot.asOf}
              divide={i > 0}
              onPress={() => setOpen(t)}
            />
          </Reveal>
        ))}
        {plan.since.transactions.length === 0 && (
          <View className="px-lg py-lg">
            <Type role="body" tone="mid">
              Nothing since {shortDate(plan.since.from, snapshot.asOf)}. New spends show here as
              they clear.
            </Type>
            <Button
              size="sm"
              variant="secondary"
              label="Open the full statement"
              haptic="none"
              className="mt-md"
              onPress={() => router.push('/statement')}
            />
          </View>
        )}
      </Card>

      {insights.length > 0 && (
        <>
          <Section title="Smart insights" />
          <InsightCarousel
            insights={insights}
            snapshot={snapshot}
            rated={rated}
            onRate={onRate}
            questionOf={(i: Insight) => questionForInsight(i, snapshot.discretionary.topHabits)}
            onAsk={askUday}
          />
        </>
      )}

      {/* One sheet for the list, drawn in its own layer wherever it sits in the tree. */}
      <TransactionSheet txn={open} asOf={snapshot.asOf} onClose={() => setOpen(null)} />
    </>
  )
}

/**
 * The one loud card on Home: Cleo's promo, a door the customer has not opened yet.
 *
 * Uday's portrait is only ever on a card about Uday. It used to sit beside "See how you borrow"
 * and "Start a ₹0-spend challenge", pictures of a man next to a credit pane and a savings game,
 * and the same face was already on Profile's "Ask Uday anything". So a customer with a debt to
 * sort out gets the card that is about him — their own question, asked for them — and everyone
 * else gets the challenge without a picture rather than with the wrong one. The Credit pane lost
 * nothing by it: it is a pill at the top of this screen, and the Debt pane opens it too.
 *
 * The challenge is not "₹0-spend". Its limits are 80, 65 and 50 per cent of what the habit
 * costs now (core `challenge.ts`), so the card promises less spending, not none, and opens the
 * generator directly — Cleo's promo, then "Generating your challenge", then the challenge.
 *
 * No chip on either. A chip on a promo carries a condition or a deadline, and neither card has
 * one; a label that only says what the card is about is a kicker over its own title.
 */
function HomePromo({ view }: { view: ViewModel }) {
  const { debt, credit } = view.snapshot
  const rate = debt.highestRate
  const high = debt.highInterestTotal

  if (!debt.missedRepayment && !debt.hasHighInterest) {
    return (
      <PromoCard
        title="Spend less on one habit"
        body="Pick a habit, pick a length, keep the money."
        action={{
          label: 'Start one',
          accessibilityHint: 'Builds a challenge from your statement',
          onPress: () => router.push('/challenge-generating'),
        }}
        className="mt-lg"
      />
    )
  }

  const late =
    credit.dpdDays > 0
      ? `A repayment ${plural(credit.dpdDays, 'day', 'days')} late`
      : 'A missed repayment'
  const promo = !debt.missedRepayment
    ? {
        title: `Ask Uday how to clear ${rupees(high)}`,
        body: `At ${rate}% it costs you about ${rupees((high * rate) / 1200)} a month.`,
        ask: debtPayoffQuestion(high, rate),
      }
    : debt.hasHighInterest
      ? {
          title: 'Ask Uday what to pay first',
          body: `${late}, and ${rupees(high)} at ${rate}%.`,
          ask: PAY_FIRST,
        }
      : {
          title: 'Ask Uday what to pay first',
          body: `${late}, on ${rupees(debt.total)} of loans.`,
          ask: PAY_FIRST,
        }

  return (
    <PromoCard
      title={promo.title}
      body={promo.body}
      image={UDAY_PORTRAIT}
      action={{
        label: 'Ask Uday',
        accessibilityHint: 'Asks Uday in the chat',
        onPress: () => askUday(promo.ask),
      }}
      className="mt-lg"
    />
  )
}

/** The next card's share of the screen: 12 of gap and 28 of card, Cleo's cue to swipe. */
const PEEK = space.xxl + space.sm
/** Cleo's card is 305 wide on a 393pt phone; past that a card only gets emptier. */
const CARD_MAX_WIDTH = 300
/** Tall enough for the mark, the figure and two caption lines with air between. */
const CARD_MIN_HEIGHT = space.xxl * 5 + space.sm

function useCardWidth() {
  const { width } = useWindowDimensions()
  return Math.min(CARD_MAX_WIDTH, width - 2 * space.pad - PEEK)
}

type BalanceSpec = {
  id: string
  label: string
  sub: string
  caption: string
  amount: number
  dark?: boolean
  mark: ReactNode
  chip?: string
  onPress: () => void
}

/** "••6031" — the four digits a customer checks a card against, never twelve X's. */
const tail = (masked: string) => `••${masked.slice(-4)}`

/**
 * One card per account, then deposits and investments.
 *
 * Only the savings and current accounts get their own card: they are what `balances.savings`
 * sums, and a fixed deposit also arrives as an account, so drawing every account and then the
 * deposits card showed Rohan's ₹2,00,000 FD twice. The deposits card is the one place deposits
 * are counted, with the maturity date beside them.
 *
 * The first IDBI account is the dark card, as Cleo's own account is. Every other bank reached us
 * through an Account Aggregator consent and says so under its balance.
 */
function balanceCards(view: ViewModel): BalanceSpec[] {
  const { snapshot, accounts } = view
  const cards: BalanceSpec[] = []
  let homeDrawn = false

  for (const acct of accounts) {
    if (acct.accountType !== 'Savings' && acct.accountType !== 'Current') continue
    const away = acct.institution !== undefined && !acct.institution.isHome
    const dark = !away && !homeDrawn
    if (dark) homeDrawn = true
    cards.push({
      id: `spend.account.${acct.accountNumberMasked}`,
      label: acct.institution?.name ?? 'IDBI Bank',
      sub: `${tail(acct.accountNumberMasked)}${away ? ' · via Account Aggregator' : ''}`,
      caption: 'Balance',
      amount: acct.currentBalance,
      dark,
      mark: away ? (
        <GlyphPlate name="bank" size={size.plateLg} fill="bg-ground-deep" />
      ) : (
        <SourceMark kind="home" size={size.plateLg} />
      ),
      chip: acct.accountType,
      onPress: () => router.push('/statement'),
    })
  }

  const { deposits, maturingSoon } = snapshot.balances
  if (deposits > 0) {
    cards.push({
      id: 'spend.deposits',
      label: 'Deposits',
      sub: maturingSoon
        ? `Matures ${shortDate(maturingSoon.maturityDate, snapshot.asOf)}`
        : 'Fixed',
      caption: 'Balance',
      amount: deposits,
      mark: <GlyphPlate name="lock" size={size.plateLg} />,
      onPress: () => askUday(depositQuestion(deposits)),
    })
  }

  cards.push({
    id: 'spend.investments',
    label: 'Investments',
    sub:
      snapshot.holdings.sipMonthly > 0
        ? `SIP ${rupeesShort(snapshot.holdings.sipMonthly)} a month`
        : 'No monthly SIP',
    caption: 'Value',
    amount: snapshot.holdings.total,
    mark: <GlyphPlate name="grow" size={size.plateLg} />,
    onPress: () => router.navigate({ pathname: '/(tabs)/grow', params: { pane: 'holdings' } }),
  })

  return cards
}

function Balances({ view }: { view: ViewModel }) {
  const width = useCardWidth()
  const cards = balanceCards(view)
  const [active, setActive] = useState(0)
  const stride = width + space.md

  // The rail follows the offset, not momentum, for the carousel's reasons (InsightCarousel.tsx):
  // a slow release fires no momentum event, and the last card rests short of its snap point.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / stride)
    setActive(Math.max(0, Math.min(cards.length - 1, next)))
  }

  return (
    <>
      {/* Full-bleed, with the gutter moved onto the content: the first card starts on the
          screen's gutter and the next one runs off the edge instead of being clipped by it.
          The same on the vertical: 4pt of padding, given back by the margins, is room for the
          web's focus ring round a card, which the scroller would otherwise cut off. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={stride}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        className="-mx-pad -mb-xs mt-xs"
        contentContainerClassName="gap-md px-pad py-xs"
        style={{ flexGrow: 0, flexShrink: 0 }}
      >
        {cards.map(({ id, ...card }) => (
          <BalanceCard key={id} id={id} width={width} {...card} />
        ))}
      </ScrollView>
      {cards.length > 1 && (
        <DotRail
          count={cards.length}
          active={Math.min(active, cards.length - 1)}
          label={`Balance ${Math.min(active, cards.length - 1) + 1} of ${cards.length}`}
          className="mt-md"
        />
      )}
    </>
  )
}

function BalanceCard({
  id,
  label,
  sub,
  caption,
  amount,
  dark = false,
  mark,
  chip,
  onPress,
  width,
}: BalanceSpec & { width: number }) {
  // The balance counts, and the paise count with it — splitting the *animated* figure rather
  // than the final one means the decimals settle at the same instant the rupees do. Splitting
  // the final one and counting only the whole part leaves a static ".85" hanging off a moving
  // number, which is worse than not animating at all. The id carries the last figure shown
  // across a pane switch, so coming back does not count up from zero again.
  const { whole, paise } = splitAmount(useCountUp(amount, { delay: dur.enter, id }))
  const tone = dark ? 'onInk' : 'ink'
  const quiet = dark ? 'onInk' : 'mid'

  return (
    // One element for a screen reader: the bank, the balance and the account, then "button".
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${rupees(amount)}, ${sub}`}
      haptic="none"
      scale={0.98}
      onPress={onPress}
      className={cn(
        'justify-between rounded-card p-lg',
        dark ? 'bg-ink' : 'border border-hairline bg-surface',
      )}
      style={{ minHeight: CARD_MIN_HEIGHT, width }}
    >
      <View
        className="flex-row items-center gap-md"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {mark}
        <Type role="body" weight="semibold" tone={tone} className="flex-1" numberOfLines={1}>
          {label}
        </Type>
        {chip === undefined ? null : <Chip tone="ground">{chip}</Chip>}
      </View>

      <View
        className="mt-lg"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View className="flex-row items-baseline">
          <Type
            role="title"
            tone={tone}
            plain
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            className="shrink"
          >
            {whole}
          </Type>
          {paise ? (
            <Type role="label" tone={quiet}>
              {paise}
            </Type>
          ) : null}
        </View>
        <Type role="caption" tone={quiet} numberOfLines={2}>
          {`${caption} · ${sub}`}
        </Type>
      </View>
    </Tap>
  )
}

/* ------------------------------------------------------------------ *
 * Budget
 * ------------------------------------------------------------------ */

function Budget({
  view,
  caps,
  rated,
  onRate,
}: {
  view: ViewModel
  caps: readonly CategoryCap[] | null
  rated: Ratings
  onRate: (key: string, rating: Rating) => void
}) {
  const { plan, snapshot } = view
  const { safeToSpend } = plan
  const { discretionary, quality, surplus } = snapshot
  const asOf = snapshot.asOf
  const insights = useLeadOrder(view.insights, rated)

  const { months, perMonth, largest } = monthlyByCategory(
    discretionary.byCategory,
    quality.monthsOfHistory,
  )
  const shown = perMonth.slice(0, 6)
  const shownTotal = shown.reduce((sum, [, v]) => sum + v, 0)
  // The header is the engine's usual month — the figure Protect's safety net, the plan, Uday and
  // "Usually left over" below are all worked from — not the rows summed. The rows are each
  // category's average, and a few big months lift averages above a usual month, so beside the
  // engine's figure they add up to more; the card says so rather than showing a second total.
  // A file too thin for a usual month falls back to the rows' own sum.
  const usual = discretionary.monthly > 0 ? discretionary.monthly : null
  const everyday = usual ?? shownTotal
  const averagesOver = usual !== null && shownTotal > usual
  const share =
    snapshot.income.monthly > 0 ? Math.round((everyday / snapshot.income.monthly) * 100) : null
  const narrow = useWindowDimensions().width < NARROW
  const capOf = new Map((caps ?? []).map((c) => [c.category, c.monthlyLimit]))

  const committed = goingOutRows(
    snapshot.commitments,
    view.roadmap.monthlyCommitment,
    snapshot.holdings.sipMonthly,
  )
  const goingOut = committed.reduce((sum, r) => sum + r.amount, 0)
  // What is left over is before the plan: the plan is paid out of it. Said on the row, because
  // Rohan's plan takes all of it, and "Set aside for your plan ₹10,933" over "Usually left over
  // ₹10,933" read as the same money twice — the second time as spare.
  const planShare = committed.find((r) => r.key === 'plan')?.amount ?? 0
  const spent = Math.max(0, safeToSpend.envelope - safeToSpend.pot)
  const over = safeToSpend.pot <= 0
  const limit = safeToSpend.limit

  // The four cases are four different facts. "Over your limit" with no limit set was the
  // sentence this replaced: it told a customer who had never set one that they had broken it.
  const standing =
    over && limit !== null
      ? `Over the ${rupees(limit)} you set`
      : over
        ? 'Nothing left to spend this month'
        : limit === null
          ? 'Left to spend on yourself'
          : `Left of the ${rupees(limit)} you set`

  // Cleo's setup steps, worked out from the file rather than ticked by hand. The first open one
  // is "current"; the rest stay tappable, because the order is advice, not a gate.
  //
  // The pay-and-bills step is only for a salary the statement found as a series, where it is
  // already done. On variable income nothing on the wire could ever tick it, and the settings
  // page it opened has nothing to confirm — so it sat open at "0/3" for good, a step asking for
  // something the customer cannot do. There it is left out, and the card counts two.
  const salaried = snapshot.income.source === 'salary-series'
  const candidates: { step: Omit<ChecklistStep, 'state'>; done: boolean }[] = [
    {
      step: {
        id: 'limit',
        title: 'Set a spending limit',
        onPress: () => router.push('/set-limit'),
      },
      done: limit !== null,
    },
    {
      step: {
        id: 'cap',
        title: 'Cap one category',
        onPress: () => router.push({ pathname: '/set-limit', params: { caps: '1' } }),
      },
      done: (caps?.length ?? 0) > 0,
    },
    ...(salaried
      ? [
          {
            step: {
              id: 'pay',
              title: 'Confirm your pay and bills',
              onPress: () => router.push('/budget-settings'),
            },
            done: true,
          },
        ]
      : []),
  ]
  const firstOpen = candidates.findIndex((c) => !c.done)
  const stateOf = (done: boolean, i: number): ChecklistState =>
    done ? 'done' : i === firstOpen ? 'current' : 'locked'
  const steps = candidates.map(({ step, done }, i): ChecklistStep => ({
    ...step,
    state: stateOf(done, i),
  }))
  const doneCount = candidates.filter((c) => c.done).length

  // Short means the month runs out before the money does. Pointing that row at the savings
  // pot would be a door to nothing; the plan's first stage is where the shortfall is dealt with.
  const short = surplus.monthly < 0

  return (
    <>
      {/* Cleo's budget hero: how long the month has to last, one number, the bar that explains
          it, and the two figures behind the bar. No text on the tint goes lighter than ink —
          mid measures 4.3:1 on this green. The gear is the way into the settings, as Cleo has
          it, at a full 44pt. The 24pt inset is Cleo's, measured, and Grow's heroes share it. */}
      <View className="rounded-card bg-budget p-xl">
        <View className="flex-row items-center justify-between gap-md">
          <Type role="body" tone="ink" className="flex-1">
            {`${shortDate(plan.date, asOf)} to ${shortDate(safeToSpend.nextSalaryDate, asOf)}`}
          </Type>
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Budget settings"
            haptic="none"
            scale={0.92}
            onPress={() => router.push('/budget-settings')}
            className="h-target w-target items-center justify-center rounded-pill bg-ink/10"
          >
            <Glyph name="sliders" size={20} />
          </Tap>
        </View>

        <Count
          value={safeToSpend.pot}
          format={rupees}
          role="display"
          id="spend.pot"
          delay={dur.enter}
          className="mt-sm"
        />
        <Type role="body" tone="ink" className="mt-xs">
          {standing}
        </Type>

        <View className="mt-lg flex-row items-center justify-between gap-md">
          <Type role="body" tone="ink">
            {plural(safeToSpend.daysToSalary, 'day', 'days')} to go
          </Type>
          <Type role="body" tone="ink">
            {rupees(safeToSpend.perDay)} a day
          </Type>
        </View>
        <View className="mt-sm">
          <Meter
            size="thick"
            track="bg-surface"
            tone={over ? 'bg-danger' : 'bg-ink'}
            fraction={spent / Math.max(1, safeToSpend.envelope)}
            label={`Spent ${rupees(spent)} of ${rupees(safeToSpend.envelope)}`}
            delay={dur.enter}
          />
        </View>

        {/* The legend is the bar's: the filled swatch is the fill, the hollow one the white
            track. A swatch for something the bar does not draw would be a key to nothing. */}
        <View className="mt-md gap-xs">
          <LegendRow
            swatch={over ? 'border-danger bg-danger' : 'border-ink bg-ink'}
            label="Spent"
            value={rupees(spent)}
          />
          {/* The whole the bar is measured against, named as the whole. "To spend this month"
              sat under "Left to spend on yourself" with a figure four thousand apart, and two
              "to spend" amounts a line from each other read as the same thing twice. */}
          <LegendRow
            swatch="border-ink bg-surface"
            label="Your budget this month"
            value={rupees(safeToSpend.envelope)}
          />
        </View>

        <View className="mt-lg flex-row gap-md">
          <Tile label="Coming in" amount={snapshot.income.monthly} />
          <Tile label="Going out" amount={goingOut} />
        </View>

        {/* Cleo's "Set up a budget": the whole job, where the checklist under the hero names its
            first step. Worded as the step it was, the same line read twice in a row. */}
        {limit === null ? (
          <Button
            label="Set up a budget"
            haptic="none"
            className="mt-lg"
            onPress={() => router.push('/set-limit')}
          />
        ) : (
          <Button
            variant="secondary"
            label="Change the limit"
            haptic="none"
            className="mt-lg"
            onPress={() => router.push('/set-limit')}
          />
        )}
      </View>

      {caps !== null && doneCount < steps.length && (
        <>
          <Section
            title="Next steps"
            trailing={<Chip tone="ground">{`${doneCount}/${steps.length} complete`}</Chip>}
          />
          <Checklist steps={steps} />
        </>
      )}

      {/* The findings, as Cleo's paginated Smart insights rather than a stack of cards. */}
      {insights.length > 0 && (
        <>
          <Section title="Smart insights" />
          <InsightCarousel
            insights={insights}
            snapshot={snapshot}
            rated={rated}
            onRate={onRate}
            questionOf={(i: Insight) => questionForInsight(i, snapshot.discretionary.topHabits)}
            onAsk={askUday}
          />
        </>
      )}

      <Section
        title="Going out this month"
        onMore={() => router.push('/statement')}
        moreLabel="open the statement"
      />
      {/* One row per kind of money the month has committed, adding up to "Going out" above.
          Each is on the statement except the plan's share, which opens the plan that sets it. */}
      <Card className="overflow-hidden">
        {committed.map((r, i) => (
          <Fragment key={r.key}>
            {i > 0 ? <Rule /> : null}
            <Row
              label={r.label}
              value={rupees(r.amount)}
              {...(r.detail === undefined ? {} : { detail: r.detail })}
              onPress={() =>
                r.key === 'plan'
                  ? router.navigate({ pathname: '/(tabs)/plan' })
                  : router.push('/statement')
              }
            />
          </Fragment>
        ))}
        {/* The month after the usual spending too, so it is not these rows subtracted from the
            pay: it is what is typically left once the everyday spending has also gone. */}
        <View className={cn('bg-ground-deep', committed.length > 0 && 'border-t border-hairline')}>
          {short ? (
            <Row
              label="Usually short by"
              value={rupees(-surplus.monthly)}
              tone="danger"
              onPress={() =>
                router.navigate({ pathname: '/(tabs)/plan', params: { stage: 'free_up' } })
              }
            />
          ) : (
            <Row
              label="Usually left over"
              value={rupees(surplus.deployable)}
              tone="brand"
              {...(planShare > 0 && planShare <= surplus.deployable
                ? { detail: `Your plan's ${rupees(planShare)} comes from this` }
                : {})}
              onPress={() =>
                router.navigate({ pathname: '/(tabs)/grow', params: { pane: 'save' } })
              }
            />
          )}
        </View>
      </Card>

      <Section
        title="Where it goes"
        onMore={() => router.push('/set-limit')}
        moreLabel="set limits"
      />
      <Card>
        {shown.length > 0 ? (
          <>
            {/* Cleo's card header: the month's everyday spending, and what share of the pay that
                is — the engine's usual month, so it is the same figure every other screen
                works from (see `usual` above). */}
            <View
              accessible
              accessibilityLabel={`Everyday spending, ${rupees(everyday)} ${
                usual === null ? 'a month on average' : 'in a usual month'
              }${share === null ? '' : `, ${share}% of income`}.`}
              className="flex-row items-start justify-between gap-md px-lg pt-lg pb-md"
            >
              <View className="flex-1">
                <Type role="body" weight="semibold">
                  Everyday spending
                </Type>
                <Type role="caption" tone="mid">
                  {usual === null
                    ? `A month, over ${plural(months, 'month', 'months')}`
                    : 'In a usual month'}
                </Type>
              </View>
              <View className="items-end">
                <Type role="body" weight="semibold" plain>
                  {rupees(everyday)}
                </Type>
                {share === null ? null : (
                  <Type role="caption" tone="mid">
                    {`${share}% of income`}
                  </Type>
                )}
              </View>
            </View>
            {shown.map(([name, amount]) => (
              <Fragment key={name}>
                <Rule />
                <CategoryRow
                  name={name}
                  amount={amount}
                  cap={capOf.get(name)}
                  largest={largest}
                  narrow={narrow}
                />
              </Fragment>
            ))}
            {/* Said where the eye lands after adding the rows up — the slice doc's "labelled
                honestly rather than reconciled", now that the header is the usual month. */}
            {averagesOver ? (
              <>
                <Rule />
                <Type role="caption" tone="mid" className="px-lg py-md">
                  Categories are monthly averages, so they add up to more than a usual month.
                </Type>
              </>
            ) : null}
          </>
        ) : (
          <Type role="body" tone="mid" className="px-lg py-lg">
            Not enough statement yet to sort by category.
          </Type>
        )}
      </Card>
    </>
  )
}

/** A key line under the hero's bar: swatch, name, dotted leader, figure — Cleo's legend. */
function LegendRow({ swatch, label, value }: { swatch: string; label: string; value: string }) {
  return (
    <View className="flex-row items-center gap-sm">
      <View className={cn('h-md w-md rounded-pill border-2', swatch)} />
      <Type role="body" tone="ink">
        {label}
      </Type>
      <View className="mb-xs flex-1 self-end border-b border-dotted border-ink/30" />
      <Type role="body" weight="semibold" plain tone="ink">
        {value}
      </Type>
    </View>
  )
}

/**
 * One of the two figures under the budget bar. The figure leads, as Cleo sets it.
 *
 * Under 360pt a lakh figure at heading size is wider than half the card. Native shrinks it to
 * fit; the web build cannot, and cut "₹1,92,000" to "₹1,92,0…" — so narrow screens set it a
 * size down instead of trusting the shrink.
 */
function Tile({ label, amount }: { label: string; amount: number }) {
  const narrow = useWindowDimensions().width < NARROW
  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${rupees(amount)} a month`}
      className={cn('flex-1 rounded-md bg-surface/45 py-md', narrow ? 'px-md' : 'px-lg')}
    >
      <Type
        role={narrow ? 'body' : 'heading'}
        weight="semibold"
        plain
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {rupees(amount)}
      </Type>
      <Type role="caption" tone="ink">
        {label}
      </Type>
    </View>
  )
}

/**
 * A category and its bar. With a limit the bar is spent against the limit and the figure reads
 * "spent / limit", Cleo's way; without one it is measured against the biggest category, so the
 * bars still rank. Every row is a way to set or change that category's limit.
 *
 * Under 360pt "₹23,226 / ₹20,825" leaves the name a word's width, so there the limit drops
 * under the spend instead of beside it.
 */
function CategoryRow({
  name,
  amount,
  cap,
  largest,
  narrow,
}: {
  name: string
  amount: number
  cap: number | undefined
  largest: number
  narrow: boolean
}) {
  const over = cap !== undefined && amount > cap
  const stacked = narrow && cap !== undefined
  const figure = `${rupees(amount)}${cap !== undefined && !stacked ? ` / ${rupees(cap)}` : ''}`
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${rupees(amount)} a month on average${
        cap !== undefined ? `, limit ${rupees(cap)}. Change the limit.` : '. Set a limit.'
      }`}
      haptic="none"
      scale={0.98}
      onPress={() => router.push({ pathname: '/set-limit', params: { category: name } })}
      className="px-lg py-md"
    >
      <View className="flex-row items-center gap-md">
        <MerchantMark merchant={null} category={name} size={size.plateLg} />
        <Type role="body" weight="semibold" className="flex-1" numberOfLines={1}>
          {name}
        </Type>
        <View className="items-end">
          <Type role="body" weight="semibold" plain tone={over ? 'danger' : 'ink'}>
            {figure}
          </Type>
          {stacked && cap !== undefined ? (
            <Type role="caption" tone="mid">
              {`of ${rupees(cap)}`}
            </Type>
          ) : null}
        </View>
      </View>
      <View className="mt-sm">
        <Meter
          fraction={cap !== undefined ? amount / Math.max(1, cap) : amount / largest}
          tone={over ? 'bg-danger' : 'bg-brand'}
          track="bg-ground-deep"
          delay={dur.state}
        />
      </View>
    </Tap>
  )
}

/* ------------------------------------------------------------------ *
 * Debt
 * ------------------------------------------------------------------ */

function Debt({ view, onOpenCredit }: { view: ViewModel; onOpenCredit: () => void }) {
  const { debt, surplus, credit } = view.snapshot
  if (debt.total === 0) return <DebtFree spare={surplus.deployable} />

  const others = debt.total - debt.highInterestTotal
  return (
    <>
      {/* A missed instalment comes before everything, including the expensive debt: it is the
          one line here that gets worse with every day it is left. The chip is how late, from the
          file — a status with a figure in it, the way Cleo's chips carry a deadline. The wire
          has no amount for the missed instalment itself, so the title names the repayment
          rather than inventing a figure for it. */}
      {debt.missedRepayment && (
        <View className="rounded-card border border-danger bg-danger-soft p-lg">
          {credit.dpdDays > 0 ? (
            <Chip tone="surface" glyph="alert" className="mb-md">
              {`${plural(credit.dpdDays, 'day', 'days')} late`}
            </Chip>
          ) : null}
          <Type role="heading">Clear the missed repayment first</Type>
          <Type role="body" tone="ink" className="mt-xs">
            A mark on your IDBI file costs more, and for longer, than any return.
          </Type>
          <Button
            label="See what IDBI can see"
            haptic="none"
            className="mt-lg"
            onPress={onOpenCredit}
          />
          <AskUday question={MISSED_REPAYMENT} className="mt-xs" />
        </View>
      )}

      {/* The facts, read as one sentence rather than as five fragments. */}
      <Card
        accessible
        accessibilityLabel={`You owe ${rupees(debt.total)}, ${rupees(debt.monthlyOutgo)} a month, highest rate ${debt.highestRate} percent`}
      >
        <View className="px-lg pt-lg pb-md">
          <Type role="caption" tone="mid">
            You owe
          </Type>
          <Count
            value={debt.total}
            format={rupees}
            role="title"
            plain
            id="debt.total"
            delay={dur.enter}
            className="mt-xs"
          />
        </View>
        <Rule />
        {debt.hasHighInterest ? (
          <>
            <Row
              label={`At ${debt.highestRate}%`}
              value={rupees(debt.highInterestTotal)}
              tone="danger"
            />
            {others > 0 ? (
              <>
                <Rule />
                <Row label="Other loans" value={rupees(others)} />
              </>
            ) : null}
          </>
        ) : (
          <Row label="Highest rate" value={`${debt.highestRate}%`} />
        )}
        <Rule />
        <Row label="Going out each month" value={rupees(debt.monthlyOutgo)} />
      </Card>

      {debt.hasHighInterest ? <DebtReset view={view} /> : <CheapDebt view={view} />}

      {debt.endingSoon && (
        <Card className="p-lg">
          <Type role="heading">
            {`${rupees(debt.endingSoon.emiAmount)} a month frees up in ${plural(debt.endingSoon.monthsLeft, 'month', 'months')}`}
          </Type>
          <Type role="body" tone="mid" className="mt-xs">
            {`Your ${debt.endingSoon.loanType} has ${plural(debt.endingSoon.monthsLeft, 'payment', 'payments')} of ${rupees(debt.endingSoon.emiAmount)} left.`}
          </Type>
          <Button
            size="sm"
            variant="secondary"
            label="Plan what it does next"
            haptic="none"
            className="mt-lg"
            onPress={() => {
              const soon = debt.endingSoon
              if (soon) askUday(emiEndingQuestion(soon.loanType, soon.monthsLeft, soon.emiAmount))
            }}
          />
        </Card>
      )}
    </>
  )
}

/** A year: how far ahead a payment that never clears the balance is drawn. */
const YEAR = 12
/** Fifty years, core's own cap on a payoff that is still running — past it, it does not clear. */
const PAYOFF_CAP = 600

/**
 * Cleo's Debt Reset card, on a light surface: the plan's payoff drawn on a plate, the expensive
 * debt as an imperative with its amount, what it costs a month, and the plan one tap away.
 *
 * Cleo blur their chart until the customer subscribes; ours is the customer's own arithmetic, so
 * it is drawn sharp. It is the plan's balance, rate and payment, month by month — the numbers
 * the Plan tab's payoff counts, so the plate and the pane behind the button cannot disagree.
 * Where the plan's payment is below the interest, the line climbs for a year instead of falling,
 * the footnote says it does not clear, and the button offers what would — Plan answers that
 * case with the payment that clears it in three years. A card that drew a path to zero over a
 * sentence saying there was none contradicted itself.
 *
 * The title is a heading, not a title, so the missed-repayment card above it — which comes first
 * — is not the quieter of the two. With a missed repayment the title says "Then", so the pane
 * orders the two the way Plan's pinned "Before anything else" card does.
 */
function DebtReset({ view }: { view: ViewModel }) {
  const { debt, asOf } = view.snapshot
  const rate = debt.highestRate
  const cost = (debt.highInterestTotal * rate) / 1200
  const stage = view.roadmap.stages.find((s) => s.kind === 'clear_debt' && s.targetAmount > 0)
  const paying = stage !== undefined && stage.monthly > 0
  const clears = paying && stage.monthsToComplete > 0
  const path = paying
    ? balanceByMonth(stage.targetAmount, rate, stage.monthly, clears ? PAYOFF_CAP : YEAR)
    : []
  // Drawn only when the arithmetic agrees with the plan: a plan that says it clears and a line
  // that never reaches zero would be two answers on one card.
  const drawn = paying && path.length > 1 && (!clears || path[path.length - 1] === 0)
  const footnote = !paying
    ? null
    : clears
      ? `${rupees(stage.monthly)} a month on your plan clears it in ${plural(stage.monthsToComplete, 'month', 'months')}.`
      : `At ${rupees(stage.monthly)} a month it doesn't clear.`

  return (
    <Card className="p-lg">
      {drawn && stage !== undefined ? (
        <PayoffPlate path={path} stage={stage} clears={clears} asOf={asOf} />
      ) : null}
      <Type role="heading" className={drawn ? 'mt-lg' : undefined}>
        {debt.missedRepayment
          ? `Then pay ${rupees(debt.highInterestTotal)} off`
          : `Pay ${rupees(debt.highInterestTotal)} off first`}
      </Type>
      <Type role="body" tone="mid" className="mt-xs">
        {`At ${rate}% it costs you about ${rupees(cost)} a month. Nothing you can invest in earns that.`}
      </Type>
      {footnote === null ? null : (
        <Type role="caption" tone="mid" className="mt-md">
          {footnote}
        </Type>
      )}
      <Button
        label={paying && !clears ? 'See what it takes to clear' : 'See your path to zero'}
        haptic="none"
        className="mt-lg"
        onPress={() =>
          router.navigate({
            pathname: '/(tabs)/plan',
            params: { pane: 'projection', stage: 'clear_debt' },
          })
        }
      />
      <AskUday question={debtPayoffQuestion(debt.highInterestTotal, rate)} className="mt-xs" />
    </Card>
  )
}

/**
 * The payoff as a line: Cleo's chart plate, with the customer's own figures.
 *
 * SVG for the one shape views cannot draw — a line through thirty points — with every colour a
 * token read at runtime, as `Arc` and `ScoreGlow` do. The scale starts at zero, always: a debt
 * that climbs from ₹3.10 lakh to ₹3.52 lakh is a gentle slope on an honest axis, and cropping the
 * axis to make it steep would be the chart lying on the customer's behalf. The dots are the two
 * ends, the figure over the first is where it starts, and the line under the plot says where it
 * ends and when. One element for a screen reader, which hears the sentence the picture says.
 */
function PayoffPlate({
  path,
  stage,
  clears,
  asOf,
}: {
  path: readonly number[]
  stage: Stage
  clears: boolean
  asOf: string
}) {
  const { width: windowWidth } = useWindowDimensions()
  const [measured, setMeasured] = useState(0)
  // Seeded from the window — the card's gutter and the plate's own inset on each side — so the
  // first frame is already the right width; the layout replaces the estimate with the fact.
  const width = measured > 0 ? measured : windowWidth - 2 * (space.pad + space.lg + space.lg)
  const height = size.track
  const dot = stroke.meter
  const inset = dot + stroke.rail
  const first = path[0] ?? 0
  const last = path[path.length - 1] ?? 0
  const top = Math.max(1, ...path)
  const x = (i: number) => inset + (i / Math.max(1, path.length - 1)) * (width - 2 * inset)
  const y = (v: number) => inset + (1 - v / top) * (height - 2 * inset)
  const line = path
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ')
  const tone = clears ? color.ink : color.danger
  // A payoff is the plan's own stage, so it runs between the plan's own months. A balance that
  // climbs has no stage dates to borrow — the plan gives it none — so it is drawn from today's
  // figure over the next year, and says so rather than dating a line the plan never drew.
  const from = clears && stage.startsOn > asOf ? monthYear(stage.startsOn) : 'Now'
  const until = monthYear(stage.completesOn)
  const spoken = clears
    ? `${rupees(first)} down to nothing by ${until}, paying ${rupees(stage.monthly)} a month.`
    : `At ${rupees(stage.monthly)} a month, ${rupees(first)} grows to ${rupees(last)} in a year.`

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={spoken}
      className="rounded-md bg-ground px-lg pb-md pt-lg"
    >
      <View className="flex-row items-baseline justify-between gap-md">
        <Type role="label" weight="semibold" plain>
          {rupees(first)}
        </Type>
        {clears ? null : (
          <Type role="label" weight="semibold" plain tone="danger">
            {rupees(last)}
          </Type>
        )}
      </View>
      <View className="mt-sm" onLayout={(e) => setMeasured(e.nativeEvent.layout.width)}>
        <Svg width={width} height={height}>
          <Path
            d={`M${inset} ${height - inset} H${width - inset}`}
            stroke={color.hairline}
            strokeWidth={StyleSheet.hairlineWidth}
          />
          <Path
            d={line}
            stroke={tone}
            strokeWidth={stroke.rail}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Circle cx={x(0)} cy={y(first)} r={dot} fill={color.ink} />
          <Circle
            cx={x(path.length - 1)}
            cy={y(last)}
            r={dot}
            fill={clears ? color.brand : color.danger}
          />
        </Svg>
      </View>
      <View className="mt-xs flex-row justify-between gap-md">
        <Type role="caption" tone="mid">
          {from}
        </Type>
        <Type role="caption" tone="mid">
          {clears ? `₹0 by ${until}` : 'In a year'}
        </Type>
      </View>
    </View>
  )
}

/**
 * The other answer: nothing here is expensive. It says so plainly, because a debt pane that only
 * knows how to alarm teaches the customer to stop reading it — and a missed instalment is still
 * the exception, so the sentence waits on it.
 */
function CheapDebt({ view }: { view: ViewModel }) {
  const { debt } = view.snapshot
  const rate = debt.highestRate
  return (
    <Card className="p-lg">
      <Type role="heading">Your loans are cheap money</Type>
      <Type role="body" tone="mid" className="mt-xs">
        {debt.missedRepayment
          ? `${rupees(debt.total)} at up to ${rate}%. Once the missed instalment is caught up, nothing here needs to come first.`
          : `${rupees(debt.total)} at up to ${rate}%. Nothing on the shelf beats clearing it, but nothing here needs to come first either.`}
      </Type>
      <AskUday
        question={prepayQuestion(rate)}
        label="Ask Uday whether to prepay"
        className="mt-md"
      />
    </Card>
  )
}

/**
 * No debt at all. No persona reaches this today, which is exactly why it still carries two ways
 * on: a pane with nothing to do is the one the owner asked never to ship. With nothing spare the
 * button names the savings pot instead of offering "the spare ₹0".
 */
function DebtFree({ spare }: { spare: number }) {
  return (
    <View className="rounded-card bg-success p-lg">
      <Type role="title">Nothing owed</Type>
      <Type role="body" tone="ink" className="mt-sm">
        No loans, no card balance, no missed repayments on record.
      </Type>
      <Button
        size="sm"
        variant="secondary"
        label={spare > 0 ? `Put the spare ${rupees(spare)} to work` : 'Open your savings'}
        haptic="none"
        className="mt-lg"
        onPress={() => router.navigate({ pathname: '/(tabs)/grow', params: { pane: 'save' } })}
      />
      <AskUday question={SPARE_SAVINGS} label="Ask Uday" className="mt-xs" />
    </View>
  )
}
