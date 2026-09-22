// Ask the gate about a product, before any money moves.
//
// This is the screen the whole product exists to be able to show. Every other app in the
// category answers "can I sell you this" — this one answers "should you buy this", and
// sometimes the answer is no about a product the bank itself distributes.
//
// The refusal is styled as seriously as the pass. It names the rule, quotes the advisor's
// own sentence, and where a rule knows a better product it names that too. It is also
// written to the audit trail either way: a verdict nobody recorded is one nobody can audit.
//
// It is a page sheet on iOS, not a pushed route: the shelf stays where it was underneath, and a
// customer checking three products in a row comes back to the list three times without losing
// their place. The page is `Screen`, so the button rides above the keyboard while the amount is
// typed rather than hiding under it, and the sheet fades instead of sliding under Reduce Motion.
//
// **Everything the sheet knows belongs to one product.** The amount, the answer and the error
// live in a body keyed to the product and to the opening, so a new product — or the same one
// opened again — starts clean, seeded with its own minimum. The old sheet kept one set of
// state across products: close it from the refusal's door and the next product opened on the
// last one's "no", and a switch checked the previous product's amount against the new one.
// While it closes, the last product stays drawn, so the sheet does not empty as it leaves.
//
// **Cover at a nominal premium asks for no amount.** PMSBY is ₹20 a year; there is no figure
// to choose, and a field pre-filled with ₹2 asks the customer a question that has one answer.
// A scheme is charged by the year, so its premium is printed by the year wherever it appears —
// see `premiumOf`.
//
// **The ruling lands on the page, not in a card.** The nine rules are a list in a card of
// their own — the customer can see how far the check got and where it stopped — and a verdict
// card around that list would be a card inside a card. The chip carries the colour instead.
// Where the rule knows a better product, "Instead" swaps the sheet onto it without closing;
// where it knows only a name, it asks Uday, which is the one honest thing left to offer.
import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Keyboard, Modal, Platform, View } from 'react-native'
import type { Edge } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { NOMINAL_PREMIUM_MAX, isProtectionProduct, shelfGroup } from '@dhan/core'
import { Tap } from '~/ui/Tap'
import { BEAT, Beat, VerdictFrame, VerdictSurface } from '~/ui/Verdict'
import { Type } from '~/ui/Text'
import { Button } from '~/ui/Button'
import { Field } from '~/ui/Field'
import { Chip } from '~/ui/Chip'
import { RulesChip } from '~/ui/RulesChip'
import { AskUday } from '~/ui/AskUday'
import { Card } from '~/ui/Card'
import { Row } from '~/ui/Row'
import { Note } from '~/ui/Note'
import { Screen } from '~/ui/Screen'
import { Checklist, type ChecklistStep } from '~/ui/Checklist'
import { MenuLink } from '~/ui/MenuRow'
import { useToTab } from '~/ui/NavRow'
import { Glyph, GlyphPlate, type GlyphName } from '~/ui/Glyph'
import { OFFLINE, RetryLine } from '~/ui/SnapshotScroll'
import { useReducedMotion } from '~/ui/motion'
import { cn } from '~/ui/cn'
import { useSnapshot } from '~/state/snapshot'
import { api } from '~/api/client'
import { rupees, rupeesShort } from '~/lib/money'
import { askFacts, questionForProduct, questionForVerdict } from '~/lib/ask'
import { color } from '@dhan/design'
import type { ShelfProduct, Verdict } from '@dhan/contracts'

/**
 * The nine rules in the order the gate runs them (`packages/core/src/suitability.ts`). The
 * order is the argument — debt before buffer before risk — so a screen that lists them lists
 * them in this order, and a rule's number is its place here.
 */
export const RULE_ORDER = [
  'HIGH_INTEREST_DEBT',
  'MISSED_REPAYMENT',
  'EMERGENCY_BUFFER',
  'RISK_CEILING',
  'VOLATILITY_VS_HORIZON',
  'AFFORDABILITY',
  'HORIZON_VS_LOCKIN',
  'TAX_BENEFIT_UNAVAILABLE',
  'BUNDLED_PROTECTION',
] as const

export type RuleId = (typeof RULE_ORDER)[number]

/**
 * Each rule as the principle it holds to, not as a fact about the customer. A rule passes
 * when its condition is met *or* when it does not apply — cover is exempt from the debt and
 * buffer rules, because a family that loses an income also inherits its debts — so a name like
 * "No high-interest debt" would put a tick beside a false sentence on the one screen whose
 * claim is that it shows its working. A principle reads true ticked, and reads as the reason
 * when the gate stops on it.
 */
