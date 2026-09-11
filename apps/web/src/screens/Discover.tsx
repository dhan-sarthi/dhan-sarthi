/**
 * Discover — the shelf, and the way into a purchase.
 *
 * This was the tab's empty state, written while step 3 was still blocked: "Not built yet, and not
 * faked". Step 3 built it, so the card comes out and the route in goes here.
 *
 * The tab is still deliberately thin. Step 5 owns Discover proper — the category grid, the fund
 * lists, search, the filter chips — and the list below is the minimum the spine needs to be
 * reachable: the real shelf off `/view`, on the canonical `ListRow`. What it does not do is
 * invent the reference's row density; SmartWealth's fund rows carry a NAV, three returns and a
 * rating, and this app computes none of those.
 *
 * The one card that stays is the frame around it, because it is the difference between this
 * screen and the reference's: every order placed from here goes through
 * `packages/core/src/suitability.ts` first, and a refusal is a screen rather than a shrug.
 * `07-DECISIONS.md` §3 calls that a feature to surface rather than a check to hide, and the first
 * place to surface it is before anyone has picked anything.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { MessageSquareText } from 'lucide-react'
import type { ShelfProduct, Verdict, View } from '@dhan/contracts'
import { Screen } from '../components/Screen.tsx'
import { Button, Card, Head } from '../components/ui.tsx'
import { Invest } from './invest/Invest.tsx'
import { plannedIds } from './invest/planned.ts'
import { ShelfList } from './invest/ShelfList.tsx'

export function Discover({
  view,
  evaluate,
  onAsk,
  onSeeRecord,
}: {
  view: View
  /** The suitability gate, injected. See the header of `screens/invest/Invest.tsx`. */
  evaluate: (productId: string, monthly: number) => Promise<Verdict>
  onAsk: () => void
  onSeeRecord: () => void
}): ReactNode {
  /* The spine takes the screen once it opens, and holds the basket for as long as it is up.
     There is no cart on the server to hold it instead. */
  const [buying, setBuying] = useState<ShelfProduct | null>(null)

  if (buying) {
    return (
      <Invest
        view={view}
        initial={buying}
        evaluate={evaluate}
        onExit={() => setBuying(null)}
        onSeeRecord={onSeeRecord}
      />
    )
  }

  return (
    <Screen
      scrollHeader
      overlap
      header={<Head title="Discover" sub="What IDBI can put you into" overlap />}
    >
      <Card tint="sky">
        <h2>Checked before it is placed</h2>
        <p className="m-0 mt-1.5 text-sm leading-relaxed text-ink-mid">
          Anything you start here runs past the suitability rules first, against what your
          statements actually show — the debt, the buffer, the horizon, what you can spare each
          month. If a rule says no, you get the rule and the sentence it wrote, not a shrug. IDBI
          sells some of the products below that it will refuse to sell you.
        </p>
      </Card>

      <Card>
        <h2>Not sure where to start?</h2>
        <p className="m-0 mt-1.5 text-sm leading-relaxed text-ink-mid">
          Ask Uday to check any of the {view.shelf.length} products on the shelf against your
          position. Same rules, same record, no order to place at the end of it.
        </p>
        <div className="mt-4">
          <Button full tone="secondary" onClick={onAsk}>
            <MessageSquareText size={16} strokeWidth={2.4} />
            Check a product with Uday
          </Button>
        </div>
      </Card>

      <ShelfList shelf={view.shelf} planned={plannedIds(view.roadmap)} onPick={setBuying} />
    </Screen>
  )
}
