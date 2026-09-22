// Credit — what IDBI can see about how you borrow, what that's worth, and what it can't see.
//
// One body, two doors. The Spend tab's Credit pane and the `/credit` route both render this, so a
// customer who taps the pill and one who follows the gate's link read the same sections in the
// same order at the same spacing. It returns its sections as siblings — no scroll, no safe area,
// no title — because each door brings its own frame: the pane sits in Spend's scroll under the
// pills, the route in a `Screen` with a back chevron and a display title. Both lay the sections
// out in a `gap-md` column, and that column is the whole contract.
//
// **The figure is 0–100 from the IDBI file alone, and it says so in its own card.** Every screen
// in this category is a 300–900 figure on an arc. That figure can't be built honestly by a bank
// that hasn't pulled a bureau report: 55% of a bureau's weight has no input anywhere in a
// `CustomerFile`, which `packages/core/src/credit.ts` argues in full. So the hero takes Cleo's
// money-health shape — the figure standing in a warm glow, "out of N" under it, a chip naming
// where it came from — on a light card of its own, and the ink card directly under it says what
// the figure costs and that it is not a credit score: above the fold, touching the figure it
// qualifies, where a disclaimer is actually read. Two cards side by side in the column, not one
// inside the other: the light plate used to sit inside the ink card, which was a card in a card.
// The glow wants the light ground either way — warm light fading straight over ink passes through
// olive on the way down, whatever the curve — and the words inside it are ink, because the light
// is brightest at its centre and cream type there is cream on cream.
//
// **The bureau's gauge is drawn properly and left empty, because the bank's own bureau call comes
// back empty.** IDBI's sandbox declares the pull as service 408, `fetchCibilScoretest`,
// `tier: 'bureau'`, with its own side effect — "A real CIBIL enquiry against the applicant, and
// it needs bureau credentials" (`apps/api/src/adapters/idbi-sandbox/api/operations.ts:146-156`).
// This build was never issued them, and operation 433's captured `cibilResponse` comes back
// `isSuccess: false`, `errorCode: "100"`, with no score anywhere in it (`…/api/schemas.ts:785-789`,
// `docs/integration/idbi-sandbox.md:149-153`). The three fact lines under the arc say that in a
// customer's words — the link isn't switched on, asking now returns no score, and a pull is a
// real enquiry we'll only make when asked. Credentials, service codes and the word "demo" are
// the build's business, not the customer's, and stay in this comment and the slice doc.
//
// **There is no "Check my score".** It could not do anything, and wired it would spend a real
// enquiry against a real person: a bureau call is never served from memory
// (`…/api/transport.ts:183`). When the credentials land, the bureau card grows a button, `Arc`
// gets a value, `credit.blind` shrinks and the list shortens with it; nothing else here changes.
// What the page offers instead is all real: the free report each bureau owes you every year,
// opened on the bureau's own site; the payoff plan, where expensive debt is what holds the figure
// down; the shelf this figure gates; and Uday, for anything a row raises.
//
// **`bg-ink`, not `bg-hero`.** The ink hero is the only saturated card here. A second green card
// carrying a second big number one pill from the Debt pane is the second-drawing failure that
// got Spend's `savings` pane deleted.
//
// **Three things we can judge, four we can't, one list — and the heaviest of the four sits between
// the verdicts.** Collecting the admissions at the bottom turns the gap into a footnote, which is
// the failure this page exists to avoid. The blind rows map over `credit.blind`, and `BLIND` is a
// total map over the union, so a fifth blind spot is a compile error rather than a row that
// silently fails to draw. The judged rows are one per `CreditComponentId` for the same reason:
// this list once shipped without `load`, and a fifth of the figure moved with nothing naming it.
// Each judged row's chip is its share of the figure, read off the working, so the list and the ⓘ
// sheet add up to the number in the glow.
//
// **The payoff links show only where there is a payoff to open.** The Plan builds its payoff stage
// for high-interest debt alone (`roadmap.ts`, "clear expensive debt"), and the cost component
// earns zero at exactly the gate's high-interest line. So the chip that reads "0 of 30" is the
// one that earns a "See the payoff plan"; a 9% education loan gets Uday instead of a link to a
// stage that isn't there.
//
// **Every count in the copy is read off the data** — the row counts, the day count, a component
// the engine couldn't read. Each was a literal once, true of all four fixtures and of nobody else.
//
// `Disclosure`, `RateStrip` and `FactLine` stay in this file: each has one caller, and
// `SettingRow.tsx`'s rule keeps a composed idiom private until a third. `Arc` lives in `src/ui/`
// because it is a drawn primitive, and its own header argues it.
import { useEffect, useState, type ReactNode } from 'react'
import { View, useWindowDimensions } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { Arc } from '~/ui/Arc'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { Chip } from '~/ui/Chip'
import { Chips } from '~/ui/Chips'
import { Count } from '~/ui/Count'
import { Glyph, GlyphPlate, type GlyphName } from '~/ui/Glyph'
import { MenuGroup, MenuRow } from '~/ui/MenuRow'
import { useToTab } from '~/ui/NavRow'
import { Row } from '~/ui/Row'
import { ScoreGlow } from '~/ui/ScoreGlow'
import { Section } from '~/ui/Section'
import { Sheet } from '~/ui/Sheet'
import { AskUdayRows } from '~/ui/Suggestion'
import { AskUday } from '~/ui/AskUday'
import { EMI_COST, INTEREST_PAID, LATE_REPAYMENT, creditQuestions } from '~/lib/ask'
import { Tap } from '~/ui/Tap'
import { Type } from '~/ui/Text'
import { dur, flat, layoutMove, timing, useReducedMotion } from '~/ui/motion'
import { rupees } from '~/lib/money'
import { color, size, space } from '@dhan/design'
import {
  BUREAU_BANDS,
  CONDUCT_WEIGHTS,
  FOIR_CLEAN_BELOW,
  FOIR_ZERO_AT,
  conductBand,
  monthlyInterest,
  ratesForBand,
  type CreditComponentId,
} from '@dhan/core'
import type { CreditBlindSpot, CreditComponent, CreditFacts } from '@dhan/contracts'

