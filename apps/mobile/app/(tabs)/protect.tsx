// Protect — what happens to the people who depend on you.
//
// Cleo's fifth tab is a cash advance. The inversion is the point: where a third-party app
// puts "borrow money when you are short", a bank-owned advisor puts "make sure being short
// never becomes a catastrophe". Same slot, opposite direction.
//
// This tab is also where the product's argument is most exposed. Term cover pays the bank
// almost nothing and PMJJBY pays it nothing at all, and both are recommended ahead of every
// market-linked product on the shelf. A screen that leads with the cheapest thing in the
// catalogue is the clearest evidence the ranking is not a sales ranking.
//
// Every pane ends in something to do, because a tab that only measures a gap hands the
// customer the gap and nothing else.
//
// **Cover names the policy that closes it.** The button is the plan the roadmap already chose
// for the cover stage, so this tab and Plan never recommend two different policies; without
// one it is the cheapest term plan. Not simply the cheapest life cover: PMJJBY's ₹2 lakh under
// a ₹2 crore gap, on a button that says "term cover for ₹36 a month", would read as the gap
// closing for ₹36. It still leads the shelf, where its size is printed beside its price.
// Under the hero the three kinds of cover are Cleo's checklist, each row a way into the gate.
//
// **Nobody depending on you is a finding, not an empty state.** The card says so, and says how
// to change it — the one fact here the customer can correct in place — because a family that
// grows after onboarding should not have to find a settings screen to be protected.
//
// **The safety net says what the spare is for.** Past the target, the money above it can do
// more — but for someone paying 34.8% on a card, "more" is clearing the card. Every investment
// the spare could go into would stop at the gate's first rule, so the card opens the payoff plan
// instead of a shelf of refusals. Short of the target, it names the shortfall and the ways to
// close it. Its rows are worked in the same month the engine measured the net in — bills and
// everyday spending together — so they add up to the figure above them.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { View, type ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { router, useLocalSearchParams, useNavigation } from 'expo-router'
import { protectionShelf } from '@dhan/core'
import { TabHeader } from '~/ui/TabHeader'
import { Pills, usePane } from '~/ui/Pills'
import { Pane } from '~/ui/Reveal'
import { Type } from '~/ui/Text'
import { Count } from '~/ui/Count'
import { dur } from '~/ui/motion'
import { Card } from '~/ui/Card'
import { Row } from '~/ui/Row'
import { Section } from '~/ui/Section'
import { RetryLine, SnapshotScroll } from '~/ui/SnapshotScroll'
import { Chip } from '~/ui/Chip'
import { Meter } from '~/ui/Meter'
import { Button } from '~/ui/Button'
import { Note } from '~/ui/Note'
import { Sheet } from '~/ui/Sheet'
import { AmountStepper } from '~/ui/AmountStepper'
import { Checklist, type ChecklistStep } from '~/ui/Checklist'
import { MenuLink } from '~/ui/MenuRow'
import { AskUday } from '~/ui/AskUday'
import { AskUdayRows } from '~/ui/Suggestion'
import { GlyphPlate, type GlyphName } from '~/ui/Glyph'
import { useToast } from '~/ui/Toast'
import { cn } from '~/ui/cn'
import { GateSheet, ProductRow, premiumOf, shortName } from '~/ui/GateSheet'
import { useSnapshot } from '~/state/snapshot'
import { api } from '~/api/client'
import { rupees, rupeesShort } from '~/lib/money'
import {
  COVER_PLUS_SAVINGS,
  GOVERNMENT_SCHEME,
  LIFE_COVER,
  NO_DEPENDANTS,
  askFacts,
  coverGapQuestion,
  spareQuestion,
  whereFromQuestion,
} from '~/lib/ask'
import type { ShelfProduct, View as ViewModel } from '@dhan/contracts'

type Pane = 'cover' | 'buffer' | 'shelf'

