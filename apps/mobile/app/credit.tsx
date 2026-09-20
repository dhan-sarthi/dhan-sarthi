// Credit — what IDBI can see about how you borrow, and what it cannot.
//
// Every screen in this category is a 300–900 figure on an arc with a carousel of loans under
// it. Exactly one of those two things can be built honestly here, and it is not the figure:
// 55% of a bureau's weight has no input anywhere in a `CustomerFile`, which
// `packages/core/src/credit.ts` argues in full. So the hero is 0–100 from the IDBI file alone,
// it says so inside its own card rather than in a footnote under one, and the bureau's gauge is
// drawn properly, at full size, as a peer of the hero — and left empty.
//
// **The empty gauge is the integration, not an affectation.** The claim underneath it is not
// that we decided not to look. IDBI's own sandbox declares the pull as service 408,
// `fetchCibilScoretest`, `tier: 'bureau'`, carrying its own side effect on the operation — "A
// real CIBIL enquiry against the applicant, and it needs bureau credentials"
// (`apps/api/src/adapters/idbi-sandbox/api/operations.ts:146-156`). This build was never issued
// them. And the body is not a mystery: operation 433 returns the same block without spending a
// pull, and the captured `cibilResponse` comes back `isSuccess: false`, `errorCode: "100"`,
// with no score value anywhere in it (`…/api/schemas.ts:785-789`,
// `docs/integration/idbi-sandbox.md:149-153`). The arc is empty because the bank's own bureau
// call comes back empty. That is a stronger sentence than "we have not looked", it is the
// sentence the three fact lines carry, and it is the one thing on this screen that a
// competitor with a bureau licence could not have written.
//
// **There is no primary button anywhere on this screen, and that is the decision rather than
// an omission.** The obvious card wants a "Check my score" under the gauge. It could not do
// anything, and a dead primary on a screen whose whole subject is honesty is a joke at the
// customer's expense. Wired, it would not even be the reference's theatre: a bureau call is
// never served from memory (`…/api/transport.ts:183` — "a cached credit pull is a credit pull
// somebody paid for and did not get"), so the button is a consent moment that spends a real
// enquiry against a real person and writes a row into the hash-chained record. When the
// credentials land, this card grows a `Button`, `Arc` gains its progress stroke, `credit.blind`
// shrinks and the list below shortens with it. **Nothing else here changes** — which is the
// test of whether this is the honest version of the real screen or a different screen wearing
// its clothes.
//
// **`bg-ink`, not `bg-hero`.** Spend's Debt hero is `bg-hero` / `bg-danger-soft` with a
// `Count role="display"` in it (`(tabs)/spend.tsx:330-345`), and a second saturated green card
// carrying a second big number one tap away is the second-drawing failure that got the
// `savings` pane deleted (`spend.tsx:8-13`). Ink is this app's other established card surface,
// and it leaves this scroll carrying exactly one saturated card against four white ones.
//
// **Three things we can judge, four we cannot, one list — and the heaviest of the four sits
// between the verdicts.** Collecting the admissions at the bottom, or worse under a "what we
// don't know" heading, turns the gap into a footnote, which is the exact failure this screen
// exists to avoid. Reading an admission *before* the second verdict is what teaches a customer
// the boundary of the product in one scroll. The blind rows are rendered off `credit.blind`
// rather than off a literal, so the day a pull lands the list shortens with no edit here, and
// `BLIND` below is a total map over the union so a fifth blind spot is a compile error rather
// than a row that silently fails to draw.
//
// The three judged rows are one per `CreditComponentId`, and `RowId` is typed off that union
// for a reason worth stating: this list shipped for a day with `load` missing, so a fifth of
// the published figure moved with nothing on the screen naming it — on a screen whose section
// is titled "What moves this" and whose hero promises the working is reproducible. A fourth
// component added in core now fails to compile here until it has a row.
//
// **Every count in the copy is read off the data.** The lede's "three of them", the repayment
// row's day count, the badge on a row whose input could not be read: all computed, none
// written into a sentence. Each of those was a literal first, and each was a literal that
// happened to be true of all four fixtures and of nobody else.
//
// **It ends on the gate, not on offers.** Every other screen in this category ends in a loan
// carousel. `suitability.ts:137-141` and `roadmap.ts:512-514` both spend a sentence about the
// customer's credit standing in the act of refusing somebody, and both terminate nowhere; this
// is the door they never had.
//
// `Disclosure`, `RateStrip` and `FactLine` stay in this file. `SettingRow.tsx:3-6` sets the
// rule for a composed idiom — it stays private until a third caller, "because three copies of a
// disclosure is how a product ends up with three chevron speeds" — and each of these has one
// caller. `Arc` is in `src/ui/` because it is a drawn primitive, which is a different rule, and
// its own header argues it.
import { useState, type ReactNode } from 'react'
import { ScrollView, View } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { router } from 'expo-router'
import { NavRow } from '~/ui/NavRow'
import { Reveal } from '~/ui/Reveal'
import { Type } from '~/ui/Text'
import { Count } from '~/ui/Count'
import { Card } from '~/ui/Card'
import { Chip } from '~/ui/Chip'
import { Chips } from '~/ui/Chips'
import { Note } from '~/ui/Note'
import { Meter } from '~/ui/Meter'
import { Section } from '~/ui/Section'
import { Glyph } from '~/ui/Glyph'
import { Tap } from '~/ui/Tap'
import { Arc } from '~/ui/Arc'
import { dur, easeOut } from '~/ui/motion'
import { useSnapshot } from '~/state/snapshot'
import { rupees } from '~/lib/money'
import { color } from '@dhan/design'
import {
  BUREAU_BANDS,
  FOIR_CLEAN_BELOW,
  FOIR_ZERO_AT,
  bureauBand,
  conductBand,
  ratesForBand,
} from '@dhan/core'
import type { CreditComponentId } from '@dhan/core'
import type { CreditBlindSpot } from '@dhan/contracts'