export const RULE_NAMES: Record<RuleId, string> = {
  HIGH_INTEREST_DEBT: 'Expensive debt comes first',
  MISSED_REPAYMENT: 'Missed repayments come first',
  EMERGENCY_BUFFER: 'A buffer before any lock-in',
  RISK_CEILING: 'Within your risk profile',
  VOLATILITY_VS_HORIZON: 'No market risk on near goals',
  AFFORDABILITY: 'Only what you can spare',
  HORIZON_VS_LOCKIN: 'Lock-in fits your goal',
  TAX_BENEFIT_UNAVAILABLE: "No tax break you can't claim",
  BUNDLED_PROTECTION: 'Cover kept apart from investing',
}

/** A rule's number, 1 to 9, or 0 for an id this client does not know. */
export function ruleIndex(id: string | null | undefined): number {
  if (id == null) return 0
  return (RULE_ORDER as readonly string[]).indexOf(id) + 1
}

/** A rule's name from the id a verdict carries, or null for an id this client does not know. */
export function ruleName(id: string | null | undefined): string | null {
  const at = ruleIndex(id)
  return at === 0 ? null : RULE_NAMES[RULE_ORDER[at - 1] as RuleId]
}

/**
 * The name a customer would say. A cover product's name carries its sum assured after a comma
 * ("LIC Term Assurance, ₹1 crore cover"); the row and the sheet print that figure on their own,
 * so the name stops at the comma.
 */
export function shortName(p: Pick<ShelfProduct, 'name' | 'coverAmount'>): string {
  if (p.coverAmount === undefined) return p.name
  const cut = p.name.indexOf(',')
  return cut > 0 ? p.name.slice(0, cut).trim() : p.name
}

/** The kind of thing it is, in sentence case: the chip on the sheet. */
const KIND: Record<ShelfProduct['category'], string> = {
  'Sweep-in FD': 'Sweep-in deposit',
  'Fixed Deposit': 'Fixed deposit',
  'Recurring Deposit': 'Recurring deposit',
  Liquid: 'Liquid fund',
  Debt: 'Debt fund',
  'Index Fund': 'Index fund',
  Equity: 'Equity fund',
  ELSS: 'Tax-saving fund',
  'Term Insurance': 'Term cover',
  'Health Insurance': 'Health cover',
  'Government Insurance': 'Government scheme',
  NPS: 'Pension scheme',
  PPF: 'Provident fund',
  ULIP: 'Cover plus investment',
  Endowment: 'Cover plus savings',
}

/**
 * Cover by what it covers; everything else by whose it is. The trend line is for what moves with
 * a market: PPF pays a rate the government sets, and an endowment a sum assured plus the
 * insurer's bonuses, so both wear the savings mark under "From other providers" instead.
 */
export function productGlyph(p: ShelfProduct): GlyphName {
  if (isProtectionProduct(p)) {
    return p.coverType === 'health' ? 'heart' : p.coverType === 'accident' ? 'umbrella' : 'shield'
  }
  if (shelfGroup(p) === 'idbi_own') return 'ledger'
  return p.category === 'PPF' || p.category === 'Endowment' ? 'moneybag' : 'grow'
}

/** "₹1 crore cover from LIC of India": what the name held after its comma, and who runs it. */
function subtitleOf(p: ShelfProduct): string {
  const who = /^government/i.test(p.manufacturer) ? `the ${p.manufacturer}` : p.manufacturer
  const cut = p.name.indexOf(',')
  const tail = p.coverAmount !== undefined && cut > 0 ? p.name.slice(cut + 1).trim() : ''
  return tail === '' ? `From ${who}` : `${tail} from ${who}`
}

/**
 * The rate a product has typically paid, when the shelf carries one. The contract's field name
 * stays in this one line; everything a customer reads calls it "typical".
 */
function typicalReturn(p: ShelfProduct): number | undefined {
  return p.indicativeReturn
}

function years(n: number): string {
  return `${n} ${n === 1 ? 'year' : 'years'}`
}

/**
 * A cover premium as the customer pays it. A government scheme is charged once a year — PMSBY
 * ₹20, PMJJBY ₹436 — and the shelf's monthly figure is that split twelve ways and rounded: "₹2 a
 * month" printed over the scheme's own "₹20 a year" read as ₹24 against ₹20. So a scheme reads
 * as the yearly figure its note states, or as "about" the monthly one where the note has none.
 * The gate still runs on the monthly figure, which is the unit its rules measure in.
 */