const PANES: ReadonlyArray<{ value: Pane; label: string }> = [
  { value: 'cover', label: 'Cover' },
  { value: 'buffer', label: 'Safety net' },
  { value: 'shelf', label: 'Get cover' },
]

export default function Protect() {
  const { pane, dir, set } = usePane<Pane>('cover', PANES)
  const [chosen, setChosen] = useState<ShelfProduct | null>(null)
  const [editing, setEditing] = useState(false)
  // What the customer told us this session, kept only for the case where the advice has not
  // caught up with it — see the zero-dependants card.
  const [declared, setDeclared] = useState<number | null>(null)
  const scroll = useRef<ScrollView>(null)
  const { data } = useSnapshot()

  // `?product=` opens the gate on that product, once the shelf it names has arrived — Plan's
  // cover stage links here. Cleared either way, so a return to the tab does not reopen it.
  const { product } = useLocalSearchParams<{ product?: string }>()
  const navigation = useNavigation<{
    setParams: (params: Record<string, string | undefined>) => void
  }>()
  useEffect(() => {
    if (product === undefined || data === null) return
    const found = data.shelf.find((p) => p.productId === product)
    if (found !== undefined) setChosen(found)
    navigation.setParams({ product: undefined })
  }, [product, data, navigation])

  // A pane opens at its top. The scroll is shared, so without this the safety net opened
  // halfway down, wherever the reader had left the cover pane.
  const go = (next: Pane, d: number) => {
    set(next, d)
    scroll.current?.scrollTo({ y: 0, animated: false })
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <TabHeader title="Protect" />
      <Pills options={PANES} value={pane} onChange={go} />

      <SnapshotScroll ref={scroll} loading="Checking what you're covered for…">
        {(view) => (
          <Pane key={pane} dir={dir} className="gap-md">
            {pane === 'cover' ? (
              <Cover
                view={view}
                onPick={setChosen}
                onShelf={() => go('shelf', 1)}
                onBuffer={() => go('buffer', 1)}
                declared={declared}
                onDependants={() => setEditing(true)}
              />
            ) : pane === 'buffer' ? (
              <Buffer view={view} />
            ) : (
              <Shelf view={view} onPick={setChosen} />
            )}
          </Pane>
        )}
      </SnapshotScroll>

      <GateSheet product={chosen} onClose={() => setChosen(null)} onSwitch={setChosen} />
      <DependantsSheet
        open={editing}
        from={declared ?? 1}
        onClose={() => setEditing(false)}
        onSaved={setDeclared}
      />
    </SafeAreaView>
  )
}

/** "7.3 months", "6 months", "1 month" — never "6.0 months". */
function months(n: number): string {
  const r = Math.round(n * 10) / 10
  if (r === 1) return '1 month'
  return Number.isInteger(r) ? `${r} months` : `${r.toFixed(1)} months`
}

function cheapest(list: readonly ShelfProduct[]): ShelfProduct | undefined {
  return list.reduce<ShelfProduct | undefined>(
    (best, p) => (best === undefined || p.minInvestment < best.minInvestment ? p : best),
    undefined,
  )
}

/** The policy that closes a life-cover gap — see the header for why it is not the cheapest. */
function lifeCover(view: ViewModel, cover: readonly ShelfProduct[]): ShelfProduct | undefined {
  const life = cover.filter((p) => p.coverType === 'life')
  const staged = view.roadmap.stages.find((s) => s.kind === 'get_cover')?.productId
  return (
    life.find((p) => p.productId === staged) ??
    cheapest(life.filter((p) => p.category === 'Term Insurance')) ??
    cheapest(life)
  )
}

type Step = Omit<ChecklistStep, 'state'> & { done: boolean }

/** Done is done; the first thing not done is the one to do now; the rest come after it. */
function ordered(steps: readonly Step[]): ChecklistStep[] {
  const first = steps.findIndex((s) => !s.done)
  return steps.map(({ done, ...step }, i) => ({
    ...step,
    state: done ? 'done' : i === first ? 'current' : 'locked',
  }))
}