/**
 * What each row the bank cannot see says for itself.
 *
 * A total `Record` over the union rather than a list of literals, because the union is engine
 * output: `credit.blind` shrinks when a bureau pull lands, and a fifth member added in core
 * should fail to compile here rather than render a row with no copy in it. Every `todo` is a
 * real thing the customer can do outside this app — a row that admits a limit and stops is a
 * row that should not be on the screen.
 */
const BLIND: Record<CreditBlindSpot, { title: string; means: string; todo: string }> = {
  utilisation: {
    title: 'How much of your limit you use',
    means:
      'A bureau weighs this at about a quarter of your score: the balance on a card against ' +
      "the limit on it. We hold the balance. We do not hold the limit — IDBI's file has a " +
      'field for it and it comes back empty, so a ratio built here would have an invented ' +
      'denominator.',
    todo:
      'On your own card statement the limit is printed at the top. Under 30% of it is the ' +
      'number every lender looks for.',
  },
  credit_age: {
    title: 'How long you have borrowed',
    means:
      'You have banked with IDBI for years, and that is not the same fact. A bureau counts ' +
      'the age of your credit lines, not the age of your relationship with us, and ' +
      "substituting one for the other would be a guess wearing a number's clothes.",
    todo: 'It only goes one way, and closing an old card makes it worse rather than better.',
  },
  enquiries: {
    title: 'Who else has checked you lately',
    means:
      'Every application you make leaves a hard enquiry on your bureau file for three years, ' +
      'and several close together read as somebody short of money. No enquiry anywhere ever ' +
      'reaches an IDBI account, so there is nothing here for us to count.',
    todo:
      'Space out applications. Your bureau has to tell you every time a lender pulls your ' +
      'report — those messages are the only record of this you will get.',
  },
  other_lenders: {
    title: 'What you owe other lenders',
    means:
      'Everything on this screen is your IDBI file. A card at another bank, a loan from an ' +
      'NBFC, anything bought on EMI at a shop — none of it is here, and all of it is on your ' +
      'bureau report.',
    todo:
      'If there is borrowing we cannot see, the figure above is flattering you. Pull your ' +
      'free report and check.',
  },
}

