// Today's one thing, and what the customer did about it.
//
// This card is the product's whole argument, so it gets the loudest surface in the system
// and sits above the balances — the one place the layout deliberately departs from Cleo,
// who leads Spend with their own card.
//
// Three responses, not one. "Did it", "not now" and "not for me" are different facts and
// the engine treats them differently: a deferral comes back tomorrow, a decline does not
// and the reason is kept. Offering only the accept button would make the audit record a
// log of what we sold rather than of what was decided.
//
// But three answers and a way in were four controls on one card — a call to the bank over "I
// spoke to them · Not now · Not for me" — and the eye could not tell which was the point. So the
// card keeps Cleo's grammar, one pill and at most two links under it, and the answers take turns
// instead of queueing:
//
// - The pill is the way in (below). A card with no way in makes the receipt its pill.
// - "Not now" is the one dismissal on the card as it lands. It asks the follow-up that splits it:
//   "Remind me later" takes the pill, because a deferral is what "not now" nearly always means,
//   and "Not for me" becomes the link. The record gets the same `deferred` or `declined` as before.
// - Where the pill is a place to look — the limits, the statement, the payoff — the receipt is a
//   link beside "Not now": the thing itself happens outside the app and may already be done.
//   Where the pill is the doing itself, the call, "I spoke to them" before the call opens would be
//   a claim about a call nobody has placed. So it arrives after: the receipt takes the pill, and
//   the call steps down to "Call again".
// - Each turn swaps controls in place, so the new ones ignore presses for a moment (`SETTLE_MS`).
//   Otherwise the second tap of a double tap on "Not now" lands on "Not for me", and one on the
//   call lands on "I spoke to them": an answer nobody gave, on a record that keeps it.
//
// The accept answer says what the customer did, in their words — "I spoke to them", "I paid
// it" — because "Do it" on a card about a phone call asked them to do something the app cannot
// do. What is recorded is the same `did_it` whatever the answer says.
//
// Above the answers, every card carries a way to *act*, not only three ways to report. A receipt
// with nothing to do first was a dead end on the first card of the app: "I did this" under a
// sweep-in the customer had never been shown. So each kind opens the one place that does its
// job — the limit editor for a cap, the statement for the subscriptions, the payoff for a card,
// the bank's own phone line for a call to the bank, the gate sheet on the product itself for a
// monthly amount into one — and where the app has no such place, Uday, asked what he can answer:
// a lump sum the sheet cannot size, as where the money sits and what it earns there
// (`lib/ask.ts`). `cancel_subscription` answers "I checked them", not "I cancelled it": the
// engine's card is "Check your subscriptions … You decide which to keep", and keeping all of
// them is a complete answer to it.
//
// No chip over the title. The card is first on Home and the only brand-green surface there;
// a "Today" label on top of that was a kicker, and the title says what the card is.
//
// All three answers land through the same sequence in `Verdict.tsx`, and the whole card sits in
// a `VerdictFrame` so the height morphs instead of jumping when one replaces another. The
// refusal is the case it was built for, but a confirmation earns the same treatment: "Done —
// it's on your record" is a claim about a regulated audit trail, and hard-cutting to it would
// make it look like a toast. The confirmation ends in a link to that record, so the claim can
// be checked from the card that makes it — and so does the refusal, which is saved the same way
// and whose "Instead" is a door onto the product it names rather than a caption about it.
import { useRef, useState } from 'react'
import { View } from 'react-native'
import { router, type Href } from 'expo-router'
import { Type } from '~/ui/Text'
import { Button } from '~/ui/Button'
import { Chip } from '~/ui/Chip'
import { Glyph } from '~/ui/Glyph'
import { Tap, openExternal } from '~/ui/Tap'
import { useToast } from '~/ui/Toast'
import { MenuLink } from '~/ui/MenuRow'
import { AskUday } from '~/ui/AskUday'
import { useToTab } from '~/ui/NavRow'
import { Reveal } from '~/ui/Reveal'
import { evidenceLine } from '~/ui/Evidence'
import { GateSheet, ruleIndex, ruleName } from '~/ui/GateSheet'
import { BEAT, Beat, VerdictFrame, VerdictSurface } from '~/ui/Verdict'
import { color } from '@dhan/design'
import { ApiError } from '~/api/client'
import { IDBI_CARE } from '~/lib/idbi'
import { RM_INSTEAD, lumpSumQuestion } from '~/lib/ask'
import { rupees } from '~/lib/money'
import type {
  Action,
  ActionKind,
  AdviceRecord,
  DecisionKind,
  DecisionResponse,
  ShelfProduct,
} from '@dhan/contracts'