function Cover({
  view,
  onPick,
  onShelf,
  onBuffer,
  declared,
  onDependants,
}: {
  view: ViewModel
  onPick: (p: ShelfProduct) => void
  onShelf: () => void
  onBuffer: () => void
  /** Dependants saved this session; the view may not show them yet. */
  declared: number | null
  onDependants: () => void
}) {
  const { protection, buffer, customer } = view.snapshot
  const { nominal, full } = protectionShelf(view.shelf)
  const cover = [...nominal, ...full]
  const life = lifeCover(view, cover)
  const health = cheapest(cover.filter((p) => p.coverType === 'health'))
  const open = (p: ShelfProduct | undefined) => (p === undefined ? onShelf() : onPick(p))
  const hint = (p: ShelfProduct | undefined) =>
    p === undefined
      ? 'Shows the cover you can get'
      : `Checks ${shortName(p)} against your statement`

  const { dependents: n, gap, lifeCoverInForce: inForce, lifeCoverNeeded: needed } = protection
  const healthInForce = protection.healthCoverInForce
  const target = buffer.targetMonths
  const covered = buffer.monthsCovered

  const steps = ordered([
    ...(n === 0
      ? []
      : [
          {
            id: 'life',
            title: 'Life cover',
            // The hero's own figure. "₹2.7L of ₹2.3Cr" under a ₹2.28Cr hero was two rounded
            // figures a reader could subtract and come out a lakh away from the one above.
            detail: gap <= 0 ? `${rupeesShort(inForce)} in place` : `${rupeesShort(gap)} short`,
            done: gap <= 0,
            onPress: () => open(life),
            accessibilityHint: hint(life),
          },
        ]),
    {
      id: 'health',
      title: 'Health cover',
      detail: healthInForce > 0 ? `${rupeesShort(healthInForce)} on file` : 'None on file',
      done: healthInForce > 0,
      onPress: () => open(health),
      accessibilityHint: hint(health),
    },
    {
      id: 'net',
      title: target === 6 ? 'Six-month safety net' : `${target}-month safety net`,
      detail: covered === null ? 'Not enough history' : `${months(covered)} of ${target}`,
      done: covered !== null && covered >= target,
      onPress: onBuffer,
      accessibilityHint: 'Shows your safety net',
    },
  ])

  if (n === 0) {
    // Saved, but the file the advice is worked out from still says nobody — a source that does
    // not take declared facts. Saying "nothing needed" over the customer's own answer would be
    // the screen contradicting them, and pretending the figures moved would be worse.
    const told = declared !== null && declared > 0 ? declared : null
    return (
      <>
        {/* The pane's hero, so no plate: the words and the pill take the card's full width, as
            the cover hero does. In the plate's column the pill's label broke onto two lines. */}
        {told === null ? (
          <Callout
            chip={<Chip tone="success">Nothing needed</Chip>}
            title="You don't need life cover"
            body="Life cover replaces an income others rely on. Nobody relies on yours, so you don't need it — and I won't sell you any."
            note="If that changes, tell me here and this screen changes with it."
          >
            <Button
              variant="secondary"
              size="sm"
              label="Someone depends on me"
              haptic="none"
              className="mt-lg"
              onPress={onDependants}
            />
            <AskUday question={NO_DEPENDANTS} className="mt-xs" />
          </Callout>
        ) : (
          <Callout
            chip={<Chip tone="ground">Saved</Chip>}
            title={`You told me ${told === 1 ? '1 person depends' : `${told} people depend`} on you`}
            body="Your cover figures come from your bank file, which still says nobody does. They change when it does."
          >
            {/* No "Ask Uday" here: he answers from the same file, which still says nobody
                depends on this customer, so his reply would contradict the answer they just gave. */}
            <Button
              variant="secondary"
              size="sm"
              label="Change the number"
              haptic="none"
              className="mt-lg"
              onPress={onDependants}
            />
          </Callout>
        )}

        <Section title="Get covered" />
        <Checklist steps={steps} />
      </>
    )
  }

  const short = gap > 0
  const term = life?.category === 'Term Insurance'
  // One sentence under the figure. Short, it is what the named policy buys, said beside the gap
  // it goes against so ₹985 a month is never read as the whole ₹2 crore; the button stays two
  // words, because a label with the figure in it ran past the pill at 375pt. The working —
  // needed, in place, short by — is the table's, in full rupees that add up.
  const said = !short
    ? needed > 0
      ? "That's at least ten years of your income."
      : null
    : life?.coverAmount === undefined
      ? `${n === 1 ? '1 person depends' : `${n} people depend`} on your income.`
      : term
        ? `A ${rupeesShort(life.coverAmount)} term plan costs ${premiumOf(life)}.`
        : `${rupeesShort(life.coverAmount)} of life cover costs ${premiumOf(life)}.`
  const cta =
    life === undefined ? 'See cover I can get' : term ? 'See term cover' : 'See life cover'

  return (
    <>
      <Card className="p-lg">
        <Chip tone={short ? 'danger' : 'success'}>{short ? 'Not covered' : 'Covered'}</Chip>
        <Count
          value={short ? gap : inForce}
          format={rupeesShort}
          role="display"
          plain
          numberOfLines={1}
          adjustsFontSizeToFit
          id="protect.cover"
          delay={dur.enter}
          className="mt-md"
        />
        <Type role="body" tone="mid">
          {short ? 'short of the cover your family would need' : 'of life cover in place'}
        </Type>
        {said === null ? null : (
          <Type role="body" className="mt-md">
            {said}
          </Type>
        )}
        <View className="mt-lg">
          <Meter
            fraction={needed > 0 ? inForce / needed : 1}
            tone="bg-brand"
            track="bg-ground-deep"
            label="Cover in place against cover needed"
            delay={dur.enter}
          />
        </View>
        {short ? (
          <Button label={cta} haptic="none" className="mt-lg" onPress={() => open(life)} />
        ) : null}
        <AskUday question={coverGapQuestion(gap, inForce)} className="mt-xs" />
      </Card>

      <Card>
        <Row label="Cover you need" detail="Ten years of your income" value={rupees(needed)} />
        <Row label="Cover you have" value={rupees(inForce)} divide />
        {short ? <Row label="Short by" value={rupees(gap)} divide tone="danger" /> : null}
      </Card>

      <Section title="Get covered" />
      <Checklist steps={steps} />

      {/* Why this sits ahead of every investment on the shelf. Said plainly, because the
          ordering is the recommendation and a customer is entitled to the reasoning. The title
          names what it goes ahead of — investing — so it cannot read against Plan's pinned
          "Before anything else" card for a missed instalment, which comes before cover too. */}
      <View className="mt-md">
        <Note title="Why cover comes before investing">
          {`Cover gets dearer every year and, past a point, unavailable. A portfolio growing for ${customer.age > 40 ? 'fifteen' : 'thirty'} years is worth nothing to your family if the income behind it stops next month.`}
        </Note>
        <Type role="caption" tone="mid" className="mt-sm">
          Term cover earns the bank almost nothing, and it still comes before investing.
        </Type>
      </View>
    </>
  )
}

