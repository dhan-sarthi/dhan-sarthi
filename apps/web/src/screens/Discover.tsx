/**
 * Discover — the tab that is a promise, and says so.
 *
 * `07-DECISIONS.md` puts it in the bar because that is where the transaction spine lands:
 * `add-scheme-invest → cart-review → verify-otp → order success`, behind
 * `packages/core/src/suitability.ts`. None of that exists yet — the API has no cart, no order, no
 * OTP, no folio and no mandate — and the decision that ships it is step 3, not this one.
 *
 * So this is the tab's empty state rather than a sketch of the tab. It exists because a tab that
 * renders nothing is broken chrome, and it is written the way the rest of the app writes a state
 * it cannot fill: say what is missing, say what you *can* do instead, and do not draw a screen
 * that implies a backend. The one route to the shelf that is real today is the advisor's product
 * check, which runs the gate for real and writes the same advice record — so that is the button.
 *
 * It is also the only screen taking `Screen`'s overlap affordance, which is deliberate: the
 * SmartWealth trick of a card starting up inside the app bar needs somewhere to be exercised,
 * and the one surface here with no existing look to preserve is the right place for it.
 */
import type { ReactNode } from 'react'
import { MessageSquareText } from 'lucide-react'
import { Screen } from '../components/Screen.tsx'
import { Button, Card, Head } from '../components/ui.tsx'

export function Discover({
  shelfSize,
  onAsk,
}: {
  /** Products on the shelf. Real, and today reachable only through the advisor. */
  shelfSize: number
  onAsk: () => void
}): ReactNode {
  return (
    <Screen
      scrollHeader
      overlap
      header={<Head title="Discover" sub="Funds, and the way into one" overlap />}
    >
      <Card tint="sky">
        <h2>Not built yet, and not faked</h2>
        <p className="m-0 mt-1.5 text-sm leading-relaxed text-ink-mid">
          This is where the shelf and the route into a purchase go — a category grid, fund lists,
          then cart, OTP and order. The advisor engine behind this app records what you decided; it
          cannot yet place the order for you, so there is nothing here that would only look like it
          could.
        </p>
      </Card>

      <Card>
        <h2>What you can do today</h2>
        <p className="m-0 mt-1.5 text-sm leading-relaxed text-ink-mid">
          Ask Uday to check any of the {shelfSize} products on the shelf. That runs the real
          suitability rules against your position, tells you which rule answered and why, and writes
          the same advice record as every other recommendation — including when the answer is no.
        </p>
        <div className="mt-4">
          <Button full onClick={onAsk}>
            <MessageSquareText size={16} strokeWidth={2.4} />
            Check a product with Uday
          </Button>
        </div>
      </Card>
    </Screen>
  )
}
