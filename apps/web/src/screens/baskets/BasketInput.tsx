/**
 * `model-portfolio-input` — the amount, and the one sentence that keeps this surface out of Plan's
 * way.
 *
 * The frame is five things stacked: a back bar, a full-width tinted **profile banner** with a
 * forward arrow, three lines of explainer, an `Investment Details` card holding two
 * checkbox-plus-amount rows with their own helper text, and a `Continue` button that is *not*
 * pinned — the frame leaves a large white area under it. All five are here.
 *
 * ## Why the plan card comes before the amount
 *
 * `07-DECISIONS.md` §5 scoped this feature out once, on the grounds that "this app's roadmap **is**
 * a sequenced basket, and a second curated-basket flow would compete with `Plan` for the same job".
 * The reversal put the surface back; it did not make that objection wrong. So the surface answers
 * it on its first screen, in this customer's own figures rather than in a disclaimer:
 *
 * - **Plan decides what comes first.** It is computed from twelve months of statements and it will
 *   tell you to clear a card at 34.8% before it tells you to invest anything.
 * - **A basket decides how one amount is split**, and nothing else. It cannot move an item up the
 *   roadmap and it does not try to.
 *
 * Where the roadmap has no growth stage at all, the card says so first and in the danger tint,
 * because the suitability gate is going to refuse every line in a moment anyway and finding that
 * out after picking a basket would be a worse screen than being told now.
 *
 * ## What the reference had here that this does not
 *
 * `Min 5K, Max 10Cr` / `Min 10K, Max 10Cr`. The minimum is real and computed — the smallest amount
 * that fills the cheapest basket above every constituent's own floor — so it stays. **The maximum
 * is dropped**: IDBI publishes no per-order ceiling, `10Cr` is the reference's stub, and the real
 * ceiling on a SIP is the affordability rule, which is a judgement the gate makes and not a number
 * printed on a form.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import type { Account, Roadmap, ShelfProduct, Snapshot } from '@dhan/contracts'
import { Screen } from '../../components/Screen.tsx'
import { Sheet } from '../../components/Sheet.tsx'
import { InfoBanner } from '../../components/InfoBanner.tsx'
import { StatusBand } from '../../components/StatusBand.tsx'
import { Checkbox, MoneyInput } from '../../components/Form.tsx'
import { Button, Card, Head, IconButton, TextLink } from '../../components/ui.tsx'
import { inr } from '../../lib/money.ts'
import { basketFloor, planStance, reachableToday, STAGE_NOUN } from './compose.ts'

/** A row of the `Investment Details` card: the box in the gutter, the field beside it. */
function AmountRow({
  on,
  onToggle,
  label,
  value,
  onValue,
  hint,
}: {
  on: boolean
  onToggle: (next: boolean) => void
  label: string
  value: number
  onValue: (n: number) => void
  hint: string
}): ReactNode {
  return (
    <div className="mt-3 flex items-start gap-1">
      {/* The frame puts the box in the left gutter beside the *field*, not beside its label —
          so it is pushed down past the label's line rather than aligned to the top of the row. */}
      <span className="mt-[30px] flex-none">
        <Checkbox checked={on} onChange={onToggle} label={label} />
      </span>
      {/* `inert` rather than opacity alone: a greyed field a keyboard can still reach is a field
          whose value nobody can explain. React 19 passes the attribute straight through. */}
      <div className={`min-w-0 flex-1 ${on ? '' : 'opacity-55'}`} {...(on ? {} : { inert: true })}>
        <span className="mb-1.5 block text-[13px] font-semibold text-ink">{label}</span>
        <MoneyInput value={value} onChange={onValue} ariaLabel={label} placeholder="0" />
        <span className="mt-1.5 block text-xs leading-snug text-ink-soft">{hint}</span>
      </div>
    </div>
  )
}

