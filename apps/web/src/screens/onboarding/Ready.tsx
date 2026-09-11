/**
 * Step 3 — the success beat.
 *
 * `07-onboarding-success` is the loudest screen in the reference and the only one that is pure
 * celebration: confetti across the top two thirds, a 130px green check at about a third of the
 * way down, a card carrying two centred lines, and Continue pinned at the bottom. Ours was a
 * 64px sparkle disc with a soft halo behind it, a headline, and a button floating in the middle
 * of 400px of white. Same information, a tenth of the volume.
 *
 * Three changes, all off that frame. The mark is an illustration rather than a lucide glyph and
 * it is drawn at 128px — `onboarding-ready`, generated into the same set as the other nine, a
 * green rosette with a white check and a scatter of confetti in the one gold accent. It sits in
 * a full-bleed tinted band with the headline, so the top of the screen is a surface rather than
 * white space. And the action is pinned.
 *
 * What is *not* here: the reference's "Assisted by someone from HDFC?" toggle, which attributes
 * the sale to a staff member. There is no staff attribution in this product and no field to put
 * one in, so there is no toggle.
 *
 * The overlapping card is also absent, deliberately. The reference's card overlaps its confetti
 * area and reads because it is white on white-with-confetti; ours would be a white card over
 * `tint-sage`, which is 1.06:1 and the exact failure `DESIGN.md` records under the header slab.
 * The alternative — a `brand-deep` band — would swallow a mark drawn in the dark end of the
 * ladder. So the band carries the headline instead, and the receipt sits below it on white.
 */
import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Art } from '../../components/Art.tsx'
import { Button } from '../../components/ui.tsx'
import { inr } from '../../lib/money.ts'
import { Band, Detail, DetailGrid, Funnel } from './Chrome.tsx'
import type { Facts } from './facts.ts'

export function Ready({
  first,
  facts,
  onDone,
}: {
  first: string | null
  facts: Facts
  onDone: () => void
}): ReactNode {
  return (
    <Funnel
      at="Ready"
      fill={1}
      action={
        <Button full onClick={onDone}>
          Show me
          <ArrowRight size={17} strokeWidth={2.6} />
        </Button>
      }
    >
      <div className="-mx-4 -mt-5 flex flex-col items-center bg-tint-sage px-6 pb-7 pt-7 text-center">
        <Art name="onboarding-ready" size="md" />
        <h1 className="m-0 mt-3 text-[26px] font-semibold leading-tight text-ink">
          {first === null ? 'That is everything' : `That is everything, ${first}`}
        </h1>
        <p className="m-0 mt-2 max-w-[32ch] text-[14.5px] leading-normal text-ink-mid">
          One thing to do today, and the reasoning behind it. Nothing next is written by hand.
        </p>
      </div>

      {/* The same bands and the same grid as the file card on step 1, on purpose: the funnel
          opens by showing what IDBI sent and closes by showing what the plan was built from. */}
      <Band>Built from</Band>
      <DetailGrid>
        <Detail
          label="Accounts"
          value={`${facts.accounts} ${facts.accounts === 1 ? 'account' : 'accounts'}`}
        />
        <Detail label="In the bank" value={inr(facts.balance)} />
        <Detail label="Statement lines" value={`${facts.lines}${facts.more ? '+' : ''}`} />
        {facts.debt > 0 ? (
          <Detail
            label="Borrowing"
            /* The instalment only where the bank reported one. Neha's loans come back with no
               monthly outgo at all, and "₹0 a month" is a claim rather than a gap. */
            value={
              facts.outgo > 0 ? `${inr(facts.debt)} · ${inr(facts.outgo)}/mo` : inr(facts.debt)
            }
          />
        ) : null}
        {facts.holdings > 0 ? (
          <Detail
            label="You told me you own"
            value={`${facts.holdings} ${facts.holdings === 1 ? 'thing' : 'things'}`}
          />
        ) : null}
      </DetailGrid>
    </Funnel>
  )
}
