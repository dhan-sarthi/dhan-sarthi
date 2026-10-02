import type { RmBookVerification } from '@dhan/contracts'
import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { Link } from 'react-router'
import type { useVerifyBook } from '../../api/queries.ts'
import { cn } from '../../lib/cn.ts'
import { formatCount } from '../../lib/format.ts'
import { Button, Skeleton, describeError } from '../../ui/index.ts'
import { clockTime } from './advice.ts'

/*
 * The book's "Verify every chain": the action and its result in one place, along the foot of the
 * headline card, so the claim above it and the proof of it sit together.
 *
 * Nothing is green until the real verification has run in this view. Before that the strip says
 * the chains are unchecked; after it, it says exactly how many records were walked and when,
 * and a broken chain names the customer and the record it breaks at.
 */
export function VerifyBookStrip({
  verify,
  names,
}: {
  /** Owned by the page, so the ledger below can mark the record a broken chain breaks at. */
  verify: ReturnType<typeof useVerifyBook>
  names: ReadonlyMap<string, string>
}) {
  const result = verify.data

  const tone = verify.isPending
    ? 'idle'
    : verify.isError
      ? 'error'
      : result
        ? result.valid
          ? 'valid'
          : 'broken'
        : 'idle'

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-6 gap-y-3 rounded-b-lg border-t px-6 py-4 transition-colors duration-300',
        tone === 'valid' && 'border-brand/15 bg-brand-wash',
        tone === 'broken' && 'border-danger/20 bg-danger-soft/60',
        tone === 'error' && 'border-hairline-soft bg-canvas-top',
        tone === 'idle' && 'border-hairline-soft bg-canvas-top',
      )}
    >
      <div role="status" aria-live="polite" className="flex min-w-0 flex-1 items-start gap-3.5">
        <StatusIcon tone={tone} />
        <div className="min-w-0 flex-1">
          {verify.isPending ? (
            <>
              <p className="text-heading text-ink">Walking every chain in your book…</p>
              <Skeleton className="mt-2.5 h-1 w-full max-w-md rounded-full" />
            </>
          ) : verify.isError ? (
            <>
              <p className="text-heading text-ink">The check did not run</p>
              <p className="mt-0.5 text-label font-normal text-ink-soft">
                {describeError(verify.error)}
              </p>
            </>
          ) : result ? (
            <Outcome result={result} names={names} />
          ) : (
            <>
              <p className="text-heading text-ink">Not checked in this view yet</p>
              <p className="mt-0.5 max-w-[68ch] text-label font-normal text-pretty text-ink-soft">
                Each advice record carries the hash of the one before it. Verifying recomputes every
                hash in your book, so one changed word anywhere would show here.
              </p>
            </>
          )}
        </div>
      </div>
      <Button
        variant={result && !verify.isError ? 'secondary' : 'primary'}
        icon={<ShieldCheck aria-hidden />}
        loading={verify.isPending}
        onClick={() => verify.mutate()}
      >
        {verify.isPending
          ? 'Verifying'
          : verify.isError
            ? 'Try again'
            : result
              ? 'Verify again'
              : 'Verify every chain'}
      </Button>
    </div>
  )
}

function StatusIcon({ tone }: { tone: 'idle' | 'valid' | 'broken' | 'error' }) {
  const Icon = tone === 'valid' ? ShieldCheck : tone === 'idle' ? ShieldQuestion : ShieldAlert
  return (
    <span
      aria-hidden
      className={cn(
        'mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-4.5',
        tone === 'valid' && 'bg-brand text-on-brand',
        tone === 'broken' && 'bg-danger text-on-brand',
        tone === 'error' && 'bg-danger-soft text-danger',
        tone === 'idle' && 'border border-hairline bg-surface text-ink-soft',
      )}
    >
      <Icon />
    </span>
  )
}

function Outcome({
  result,
  names,
}: {
  result: RmBookVerification
  names: ReadonlyMap<string, string>
}) {
  const records = `${formatCount(result.checked)} record${result.checked === 1 ? '' : 's'}`
  if (result.valid) {
    return (
      <>
        <p className="text-heading text-ink">Every chain in your book verifies</p>
        <p className="mt-0.5 max-w-[72ch] text-label font-normal text-pretty text-ink-soft">
          All <span className="tabular">{records}</span> recomputed to the hashes they were written
          with, at <span className="tabular">{clockTime(result.checkedAt)}</span>. Not one word has
          changed since it was recorded.
        </p>
      </>
    )
  }
  const count = result.broken.length
  return (
    <>
      <p className="text-heading text-danger">
        {count} chain{count === 1 ? '' : 's'} did not verify
      </p>
      <p className="mt-0.5 max-w-[72ch] text-label font-normal text-pretty text-ink-soft">
        A record was changed after it was written. <span className="tabular">{records}</span>{' '}
        checked at <span className="tabular">{clockTime(result.checkedAt)}</span>; each chain below
        breaks at the first record that no longer matches its hash.
      </p>
      <ul className="mt-2 grid gap-1">
        {result.broken.map((b) => (
          <li key={`${b.chainId}-${b.brokenAt}`} className="text-label">
            <Link
              to={`/customers/${encodeURIComponent(b.cif)}/record?record=${encodeURIComponent(b.brokenAt)}`}
              className="rounded-sm text-danger underline-offset-3 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
            >
              {names.get(b.cif) ?? b.cif}
            </Link>
            <span className="font-normal text-ink-soft">
              {' '}
              breaks at record <code className="font-mono tabular">{b.brokenAt.slice(0, 8)}</code>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