function Buffer({ view }: { view: ViewModel }) {
  const { buffer, commitments, discretionary, balances } = view.snapshot
  // Null where the monthly outflow is unknown, which a sparse statement makes common. That
  // means "not computable", which is emphatically not "zero months of buffer" — printing 0.0
  // months would be a false statement about someone's finances on the one tab whose claim is
  // that it shows its working. So the figure, its meter and its verdict are withheld.
  const covered = buffer.monthsCovered
  const target = buffer.targetMonths
  const short = buffer.shortfall > 0
  // The month the engine measured the net in (`monthlyOutflow` in core's derive.ts): bills and
  // everyday spending together. With the commitments alone the rows disagreed with the hero —
  // Karan's ₹12.46L over ₹1.19L is 10.4 months under a hero saying 7.3, and his spare came out
  // ₹5.3L where ₹2.29L is true.
  const month = commitments.total + discretionary.monthly
  const spare = Math.max(0, balances.total - month * target)

  return (
    <>
      <Card className="p-lg">
        {covered === null ? (
          <>
            <Type role="heading">Not enough history</Type>
            <Type role="body" tone="mid" className="mt-xs">
              {`Not enough statement to work out what a month costs you, so no number yet. Target: ${target} months.`}
            </Type>
            <MenuLink
              label="Where my data comes from"
              className="mt-xs"
              onPress={() => router.push('/connections')}
            />
          </>
        ) : (
          <>
            <Chip tone={short ? 'streak' : 'success'}>{short ? 'Below target' : 'On target'}</Chip>
            <Count
              value={covered}
              format={months}
              role="display"
              plain
              numberOfLines={1}
              id="protect.buffer"
              delay={dur.enter}
              className="mt-md"
            />
            {/* The monthly figure is the second row below, so it is not said here twice. The
                no-break spaces keep "today · target 6 months" together, so the dot never ends
                a line. */}
            <Type role="body" tone="mid">
              {`covered if your income stopped today\u00A0·\u00A0target\u00A0${target}\u00A0months`}
            </Type>
            <View className="mt-lg">
              <Meter
                fraction={target > 0 ? covered / target : 1}
                tone="bg-brand"
                track="bg-ground-deep"
                label="Safety net against target"
                delay={dur.enter}
              />
            </View>
          </>
        )}
      </Card>

      <Card>
        <Row label="Money you can reach" value={rupees(balances.total)} />
        {covered === null ? null : (
          <>
            <Row
              label="Goes out every month"
              detail="Bills and everyday spending"
              value={rupees(month)}
              divide
            />
            <Row
              label={short ? `Short of ${target} months` : `Spare above ${target} months`}
              value={rupees(short ? buffer.shortfall : spare)}
              divide
              tone={short ? 'danger' : 'ink'}
            />
          </>
        )}
      </Card>

      {covered === null ? null : <TakeAction view={view} spare={spare} />}
    </>
  )
}

