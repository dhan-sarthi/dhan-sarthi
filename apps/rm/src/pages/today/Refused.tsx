import type { AdviceItem } from '@dhan/contracts'
import { ruleLabel } from '@dhan/core'
import { ShieldCheck } from 'lucide-react'
import { Fragment, useMemo } from 'react'
import { Link } from 'react-router'
import { useRefusals } from '../../api/queries.ts'
import { formatCount, formatMonth } from '../../lib/format.ts'
import { Card, CardHeader, EmptyState, Skeleton } from '../../ui/index.ts'
import { groupRefusals, rangeLabel, type RefusalGroup } from './derive.ts'

/** The latest few, not a feed: the Record page holds every one of them. */
const SHOWN = 3

/**
 * "Uday refused": how many sales the rules have stopped across the book (the Record page's
 * "Mis-sales prevented", the same count), then the latest three, each with the sentence the
 * customer heard.
 *
 * The count is the card's claim, so it leads. It comes from the Record page's own read
 * (`useRefusals`, cached for the click through), so Today's figure and the Record's can never
 * disagree; if that read fails, the card still shows the latest refusals from Today's own reply
 * and simply leaves the count out.
 *
 * A refusal said word for word to more than one customer is one row with both names. Quotes are
 * held to two lines to keep the card a summary; the whole sentence is the row's hover title, read
 * in full by a screen reader, and one click away on the Record.
 */
export function Refused({ refusals }: { refusals: readonly AdviceItem[] }) {
  const all = useRefusals()
  const groups = useMemo(() => groupRefusals(refusals, SHOWN), [refusals])
  const total = all.data?.total ?? null
  const oldest = all.data?.items.at(-1)?.at ?? null

  return (
    <Card>
      <CardHeader
        title="Uday refused"
        to="/record"
        actionLabel={total !== null && total > 0 ? `See all ${formatCount(total)}` : 'All refusals'}
        className="mb-3"
      />
      {refusals.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck />}
          title="No refusals yet"
          body="When Uday turns down a product for a customer, the rule and the words they heard appear here, with the record that proves it."
        />
      ) : (
        <>
          {total !== null && total > 0 ? (
            <p className="mb-3 flex items-baseline gap-2">
              <span className="text-display text-ink tabular">{formatCount(total)}</span>
              <span className="text-label-plain text-ink-soft">
                {total === 1 ? 'mis-sale' : 'mis-sales'} prevented
                {oldest ? ` since ${formatMonth(oldest)}` : ''}
              </span>
            </p>
          ) : all.isPending ? (
            <Skeleton className="mb-3 h-8 w-48" />
          ) : null}
          <ul className="-mx-5 -mb-2 border-t border-hairline-soft">
            {groups.map((group) => (
              <RefusalRow key={group.id} group={group} />
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

function RefusalRow({ group }: { group: RefusalGroup }) {
  const words = group.spoken ? `“${group.words}”` : group.words
  return (
    <li className="grid grid-cols-1 gap-1 border-b border-hairline-soft px-5 py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-label font-semibold text-ink">
          {group.productName ?? 'A product not on the shelf'}
        </p>
        <span className="shrink-0 text-caption text-ink-faint tabular">
          {rangeLabel(group.from, group.to)}
        </span>
      </div>
      <p className="text-caption text-ink-soft">
        {group.people.map((person, i) => (
          <Fragment key={person.cif}>
            {i > 0 ? ', ' : null}
            <Link
              to={`/customers/${person.cif}/record`}
              className="text-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
            >
              {person.name}
            </Link>
          </Fragment>
        ))}
      </p>
      <blockquote title={words} className="line-clamp-2 text-label-plain text-ink">
        {words}
      </blockquote>
      {group.ruleId ? (
        <p className="inline-flex items-start gap-1.5 text-caption text-ink-soft">
          <ShieldCheck aria-hidden className="mt-px size-3.5 shrink-0 text-brand" />
          {ruleLabel(group.ruleId)}
        </p>
      ) : null}
    </li>
  )
}