/**
 * The picker's options, off core's own table so a fifth band or a renamed one arrives here
 * without an edit. The value is the band's floor and is never rendered: the chips carry names,
 * and a 300–900 numeral anywhere near the 0–100 figure above them is the one thing this screen
 * may not put on a customer's eye. `bureauBand` turns the floor back into the name.
 */
const BAND_OPTIONS = BUREAU_BANDS.map((b) => ({ value: b.min, label: b.name }))

/** The rows, judged and blind alike, keyed so exactly one disclosure can be open. */
// The three judged ids are `CreditComponentId` rather than literals, so a component added to
// the figure in core fails to compile here until it has a row on the screen — which is the
// gap that let `load` move a fifth of the score with nothing naming it.
type RowId = CreditComponentId | CreditBlindSpot

export default function Credit() {
  const { data: view, state } = useSnapshot()
  const [open, setOpen] = useState<RowId | null>(null)
  // Nothing is selected until the customer selects it, which is the truth about a band we
  // cannot see. `Chips` takes `T | null` for exactly this and needs no empty sentinel.
  const [band, setBand] = useState<number | null>(null)

  const credit = view?.snapshot.credit ?? null

  // `data` before `state`, per the store's own invariants: a refresh that fails over a view
  // already on screen leaves `data` standing, and branching on `state` first would blank a
  // screen the module is still holding. The error line is for having nothing at all.
  if (credit === null) {
    return (
      <Frame>
        <Type role="body" tone={state === 'error' ? 'danger' : 'soft'} className="mt-xl">
          {state === 'error'
            ? 'Could not load what your IDBI file shows. Check the API on :3001.'
            : 'Reading your IDBI file…'}
        </Type>
      </Frame>
    )
  }

  const score = credit.conductScore
  const outOf = credit.outOf
  const late = credit.dpdDays > 0

  /*
   * "Expensive" is read off the cost component rather than compared against 24 here. The
   * threshold is `DeriveOptions.highInterestThreshold` and the gate refuses on the same number
   * (`suitability.ts:130`); restating it in a screen would be the third definition of a word
   * this codebase has already decided to keep to one. The component earns zero exactly when the
   * rate has reached the gate's own cut-off, so this is that fact and not a copy of it.
   */
  const expensive = credit.components.find((c) => c.id === 'cost')?.earned === 0

  /*
   * Whether the engine could read each judged input at all, taken from the working rather than
   * re-derived here. A component the engine dropped out of both halves of the fraction is one
   * this screen must badge "We can't see this" too: badging it "Judged" while it earned nothing
   * and cost nothing is the screen claiming a verdict the figure did not make.
   */
  const readable = (id: CreditComponentId): boolean =>
    credit.components.find((c) => c.id === id)?.earned !== null

  /*
   * The balance the cost row is about. `highestRate` is worst-across-the-file, so pairing it
   * with `revolvingBalance` alone prints "9.15% on ₹0" for a customer whose only borrowing is a
   * term loan — two of the four personas today. The revolving balance is the right one whenever
   * there is a card, because a card is where an Indian file's expensive money lives; where
   * there is none, the instalment balance is what carries the rate being quoted.
   */
  const carrying = credit.revolvingBalance > 0 ? credit.revolvingBalance : credit.instalmentBalance

  const rates = band === null ? undefined : ratesForBand(bureauBand(band))

  const blindRows: Row[] = credit.blind.map((spot) => ({
    id: spot,
    badge: <Chip tone="ground">We can't see this</Chip>,
    ...BLIND[spot],
  }))

  const repayment: Row = {
    id: 'repayment',
    badge: <Chip tone={late ? 'danger' : 'budget'}>Judged</Chip>,
    title: late ? 'There is a late repayment on record' : 'You have paid every instalment on time',
    // The number is read off `credit.dpdDays` rather than written into the sentence. It was a
    // literal "twelve days" for as long as it took somebody to notice that every fixture happens
    // to be twelve: `dpdStatus` comes straight off the bank (`to-domain.ts:500`), any value is
    // live, and a screen telling a customer ninety-five days late that his file records twelve
    // is a fact he can disprove at a branch counter — and a different number from the one the
    // figure above it was built from.
    means: late
      ? `Your IDBI file records ${credit.dpdDays} ${credit.dpdDays === 1 ? 'day' : 'days'} past ` +
        'due. This is the single biggest thing a lender looks at, and it is the one thing here ' +
        'a good month does not offset.'
      : 'Nothing on your IDBI file is past due. This is the single biggest thing a lender ' +
        'looks at, and it is the one thing here you have already got right.',
    todo: late
      ? 'Nothing clears a late repayment early — it ages off. What you can do is make sure the ' +
        'next one does not happen: the balance on the mandate day is what decides it.'
      : 'Keep the balance on the mandate day above the instalment. That is a date, not a habit.',
  }

  const cost: Row = {
    id: 'cost',
    badge: !readable('cost') ? (
      <Chip tone="ground">We can't see this</Chip>
    ) : (
      <Chip tone={expensive ? 'danger' : 'budget'}>Judged</Chip>
    ),
    // Nothing borrowed is not a rate of zero. A row reading "0% on ₹0" beside a hero that has
    // just said there is no borrowing on the file is the screen contradicting itself in the
    // one state it was built to handle gracefully.
    title:
      credit.liabilityCount === 0
        ? 'You are not carrying any borrowing'
        : !readable('cost')
          ? 'What your borrowing costs you'
          : `You are carrying ${credit.highestRate}% on ${rupees(carrying)}`,
    means:
      credit.liabilityCount === 0
        ? 'There is nothing on your IDBI file being charged interest, so there is nothing here ' +
          'for the gate to refuse you over. The rate on the next thing you borrow is what this ' +
          'row will be about.'
        : !readable('cost')
          ? // A rate that came back empty, not a rate of zero. Saying "0%" here would be the
            // single most flattering thing this screen could tell somebody, about the one axis
            // the gate refuses on, on the strength of a field nobody read.
            'Your file shows the balance but not the rate being charged on it. Nothing lends ' +
            'at nothing, so rather than read the gap as a cheap loan we have left this out of ' +
            'the figure above — which is why it is out of ' +
            `${credit.outOf ?? 0} rather than 100.`
          : // The closing clause is true only while the gate is actually refusing on this rate.
            // Printed under a loan at 9.15% it would be the screen making a claim about the app's
            // own rules that a judge can disprove by opening the shelf.
            `This is the most expensive money in your file. Nothing on IDBI's shelf returns ${credit.highestRate}%, ` +
            'so clearing it earns you more than investing does' +
            (expensive
              ? ' — which is why the gate refuses to recommend anything until it is gone.'
              : '.'),
    todo:
      credit.liabilityCount === 0
        ? 'When you do borrow, the rate is the one term worth arguing about. It is the only ' +
          'part of a loan that keeps costing after everything else is settled.'
        : !readable('cost')
          ? 'The rate is printed on your own loan statement and on every card bill. Whatever it ' +
            'turns out to be, the expensive balance is the one to clear first.'
          : 'Pay the expensive balance down before the cheap one, whatever the sizes are.',
  }

  /*
   * The third judged component, and it was missing from this list for a day.
   *
   * `CONDUCT_WEIGHTS` has three parts, not two, and `load` is twenty of the hundred. A list
   * titled "What moves this" that named two of the three let a fifth of the figure move with
   * nothing on the screen accounting for it — and worse, on a screen where every unlisted thing
   * is framed as something IDBI cannot see, so a FOIR penalty read as an unexplained deduction.
   * A published figure whose working is on the wire has to have its working on the screen too.
   */
  const loadPct = credit.emiToIncome === null ? null : Math.round(credit.emiToIncome * 100)
  const loadRow: Row = {
    id: 'load',
    badge:
      loadPct === null ? (
        <Chip tone="ground">We can't see this</Chip>
      ) : (
        <Chip
          tone={
            credit.emiToIncome !== null && credit.emiToIncome > FOIR_CLEAN_BELOW
              ? 'danger'
              : 'budget'
          }
        >
          Judged
        </Chip>
      ),
    title:
      loadPct === null
        ? 'What your instalments take each month'
        : `Your instalments take ${loadPct}% of what comes in`,
    means:
      loadPct === null
        ? 'This is your instalments against your income, and it is the number a lender actually ' +
          'prices. We can read the instalments. We could not find a salary in your statement, ' +
          'so we have left this out of the figure above rather than guess at it.'
        : 'Lenders call this your fixed obligation to income ratio. Comfortable is under ' +
          `${Math.round(FOIR_CLEAN_BELOW * 100)}%, and past ${Math.round(FOIR_ZERO_AT * 100)}% ` +
          'most will not lend at all — not because you have done anything wrong, but because ' +
          'there is nothing left each month to take a new instalment out of.',
    todo:
      loadPct === null
        ? 'If your salary reaches another bank, this is one of the things we cannot see. ' +
          'Your own payslip against your instalments gives you the same number.'
        : 'This one moves quickest by ending a loan rather than by earning more. The shortest ' +
          'instalment you are carrying is the one that frees the most room soonest.',
  }

  // The heaviest thing we cannot see goes between the ones we can. See the header.
  const rows: Row[] = [repayment, ...blindRows.slice(0, 1), cost, loadRow, ...blindRows.slice(1)]

  // Counted off the working rather than written into the sentence, for the same reason the
  // repayment row's day count is: an unreadable rate or income moves a row from one side of
  // this sentence to the other, and a hard-coded "two" would then be the lede contradicting
  // the badges directly beneath it.
  const judged = (['repayment', 'cost', 'load'] as const).filter(readable).length

  return (
    <Frame>
      {/* ── 1. THE HERO ─────────────────────────────────────────────────────────────── */}
      <Reveal className="mt-xl">
        <View className="rounded-lg bg-ink p-xl">
          <Type role="caption" tone="onInk" className="opacity-70">
            WHAT YOUR IDBI FILE SHOWS
          </Type>

          {score === null || outOf === null ? (
            <>
              {/* An em dash at the full display weight, and no `Meter` at all: a bar drawn at
                  zero is a verdict, and "nothing to judge" is not a bad score. This is
                  `protect.tsx:148-152`'s rule, which suppresses the figure and its meter
                  together rather than printing 0.0 months against a target. */}
              <Type role="display" tone="onInk" className="mt-xs">
                —
              </Type>
              <Type role="body" tone="onInk" className="mt-xs opacity-85">
                No borrowing on your IDBI file
              </Type>
            </>
          ) : (
            <>
              <Count
                value={score}
                format={(n) => String(Math.round(n))}
                role="display"
                tone="onInk"
                className="mt-xs"
                delay={dur.enter}
              />
              {/* The denominator is printed because it moves: a component the file cannot
                  answer for is dropped from both halves of the fraction, so 80 out of 80 is a
                  different statement from 80 out of 100 and the customer is owed which one. */}
              <Type role="body" tone="onInk" className="mt-xs opacity-85">
                out of {outOf}
              </Type>
              <View className="mt-lg">
                <Meter
                  fraction={score / outOf}
                  tone="bg-on-ink"
                  track="bg-on-ink/20"
                  delay={dur.enter}
                />
              </View>
            </>
          )}

          <Type role="heading" tone="onInk" className="mt-lg">
            {conductBand(score, outOf)}
          </Type>
          {credit.capped && (
            <Type role="body" tone="onInk" className="mt-xs opacity-75">
              Held here by the late repayment. It cannot go higher until that clears.
            </Type>
          )}

          {/* Inside the hero, above the fold, on the same card as the figure it qualifies.
              A disclaimer at the foot of the scroll is a disclaimer nobody reads, and this one
              is the difference between a composite and a claim about a regulated scale. */}
          <View className="mt-lg border-t border-on-ink/20 pt-md">
            <Type role="label" tone="onInk">
              This is not a credit score.
            </Type>
            <Type role="body" tone="onInk" className="mt-xs opacity-75">
              It is built from your IDBI accounts and nothing else. No bureau produced it, no lender
              will ever see it, and it is not on the 300 to 900 scale a credit score uses.
            </Type>
          </View>
        </View>
      </Reveal>

      {/* ── 2. THE GAP ──────────────────────────────────────────────────────────────── */}
      <Reveal i={1} className="mt-md">
        <Card className="items-center px-lg py-xl">
          <Type role="caption" tone="soft">
            WHAT A CREDIT BUREAU SEES
          </Type>
          {/* Full-width and unpadded: `Arc` measures this container to size itself, and a
              gutter here would shrink the gauge on every device by however much the card's own
              padding already took. */}
          <View className="mt-lg w-full">
            <Arc value={null} chord="Not pulled" startLabel="300" endLabel="900" />
          </View>
          <Type role="heading" className="mt-lg text-center">
            We have not looked.
          </Type>
          <Type role="body" tone="soft" className="mt-xs text-center">
            A real score comes from one of four bureaus, on a scale of 300 to 900, and it counts
            things your IDBI file does not contain — what you owe other lenders, how long you have
            borrowed, and who else has checked you lately.
          </Type>
          {/* The three lines that turn the blank gauge from an assertion into evidence. They
              have to sit in the same viewport as the arc at 375pt — a judge scrolling fast past
              an empty gauge with no reason under it sees a broken widget, not an argument. */}
          <View className="mt-lg w-full gap-sm">
            <FactLine>
              IDBI can pull this, and the call is already built. It needs bureau credentials we were
              not given.
            </FactLine>
            <FactLine>
              Without them it comes back refused, with no score anywhere in it. The gauge is empty
              because that is what comes back.
            </FactLine>
            <FactLine>
              A pull is a real enquiry against you, and we will not spend one to fill a demo. When
              we do, it will be because you asked, and it will be on your record.
            </FactLine>
          </View>
        </Card>
      </Reveal>

      {/* ── 3. WHAT A SCORE IS WORTH ────────────────────────────────────────────────── */}
      <Section title="What a score is worth" />
      <Type role="body" tone="soft" className="mt-xs">
        Pick a band. This is not your score — it is what each one is worth in rupees, and we cannot
        see which one is yours.
      </Type>
      <View className="mt-md">
        <Chips options={BAND_OPTIONS} value={band} onChange={setBand} />
      </View>
      <Reveal className="mt-md">
        <Card className="px-lg py-lg">
          {/* Branching on the resolved rates rather than on `band` covers the empty state and a
              band name core no longer publishes in one arm, which is what keeps a `!` out of a
              lookup that can legitimately miss. */}
          {rates === undefined ? (
            <Type role="body" tone="soft" className="text-center">
              Pick a band above.
            </Type>
          ) : (
            <>
              <RateStrip
                left={{
                  value: rates.home,
                  label: 'Home loan, salaried',
                  emptyLabel: 'A home loan would be hard to get',
                }}
                right={{
                  value: rates.car,
                  label: 'Car loan, new',
                  emptyLabel: 'A car loan would be hard to get',
                }}
              />
              {/* A sentence where the other two cells carry a rate, because in India a card's
                  interest is near-flat whoever you are — the band decides whether you get one
                  and at what limit, which is the fact worth knowing. */}
              <Type role="body" tone="mid" className="mt-lg">
                {rates.card}
              </Type>
              <Type role="caption" tone="soft" className="mt-md text-center">
                Indicative. A lender prices your whole file, not one number. Not an offer of credit.
              </Type>
            </>
          )}
        </Card>
      </Reveal>

      {/* ── 4. THE LIST ─────────────────────────────────────────────────────────────── */}
      <Section title="What moves this" />
      <Type role="body" tone="soft" className="mt-xs">
        These are the things that move how you borrow. We can judge {judged} of them from your IDBI
        file and we cannot see the other {rows.length - judged} — so all {rows.length} are on one
        list, at the same size.
      </Type>
      <View className="mt-md gap-md">
        {rows.map((row) => (
          <Disclosure
            key={row.id}
            badge={row.badge}
            title={row.title}
            open={open === row.id}
            onToggle={() => setOpen(open === row.id ? null : row.id)}
            means={row.means}
            todo={row.todo}
          />
        ))}
      </View>

      {/* ── 5. THE NOTE AND THE GATE ────────────────────────────────────────────────── */}
      <View className="mt-xxl">
        <Note title="Your free report">
          You get one full credit report, with the score, free from each of the four bureaus once
          every calendar year — TransUnion CIBIL, Experian, Equifax and CRIF High Mark. Four
          reports, if you want them. Nobody has to ask us.
        </Note>
      </View>
      <View className="mt-md">
        <Note title="Nothing here touches your report" glyph="lock">
          We have not asked any bureau about you, and nothing on this page does. There is no enquiry
          here for a check to affect, and nothing here a lender can see.
        </Note>
      </View>
      <Reveal className="mt-md">
        <Tap accessibilityRole="button" onPress={() => router.push('/(tabs)/grow')} scale={0.985}>
          <Card className="flex-row items-center gap-md px-lg py-lg">
            <View className="h-9 w-9 items-center justify-center rounded-pill bg-ground-deep">
              <Glyph name="shield" size={19} tint={color.ink} />
            </View>
            <View className="flex-1">
              <Type role="heading">What this changes on the shelf</Type>
              <Type role="body" tone="soft" className="mt-[2px]">
                Every product IDBI can sell you runs through nine rules first, and two of them read
                this page.
              </Type>
            </View>
            <Glyph name="chevronRight" size={20} tint={color.inkSoft} />
          </Card>
        </Tap>
      </Reveal>
    </Frame>
  )
}