/** What to do about the months above: Cleo's "Take action" card, plate beside the words. */
function TakeAction({ view, spare }: { view: ViewModel; spare: number }) {
  const { buffer, debt } = view.snapshot
  const target = buffer.targetMonths

  if (buffer.shortfall > 0) {
    // The deposit screen fills the goal, which is the safety net only when the goal is one.
    // Otherwise the roadmap's buffer stage is where the plan to close it lives.
    const fund = view.goal.kind === 'emergency_fund'
    const staged = view.roadmap.stages.some((s) => s.kind === 'build_buffer')
    // "Where does it come from?" had no rule behind it. What Uday can say is where the money
    // goes: the biggest spending category last month, and the two places most of it went.
    const whereFrom = whereFromQuestion(
      `I'm ${rupeesShort(buffer.shortfall)} short of a ${target}-month safety net.`,
      askFacts(view.snapshot).biggestSpend,
    )
    return (
      <>
        <Section title="Take action" />
        <Callout
          glyph="moneybag"
          chip={<Chip tone="streak">Below target</Chip>}
          title={`Add ${rupeesShort(buffer.shortfall)} to your safety net`}
          body={`That takes it to ${target} months of what goes out.`}
        >
          {fund ? (
            <Button
              label="Add to savings"
              size="sm"
              haptic="none"
              className="mt-lg"
              onPress={() => router.push('/deposit')}
            />
          ) : staged ? (
            <Button
              label="See the plan"
              size="sm"
              haptic="none"
              className="mt-lg"
              onPress={() =>
                router.navigate({ pathname: '/(tabs)/plan', params: { stage: 'build_buffer' } })
              }
            />
          ) : null}
          <MenuLink
            label="Spend less each month"
            className={cn(fund || staged ? 'mt-xs' : 'mt-sm')}
            onPress={() => router.push('/set-limit')}
          />
          {whereFrom === null ? null : <AskUday question={whereFrom} />}
        </Callout>
      </>
    )
  }

  const expensive = debt.hasHighInterest && debt.highInterestTotal > 0
  // Exactly on target leaves nothing above it to put anywhere; the card says nothing about ₹0.
  if (!expensive && spare <= 0) return null
  const extra = spare > 0 ? `the spare ${rupeesShort(spare)}` : 'anything above it'
  return (
    <>
      <Section title="Take action" />
      {expensive ? (
        <Callout
          glyph="target"
          chip={<Chip tone="success">On track</Chip>}
          title={`Clear ${rupeesShort(debt.highInterestTotal)} of expensive debt`}
          body={`Nothing I can sell you earns the ${debt.highestRate}% it costs, and your safety net is past target.`}
        >
          <Button
            variant="secondary"
            size="sm"
            label="See the payoff plan"
            haptic="none"
            className="mt-lg"
            onPress={() =>
              router.navigate({
                pathname: '/(tabs)/plan',
                params: { pane: 'projection', stage: 'clear_debt' },
              })
            }
          />
          <AskUday question={spareQuestion(extra, target, true)} className="mt-xs" />
        </Callout>
      ) : (
        <Callout
          glyph="grow"
          chip={<Chip tone="success">On track</Chip>}
          title={`Put ${rupeesShort(spare)} to work`}
          body="Past the target. Anything above it can work harder."
        >
          <Button
            variant="secondary"
            size="sm"
            label="See what it could grow to"
            haptic="none"
            className="mt-lg"
            onPress={() =>
              router.navigate({ pathname: '/(tabs)/grow', params: { pane: 'invest' } })
            }
          />
          <AskUday question={spareQuestion(extra, target, false)} className="mt-xs" />
        </Callout>
      )}
    </>
  )
}