export function premiumOf(p: Pick<ShelfProduct, 'category' | 'minInvestment' | 'note'>): string {
  const month = `${rupees(p.minInvestment)} a month`
  if (p.category !== 'Government Insurance') return month
  const year = p.note === undefined ? null : /₹[\d,]+ a year/.exec(p.note)
  return year === null ? `about ${month}` : year[0]
}

/** A premium that opens a chip or a sentence. */
function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// A sentence's characters: anything but a full stop, or one inside a number ("₹1.5 crore").
const IN_SENTENCE = String.raw`(?:[^.]|\.(?=\d))`
// The sentence a quote was priced on: "LIC Digi Term, non-smoker, age 29, ₹1 crore."
const QUOTE_BASIS = new RegExp(
  String.raw`${IN_SENTENCE}*?\b(non-smoker|smoker), age (\d+)${IN_SENTENCE}*\.?`,
  'i',
)

/**
 * The shelf's note as the customer reads it. The note is catalogue text, and two kinds of it
 * are not facts about the customer. A "[verify premium]" is a builder's reminder to check the
 * figure, so it goes. The basis a quote was priced on — "non-smoker, age 29" — printed bare
 * read as the customer's own age and habits, on a sheet opened by a customer of 30, so it is
 * said as what it is: the quote's. Both belong fixed in the catalogue; this keeps them off
 * the sheet until they are.
 */
function noteOf(note: string | undefined): string | null {
  if (note === undefined) return null
  let text = note.replace(/\s*\[verify[^\]]*\]/gi, '')
  const basis = QUOTE_BASIS.exec(text)
  const who = basis?.[1]
  const age = basis?.[2]
  if (basis !== null && who !== undefined && age !== undefined) {
    text =
      text.slice(0, basis.index) +
      ` Quoted for a ${age}-year-old ${who.toLowerCase()}; your premium may differ.` +
      text.slice(basis.index + basis[0].length)
  }
  const said = text.replace(/\s+/g, ' ').trim()
  return said === '' ? null : said
}

// A page sheet has no status bar over it; Android and the web draw it full screen.
const EDGES: readonly Edge[] = Platform.OS === 'ios' ? ['bottom'] : ['top', 'bottom']

export function GateSheet({
  product,
  onClose,
  onSwitch,
}: {
  product: ShelfProduct | null
  onClose: () => void
  /** Moves the open sheet onto another product — the verdict's "Instead". Omitted, it asks Uday. */
  onSwitch?: (product: ShelfProduct) => void
}) {
  const reduced = useReducedMotion()

  // Held so the sheet keeps its content while it animates away after `product` goes null.
  const last = useRef<ShelfProduct | null>(product)
  if (product !== null) last.current = product
  const shown = product ?? last.current

  // One body per product per opening. The count moves when a product arrives — a first
  // opening, a reopening, a switch — and not when the sheet closes, which is what keeps the
  // closing sheet drawn as it was.
  const session = useRef<{ id: string | null; n: number }>({ id: null, n: 0 })
  const id = product?.productId ?? null
  if (id !== session.current.id) {
    session.current = { id, n: id === null ? session.current.n : session.current.n + 1 }
  }

  return (
    <Modal
      visible={product !== null}
      animationType={reduced ? 'fade' : 'slide'}
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {shown === null ? null : (
        <Gate
          key={session.current.n}
          product={shown}
          onClose={onClose}
          {...(onSwitch === undefined ? {} : { onSwitch })}
        />
      )}
    </Modal>
  )
}

