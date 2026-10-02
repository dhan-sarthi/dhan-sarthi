import type { AdviceItem, RmCustomerVerification } from '@dhan/contracts'
import { CircleAlert, ShieldCheck } from 'lucide-react'
import { cn } from '../../../lib/cn.ts'
import { formatCount, formatDate } from '../../../lib/format.ts'
import { Button, Card, VerifiedBadge, describeError } from '../../../ui/index.ts'
import { clockTime, verdictSplit } from '../../record/advice.ts'
import { IntactSummary } from '../../record/Intact.tsx'

/*
 * The head of a customer's advice record: how many verdicts there are, how they split, and the
 * "Verify chain" that runs the real verification. One figure leads; the split and the chain
 * count sit under it in the quiet ink.
 *
 * Until the check has run in this view the badge says "Not checked yet": green is only ever
 * earned by the server walking the chain, never assumed because nothing has complained. A clean
 * result fills the band under the head in the brand, as the book's strip does.
 *
 * The split uses the verdict words every page uses: a refusal is "refused", on the brand's dot,
 * because the rules refusing a product is the record working, not something gone wrong.
 */
export function ChainCheck({
  name,
  records,
  chains,
  verification,
  pending,
  error,
  onVerify,
  onShowRecord,
}: {
  /** First name, for the copy. */
  name: string
  records: readonly AdviceItem[]
  chains: number
  verification: RmCustomerVerification | undefined
  pending: boolean
  error: unknown
  onVerify: () => void
  /** Open and scroll to a record: where a broken chain breaks. */
  onShowRecord: (id: string) => void
}) {
  const { refused, passed, other } = verdictSplit(records)
  const status = verification ? (verification.valid ? 'verified' : 'broken') : 'unchecked'

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 p-5">
        <div className="min-w-0">
          <div className="flex items-baseline gap-3">
            <p className="text-display text-ink tabular">{formatCount(records.length)}</p>
            <p className="text-heading text-ink">
              verdict{records.length === 1 ? '' : 's'} on {name}’s record
            </p>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-label font-normal text-ink-soft">
            <Split dot="bg-brand" label="refused" value={refused} />
            <span aria-hidden className="text-ink-hint">
              ·
            </span>
            <Split dot="bg-ink-hint" label="passed" value={passed} />
            {other > 0 ? (
              <>
                <span aria-hidden className="text-ink-hint">
                  ·
                </span>
                <Split dot="bg-hairline" label="not on the shelf" value={other} />
              </>
            ) : null}
            <span className="text-ink-faint">
              in <span className="tabular">{chains}</span> hash chain{chains === 1 ? '' : 's'}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <VerifiedBadge
            status={status}
            {...(verification
              ? { records: verification.checked, checkedAt: verification.checkedAt }
              : {})}
          />
          <Button
            variant={verification ? 'secondary' : 'primary'}
            icon={<ShieldCheck aria-hidden />}
            loading={pending}
            onClick={onVerify}
          >
            {pending ? 'Verifying' : verification || error ? 'Verify again' : 'Verify chain'}
          </Button>
        </div>
      </div>

      <div
        role="status"
        aria-live="polite"
        className={cn(
          'rounded-b-lg border-t px-5 py-3.5',
          status === 'verified' && !pending && 'border-brand-deep bg-brand text-on-brand',
          status === 'broken' && !pending && 'border-danger/20 bg-danger-soft/60',
          (status === 'unchecked' || pending) && 'border-hairline-soft bg-canvas-top/60',
        )}
      >
        {pending ? (
          <p className="text-label font-normal text-ink-soft">
            Recomputing every hash in {name}’s {chains === 1 ? 'chain' : `${chains} chains`}…
          </p>
        ) : error ? (
          <p className="flex items-start gap-2 text-label font-normal text-danger">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>The check did not run. {describeError(error)}</span>
          </p>
        ) : verification ? (
          <ChainResults
            name={name}
            verification={verification}
            records={records}
            onShowRecord={onShowRecord}
          />
        ) : (
          <p className="max-w-[72ch] text-label font-normal text-ink-soft">
            Each record carries the hash of the one before it, so changing one word anywhere breaks
            every hash after it. Verifying recomputes them all on the server.
          </p>
        )}
      </div>
    </Card>
  )
}

function Split({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn('size-1.5 rounded-full', dot)} />
      <span className="text-ink tabular">{formatCount(value)}</span> {label}
    </span>
  )
}

function ChainResults({
  name,
  verification,
  records,
  onShowRecord,
}: {
  name: string
  verification: RmCustomerVerification
  records: readonly AdviceItem[]
  onShowRecord: (id: string) => void
}) {
  if (verification.valid) {
    return (
      <div className="grid gap-3">
        <IntactSummary
          checked={verification.checked}
          checkedAt={verification.checkedAt}
          scope={`on ${name}’s record`}
        />
        {/* One chain says the same as the line above; several get a line each. */}
        {verification.chains.length > 1 ? (
          <ul className="grid gap-1 border-t border-on-brand/20 pt-2.5">
            {verification.chains.map((chain, i) => (
              <li
                key={chain.chainId}
                className="flex min-w-0 items-center gap-2 text-label font-normal text-on-brand/85"
              >
                <ShieldCheck aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate">
                  <span className="text-on-brand">Chain {i + 1}</span>{' '}
                  <code className="font-mono text-caption">{chain.chainId.slice(0, 8)}</code> ·{' '}
                  <span className="tabular">{formatCount(chain.records)}</span> record
                  {chain.records === 1 ? '' : 's'}, intact
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    )
  }

  const byId = new Map(records.map((r) => [r.id, r]))
  return (
    <div className="grid gap-2">
      <p className="text-label font-normal text-danger">
        A record was changed after it was written.{' '}
        <span className="tabular">{formatCount(verification.checked)}</span> checked at{' '}
        <span className="tabular">{clockTime(verification.checkedAt)}</span>.
      </p>
      <ul className="grid gap-1.5">
        {verification.chains.map((chain, i) => {
          const at = chain.brokenAt ? byId.get(chain.brokenAt) : undefined
          return (
            <li
              key={chain.chainId}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-label"
            >
              <span className="min-w-0 truncate font-normal text-ink-soft">
                <span className="text-ink">Chain {i + 1}</span>{' '}
                <code className="font-mono text-caption text-ink-faint">
                  {chain.chainId.slice(0, 8)}
                </code>{' '}
                · <span className="tabular">{formatCount(chain.records)}</span> record
                {chain.records === 1 ? '' : 's'}
                {chain.brokenAt ? (
                  <>
                    {' '}
                    ·{' '}
                    <button
                      type="button"
                      onClick={() => onShowRecord(chain.brokenAt ?? '')}
                      className="rounded-sm text-danger underline underline-offset-3 focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      breaks at{' '}
                      {at
                        ? `the ${formatDate(at.at)} record`
                        : `record ${chain.brokenAt.slice(0, 8)}`}
                    </button>
                  </>
                ) : null}
              </span>
              {verification.chains.length > 1 ? (
                <VerifiedBadge
                  status={chain.valid ? 'verified' : 'broken'}
                  records={chain.records}
                  checkedAt={verification.checkedAt}
                />
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