/** The cover groups past the nominal ones, by what they cover rather than what they cost. */
const GROUPS: ReadonlyArray<{ title: string; holds: (p: ShelfProduct) => boolean }> = [
  { title: 'Term cover', holds: (p) => p.coverType === 'life' },
  { title: 'Health cover', holds: (p) => p.coverType === 'health' },
  { title: 'Accident cover', holds: (p) => p.coverType === 'accident' },
  { title: 'Other cover', holds: (p) => p.coverType === undefined },
]

function Shelf({ view, onPick }: { view: ViewModel; onPick: (p: ShelfProduct) => void }) {
  // Only protection, and the rule that decides it lives in the engine beside the gate that
  // enforces it — not in a regex over a product's marketing name. A name-matcher put "LIC
  // Jeevan Anand Endowment" under Proper cover on the word *Jeevan*, directly above the card
  // on this tab saying that anything bundling cover with investment is not here. The groups
  // after the free ones are by kind: a health floater under "Term cover" would be the same
  // mistake in the other direction.
  const { nominal, full } = protectionShelf(view.shelf)
  const groups = GROUPS.map((g) => ({ title: g.title, items: full.filter(g.holds) })).filter(
    (g) => g.items.length > 0,
  )

  return (
    <>
      <Type role="body" tone="mid">
        Cover only. Tap one and I&apos;ll say whether it suits you — including when it doesn&apos;t.
      </Type>

      {nominal.length > 0 ? (
        <View className="gap-md">
          <Section title="Costs almost nothing" />
          <Products items={nominal} onPick={onPick} />
          <Type role="caption" tone="mid">
            Government schemes. The bank earns nothing on them, so they come first.
          </Type>
        </View>
      ) : null}

      {groups.map((g) => (
        <View key={g.title} className="gap-md">
          <Section title={g.title} />
          <Products items={g.items} onPick={onPick} />
        </View>
      ))}

      <View className="mt-md">
        <Callout
          glyph="lock"
          chip={<Chip tone="ground">Rule 9 of 9</Chip>}
          title="What you won't find here"
          body="Anything mixing cover with investment. IDBI sells them; I won't recommend them, and your record says why."
        >
          <MenuLink
            label="See the nine rules"
            className="mt-xs"
            onPress={() => router.push({ pathname: '/record', params: { pane: 'rules' } })}
          />
        </Callout>
      </View>

      <AskUdayRows
        title="Ask Uday"
        questions={[LIFE_COVER, GOVERNMENT_SCHEME, COVER_PLUS_SAVINGS]}
      />
    </>
  )
}