function Gate({
  product,
  onClose,
  onSwitch,
}: {
  product: ShelfProduct
  onClose: () => void
  onSwitch?: (product: ShelfProduct) => void
}) {
  const cover = isProtectionProduct(product)
  const min = product.minInvestment
  const nominal = cover && min <= NOMINAL_PREMIUM_MAX
  const [text, setText] = useState(String(min))
  const [checking, setChecking] = useState(false)
  const [failed, setFailed] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [checked, setChecked] = useState(min)

  // An answer that lands after the sheet moved on belongs to nobody on screen.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const value = nominal ? min : Number.parseInt(text, 10) || 0
  const under = !nominal && value > 0 && value < min
  const canCheck = value > 0 && !under

  function close() {
    Keyboard.dismiss()
    onClose()
  }

  async function check() {
    if (!canCheck || checking) return
    Keyboard.dismiss()
    const amount = value
    setChecking(true)
    setFailed(false)
    try {
      const out = await api.evaluate(product.productId, amount)
      if (!alive.current) return
      setChecked(amount)
      setVerdict(out.verdict)
      const at = ruleIndex(out.verdict.ruleId)
      AccessibilityInfo.announceForAccessibility(
        out.verdict.verdict === 'BLOCKED'
          ? `Not suitable.${at > 0 ? ` Stopped at rule ${at} of 9.` : ''}`
          : 'All nine rules passed',
      )
    } catch {
      if (alive.current) setFailed(true)
    } finally {
      if (alive.current) setChecking(false)
    }
  }

  const typical = typicalReturn(product)
  const note = noteOf(product.note)
  const facts: { label: string; value: string }[] = cover
    ? [
        ...(product.coverAmount === undefined
          ? []
          : [{ label: 'Cover', value: rupeesShort(product.coverAmount) }]),
        // A government scheme's premium is fixed; "from" would promise a range it has not got.
        { label: nominal ? 'Premium' : 'Premium from', value: premiumOf(product) },
      ]
    : [
        ...(typical === undefined ? [] : [{ label: 'Typical return', value: `about ${typical}%` }]),
        { label: 'Risk', value: product.riskometer },
        { label: 'Minimum', value: rupees(min) },
        ...(product.lockInYears > 0
          ? [{ label: 'Lock-in', value: years(product.lockInYears) }]
          : []),
      ]

  return (
    <Screen
      onClose={close}
      edges={EDGES}
      footer={
        verdict === null ? (
          <Button
            label="Check if this suits me"
            loading={checking}
            disabled={!canCheck || checking}
            haptic="none"
            accessibilityHint="Runs the nine suitability rules"
            onPress={() => void check()}
          />
        ) : undefined
      }
    >
      <Type role="display" numberOfLines={2} adjustsFontSizeToFit>
        {shortName(product)}
      </Type>
      <Type role="body" tone="mid" className="mt-sm">
        {subtitleOf(product)}
      </Type>

      <View className="mt-md flex-row flex-wrap gap-sm">
        <Chip tone="ground">{KIND[product.category]}</Chip>
        {nominal ? <Chip tone="success">Costs almost nothing</Chip> : null}
      </View>

      <Card className="mt-lg">
        {facts.map((f, i) => (
          <Row key={f.label} label={f.label} value={f.value} divide={i > 0} />
        ))}
      </Card>

      {note === null ? null : (
        <Type role="caption" tone="mid" className="mt-md">
          {note}
        </Type>
      )}

      {verdict === null ? (
        <>
          {nominal ? null : (
            <View className="mt-xl">
              <Field
                label="How much a month?"
                prefix="₹"
                keyboardType="number-pad"
                inputMode="numeric"
                returnKeyType="done"
                onSubmitEditing={() => void check()}
                maxLength={9}
                value={text}
                onChangeText={(t) => setText(t.replace(/\D/g, ''))}
                hint={`Minimum is ${rupees(min)}`}
                {...(under ? { error: `Under the ${rupees(min)} minimum` } : {})}
              />
            </View>
          )}

          {failed ? (
            <View className="mt-md">
              <RetryLine compact message={OFFLINE} busy={checking} onRetry={() => void check()} />
            </View>
          ) : null}

          <View className="mt-xl">
            <Note>
              Nine rules run against your statement. Whatever they say goes in your record.
            </Note>
          </View>
        </>
      ) : (
        <Ruling
          verdict={verdict}
          product={product}
          checked={checked}
          fixed={nominal}
          onClose={close}
          onAgain={() => setVerdict(null)}
          {...(onSwitch === undefined ? {} : { onSwitch })}
        />
      )}
    </Screen>
  )
}

/**
 * The answer, in the four beats `Verdict.tsx` times: the chip and the ruling, then the reason
 * and the rules it ran, then where it went and what to do next.
 */