const CANT_SEE = "We can't see this"

/** The hero's caption when there is no borrowing to judge at all. */
const NOTHING_YET = 'Nothing to judge yet'

/** The three parts of the figure, by the names the ⓘ sheet adds them up under. */
const COMPONENT_LABEL: Record<CreditComponentId, string> = {
  repayment: 'Repayment',
  cost: 'Cost of borrowing',
  load: 'Loan load',
}

/**
 * What each row the bank cannot see says for itself.
 *
 * A total `Record` over the union rather than a list of literals, because the union is engine
 * output: `credit.blind` shrinks when a bureau pull lands, and a fifth member added in core should
 * fail to compile here rather than render a row with no copy in it. Every `todo` is something the
 * customer can do outside this app — a row that admits a limit and stops shouldn't be here.
 */
const BLIND: Record<CreditBlindSpot, { title: string; means: string; todo: string }> = {
  utilisation: {
    title: 'How much of your limit you use',
    means:
      'About a quarter of a bureau score: card balance against its limit. We hold the balance, ' +
      "not the limit — IDBI's file leaves it blank — so any ratio here would be invented.",
    todo: 'Your card statement prints the limit at the top. Under 30% of it is what every lender looks for.',
  },
  credit_age: {
    title: "How long you've borrowed",
    means:
      'A bureau counts the age of your credit lines, not your years with IDBI. Swapping one for ' +
      'the other would be a guess.',
    todo: 'It only goes one way. Closing an old card makes it worse, not better.',
  },
  enquiries: {
    title: 'Who else has checked you lately',
    means:
      'Every application leaves a hard enquiry on your bureau file for three years; several close ' +
      'together read as someone short of money. None of it reaches an IDBI account.',
    todo:
      'Space out applications. Your bureau must tell you each time a lender pulls your report — ' +
      'keep those messages.',
  },
  other_lenders: {
    title: 'What you owe other lenders',
    means:
      'Everything here is your IDBI file. A card elsewhere, an NBFC loan, a shop EMI — none of it ' +
      'is here; all of it is on your bureau report.',
    todo: 'If you owe elsewhere, the figure above flatters you. Pull your free report and check.',
  },
}

/**
 * Each bureau's own free-report page, checked in a browser on 22 September 2026: every one
 * answered 200. CIBIL refuses a bare `curl` (403) and serves a browser; Experian's is the page its
 * own home page links as "Free Credit Report"; CRIF's old path redirects to the one below.
 */
const BUREAUS: readonly { name: string; site: string; url: string }[] = [
  { name: 'TransUnion CIBIL', site: 'cibil.com', url: 'https://www.cibil.com/freecibilscore' },
  {
    name: 'Experian',
    site: 'experian.in',
    url: 'https://consumer.experian.in/ECV-OLN/view/angular/#/',
  },
  {
    name: 'Equifax',
    site: 'equifax.co.in',
    url: 'https://www.equifax.co.in/support/free-credit-report/',
  },
  {
    name: 'CRIF High Mark',
    site: 'crifhighmark.com',
    url: 'https://www.crifhighmark.com/your-credit-score',
  },
]