function Products({
  items,
  onPick,
}: {
  items: readonly ShelfProduct[]
  onPick: (p: ShelfProduct) => void
}) {
  return (
    <Card>
      {items.map((p, i) => (
        <ProductRow key={p.productId} product={p} onPress={() => onPick(p)} divide={i > 0} />
      ))}
    </Card>
  )
}

/**
 * Cleo's white card with a plate beside the words: a chip, a heading, a sentence or two, then
 * whatever the card asks the customer to do. Everything sits in the column right of the plate,
 * so the buttons line up with the heading rather than with the card's edge. Without a glyph it
 * is a pane's hero: the same words at the card's full width.
 */
function Callout({
  glyph,
  chip,
  title,
  body,
  note,
  children,
}: {
  glyph?: GlyphName
  chip?: ReactNode
  title: string
  body: string
  note?: string
  children?: ReactNode
}) {
  const words = (
    <>
      {chip}
      <Type role="heading" className={cn(chip !== undefined && 'mt-sm')}>
        {title}
      </Type>
      <Type role="body" tone="mid" className="mt-xs">
        {body}
      </Type>
      {note === undefined ? null : (
        <Type role="body" tone="mid" className="mt-sm">
          {note}
        </Type>
      )}
      {children}
    </>
  )
  if (glyph === undefined) return <Card className="p-lg">{words}</Card>
  return (
    <Card className="flex-row items-start gap-lg p-lg">
      <GlyphPlate name={glyph} fill="bg-ground" />
      <View className="flex-1">{words}</View>
    </Card>
  )
}

const people = (v: number) => `${v} ${v === 1 ? 'person' : 'people'}`

/**
 * The one fact on this tab the customer can correct in place. It lives at the tab's root, not
 * inside the card that opens it: saving a first dependant swaps that card for the cover hero,
 * and a sheet inside the card would be torn down mid-save along with it.
 */
function DependantsSheet({
  open,
  from,
  onClose,
  onSaved,
}: {
  open: boolean
  /** Where the dial starts: one person, or the number already given this session. */
  from: number
  onClose: () => void
  onSaved: (dependents: number) => void
}) {
  const { refresh } = useSnapshot()
  const toast = useToast()
  const [n, setN] = useState(1)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  // Each opening starts from its own figure and no error, whatever the last one ended on.
  useEffect(() => {
    if (!open) return
    setN(from)
    setFailed(false)
  }, [open, from])

  async function save() {
    setBusy(true)
    setFailed(false)
    try {
      await api.patchProfile({ dependents: n })
      // The advice moves with the profile, so the view is read again before the sheet goes:
      // the customer lands on the new cover figure, not on the card they just answered.
      await refresh()
      onSaved(n)
      onClose()
      toast.show('Profile updated')
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Who depends on your income?"
      subtitle="Anyone who would struggle if your income stopped."
      footer={<Button label="Save" loading={busy} disabled={busy} onPress={() => void save()} />}
    >
      <AmountStepper
        value={n}
        min={1}
        max={20}
        step={1}
        format={people}
        size="lg"
        label="Dependants"
        onChange={setN}
      />
      {failed ? (
        <View className="mt-lg">
          <RetryLine
            compact
            message="Couldn't save. Try again."
            busy={busy}
            onRetry={() => void save()}
          />
        </View>
      ) : null}
    </Sheet>
  )
}