/**
 * Where the answers stand. `ask` is the card as it lands; `called` follows a way in that is the
 * doing itself, once it has opened; `parking` follows "Not now" and asks which kind it was.
 */
type Stage = 'ask' | 'called' | 'parking'

/**
 * How long a turn's new controls ignore presses. Longer than a double tap (about 300ms on either
 * platform) and shorter than anyone takes to read a new label and mean to press it.
 */
const SETTLE_MS = 450

/** One of the links under the pill: an answer for the record, or a move on the card. */
type Link = {
  key: string
  label: string
  hint: string
  /** The answer this link records, if it records one; it shows "Saving…" while it does. */
  kind?: DecisionKind
  haptic: 'selection' | 'light' | 'none'
  onPress: () => void
}

/** What the customer did, where the action is something they do outside the app. */
const DID_IT: Partial<Record<ActionKind, string>> = {
  talk_to_rm: 'I spoke to them',
  pay_down_card: 'I paid it',
  cancel_subscription: 'I checked them',
  set_category_cap: 'I set the cap',
}

const DONE_TITLE: Record<DecisionKind, string> = {
  did_it: "Done — it's on your record",
  deferred: 'Parked for now',
  declined: 'Noted',
  pushed_back: 'Noted',
}

const DONE_BODY: Record<DecisionKind, string> = {
  did_it: 'Saved with its evidence and the rules it passed.',
  deferred: "I'll bring it up again while it still matters.",
  declined: "I won't suggest this one again.",
  pushed_back: "I won't suggest this one again.",
}

/**
 * The one thing the card can open for its action, drawn above the receipt for doing it: a place
 * in the app (`open`), or a line out of it (`href`, with what to say if the phone cannot open it).
 */
type Door = {
  label: string
  hint: string
  open?: () => void
  href?: string
  failed?: string
  /**
   * Only on a door that is the doing itself — the call. Once it opens, the receipt takes the pill
   * and the door steps down to a link with this label.
   */
  again?: string
}

/**
 * Where "doing it" starts, for each kind of action.
 *
 * A product is a lookup on the shelf the view carries, and the gate sheet only sizes a monthly
 * amount — "How much a month?" — so a lump sum (moving a maturing deposit) is put to Uday as the
 * move itself rather than checked as a figure it is not. A product the shelf does not carry gets
 * no door at all: a button that opens nothing would be worse than the receipt alone.
 */
function doorFor(
  action: Action,
  product: ShelfProduct | undefined,
  toTab: (href: Href) => void,
  openGate: (product: ShelfProduct) => void,
): Door | null {
  const ask = (question: string) => () =>
    toTab({ pathname: '/(tabs)/uday', params: { ask: question } })

  switch (action.kind) {
    case 'set_category_cap':
      return {
        label: 'Show me',
        hint: 'Opens the spending limits',
        open: () => router.push('/set-limit'),
      }
    case 'cancel_subscription':
      return {
        label: 'See the charges',
        hint: 'Opens your statement',
        open: () => router.push('/statement'),
      }
    case 'pay_down_card':
      return {
        label: 'See the payoff',
        hint: 'Opens the payoff on your plan',
        open: () =>
          toTab({ pathname: '/(tabs)/plan', params: { pane: 'projection', stage: 'clear_debt' } }),
      }
    case 'talk_to_rm':
      // The call itself, on the bank's toll-free line — the one the notices' hand-off dials.
      // The card says the manager "will already have all of this", so the door is the
      // conversation, not a briefing on it; what the bank's file shows is the Credit pill.
      return {
        label: IDBI_CARE.label,
        hint: IDBI_CARE.hint,
        href: IDBI_CARE.href,
        failed: IDBI_CARE.failed,
        again: 'Call again',
      }
    case 'pause_sip':
      return {
        label: 'See your SIPs',
        hint: 'Opens your holdings',
        open: () => toTab({ pathname: '/(tabs)/grow', params: { pane: 'holdings' } }),
      }
    default:
      if (action.cadence === 'lump_sum') {
        // Not the product's name: Uday's rules have none of them, and a named product runs the
        // gate a second time. Where the money sits and what it earns there is what he answers.
        return {
          label: 'Ask Uday about it',
          hint: 'Asks Uday in the chat',
          open: ask(lumpSumQuestion(action)),
        }
      }
      return product === undefined
        ? null
        : {
            label: 'Show me',
            hint: `Checks ${product.name} against your file`,
            open: () => openGate(product),
          }
  }
}