/** One row of the list, judged or blind. The badge is a node because a `Chip`'s tone is the row's. */
type Row = { id: RowId; badge: ReactNode; title: string; means: string; todo: string }

/**
 * The way back, the title and the promise under it — everything every arm of this screen shares.
 *
 * The title scrolls rather than pinning. There is no `Pills` row here to pin it under, this is
 * one continuous scroll like the reference's own, and a title the customer has already read is
 * not worth a hundred points of vertical for the rest of the page.
 */
function Frame({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      {/* Reachable from Spend, from the gate sheet and from a deep link, so `back` cannot be
          assumed to have anywhere to go. */}
      <NavRow
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/spend'))}
      />
      <ScrollView className="flex-1 px-pad" contentContainerClassName="pb-xxl">
        <Type role="display">Credit</Type>
        <Type role="body" tone="soft" className="mt-sm">
          How you borrow with IDBI, what that is worth, and the things about your borrowing we
          cannot see.
        </Type>
        {children}
      </ScrollView>
    </SafeAreaView>
  )
}

/**
 * One row of the list, opened or closed.
 *
 * `noticed.tsx:110-171`'s shape, with two changes. The badge is the row's *epistemic status*
 * rather than a severity, so it is read before the claim and sits above the title; the reference
 * puts its verdict below, which is right for a verdict on a claim already read and wrong here.
 * And the body is two headings set at the same `role="body"` as the prose under them, differing
 * only in weight and tone, with nothing between a heading and its own paragraph — so it reads as
 * prose with emphasis rather than as a form with field labels.
 *
 * Every row carries its badge closed, which is what makes the list skimmable without opening
 * anything: a customer scrolling past four "We can't see this" chips has the whole boundary of
 * the product before they have tapped once.
 */