const FREE_REPORT =
  'One full report with the score, free every year from each bureau. Nobody has to ask us.'
const OWN_SITE =
  "Opens the bureau's own site. Nothing here asks a bureau about you — no enquiry, nothing a " +
  'lender can see.'

/**
 * The picker's options, off core's own table so a fifth band or a renamed one arrives without an
 * edit. The value is the band's name: no 300–900 numeral ever sits near the 0–100 figure above.
 */
const BAND_OPTIONS = BUREAU_BANDS.map((b) => ({ value: b.name, label: b.name }))

/** What one band buys, or `undefined` before a band is picked. */
type BandRates = ReturnType<typeof ratesForBand>

/** The glow's widest; it narrows with the card on a small phone so it never meets the edges. */
const GLOW = 184

/** The rows, judged and blind alike, keyed so exactly one disclosure can be open. */
type RowId = CreditComponentId | CreditBlindSpot

/**
 * One row of the list. `badge` is the chip under the title — a judged row's share of the figure —
 * and `note` the quiet line in the same place where there is no share to show. `spoken` is
 * whichever the row carries, in words, for its accessible name; empty where it carries neither.
 */
type FactorRow = {
  id: RowId
  badge: ReactNode
  note: string | null
  spoken: string
  title: string
  means: string
  todo: string
  actions: ReactNode
}