export function BasketInput({
  snapshot,
  roadmap,
  shelf,
  accounts,
  sip,
  sipOn,
  lump,
  lumpOn,
  onSip,
  onSipOn,
  onLump,
  onLumpOn,
  onContinue,
  onBack,
  onOpenProfile,
  onOpenPlan,
}: {
  snapshot: Snapshot
  roadmap: Roadmap
  shelf: readonly ShelfProduct[]
  accounts: readonly Account[]
  sip: number
  sipOn: boolean
  lump: number
  lumpOn: boolean
  onSip: (n: number) => void
  onSipOn: (on: boolean) => void
  onLump: (n: number) => void
  onLumpOn: (on: boolean) => void
  onContinue: () => void
  onBack: () => void
  /** The profile banner's forward arrow. Left out, the banner states the profile and offers no way in. */
  onOpenProfile?: (() => void) | undefined
  /** The plan card's link. Left out, the card still says what Plan decides; it just cannot open it. */
  onOpenPlan?: (() => void) | undefined
}): ReactNode {
  const floor = basketFloor(shelf)
  const stance = planStance(roadmap)
  const reachable = reachableToday(accounts)
  const spare = snapshot.surplus.deployable

  const chosen = (sipOn ? sip : 0) + (lumpOn ? lump : 0)
  const shortSip = sipOn && sip > 0 && sip < floor
  const shortLump = lumpOn && lump > 0 && lump < floor
  /* Below the floor no basket can hold more than one scheme, and the card above says so — so
     `Continue` is closed rather than leading to a screen that contradicts the sentence. */
  const ready = chosen > 0 && (sipOn ? sip >= floor : true) && (lumpOn ? lump >= floor : true)

  const [about, setAbout] = useState(false)

  return (
    <Screen
      header={
        <Head
          onBack={onBack}
          backLabel="Back"
          title="Ready-made baskets"
          sub="One amount, split across the shelf"
          right={
            <IconButton label="What a basket is" tone="bordered" onClick={() => setAbout(true)}>
              <Info size={18} strokeWidth={2.2} />
            </IconButton>
          }
        />
      }
      notice={
        <InfoBanner
          tone="sage"
          {...(onOpenProfile ? { action: 'Change', onAction: onOpenProfile } : {})}
        >
          Your risk profile is <b className="font-semibold">{snapshot.customer.riskProfile}</b>
        </InfoBanner>
      }
      after={
        <Sheet
          open={about}
          onClose={() => setAbout(false)}
          title="What a basket is"
          sub="And the three things the screen deliberately does not tell you."
        >
          <div className="pb-2 text-[14.5px] leading-relaxed text-ink-mid">
            <p className="mb-3 mt-0">
              A basket is the same shelf Discover sells, filtered by one rule, with your amount
              split equally across whatever passes that rule. The rule is printed above the schemes
              so you can check it against them.
            </p>
            <p className="mb-3 mt-0">
              <b className="font-semibold text-ink">No expected return.</b> Deposits carry a
              contracted rate and funds carry none, so a blended basket return would be part fact
              and part guess presented as one number.
            </p>
            <p className="mb-3 mt-0">
              <b className="font-semibold text-ink">No risk grade for the basket.</b> SEBI&rsquo;s
              riskometer is a per-scheme disclosure and it is shown per scheme. Rolling several into
              one word is a rating, and this app does not publish ratings.
            </p>
            <p className="mb-0 mt-0">
              <b className="font-semibold text-ink">Nothing is checked yet.</b> The suitability gate
              runs on the whole basket when you place it, and a refusal on any one scheme stops all
              of it.
            </p>
          </div>
        </Sheet>
      }
    >
      {stance?.kind === 'not_yet' ? (
        /*
         * A white card with a warning band at its foot, not a tinted one. The three tint names
         * draw identical pixels (`DESIGN.md`), so `clay` here would have been the same green
         * rectangle as the ordinary case below it and the difference between "here is how this
         * differs from your plan" and "your plan says do not do this yet" would have been
         * invisible. `StatusBand` is the reference's own way of saying a card's state, and a
         * banded white card against a flat tinted one is a difference in *form*.
         */
        <Card tint="white">
          <h2>Your plan does not reach investing yet</h2>
          <p className="mb-0 mt-1.5 text-[14.5px] leading-relaxed text-ink-mid">
            The next thing on your roadmap is {STAGE_NOUN[stance.first.kind]}, not putting money
            into anything. A basket cannot move that — it only decides how an amount is split.
          </p>
          {onOpenPlan ? (
            <div className="mt-2">
              <TextLink flush size="sm" onClick={onOpenPlan}>
                See what comes first
              </TextLink>
            </div>
          ) : null}
          <StatusBand tone="bad" label="Expect a refusal.">
            The suitability gate is going to stop these schemes on the same grounds your plan puts{' '}
            {STAGE_NOUN[stance.first.kind]} first.
          </StatusBand>
        </Card>
      ) : (
        <Card tint="sage">
          <h2>This is not your plan</h2>
          <p className="mb-0 mt-1.5 text-[14.5px] leading-relaxed text-ink-mid">
            {stance?.kind === 'after' ? (
              <>
                Plan decides what comes first, and it puts {STAGE_NOUN[stance.before.kind]} ahead of
                this. A basket only decides how the growing money is split once you get there.
              </>
            ) : stance?.kind === 'now' ? (
              <>
                Plan names one scheme for the growing stage
                {stance.grow.productName ? <> — {stance.grow.productName}</> : null}, at{' '}
                {inr(stance.grow.monthly)} a month. A basket spreads the same kind of money across
                several instead. It does not change the order of your roadmap.
              </>
            ) : (
              <>
                Plan decides what comes first, computed from your statements. A basket only decides
                how one amount is split across the shelf.
              </>
            )}
          </p>
          {onOpenPlan ? (
            <div className="mt-2">
              <TextLink flush size="sm" onClick={onOpenPlan}>
                Open your plan
              </TextLink>
            </div>
          ) : null}
        </Card>
      )}

      <p className="mb-0 mt-4 text-[14.5px] leading-relaxed text-ink-mid">
        Tell us how much and you get three baskets to compare. Each one is the shelf filtered by a
        different rule, with your amount split equally across it.
      </p>

      <Card tint="white">
        <h2>How much</h2>
        <p className="mb-0 mt-1 text-[13px] text-ink-soft">
          A monthly SIP, a one-off amount, or both. At least one.
        </p>

        <AmountRow
          on={sipOn}
          onToggle={onSipOn}
          label="Monthly SIP"
          value={sip}
          onValue={onSip}
          hint={
            spare > 0
              ? `Minimum ${inr(floor)}. Your statements show ${inr(spare)} a month spare.`
              : `Minimum ${inr(floor)}. Your statements show nothing spare each month.`
          }
        />
        <AmountRow
          on={lumpOn}
          onToggle={onLumpOn}
          label="One-off amount"
          value={lump}
          onValue={onLump}
          hint={`Minimum ${inr(floor)}. You can reach ${inr(reachable)} in your savings today.`}
        />

        {shortSip || shortLump ? (
          <p role="alert" className="mb-0 mt-3 text-[13px] leading-snug text-danger">
            Below {inr(floor)} a basket can only hold one scheme, and one scheme is not a basket.
          </p>
        ) : null}
      </Card>

      <div className="mb-6 mt-1">
        <Button full disabled={!ready} onClick={onContinue}>
          Show me the baskets
        </Button>
        {ready ? null : (
          <p className="mb-0 mt-2.5 text-center text-[13px] text-ink-soft">
            {shortSip || shortLump
              ? `Raise the amount to at least ${inr(floor)}.`
              : 'Tick a box and type an amount to see the baskets.'}
          </p>
        )}
      </div>
    </Screen>
  )
}
