/**
 * Request received — the recipient's half, `06-family-requests-received`.
 *
 * This is the consent gate for the whole feature: nothing is linked until somebody taps `Accept`,
 * and `Decline` is what starts the five-day cooldown the request-sent screen promises. The frame
 * is a zoom-in with its chrome cropped out, so the spec records that whether this is a screen, a
 * sheet or a section of Family Wealth is **not observable**. It is a screen here, reached from a
 * counted row at the top of the members list — a consent decision should have a page of its own
 * and a title, not be something you scroll past.
 *
 * The button pair is the frame's, in this app's shapes: `Decline` is the outlined secondary and
 * `Accept` is the filled primary, side by side at equal width. The frame draws them at roughly
 * 40/45 with a gutter; equal halves is the same idea without the rounding error, and it keeps the
 * pair from reading as though one answer were nudged at you.
 *
 * What the reference never shows — its spec lists the post-accept and post-decline states under
 * NOT observed — is what happens after the tap. Both are designed here rather than left as a row
 * that vanishes: an accepted request says the member is in the household, a declined one prints
 * the date the requester may ask again, which is the only place in the flow that rule is visible
 * from the *receiving* side.
 */
import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'
import { Screen } from '../../components/Screen.tsx'
import { StatusBand } from '../../components/StatusBand.tsx'
import { Button, Head } from '../../components/ui.tsx'
import { longDate } from '../../lib/money.ts'
import { Avatar, Marker } from './parts.tsx'
import { addDays, COOLDOWN_DAYS } from './household.ts'
import type { LinkRequest } from './household.ts'

/** What was done with a request, once it has been answered. */
export type Answer = 'accepted' | 'declined'

export function RequestsReceived({
  requests,
  answered,
  asOf,
  onBack,
  onAnswer,
}: {
  /** Everything still to answer. */
  requests: readonly LinkRequest[]
  /** What was answered on this visit, so the outcome stays on screen instead of the row vanishing. */
  answered: readonly { request: LinkRequest; answer: Answer }[]
  asOf: string
  onBack: () => void
  onAnswer: (request: LinkRequest, answer: Answer) => void
}): ReactNode {
  const until = addDays(asOf, COOLDOWN_DAYS)
  const empty = requests.length === 0 && answered.length === 0

  return (
    <Screen
      header={
        <Head
          onBack={onBack}
          backLabel="Back to Family Wealth"
          title="Request received"
          sub={
            requests.length === 0
              ? 'Nothing waiting on you'
              : `${String(requests.length)} waiting on you`
          }
        />
      }
    >
      <div className="mb-4 mt-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-accent-text">
          Demo requests
        </div>
        <p className="m-0 mt-1 text-[13px] leading-relaxed text-ink-soft">
          The people asking are demo people. Answering one changes what this app shows you and
          nothing else — nobody is notified, because there is no household in IDBI&rsquo;s records
          to join.
        </p>
      </div>

      {empty ? (
        <div className="flex flex-col items-center py-10 text-center">
          <span
            aria-hidden="true"
            className="grid size-14 place-items-center rounded-pill bg-legend-chip text-brand-deep"
          >
            <Inbox size={26} strokeWidth={1.9} />
          </span>
          <h2 className="m-0 mt-3.5 text-[18px] font-semibold text-ink">Nothing to answer</h2>
          <p className="mb-0 mt-1.5 text-[15px] leading-relaxed text-ink-soft">
            When someone asks to link their accounts to yours, it waits here until you say yes or
            no. Until you do, they see nothing of what you hold.
          </p>
        </div>
      ) : null}

      <div className="divide-y divide-solid divide-hairline-mint">
        {requests.map((request) => (
          <div key={request.id} className="py-4">
            <div className="flex items-center gap-3">
              <Avatar name={request.name} real={false} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[17px] font-medium text-ink">{request.name}</span>
                  <Marker self={false} />
                </div>
                <div className="mt-0.5 text-[13px] text-ink-soft">
                  Customer ID {request.customerId}
                </div>
              </div>
            </div>
            <div className="mt-3.5 flex gap-3">
              <Button tone="secondary" full onClick={() => onAnswer(request, 'declined')}>
                Decline
              </Button>
              <Button full onClick={() => onAnswer(request, 'accepted')}>
                Accept
              </Button>
            </div>
          </div>
        ))}
      </div>

      {answered.map(({ request, answer }) => (
        <section
          key={request.id}
          className="mb-3 overflow-hidden rounded-md border border-solid border-hairline-mint bg-surface"
        >
          <div className="flex items-center gap-3 p-4">
            <Avatar name={request.name} real={false} size="sm" />
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
              {request.name}
            </span>
          </div>
          {answer === 'accepted' ? (
            <StatusBand flush tone="good" label="Accepted">
              — {request.name} is in the household now, and what they hold is on the Overall
              Holdings tab.
            </StatusBand>
          ) : (
            <StatusBand flush tone="quiet" label="Declined">
              — nothing was linked. They can ask again from {longDate(until)}.
            </StatusBand>
          )}
        </section>
      ))}
    </Screen>
  )
}