function Ruling({
  verdict,
  product,
  checked,
  fixed,
  onClose,
  onAgain,
  onSwitch,
}: {
  verdict: Verdict
  product: ShelfProduct
  checked: number
  /** No amount to change: the premium is the scheme's. */
  fixed: boolean
  onClose: () => void
  onAgain: () => void
  onSwitch?: (product: ShelfProduct) => void
}) {
  const { data } = useSnapshot()
  const toTab = useToTab()
  const askUday = (question: string) =>
    toTab({ pathname: '/(tabs)/uday', params: { ask: question } })
  const blocked = verdict.verdict === 'BLOCKED'
  const at = ruleIndex(verdict.ruleId)
  const name = shortName(product)
  // What was checked, as it is paid: a scheme's own premium when there was no amount to choose.
  const paid = fixed ? premiumOf(product) : `${rupees(checked)} a month`

  // A rule this client does not know still stops the list honestly: what passed is ticked and
  // nothing is claimed about the rest.
  const steps: ChecklistStep[] = RULE_ORDER.map((id, i) => {
    const n = i + 1
    if (!blocked) return { id, title: RULE_NAMES[id], state: 'done' }
    if (at === 0) {
      return { id, title: RULE_NAMES[id], state: verdict.passed.includes(id) ? 'done' : 'locked' }
    }
    if (n < at) return { id, title: RULE_NAMES[id], state: 'done' }
    if (n === at) return { id, title: RULE_NAMES[id], detail: 'Stopped here', state: 'current' }
    return { id, title: RULE_NAMES[id], state: 'locked' }
  })

  const alt = verdict.alternative
  const found = alt === null ? undefined : data?.shelf.find((p) => p.productId === alt.productId)
  const altName = found ? shortName(found) : (alt?.name ?? '')
  const swaps = found !== undefined && onSwitch !== undefined
  // Asked by its kind, never its name — a named product runs the gate again and files a second
  // verdict. A product the shelf does not carry has no kind to ask by, so it is shown, not linked.
  const facts = data === null ? null : askFacts(data.snapshot)
  const altAsk = found === undefined || facts === null ? null : questionForProduct(found, facts)
  const altPress = swaps
    ? () => onSwitch(found)
    : altAsk !== null
      ? () => leaveFor(() => askUday(altAsk))
      : null
  // The rule that stopped it, or the kind that passed; null where no rule of Uday's answers it
  // (a risk ceiling, a lock-in, a tax break), and then the sheet's own reason is the answer.
  const ask = facts === null ? null : questionForVerdict(verdict, product, facts)

  // Close first: a route opened behind a presented sheet arrives underneath it, and the
  // customer is left looking at the answer they just tapped away from.
  const leaveFor = (go: () => void) => {
    onClose()
    go()
  }

  return (
    <VerdictFrame>
      <VerdictSurface tone={blocked ? 'blocked' : 'passed'} className="mt-xl">
        <Beat at={BEAT.ruling}>
          <RulesChip blocked={blocked} of={RULE_ORDER.length} at={at} />
          <Type role="title" className="mt-sm">
            {blocked ? "I'm not going to sell you that" : 'This one fits'}
          </Type>
        </Beat>

        <Beat at={BEAT.reasoning}>
          <Type role="body" className="mt-sm">
            {blocked
              ? (verdict.spoken ?? 'The reason is in your record.')
              : `${capital(paid)} for ${name} clears every check against your statement.`}
          </Type>

          {/* The one refusal that names a subject and ends nowhere: a missed repayment is a
              sentence about the customer's credit standing, so it opens onto what their IDBI
              file shows. The same words as the Plan tab's door, onto the same pane. */}
          {verdict.ruleId === 'MISSED_REPAYMENT' ? (
            <MenuLink
              label="See what your IDBI file actually shows"
              className="mt-xs"
              onPress={() =>
                leaveFor(() => toTab({ pathname: '/(tabs)/spend', params: { pane: 'credit' } }))
              }
            />
          ) : null}

          {alt === null ? null : (
            <View className="mt-lg">
              <Type role="caption" tone="mid">
                Instead
              </Type>
              <Card className="mt-sm">
                {altPress === null ? (
                  <View
                    accessible
                    accessibilityLabel={`Instead, ${altName}, ${rupees(alt.monthly)} a month`}
                    className="min-h-target flex-row items-center gap-lg px-lg py-md"
                  >
                    <GlyphPlate name={found ? productGlyph(found) : 'shield'} fill="bg-ground" />
                    <View className="flex-1">
                      <Type role="heading" plain>
                        {altName}
                      </Type>
                      <Type role="body" tone="mid">
                        {`${rupees(alt.monthly)} a month`}
                      </Type>
                    </View>
                  </View>
                ) : (
                  <Tap
                    accessibilityRole="button"
                    accessibilityLabel={`Instead, ${altName}, ${rupees(alt.monthly)} a month`}
                    accessibilityHint={swaps ? 'Checks this one instead' : 'Asks Uday about it'}
                    haptic="none"
                    scale={0.98}
                    onPress={altPress}
                    className="min-h-target flex-row items-center gap-lg px-lg py-md"
                  >
                    <GlyphPlate name={found ? productGlyph(found) : 'shield'} fill="bg-ground" />
                    <View className="flex-1">
                      <Type role="heading" plain>
                        {altName}
                      </Type>
                      <Type role="body" tone="mid">
                        {`${rupees(alt.monthly)} a month`}
                      </Type>
                    </View>
                    <Glyph name="chevronRight" size={22} tint={color.ink} />
                  </Tap>
                )}
              </Card>
            </View>
          )}

          <Checklist dense variant="rows" steps={steps} className="mt-lg" />
        </Beat>

        <Beat at={BEAT.provenance}>
          <Type role="caption" tone="mid" className="mt-lg">
            {blocked
              ? `Passed ${verdict.passed.length} of 9.${at > 0 ? ` Stopped at rule ${at} of 9.` : ''}`
              : 'Recorded with its evidence.'}
          </Type>
          <MenuLink
            label="See it in your record"
            onPress={() =>
              leaveFor(() => router.push({ pathname: '/record', params: { pane: 'advice' } }))
            }
          />

          {/* The sheet's own next move is the button; asking Uday is the link under it, the one
              shape the ask takes across the app. It closes the sheet before the chat opens. */}
          {ask === null && fixed ? null : (
            <View className="mt-lg">
              {fixed ? null : (
                <Button label="Check a different amount" haptic="none" onPress={onAgain} />
              )}
              {ask === null ? null : (
                <AskUday
                  question={ask}
                  onBefore={onClose}
                  {...(fixed ? {} : { className: 'mt-xs' })}
                />
              )}
            </View>
          )}
        </Beat>
      </VerdictSurface>
    </VerdictFrame>
  )
}