/** A share of the figure as printed: whole points stay whole, a ramp's half point shows as one. */
function points(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/**
 * A judged row's standing: its share of the figure as a chip, or a line saying why there isn't
 * one. An input the engine couldn't read is dropped from both halves of the fraction, so it reads
 * as unseen — a "0 of 30" there would be a verdict the figure never made. With nothing borrowed
 * the row's own title says so ("Nothing to repay on your IDBI file"), and the lede above the list
 * says there is nothing to judge, so the row carries neither.
 */
function standing(c: CreditComponent | undefined): Pick<FactorRow, 'badge' | 'note' | 'spoken'> {
  if (c === undefined) return { badge: null, note: null, spoken: '' }
  if (c.earned === null) return { badge: null, note: CANT_SEE, spoken: CANT_SEE }
  const share = `${points(c.earned)} of ${c.weight}`
  return {
    badge: <Chip tone={c.earned < c.weight / 2 ? 'danger' : 'budget'}>{share}</Chip>,
    note: null,
    spoken: `${share} points`,
  }
}

/**
 * What a band decides about a card, cut to its verdict. Core's `card` leads with one sentence of
 * verdict; the Poor band's then argues for three more lines and ends on "the 34.8% this app
 * refuses to invest around" — Karan's and Priya's card rate, not every customer's. The verdict is
 * the part that is true of everyone, and the part that fits under the strip.
 */
function verdict(card: string): string {
  const stop = card.indexOf('. ')
  return stop === -1 ? card : card.slice(0, stop + 1)
}

export function CreditContent({ credit }: { credit: CreditFacts }) {
  const { width } = useWindowDimensions()
  const [open, setOpen] = useState<RowId | null>(null)
  // Nothing is picked until the customer picks, which is the truth about a band we can't see.
  const [band, setBand] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [bureaus, setBureaus] = useState(false)
  // /credit and Spend's Credit pane draw this same content, so every door out of it into a tab
  // goes through the one helper that knows which side of the tabs it was opened on.
  const toTab = useToTab()
  const toPayoff = () =>
    toTab({ pathname: '/(tabs)/plan', params: { pane: 'projection', stage: 'clear_debt' } })

  const score = credit.conductScore
  const outOf = credit.outOf
  const unscored = score === null || outOf === null
  const late = credit.dpdDays > 0
  const borrowing = credit.liabilityCount > 0
  const part = (id: CreditComponentId) => credit.components.find((c) => c.id === id)
  const cost = part('cost')
  const load = part('load')
  // Zero is earned at the gate's own high-interest line (`DeriveOptions.highInterestThreshold`),
  // so this is that fact read off the working, not a third definition of "expensive".
  const expensive = cost?.earned === 0
  const payoff = borrowing && expensive

  /*
   * The balance the cost row is about. `highestRate` is worst-across-the-file, so pairing it with
   * `revolvingBalance` alone prints "9.15% on ₹0" for a customer whose only borrowing is a term
   * loan. A card is where an Indian file's expensive money lives, so it is the card's balance
   * wherever there is one, and the instalment balance where there isn't.
   */
  const carrying = credit.revolvingBalance > 0 ? credit.revolvingBalance : credit.instalmentBalance
  const rates = band === null ? undefined : ratesForBand(band)
  // The page gutter and the card's own padding.
  const glow = Math.min(GLOW, width - 2 * (space.pad + space.lg))

  /*
   * What the expensive balance costs, named in rupees under the band: "This is costing you" alone
   * begs "costing me what?". Only for a card, where one rate on one balance is the honest pairing
   * — the same `monthlyInterest` the Debt pane prints, so the two panes say the same ₹5,401.
   */
  const onCard = credit.revolvingBalance > 0
  const cardInterest =
    payoff && onCard ? monthlyInterest(credit.revolvingBalance, credit.highestRate) : null
  /*
   * The line under the figure names what holds it down, so a title never promises a cost the
   * card doesn't print. The cap, where it fired: "This is costing you" over a cheap loan and a
   * missed instalment named no cost at all. The card's interest, wherever it is printed under
   * the title, whatever the band: ₹8,990 a month read "One thing to tidy" beside another
   * customer's ₹5,401 under "This is costing you". Core's band only where neither applies, and
   * never for an empty file: its "Too soon to tell" under "No borrowing" reads as time rather
   * than as the reason.
   */
  const headline = unscored
    ? NOTHING_YET
    : credit.capped
      ? 'The late repayment caps this'
      : cardInterest !== null
        ? 'This is costing you'
        : conductBand(score, outOf)
  // What the parts add up to before the cap, the same sum the ⓘ sheet shows.
  const earned = credit.components.reduce((sum, c) => sum + (c.earned ?? 0), 0)
  // The plan's payoff stage is the expensive balance, so the row names that and nothing larger:
  // "your path to zero" over the card's figure promised a whole debt the plan doesn't clear. With
  // a late repayment on record the payoff comes second, as the Debt pane and Plan's pinned
  // "Before anything else" card both say, so the row does not call it first.
  const clearWhat = onCard ? `the ${rupees(credit.revolvingBalance)} card` : rupees(carrying)
  const clearLabel = late ? `Then clear ${clearWhat}` : `Clear ${clearWhat} first`
  const clearDetail = `${onCard ? '' : 'Up to '}${credit.highestRate}% a year. Your plan shows how long it takes.`

  /*
   * A row's question is what Uday can answer about it, not "What does '<title>' mean": he has no
   * rule for a sentence about the file, and every one of those came back "I am not sure". The late
   * repayment is his top finding, the rate is his debt answer, the instalments a spending total.
   * The rows he cannot speak to — a limit, a credit age, a bureau's enquiries — open the free
   * report instead, which is where those figures live.
   */
  const ask = (question: string) => <AskUday key="ask" question={question} />
  const report = (
    <Button
      key="report"
      size="sm"
      variant="secondary"
      haptic="none"
      label="Get your free report"
      accessibilityHint="Lists the four bureaus"
      onPress={() => setBureaus(true)}
    />
  )

  const repaymentTitle = !borrowing
    ? 'Nothing to repay on your IDBI file'
    : late
      ? "There's a late repayment on record"
      : "You've paid every instalment on time"
  const repayment: FactorRow = {
    id: 'repayment',
    ...standing(part('repayment')),
    title: repaymentTitle,
    // The day count is read off `credit.dpdDays`, never written in: every fixture happens to be
    // twelve, and a screen telling a customer ninety days late that his file says twelve is a
    // fact he can disprove at a branch counter.
    means: !borrowing
      ? "With nothing borrowed there's no repayment to judge. When you borrow, it's the biggest thing a lender looks at."
      : late
        ? `${credit.dpdDays} ${credit.dpdDays === 1 ? 'day' : 'days'} past due on your IDBI file. ` +
          "The biggest thing a lender looks at, and a good month doesn't offset it."
        : "Nothing on your IDBI file is past due. It's the biggest thing a lender looks at, and you've got it right.",
    todo: !borrowing
      ? "When you borrow, keep the balance above the instalment on the mandate day. It's a date, not a habit."
      : late
        ? "It ages off; nothing clears it early. Keep the balance above the instalment on the mandate day so it doesn't repeat."
        : "Keep the balance above the instalment on the mandate day. It's a date, not a habit.",
    actions: late ? ask(LATE_REPAYMENT) : null,
  }

  const costTitle = !borrowing
    ? "You're not carrying any borrowing"
    : cost?.earned === null
      ? 'What your borrowing costs you'
      : `You're carrying ${credit.highestRate}% on ${rupees(carrying)}`
  const costRow: FactorRow = {
    id: 'cost',
    ...standing(cost),
    title: costTitle,
    means: !borrowing
      ? 'Nothing on your IDBI file is charging you interest, so no rule holds back an investment here.'
      : cost?.earned === null
        ? // A rate that came back empty, not a rate of zero: "0%" would be the most flattering
          // thing this page could say, about the one axis the gate refuses on.
          'Your file shows the balance but not the rate. Nothing lends at nothing, so rather than ' +
          `call it cheap we left it out — the figure is out of ${outOf ?? 0} rather than 100.`
        : `The most expensive money in your file. Nothing on IDBI's shelf returns ${credit.highestRate}%, ` +
          'so clearing it beats investing.' +
          // True only while the gate is refusing on this rate; under a 9% loan it would be a
          // claim about the app's own rules that the shelf disproves. "No investment", not
          // "nothing": the rule (core's HIGH_INTEREST_DEBT) never blocks cover.
          (expensive ? " Until it's gone, no investment is recommended." : ''),
    todo: !borrowing
      ? "When you borrow, argue about the rate. It's the only term that keeps costing."
      : cost?.earned === null
        ? 'Your loan statement and card bill print the rate. Whatever it is, clear the expensive balance first.'
        : 'Pay the expensive balance down before the cheap one, whatever the sizes.',
    actions: payoff
      ? [
          <Button
            key="payoff"
            size="sm"
            variant="secondary"
            haptic="none"
            label="See the payoff plan"
            accessibilityHint="Opens the Plan tab on the payoff"
            onPress={toPayoff}
          />,
          ask(INTEREST_PAID),
        ]
      : borrowing
        ? ask(INTEREST_PAID)
        : null,
  }

  const comfortable = Math.round(FOIR_CLEAN_BELOW * 100)
  const ceiling = Math.round(FOIR_ZERO_AT * 100)
  const loadPct = credit.emiToIncome === null ? null : Math.round(credit.emiToIncome * 100)
  const loadUnread = load?.earned === null || loadPct === null
  const loadTitle = loadUnread
    ? 'What your instalments take each month'
    : !borrowing
      ? 'No instalments coming out of your pay'
      : `Your instalments take ${loadPct}% of what comes in`
  const loadRow: FactorRow = {
    id: 'load',
    ...standing(load),
    title: loadTitle,
    means: loadUnread
      ? 'Your instalments against your income: the number a lender actually prices. ' +
        (loadPct === null
          ? "We couldn't find a salary in your statement, so we left it out of the figure rather than guess."
          : "One of your instalments didn't come through in your file, so we left it out of the figure rather than guess.")
      : 'Lenders call it your fixed-obligation-to-income ratio. Under ' +
        `${comfortable}% is comfortable; past ${ceiling}% most won't lend, because nothing is left ` +
        'each month for a new instalment.',
    todo: loadUnread
      ? 'Your payslip against your instalments gives you the same number.'
      : !borrowing
        ? `Keep any new instalments under ${comfortable}% of what comes in.`
        : 'Ending a loan moves this fastest. The shortest instalment you carry frees the most room soonest.',
    actions: borrowing ? ask(EMI_COST) : null,
  }

  const blind: FactorRow[] = credit.blind.map((spot) => ({
    id: spot,
    badge: null,
    note: CANT_SEE,
    spoken: CANT_SEE,
    ...BLIND[spot],
    actions: report,
  }))

  // The heaviest thing we can't see goes between the ones we can. See the header.
  const rows: FactorRow[] = [repayment, ...blind.slice(0, 1), costRow, loadRow, ...blind.slice(1)]

  // Counted off the working rather than written in: an unreadable rate moves a row from one side
  // of this sentence to the other, and a hard-coded "three" would contradict the chips below it.
  const judged = credit.components.filter((c) => c.earned !== null).length
  const lede = !borrowing
    ? `No borrowing on your IDBI file, so nothing to judge yet. ${credit.blind.length} of these ${rows.length} we can't see.`
    : `${judged} of these ${rows.length} we can judge from your IDBI file; ${rows.length - judged} ` +
      "we can't see."

  const bureauRows = BUREAUS.map((b) => (
    <MenuRow
      key={b.name}
      label={b.name}
      detail={b.site}
      trailing="external"
      href={b.url}
      accessibilityHint="Opens the bureau's site in your browser"
    />
  ))

  return (
    <>
      {/* ── The hero: the figure, then what it means ─────────────────────────────────── */}
      <Card className="items-center px-lg pb-lg pt-sm">
        <ScoreGlow tone="warm" sparkles size={glow}>
          {unscored ? (
            // An em dash and no figure: "nothing to judge" is not a bad score, and a zero here
            // would be a verdict on somebody who owes us nothing.
            <Type role="figure" plain>
              —
            </Type>
          ) : (
            // One stop for a screen reader: the figure and its denominator are one statement,
            // and the denominator is printed because it moves (80 of 80 is not 80 of 100).
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${score} out of ${outOf}`}
              className="items-center"
            >
              <Count
                value={score}
                format={(n) => String(Math.round(n))}
                role="figure"
                id="credit.score"
                delay={dur.enter}
              />
              <Type role="body" tone="mid">
                out of {outOf}
              </Type>
            </View>
          )}
        </ScoreGlow>
        {/* The chip names where a figure came from; with no figure, the line says it. Tucked
            into the glow's faint lower rim, as Cleo's chip sits under its figure. */}
        {unscored ? (
          <Type role="body" tone="mid" className="-mt-lg text-center">
            No borrowing on your IDBI file
          </Type>
        ) : (
          <View className="-mt-lg self-center">
            <Chip tone="ground">From your IDBI file</Chip>
          </View>
        )}
        {/* Last in the card so it draws over the glow's corner on a narrow phone. */}
        <Tap
          accessibilityRole="button"
          accessibilityLabel="How this figure is built"
          haptic="none"
          hitSlop={8}
          onPress={() => setWorking(true)}
          className="absolute right-sm top-sm h-target w-target items-center justify-center"
        >
          <GlyphPlate name="info" size={size.ring} plain />
        </Tap>
      </Card>

      {/* Directly under the figure, never further down the page: a disclaimer at the foot of a
          scroll is one nobody reads, and this one separates a composite from a claim about a
          regulated scale. */}
      <View className="rounded-card bg-ink p-lg">
        <Type role="heading" tone="onInk" className="text-center">
          {headline}
        </Type>
        {credit.capped && score !== null ? (
          <Type role="body" tone="onInk" className="mt-xs text-center opacity-85">
            {`${points(earned)} before the cap; ${score} until it clears.`}
          </Type>
        ) : null}
        {cardInterest === null ? null : (
          <Type role="body" tone="onInk" className="mt-xs text-center opacity-85">
            {`About ${rupees(cardInterest)} a month in card interest.`}
          </Type>
        )}

        <View className="mt-lg border-t border-on-ink/20 pt-lg">
          <Type role="label" tone="onInk">
            This is not a credit score.
          </Type>
          <Type role="body" tone="onInk" className="mt-xs opacity-85">
            Built from your IDBI accounts only. No bureau made it, no lender sees it, and it
            isn&apos;t on the 300–900 scale.
          </Type>
        </View>
      </View>

      {/* ── What a bureau sees ───────────────────────────────────────────────────────── */}
      <Card className="p-lg">
        <Type role="heading">What a credit bureau sees</Type>
        {/* Full width: `Arc` measures this container to size itself. */}
        <View className="mt-lg w-full">
          <Arc value={null} chord="Not pulled" startLabel="300" endLabel="900" />
        </View>
        <Type role="body" weight="semibold" className="mt-md">
          We haven&apos;t looked.
        </Type>
        <Type role="body" tone="mid" className="mt-xs">
          A real score, 300 to 900, comes from one of four bureaus.
        </Type>
        {/* The three lines that turn the blank gauge from an assertion into evidence. */}
        <View className="mt-lg gap-md">
          <FactLine glyph="lock">Empty until IDBI&apos;s bureau link is switched on.</FactLine>
          <FactLine glyph="alert">A request today comes back with no score.</FactLine>
          <FactLine glyph="shield">
            We&apos;ll pull your report only with your go-ahead. Each pull is a real enquiry on your
            record.
          </FactLine>
        </View>
      </Card>

      {/* ── What a score is worth ────────────────────────────────────────────────────── */}
      <Card className="p-lg">
        <Type role="heading">What a score is worth</Type>
        <Type role="body" tone="mid" className="mt-xs">
          Pick a band to see the rates it gets. We can&apos;t see which is yours.
        </Type>
        <View className="mt-md">
          <Chips options={BAND_OPTIONS} value={band} onChange={setBand} wrap />
        </View>
        {/* Rows ruled straight into the card: a filled tile inside a white card is a card in a
            card (D9). Drawn before a pick too, greyed, so nothing jumps on the first tap. */}
        <View className="mt-md border-b border-hairline">
          <RateStrip rates={rates} />
        </View>
        {/* The third thing a band decides is a card, and in India that is never the rate. */}
        <Type role="body" tone={rates === undefined ? 'mid' : 'ink'} className="mt-md">
          {rates === undefined ? 'Tap a band.' : verdict(rates.card)}
        </Type>
        <Type role="caption" tone="mid" className="mt-md">
          A guide only. Lenders price your whole file, not one number. Not an offer of credit.
        </Type>
      </Card>

      {/* ── What moves this ──────────────────────────────────────────────────────────── */}
      <Section title="What moves this" subtitle={lede} />
      <Card>
        {rows.map((row, i) => (
          <Disclosure
            key={row.id}
            row={row}
            divide={i > 0}
            open={open === row.id}
            onToggle={() => setOpen(open === row.id ? null : row.id)}
          />
        ))}
      </Card>

      {/* ── The free report ──────────────────────────────────────────────────────────── */}
      <Section title="Get your free report" subtitle={FREE_REPORT} />
      <MenuGroup>{bureauRows}</MenuGroup>
      <Type role="caption" tone="mid" className="px-lg">
        {OWN_SITE}
      </Type>

      {/* ── Where this goes ──────────────────────────────────────────────────────────── */}
      <MenuGroup title="Where this goes">
        {payoff ? (
          <MenuRow
            glyph="plan"
            label={clearLabel}
            detail={clearDetail}
            accessibilityHint="Opens the Plan tab on the payoff"
            onPress={toPayoff}
          />
        ) : null}
        <MenuRow
          glyph="shield"
          label="What this changes on the shelf"
          detail="Two of the nine rules every product must pass read this page."
          accessibilityHint="Opens Grow on Invest"
          onPress={() => toTab({ pathname: '/(tabs)/grow', params: { pane: 'invest' } })}
        />
      </MenuGroup>
      <AskUdayRows questions={creditQuestions({ late, borrowing })} />

      <Sheet
        open={working}
        onClose={() => setWorking(false)}
        title="How this figure is built"
        footer={<Button label="Got it" haptic="none" onPress={() => setWorking(false)} />}
      >
        <Working credit={credit} />
      </Sheet>
      <Sheet
        open={bureaus}
        onClose={() => setBureaus(false)}
        title="Get your free report"
        subtitle={FREE_REPORT}
      >
        <MenuGroup>{bureauRows}</MenuGroup>
        <Type role="caption" tone="mid" className="mt-md px-lg">
          {OWN_SITE}
        </Type>
      </Sheet>
    </>
  )
}

/** Every part at its full weight and nothing earned: the working for a file with no borrowing. */
const NOTHING_BORROWED: readonly CreditComponent[] = (
  Object.keys(CONDUCT_WEIGHTS) as CreditComponentId[]
).map((id) => ({ id, weight: CONDUCT_WEIGHTS[id], earned: null }))

/**
 * The ⓘ sheet: the figure added up in front of the customer, from the same `components` the
 * engine published it from. An unreadable part is left out of the sum rather than printed as a
 * zero — it was dropped from both halves of the fraction — and a capped figure says it was held
 * and by what, in the sum itself, so the arithmetic on screen is never an equation that doesn't
 * add up and the sheet doesn't repeat the hero's cap line under it.
 */
function Working({ credit }: { credit: CreditFacts }) {
  const parts = credit.components.length > 0 ? credit.components : NOTHING_BORROWED
  const read = credit.components.flatMap((c) => (c.earned === null ? [] : [c.earned]))
  const unread = credit.components
    .filter((c) => c.earned === null)
    .map((c) => COMPONENT_LABEL[c.id])
  const score = credit.conductScore
  const outOf = credit.outOf

  let sum = "No borrowing on your IDBI file, so there's nothing to add up yet."
  if (score !== null && outOf !== null && read.length > 0) {
    const total = read.reduce((a, b) => a + b, 0)
    const working = `${read.map(points).join(' + ')} = ${points(total)}`
    sum = credit.capped
      ? `${working}, held at ${score} out of ${outOf} until the late repayment clears`
      : points(total) === String(score)
        ? `${working} out of ${outOf}`
        : `${working}, so ${score} out of ${outOf}`
  }

  return (
    <>
      <Type role="body">
        Three things IDBI can judge from its own file, each worth a share of 100.
      </Type>
      <Card className="mt-lg">
        {parts.map((c, i) => (
          <Row
            key={c.id}
            label={COMPONENT_LABEL[c.id]}
            value={c.earned === null ? `— of ${c.weight}` : `${points(c.earned)} of ${c.weight}`}
            divide={i > 0}
          />
        ))}
      </Card>
      <Type role="body" weight="semibold" className="mt-lg">
        {sum}
      </Type>
      {unread.length > 0 && outOf !== null ? (
        <Type role="body" tone="mid" className="mt-xs">
          {`${unread.join(' and ')} couldn't be read, so ${unread.length === 1 ? "it's" : "they're"} ` +
            `left out and the figure is out of ${outOf}.`}
        </Type>
      ) : null}
    </>
  )
}

