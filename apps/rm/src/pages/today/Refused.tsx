import type { AdviceItem } from '@dhan/contracts'
import { ruleLabel } from '@dhan/core'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { formatDate } from '../../lib/format.ts'
import { Card, CardHeader, EmptyState } from '../../ui/index.ts'

/**
 * "Uday refused": the latest products the rules turned down, and the sentence each customer
 * heard, word for word. Two columns per refusal, what and who on the left and the spoken words
 * on the right, so the card reads like a ledger rather than a feed. Nothing is shortened:
 * a refusal shown in part would be a refusal softened.
 */
export function Refused({ refusals }: { refusals: readonly AdviceItem[] }) {
  return (
    <Card padded={false}>
      <div className="px-5 pt-5">
        <CardHeader title="Uday refused" to="/record" actionLabel="All refusals" />
      </div>
      {refusals.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck />}
          title="No refusals yet"
          body="When Uday turns down a product for a customer, the rule and the words they heard appear here, with the record that proves it."
          className="pb-12"
        />
      ) : (
        <ul className="border-t border-hairline-soft">
          {refusals.map((r) => (
            <li
              key={r.id}
              className="grid grid-cols-1 gap-x-8 gap-y-2 border-b border-hairline-soft px-5 py-4 last:border-b-0 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]"
            >
              <div className="grid grid-cols-1 content-start gap-0.5">
                <p className="text-label font-semibold text-ink">
                  {r.productName ?? 'A product not on the shelf'}
                </p>
                <p className="text-caption text-ink-soft">
                  <Link
                    to={`/customers/${r.cif}`}
                    className="text-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    {r.name}
                  </Link>
                  <span className="text-ink-faint"> · {formatDate(r.at, { year: false })}</span>
                </p>
                {r.ruleId ? (
                  <p className="mt-1.5 inline-flex items-start gap-1.5 text-caption text-ink-soft">
                    <ShieldCheck aria-hidden className="mt-px size-3.5 shrink-0 text-brand" />
                    {ruleLabel(r.ruleId)}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-1 content-start gap-2">
                <blockquote className="text-body text-ink">
                  {r.spoken ? `“${r.spoken}”` : r.recorded}
                </blockquote>
                <Link
                  to={`/customers/${r.cif}/record`}
                  className="inline-flex w-fit items-center gap-0.5 rounded-sm text-caption text-ink-soft transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-focus"
                >
                  Open the record
                  <ArrowRight aria-hidden className="size-3.5" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
