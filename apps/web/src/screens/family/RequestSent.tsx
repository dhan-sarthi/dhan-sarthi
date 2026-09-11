/**
 * Request sent — `05-family-request-sent`, and the screen where this feature's consent model is
 * actually written down.
 *
 * Two rules, and both are kept because they are the whole argument for the flow being a flow
 * rather than a switch:
 *
 * 1. **Nothing links until the other person accepts.** The requester cannot self-serve.
 * 2. **A declined request has a five-day cooldown**, and the app prints the date it lifts.
 *
 * The date is computed off `asOf` — the *simulated* clock — rather than off `Date.now()`. That is
 * the difference between a cooldown and a sentence about one: advance the clock a week on the
 * Dashboard and the date this screen printed is in the past, which is the only way a reviewer can
 * see the rule work.
 *
 * Three things from the frame are not reproduced.
 *
 * - **The typo.** It reads `You request has been sent successfully`. It is `Your`.
 * - **The confetti success mark.** This app has an illustration system and a ring of scattered
 *   multi-coloured ticks is not in it; `family-invite` carries the same beat in the set's own
 *   language, and it says something the tick cannot — the link is *offered*, not made. The arc in
 *   it ends in an open ring short of the second house for exactly that reason.
 * - **The line-art mock of the recipient's phone.** It is an explainer of a screen this app also
 *   builds, and drawing a picture of our own UI would be a second thing to keep in sync with the
 *   real one. The sentence under the mark does that job in words.
 *
 * A terminal screen: no app bar, no back arrow, dismissed only by its button — which is what the
 * frame shows and is right, because there is nothing to go back to that has not already happened.
 */
import type { ReactNode } from 'react'
import { Art } from '../../components/Art.tsx'
import { Screen } from '../../components/Screen.tsx'
import { Button, Card } from '../../components/ui.tsx'
import { longDate } from '../../lib/money.ts'
import { addDays, COOLDOWN_DAYS, maskCustomerId } from './household.ts'

export function RequestSent({
  customerId,
  asOf,
  onDone,
}: {
  /** What was actually typed on the previous screen. Masked here, so the two screens agree. */
  customerId: string
  /** The simulated clock. The cooldown date is computed from it. */
  asOf: string
  onDone: () => void
}): ReactNode {
  const until = addDays(asOf, COOLDOWN_DAYS)
  return (
    <Screen
      header={null}
      footer={
        <Button full onClick={onDone}>
          Okay
        </Button>
      }
    >
      <div className="flex flex-col items-center pt-8 text-center">
        <Art name="family-invite" size="lg" />
        <h1 className="m-0 mt-5 text-[24px] font-semibold leading-tight text-ink">
          Your request has been sent successfully
        </h1>
        <p className="mb-0 mt-2.5 text-[15px] leading-relaxed text-ink-soft">
          Your request has been sent successfully for Customer ID {maskCustomerId(customerId)}.
          Please ask the family member to accept the same.
        </p>
      </div>

      {/* The reference's pale-blue info box, on the tint the palette map sends it to. Bold, because
          this is the rule and not a footnote. */}
      <div className="mt-6">
        <Card tint="sage">
          <p className="m-0 text-[14px] font-semibold leading-relaxed text-brand-deep">
            If the family member declines your request, you can request again after five days (
            {longDate(until)}).
          </p>
        </Card>
      </div>

      <p className="mb-4 mt-0 text-[13px] leading-relaxed text-ink-soft">
        Nothing left the app. There is no household in IDBI&rsquo;s records, so the request, the
        five-day rule and the member you would link are all part of the demonstration — the date
        above is five days on from the simulated clock, and it moves when you move it.
      </p>
    </Screen>
  )
}