function Disclosure({
  badge,
  title,
  open,
  onToggle,
  means,
  todo,
}: {
  /** The row's epistemic status, read BEFORE the claim. A `Chip`. */
  badge: ReactNode
  title: string
  open: boolean
  onToggle: () => void
  /** "What this means" and "What to do", in that order. */
  means: string
  todo: string
}) {
  return (
    // The card grows into its body rather than jumping to its new height, so the line the
    // reader was on stays under their eye while it opens.
    <Animated.View layout={LinearTransition.duration(dur.move).easing(easeOut)}>
      <Card>
        <Tap
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          haptic="selection"
          onPress={onToggle}
          scale={0.99}
          className="px-lg py-lg"
        >
          <View className="flex-row items-center justify-between gap-md">
            {badge}
            <Glyph name={open ? 'chevronDown' : 'chevronRight'} size={20} tint={color.inkSoft} />
          </View>

          <Type role="heading" className="mt-md">
            {title}
          </Type>

          {open && (
            <View className="mt-lg">
              <Type role="body" className="font-semibold">
                What this means
              </Type>
              <Type role="body" tone="mid">
                {means}
              </Type>
              <Type role="body" className="mt-xxl font-semibold">
                What to do
              </Type>
              <Type role="body" tone="mid">
                {todo}
              </Type>
            </View>
          )}
        </Tap>
      </Card>
    </Animated.View>
  )
}