/**
 * A tappable shelf row, Cleo's benefits-list shape: what it covers on a plate, the name, and
 * what it costs as chips — the lime chip is the premium the bank earns nothing on. A product
 * that is not cover reads as its risk, return and lock-in instead. The whole row is the target,
 * and its hairline is inset to the row's content, so the plates read as one column.
 */
export function ProductRow({
  product,
  onPress,
  divide,
}: {
  product: ShelfProduct
  onPress: () => void
  divide: boolean
}) {
  const cover = isProtectionProduct(product)
  const name = shortName(product)
  const typical = typicalReturn(product)
  const premium = premiumOf(product)
  const amount =
    product.coverAmount === undefined ? null : `${rupeesShort(product.coverAmount)} cover`
  const meta = [
    `${product.riskometer} risk`,
    typical === undefined ? null : `about ${typical}%`,
    product.lockInYears > 0 ? `${product.lockInYears}-year lock-in` : null,
  ]
    .filter((s): s is string => s !== null)
    .join(' · ')
  const said = cover ? [premium, amount].filter((s): s is string => s !== null).join(', ') : meta

  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${said}`}
      accessibilityHint="Runs the nine suitability rules"
      haptic="none"
      scale={0.985}
      onPress={onPress}
      className="px-lg"
    >
      <View
        className={cn('flex-row items-center gap-lg py-lg', divide && 'border-t border-hairline')}
      >
        <GlyphPlate name={productGlyph(product)} fill="bg-ground" />
        {/* No line cap: at 320pt "IDBI Systematic Savings Plan (SSP)" and "LIC Jeevan Anand
            Endowment" need three lines, and a product cut to "…" is one the customer can't name. */}
        <View className="flex-1">
          <Type role="heading" plain>
            {name}
          </Type>
          {cover ? (
            <View className="mt-xs flex-row flex-wrap gap-xs">
              <Chip
                size="sm"
                tone={product.minInvestment <= NOMINAL_PREMIUM_MAX ? 'success' : 'ground'}
              >
                {capital(premium)}
              </Chip>
              {amount === null ? null : (
                <Chip size="sm" tone="ground">
                  {amount}
                </Chip>
              )}
            </View>
          ) : (
            <Type role="caption" tone="mid" className="mt-xs">
              {meta}
            </Type>
          )}
        </View>
        <Glyph name="chevronRight" size={22} tint={color.ink} />
      </View>
    </Tap>
  )
}