export function ActionCard({
  action,
  onDecide,
  asOf,
  shelf,
}: {
  action: Action
  onDecide?: (kind: DecisionKind) => Promise<DecisionResponse>
  /** The snapshot's date, so an evidence line's date prints as "11 Sep" rather than ISO. */
  asOf?: string
  /** The products the view carries, so a product action — or a refusal's "Instead" — opens it. */
  shelf?: readonly ShelfProduct[]
}) {
  const [busy, setBusy] = useState<DecisionKind | null>(null)
  const [done, setDone] = useState<DecisionKind | null>(null)
  const [blocked, setBlocked] = useState<AdviceRecord | null>(null)
  const [failed, setFailed] = useState<'retry' | 'already' | null>(null)
  const [gate, setGate] = useState<ShelfProduct | null>(null)
  const [stage, setStage] = useState<Stage>('ask')
  // When the current controls start answering. A ref, not state: it gates a press, it draws nothing.
  const settles = useRef(0)
  const toTab = useToTab()
  const toast = useToast()
  const onShelf = (id: string | null | undefined) =>
    id == null ? undefined : shelf?.find((p) => p.productId === id)

  // The sheet sits beside the card rather than inside it, so the card's height morph never
  // measures it; closed, it draws nothing.
  const sheet = <GateSheet product={gate} onClose={() => setGate(null)} onSwitch={setGate} />

  /** Moves the card on a turn, and holds the new controls still while a double tap finishes. */
  function turn(next: Stage) {
    settles.current = Date.now() + SETTLE_MS
    setStage(next)
  }

  const settling = () => Date.now() < settles.current

  async function decide(kind: DecisionKind) {
    if (!onDecide || busy || settling()) return
    setBusy(kind)
    setFailed(null)
    try {
      const outcome = await onDecide(kind)
      // Accepting is a request, not a result. The suitability gate runs server-side on the
      // re-derived snapshot and can refuse, and when it does the refusal is the screen —
      // showing a green tick over a blocked recommendation would be the one unforgivable
      // bug in a product whose whole claim is that it says no.
      if (outcome.adviceRecord?.verdict === 'BLOCKED') setBlocked(outcome.adviceRecord)
      else setDone(kind)
    } catch (err) {
      // One decision per action is the server's rule, and a 409 means this one already has
      // one. Telling the customer to try again would be advice that cannot work.
      setFailed(err instanceof ApiError && err.status === 409 ? 'already' : 'retry')
    } finally {
      setBusy(null)
    }
  }

  if (blocked) {
    const at = ruleIndex(blocked.ruleId)
    const rule = ruleName(blocked.ruleId)
    // An object on the wire (`AlternativeSchema`) and never a string. This once rendered the
    // object straight into a `<Type>` child, so every refusal carrying one took the tab down.
    const alt = blocked.alternative
    const altProduct = onShelf(alt?.productId)
    const altLine =
      alt === null ? '' : `${alt.name}${alt.monthly > 0 ? `, ${rupees(alt.monthly)} a month` : ''}`
    return (
      <>
        <VerdictFrame>
          <VerdictSurface
            tone="blocked"
            className="rounded-card border border-danger bg-danger-soft p-lg"
          >
            <Beat at={BEAT.ruling}>
              {/* White, not the soft red: a danger chip on the danger card is the same fill as
                  the card and reads as loose text. */}
              <Chip tone="surface" glyph="alert">
                Not suitable
              </Chip>
              <Type role="title" className="mt-md">
                {"I'm not going to do that"}
              </Type>
            </Beat>

            <Beat at={BEAT.reasoning}>
              <Type role="body" className="mt-sm">
                {blocked.spoken ?? blocked.recorded}
              </Type>

              {/* The better product is a door, the way the gate sheet draws its own "Instead":
                  onto that product's check when the shelf carries it. One the shelf does not
                  carry is named, not linked — "Should I take it instead?" was a question Uday
                  had no rule for, so the door only ever opened onto "I am not sure". */}
              {alt === null ? null : altProduct === undefined ? (
                <View
                  accessible
                  accessibilityLabel={`Instead, ${altLine}`}
                  className="mt-lg rounded-md bg-surface p-md"
                >
                  <Type role="caption" tone="mid">
                    Instead
                  </Type>
                  <Type role="body" weight="semibold" className="mt-xs">
                    {altLine}
                  </Type>
                </View>
              ) : (
                <Tap
                  accessibilityRole="button"
                  accessibilityLabel={`Instead, ${altLine}`}
                  accessibilityHint="Checks this one instead"
                  haptic="none"
                  scale={0.98}
                  onPress={() => setGate(altProduct)}
                  className="mt-lg min-h-target flex-row items-center gap-md rounded-md bg-surface p-md"
                >
                  <View className="flex-1">
                    <Type role="caption" tone="mid">
                      Instead
                    </Type>
                    <Type role="body" weight="semibold" className="mt-xs">
                      {altLine}
                    </Type>
                  </View>
                  <Glyph name="arrowRight" size={18} tint={color.ink} />
                </Tap>
              )}
            </Beat>

            {/* Which rules it did clear matters as much as the one it did not: it says the
                refusal came from a specific test, not from a blanket unwillingness to act. And
                it is the last beat, so it is the sentence still arriving as the motion stops.
                The rule is named by its place in the nine and by what it protects, never by its
                id. The claim that it is saved ends in the record that holds it. */}
            <Beat at={BEAT.provenance}>
              {blocked.rulesPassed.length > 0 && (
                <Type role="caption" tone="mid" className="mt-lg">
                  {`Passed ${blocked.rulesPassed.length} of 9.`}
                  {at > 0 ? ` Stopped at rule ${at} of 9${rule ? ` · ${rule}` : ''}.` : ''}
                </Type>
              )}

              <Type role="caption" tone="mid" className="mt-xs">
                This refusal is saved with its reasoning, same as any advice.
              </Type>
              <MenuLink label="Open my record" onPress={() => router.push('/record')} />
            </Beat>
          </VerdictSurface>
        </VerdictFrame>
        {sheet}
      </>
    )
  }

  if (done) {
    return (
      <VerdictFrame>
        <VerdictSurface tone="passed" className="rounded-card bg-success p-lg">
          <Beat at={BEAT.ruling}>
            <View className="flex-row items-center gap-sm">
              <Glyph name="check" size={18} tint={color.ink} />
              <Type role="heading" className="flex-1">
                {DONE_TITLE[done]}
              </Type>
            </View>
          </Beat>
          <Beat at={BEAT.reasoning}>
            <Type role="body" className="mt-sm">
              {DONE_BODY[done]}
            </Type>
            <View className="mt-xs flex-row flex-wrap gap-x-xl">
              <MenuLink label="Open my record" onPress={() => router.push('/record')} />
              {/* Only when the call did not happen: "instead" of a conversation already had
                  is not an offer, it is a contradiction. */}
              {action.kind === 'talk_to_rm' && done !== 'did_it' ? (
                <AskUday question={RM_INSTEAD} label="Ask Uday instead" />
              ) : null}
            </View>
          </Beat>
        </VerdictSurface>
      </VerdictFrame>
    )
  }

  const door = doorFor(action, onShelf(action.productId), toTab, setGate)
  const receipt = DID_IT[action.kind] ?? 'I did this'

  // A line out of the app opens here rather than in `Tap`, so the card knows whether it opened: a
  // call that could not start must not turn the pill into "I spoke to them". The turn is only ever
  // out of `ask` — a "Not now" pressed while the call was opening has already moved the card on.
  function enter(d: Door) {
    if (settling()) return
    if (d.open !== undefined) {
      d.open()
      return
    }
    if (d.href === undefined) return
    void openExternal(d.href).then((opened) => {
      if (!opened) {
        if (d.failed !== undefined) toast.show(d.failed)
      } else if (d.again !== undefined) {
        settles.current = Date.now() + SETTLE_MS
        setStage((now) => (now === 'ask' ? 'called' : now))
      }
    })
  }

  const notNow: Link = {
    key: 'not-now',
    label: 'Not now',
    hint: 'Asks whether to bring it back later',
    haptic: 'selection',
    onPress: () => {
      if (!settling()) turn('parking')
    },
  }
  const didIt: Link = {
    key: 'did-it',
    label: receipt,
    hint: 'Saves it to your record',
    kind: 'did_it',
    haptic: 'light',
    onPress: () => void decide('did_it'),
  }
  const notForMe: Link = {
    key: 'not-for-me',
    label: 'Not for me',
    hint: "Saves it to your record. It won't be suggested again",
    kind: 'declined',
    haptic: 'light',
    onPress: () => void decide('declined'),
  }
  const again = stage === 'called' ? door?.again : undefined
  const links: readonly Link[] =
    stage === 'parking'
      ? [notForMe]
      : door !== null && again !== undefined
        ? [
            {
              key: 'again',
              label: again,
              hint: door.hint,
              haptic: 'none',
              onPress: () => enter(door),
            },
            notNow,
          ]
        : door !== null && door.again === undefined
          ? [didIt, notNow]
          : [notNow]

  return (
    <>
      <VerdictFrame>
        {/* The brand green, and the only card on Spend that wears it.

            The terracotta this replaces was Cleo's coral, and it sat 150 degrees from the
            green — near-complementary, which is the one interval that reads as two colours
            arguing rather than as a pair. It survived while the green was near-black enough to
            pass for a neutral and stopped surviving the moment the green became #016A4D.

            Putting the bank's own colour on the card where the bank actually speaks is the more
            honest answer than finding a second hue to shout with. What it costs is the contrast
            against the balance card, which was also green — so that one drops to ink. The line
            between them is real rather than decorative: a balance is a fact the customer can
            already read in GO Mobile+, and the advice is the thing only this app has. Derived,
            advisory surfaces are brand green; raw account figures are ink.

            Cream at 85% on the green is 4.76:1, which is the floor for body text and the reason
            nothing on this card goes lighter than that. */}
        <View className="rounded-card bg-brand p-lg">
          <Type role="title" tone="onInk">
            {action.label}
          </Type>
          <Type role="body" tone="onInk" className="mt-sm opacity-85">
            {action.detail}
          </Type>

          {/* The evidence deals itself out. These lines are the reason the action is being put
              forward at all, and a customer who watches them arrive one at a time has read
              them; a customer handed four grey lines at once has read the first. */}
          {action.evidence.length > 0 && (
            <View className="mt-lg gap-xs">
              {action.evidence.map((line, i) => (
                <Reveal key={line} i={i} delay={BEAT.reasoning}>
                  <View className="flex-row items-start gap-sm">
                    <View className="mt-xxs">
                      <Glyph name="check" size={12} tint={color.onInk} />
                    </View>
                    <Type role="caption" tone="onInk" className="flex-1 opacity-85">
                      {evidenceLine(line, asOf)}
                    </Type>
                  </View>
                </Reveal>
              ))}
            </View>
          )}

          {/* One pill, as every Cleo card has one, and at most two links under it (see the
              header). The pair is a live region so a turn is heard as well as seen: the
              control under the finger has just changed its words. */}
          <View accessibilityLiveRegion="polite">
            <View className="mt-lg">
              {stage === 'parking' ? (
                <Button
                  label="Remind me later"
                  variant="light"
                  accessibilityHint="Saves it to your record. It comes back while it still matters"
                  loading={busy === 'deferred'}
                  onPress={() => void decide('deferred')}
                />
              ) : door === null || stage === 'called' ? (
                <Button
                  label={receipt}
                  variant="light"
                  accessibilityHint="Saves it to your record"
                  loading={busy === 'did_it'}
                  onPress={() => void decide('did_it')}
                />
              ) : (
                <Button
                  label={door.label}
                  variant="light"
                  haptic="none"
                  accessibilityHint={door.hint}
                  onPress={() => enter(door)}
                />
              )}
            </View>

            {/* No side padding: each link is already wider than 44pt, and the hit slop meets in
                the gap. Two links fit one line at 320pt; a larger text size wraps the row
                rather than cutting a word. */}
            <View className="mt-sm flex-row flex-wrap justify-center gap-x-xl">
              {links.map((l) => (
                <Tap
                  key={l.key}
                  accessibilityRole="button"
                  accessibilityLabel={l.label}
                  accessibilityHint={l.hint}
                  accessibilityState={{
                    disabled: busy !== null,
                    busy: l.kind !== undefined && busy === l.kind,
                  }}
                  disabled={busy !== null}
                  haptic={l.haptic}
                  dim
                  hitSlop={6}
                  onPress={l.onPress}
                  className="min-h-target justify-center"
                >
                  <Type role="label" tone="onInk" className="underline opacity-85">
                    {l.kind !== undefined && busy === l.kind ? 'Saving…' : l.label}
                  </Type>
                </Tap>
              ))}
            </View>
          </View>

          {failed && (
            <Reveal>
              <Type
                role="caption"
                tone="onInk"
                className="mt-sm text-center opacity-85"
                accessibilityLiveRegion="polite"
              >
                {failed === 'already'
                  ? 'You already answered this one.'
                  : "Couldn't save. Try again."}
              </Type>
            </Reveal>
          )}
        </View>
      </VerdictFrame>
      {sheet}
    </>
  )
}