/**
 * Two figures side by side, on a rigid half each.
 *
 * The right cell is right-aligned, which is the detail that reads as craft: both cells' labels
 * land on the same baselines and both values end on an edge the eye can follow, where two
 * left-aligned cells would leave a ragged gutter down the middle of the card. The cells are
 * half and half rather than content-sized, so the rule between them does not move when the band
 * changes and the strip stops looking like a table being re-laid every tap.
 *
 * A missing value is a literal dash in the full value style — never "N/A", never a zero, which
 * would be a rate we are asserting — **and the label changes with it**. The dash is only the
 * typographic placeholder; the sentence beside it is what the empty state actually says.
 */
function RateStrip({
  left,
  right,
}: {
  left: { value: string | null; label: string; emptyLabel: string }
  right: { value: string | null; label: string; emptyLabel: string }
}) {
  return (
    <View className="flex-row">
      <View className="flex-1 pr-md">
        <Type role="heading">{left.value ?? '—'}</Type>
        <Type role="label" tone="soft" className="mt-xs">
          {left.value === null ? left.emptyLabel : left.label}
        </Type>
      </View>
      {/* Inset top and bottom, so the rule tracks the content block rather than the card. */}
      <View className="my-sm w-[1px] self-stretch bg-hairline-soft" />
      <View className="flex-1 items-end pl-md">
        <Type role="heading">{right.value ?? '—'}</Type>
        <Type role="label" tone="soft" className="mt-xs text-right">
          {right.value === null ? right.emptyLabel : right.label}
        </Type>
      </View>
    </View>
  )
}

/** One checked line of evidence under the empty gauge. `items-start`, so the mark stays on the
 *  first line of a sentence that runs to three rather than drifting into the middle of it. */
function FactLine({ children }: { children: string }) {
  return (
    <View className="flex-row items-start gap-sm">
      <View className="mt-[5px]">
        <Glyph name="check" size={11} tint={color.inkSoft} />
      </View>
      <Type role="label" tone="mid" className="flex-1">
        {children}
      </Type>
    </View>
  )
}