/**
 * One row of the list, opened or closed.
 *
 * The claim leads, and its standing sits under it: a judged row's share of the figure as a chip —
 * the badge a Cleo menu row carries under its label — and a row we can't see saying so in the
 * quiet tone, in the same place. A chip above every title was an eyebrow seven times over, and a
 * chip at the trailing edge squeezed the titles to four lines at 320pt. Closed, the list still
 * gives the whole boundary of the product before a single tap.
 *
 * The chevron turns rather than swapping, and the rows below move to make room rather than
 * jumping, so the line the reader was on stays under their eye; under Reduce Motion both simply
 * land. Opening shows what it means, what to do, and the one or two things on this page or in
 * this app that act on it.
 */
function Disclosure({
  row,
  open,
  divide,
  onToggle,
}: {
  row: FactorRow
  open: boolean
  divide: boolean
  onToggle: () => void
}) {
  const reduced = useReducedMotion()
  const turn = useSharedValue(open ? 90 : 0)

  useEffect(() => {
    turn.value = withTiming(open ? 90 : 0, timing(dur.state))
  }, [open, turn])

  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }))

  return (
    <Animated.View layout={layoutMove(reduced)}>
      {divide ? <View className="mx-lg h-px bg-hairline" /> : null}
      <Tap
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        accessibilityLabel={row.spoken === '' ? row.title : `${row.title}, ${row.spoken}`}
        accessibilityHint={open ? 'Collapses the detail' : 'Shows what this means'}
        haptic="none"
        scale={0.99}
        onPress={onToggle}
        className="min-h-target flex-row items-center gap-md px-lg py-md"
      >
        <View className="flex-1">
          <Type role="heading" plain>
            {row.title}
          </Type>
          {row.badge === null ? null : <View className="mt-sm">{row.badge}</View>}
          {row.note === null ? null : (
            <Type role="body" tone="mid" className="mt-xxs">
              {row.note}
            </Type>
          )}
        </View>
        <Animated.View style={chevron}>
          <Glyph name="chevronRight" size={20} tint={color.ink} />
        </Animated.View>
      </Tap>
      {open ? (
        <Animated.View entering={flat(0)} className="px-lg pb-lg">
          <Type role="body">{row.means}</Type>
          <Type role="body" tone="mid" className="mt-sm">
            {row.todo}
          </Type>
          {/* A row's own action, then "Ask Uday about this" as the link under it (Cleo's
              "What's this transaction?"), the one shape the ask takes across the app. */}
          {row.actions === null ? null : (
            <View className="mt-md items-start gap-xs">{row.actions}</View>
          )}
        </Animated.View>
      ) : null}
    </Animated.View>
  )
}

