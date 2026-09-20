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
import { useState } from 'react'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { TabHeader } from '~/ui/TabHeader'
import { Pills, usePane } from '~/ui/Pills'
import { Pane } from '~/ui/Reveal'
import { Type } from '~/ui/Text'
import { Count } from '~/ui/Count'
import { dur } from '~/ui/motion'
import { Card } from '~/ui/Card'
import { Row } from '~/ui/Row'
import { Section } from '~/ui/Section'
import { SnapshotScroll } from '~/ui/SnapshotScroll'
import { Chip } from '~/ui/Chip'
import { Meter } from '~/ui/Meter'
import { Glyph } from '~/ui/Glyph'
import { GateSheet, ProductRow } from '~/ui/GateSheet'
import { rupees, rupeesShort } from '~/lib/money'
import { color } from '@dhan/design'
import { protectionShelf } from '@dhan/core'
import type { ShelfProduct, View as ViewModel } from '@dhan/contracts'

type Pane = 'cover' | 'buffer' | 'shelf'

const PANES = [
  { value: 'cover' as const, label: 'Cover' },
  { value: 'buffer' as const, label: 'Safety net' },
  { value: 'shelf' as const, label: 'What I can get' },
]

export default function Protect() {
  const { pane, dir, set } = usePane<Pane>('cover')
  const [chosen, setChosen] = useState<ShelfProduct | null>(null)

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <TabHeader title="Protect" />
      <Pills options={PANES} value={pane} onChange={set} />

      <SnapshotScroll loading="Checking what you are covered for…">
        {(view) => (
          <Pane key={pane} dir={dir} className="gap-md">
            {pane === 'cover' ? (
              <Cover view={view} />
            ) : pane === 'buffer' ? (
              <Buffer view={view} />
            ) : (
              <Shelf view={view} onPick={setChosen} />
            )}
          </Pane>
        )}
      </SnapshotScroll>

      <GateSheet product={chosen} onClose={() => setChosen(null)} />
    </SafeAreaView>
  )
}

function Cover({ view }: { view: ViewModel }) {
  const { protection, customer } = view.snapshot
  const covered =
    protection.lifeCoverNeeded > 0 ? protection.lifeCoverInForce / protection.lifeCoverNeeded : 1
  const exposed = protection.gap > 0

  if (protection.dependents === 0) {
    return (
      <>
        <View className="rounded-lg bg-success p-lg">
          <View className="flex-row items-center gap-sm">
            <Glyph name="check" size={18} tint={color.ink} />
            <Type role="title">Nobody depends on your income</Type>
          </View>
          <Type role="body" className="mt-sm opacity-80">
            Life cover replaces an income someone else depends on. Nobody depends on yours, so you
            do not need it — and I will not sell you some anyway.
          </Type>
        </View>
        <Type role="caption" tone="faint">
          If that changes, update your profile and this screen changes with it.
        </Type>
      </>
    )
  }

  return (
    <>
      <View className={exposed ? 'rounded-lg bg-streak p-lg' : 'rounded-lg bg-success p-lg'}>
        <Type role="caption" className="opacity-70">
          {exposed ? 'NOT COVERED' : 'COVERED'}
        </Type>
        <Count
          value={protection.gap}
          format={rupeesShort}
          role="display"
          className="mt-xs"
          delay={dur.enter}
        />
        <Type role="body" className="mt-sm opacity-85">
          {protection.dependents} {protection.dependents === 1 ? 'person depends' : 'people depend'}{' '}
          on your income. Ten times income is the rule of thumb:{' '}
          {rupeesShort(protection.lifeCoverNeeded)} needed against{' '}
          {rupeesShort(protection.lifeCoverInForce)} in force.
        </Type>
        <View className="mt-lg">
          <Meter fraction={covered} tone="bg-ink" track="bg-ink/15" delay={dur.enter} />
        </View>
      </View>

      <Card>
        <Row label="Cover you need" value={rupees(protection.lifeCoverNeeded)} />
        <Row label="Cover in force" value={rupees(protection.lifeCoverInForce)} divide />
        <Row label="The gap" value={rupees(protection.gap)} divide tone="danger" />
      </Card>

      {/* Why this sits ahead of every investment on the shelf. Said plainly, because the
          ordering is the recommendation and a customer is entitled to the reasoning. */}
      <View className="rounded-lg border border-hairline bg-surface p-lg">
        <Type role="heading">Why this comes first</Type>
        <Type role="body" tone="soft" className="mt-sm">
          Cover is the one thing that cannot be caught up on later — it gets more expensive every
          year and at some point it stops being available at all. A portfolio that grows for{' '}
          {customer.age > 40 ? 'fifteen' : 'thirty'} years is worth nothing to your family if the
          income behind it stops next month.
        </Type>
        <Type role="body" tone="soft" className="mt-md">
          Term cover pays this bank almost nothing. That is the point of it being first.
        </Type>
      </View>
    </>
  )
}

