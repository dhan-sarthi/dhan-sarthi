/**
 * Family Members — one card per person, the reference's `family-wealth-members`.
 *
 * The card is theirs almost unchanged: an avatar disc, the name, a marker or a remove control on
 * the right, a hairline, and a 2×2 grid of figures. What changed and why:
 *
 * - **The fourth cell is not XIRR.** See `household.ts`; there is no price feed and no dated
 *   cashflow, so there is no money-weighted return to print. The monthly mandate goes there — the
 *   same block, a figure that exists.
 * - **`Market Value` is `Recorded value`.** Same reason, and the same wording the Dashboard's
 *   Holdings pane already uses, so the two screens agree about what the number is.
 * - **The remove icon is a `danger` IconButton, not a bare red glyph**, and it asks first. The
 *   reference shows a trash icon with no confirmation observed anywhere; unlinking a family
 *   member is not a thing to do on a mis-tap. It is also only on a demo member: you cannot
 *   remove yourself from your own household.
 * - **Two things the frames do not have** are here because the flow needs somewhere to start:
 *   the inbound-requests row and the `Add a member` button. `02-family-wealth-members.md` records
 *   that there is no visible add affordance on that screen in any frame and that the add screen
 *   is *not reachable from anything observed* — so this is a designed edge, not a copied one.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Trash2, UserPlus, Users } from 'lucide-react'
import { Sheet } from '../../components/Sheet.tsx'
import { Button, Card, IconButton, ListRow } from '../../components/ui.tsx'
import { inr } from '../../lib/money.ts'
import { Avatar, Figure, Gain, Marker, Metric, Nothing } from './parts.tsx'
import type { Household, LinkRequest, Member } from './household.ts'

export function Members({
  household,
  requests,
  onReview,
  onAdd,
  onRemove,
}: {
  household: Household
  requests: readonly LinkRequest[]
  onReview: () => void
  onAdd: () => void
  onRemove: (id: string) => void
}): ReactNode {
  const [confirm, setConfirm] = useState<Member | null>(null)

  return (
    <>
      {requests.length > 0 ? (
        <Card>
          <ListRow
            icon={<Users size={22} strokeWidth={1.9} />}
            title={requests.length === 1 ? 'Request received' : 'Requests received'}
            sub={
              requests.length === 1
                ? `${requests[0]?.name ?? ''} has asked to be linked`
                : `${String(requests.length)} people have asked to be linked`
            }
            badge={requests.length}
            onClick={onReview}
          />
        </Card>
      ) : null}

      {household.members.map((member) => (
        <MemberCard
          key={member.id}
          member={member}
          {...(member.self ? {} : { onRemove: () => setConfirm(member) })}
        />
      ))}

      <div className="mb-3">
        <Button tone="secondary" full onClick={onAdd}>
          <UserPlus size={16} strokeWidth={2.4} />
          Add a member
        </Button>
      </div>

      <Sheet
        title="Remove this member?"
        {...(confirm ? { sub: confirm.name } : {})}
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        footer={
          <div className="flex gap-2">
            <Button tone="quiet" full onClick={() => setConfirm(null)}>
              Keep them
            </Button>
            <Button
              tone="danger"
              full
              onClick={() => {
                if (confirm) onRemove(confirm.id)
                setConfirm(null)
              }}
            >
              Remove
            </Button>
          </div>
        }
      >
        <p className="m-0 text-[15px] leading-relaxed text-ink-mid">
          Their figures come out of the household total and you stop seeing what they hold. In a
          real household they would have to accept again to come back; here they are demo state, so
          nothing is sent and nothing is lost.
        </p>
      </Sheet>
    </>
  )
}

function MemberCard({ member, onRemove }: { member: Member; onRemove?: () => void }): ReactNode {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <Avatar name={member.name} real={member.real} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[17px] font-semibold text-ink">{member.name}</span>
            <Marker self={member.self} />
          </div>
          <div className="mt-0.5 text-[13px] leading-snug text-ink-soft">
            {member.self
              ? 'Computed from your statements'
              : `Demo member · ${String(member.holdings.length)} ${
                  member.holdings.length === 1 ? 'entry' : 'entries'
                }`}
          </div>
        </div>
        {onRemove ? (
          <IconButton label={`Remove ${member.name}`} tone="danger" size="sm" onClick={onRemove}>
            <Trash2 size={17} strokeWidth={2.1} />
          </IconButton>
        ) : null}
      </div>

      <div className="my-3.5 border-t border-solid border-hairline-mint" />

      {/* The reference's 2×2, with the monthly mandate where its XIRR was. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
        <Metric label="Recorded value">
          <Figure>{inr(member.value)}</Figure>
        </Metric>
        <Metric label="Invested">
          {member.invested === null ? (
            <Nothing>Not recorded</Nothing>
          ) : (
            <Figure>{inr(member.invested)}</Figure>
          )}
        </Metric>
        <Metric label="Gain">
          {member.gain === null ? (
            <Nothing>No cost recorded</Nothing>
          ) : (
            <Gain amount={member.gain} pct={member.gainPct} />
          )}
        </Metric>
        {/* Where the reference prints XIRR. There is no price feed and no dated cashflow behind a
            declared holding, so there is no money-weighted return to compute. */}
        <Metric label="Going in monthly">
          {member.sipMonthly > 0 ? (
            <Figure>{inr(member.sipMonthly)}</Figure>
          ) : (
            <Nothing>No mandate</Nothing>
          )}
        </Metric>
      </div>
    </Card>
  )
}