/**
 * What a band buys, Cleo's simulator tiles as ruled rows: each product on its own line, its rate
 * flush right.
 *
 * Cleo sets two single figures side by side on a tinted tile. These are ranges ("13.00–16.00%"),
 * and at heading size two of them break at the dash on a 375pt phone, so the rows stack instead:
 * the label keeps its line, the figure ends on an edge the eye can follow, and nothing wraps
 * whichever band is picked, so the rows never change height under the finger. They are ruled
 * straight into the card rather than set on a tile of their own, because a filled panel inside a
 * white card is a card in a card. Before a pick each figure is a greyed dash — the rows are there,
 * waiting — and a product the band won't get says so in the figure's own place. Never a zero:
 * that would be a rate.
 */
function RateStrip({ rates }: { rates: BandRates }) {
  return (
    <>
      <RateLine label="Home loan, salaried" value={rates === undefined ? undefined : rates.home} />
      <RateLine label="Car loan, new" value={rates === undefined ? undefined : rates.car} />
    </>
  )
}

/** `undefined` is "no band picked yet"; `null` is "this band won't get one". */
function RateLine({ label, value }: { label: string; value: string | null | undefined }) {
  const figure = value === undefined ? '—' : (value ?? 'Hard to get')
  return (
    <View
      accessible
      accessibilityLabel={value === undefined ? `${label}, pick a band` : `${label}, ${figure}`}
      className="flex-row items-center gap-md border-t border-hairline py-md"
    >
      <Type role="body" tone="mid" className="flex-1">
        {label}
      </Type>
      <Type
        role="heading"
        plain
        numberOfLines={1}
        tone={value === undefined ? 'mid' : 'ink'}
        className="text-right"
      >
        {figure}
      </Type>
    </View>
  )
}

/** One line of evidence under the empty gauge; the plate stays level with its first line. */
function FactLine({ glyph, children }: { glyph: GlyphName; children: ReactNode }) {
  return (
    <View className="flex-row items-start gap-md">
      <GlyphPlate name={glyph} size={size.plateSm} fill="bg-ground" />
      <Type role="body" tone="mid" className="flex-1">
        {children}
      </Type>
    </View>
  )
}