function Buffer({ view }: { view: ViewModel }) {
  const { buffer, commitments, balances } = view.snapshot
  const short = buffer.shortfall > 0
  // Null where the monthly outflow is unknown, which a sparse statement makes common. That
  // means "not computable", which is emphatically not "zero months of buffer" — printing 0.0
  // months would be a false statement about someone's finances on the one tab whose claim is
  // that it shows its working. So the figure and its meter are suppressed rather than faked.
  const covered = buffer.monthsCovered
  const ratio =
    covered !== null && buffer.targetMonths > 0 ? Math.min(1, covered / buffer.targetMonths) : 1

  return (
    <>
      <View className={short ? 'rounded-lg bg-streak p-lg' : 'rounded-lg bg-budget p-lg'}>
        <Type role="caption" className="opacity-70">
          IF INCOME STOPPED TODAY
        </Type>
        {covered === null ? (
          <>
            <Type role="display" className="mt-xs">
              Not yet known
            </Type>
            <Type role="body" className="mt-sm opacity-85">
              There is not enough statement here to work out what a month costs you, so there is no
              honest number of months to set against a target of {buffer.targetMonths}.
            </Type>
          </>
        ) : (
          <>
            <Count
              value={covered}
              format={(n) => `${n.toFixed(1)} months`}
              role="display"
              className="mt-xs"
              delay={dur.enter}
            />
            <Type role="body" className="mt-sm opacity-85">
              Against a target of {buffer.targetMonths}. That is {rupees(commitments.total)} a month
              of commitments your balance would have to carry.
            </Type>
            <View className="mt-lg">
              <Meter fraction={ratio} tone="bg-ink" track="bg-ink/15" delay={dur.enter} />
            </View>
          </>
        )}
      </View>

      <Card>
        <Row label="Liquid balance" value={rupees(balances.total)} />
        <Row label="Committed every month" value={rupees(commitments.total)} divide />
        <Row
          label={short ? 'Still short by' : 'Above target by'}
          value={rupees(
            short
              ? buffer.shortfall
              : Math.max(0, balances.total - commitments.total * buffer.targetMonths),
          )}
          divide
          tone={short ? 'danger' : 'ink'}
        />
      </Card>

      {!short && (
        <View className="rounded-lg border border-hairline bg-surface p-lg">
          <Type role="heading">This one is done</Type>
          <Type role="body" tone="soft" className="mt-sm">
            You are past the target, so nothing here needs attention. Anything above the buffer can
            work harder — that is what Grow is for.
          </Type>
        </View>
      )}
    </>
  )
}

function Shelf({ view, onPick }: { view: ViewModel; onPick: (p: ShelfProduct) => void }) {
  // Only protection, and the rule that decides it lives in the engine beside the gate that
  // enforces it — not in a regex over a product's marketing name. A name-matcher put "LIC
  // Jeevan Anand Endowment" under Proper cover on the word *Jeevan*, directly above the card
  // on this tab saying that anything bundling cover with investment is not here.
  const { nominal: free, full: rest } = protectionShelf(view.shelf)

  return (
    <>
      <Type role="body" tone="soft">
        All of these run through the same nine rules. Tap one and I will tell you if it suits you —
        including when it does not.
      </Type>

      {free.length > 0 && (
        <>
          <Section title="Costs almost nothing" />
          <Card>
            {free.map((p, i) => (
              <ProductRow key={p.productId} product={p} onPress={() => onPick(p)} divide={i > 0} />
            ))}
          </Card>
          <Type role="caption" tone="faint">
            Government schemes. The bank earns nothing on these, which is why they are first.
          </Type>
        </>
      )}

      {rest.length > 0 && (
        <>
          <Section title="Proper cover" />
          <Card>
            {rest.map((p, i) => (
              <ProductRow key={p.productId} product={p} onPress={() => onPick(p)} divide={i > 0} />
            ))}
          </Card>
        </>
      )}

      <View className="mt-md rounded-lg border border-hairline bg-surface p-lg">
        <Type role="heading">What you will not find here</Type>
        <Type role="body" tone="soft" className="mt-sm">
          Anything that mixes cover with investment. IDBI sells them, but they are refused for you,
          and the reason is saved.
        </Type>
        <Chip tone="ground" className="mt-md">
          Rule 9 · BUNDLED_PROTECTION
        </Chip>
      </View>
    </>
  )
}
