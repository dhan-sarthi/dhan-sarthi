import { FileText } from 'lucide-react'
import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { useCustomer, useRecord, useVerifyRecord } from '../../api/queries.ts'
import { Card, EmptyState, ErrorState, LoadingRegion, Skeleton } from '../../ui/index.ts'
import { AdviceLedger, LedgerSkeleton } from '../record/AdviceLedger.tsx'
import { ChainCheck } from './record/ChainCheck.tsx'

const STACK = 'grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6'

/**
 * The customer's advice record: every verdict the rules gave, PASS and BLOCKED, with the
 * sentence the customer heard, the recorded wording and the hash; and "Verify chain", which runs
 * the server's real verification and says, chain by chain, whether every hash still holds.
 *
 * `?record=<id>` opens one record and brings it into view: the journey and the book's ledger
 * link here that way, so "see the exact wording" lands on the exact row.
 */
export function CustomerRecord() {
  const { cif = '' } = useParams()
  const [search] = useSearchParams()
  const focus = search.get('record')
  const record = useRecord(cif)
  // The layout has already read the file; this is the same cached answer, never a second open.
  const file = useCustomer(cif)
  const verify = useVerifyRecord(cif)

  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(focus ? [focus] : []))
  const [focused, setFocused] = useState<string | null>(focus)
  // A new `?record=` while the tab is open (the RM followed a second link) opens that one too.
  const [seenFocus, setSeenFocus] = useState(focus)
  if (focus !== seenFocus) {
    setSeenFocus(focus)
    if (focus) {
      setFocused(focus)
      setOpen((prev) => new Set(prev).add(focus))
    }
  }

  const name = firstNameOf(file.data?.profile.name) ?? 'this customer'

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function showRecord(id: string) {
    setFocused(id)
    setOpen((prev) => new Set(prev).add(id))
  }

  if (record.isError) {
    return (
      <Card>
        <ErrorState
          title={`${capitalise(possessiveOf(name))} advice record did not load`}
          error={record.error}
          onRetry={() => void record.refetch()}
          retrying={record.isFetching}
        />
      </Card>
    )
  }

  if (!record.data) {
    return (
      <LoadingRegion label="Loading the advice record" className={STACK}>
        <Card padded={false}>
          <div className="flex items-start justify-between gap-6 p-5">
            <div className="grid gap-2.5">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-3 w-72" />
            </div>
            <Skeleton className="h-9 w-36 rounded-md" />
          </div>
          <div className="rounded-b-lg border-t border-hairline-soft bg-footer-wash px-5 py-4">
            <Skeleton className="h-3 w-4/5" />
          </div>
        </Card>
        <LedgerSkeleton rows={4} />
      </LoadingRegion>
    )
  }

  const { records, chains } = record.data

  if (records.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<FileText />}
          title={`Nothing on ${possessiveOf(name)} advice record yet`}
          body={`When Uday checks a product for ${name}, in the app, in chat or on a call, the verdict lands here with the exact words ${name} heard, chained to the record before it.`}
          className="text-pretty"
        />
      </Card>
    )
  }

  const broken = new Set(
    (verify.data?.chains ?? []).flatMap((c) => (c.brokenAt ? [c.brokenAt] : [])),
  )

  return (
    <div className={STACK}>
      <ChainCheck
        name={name}
        records={records}
        chains={chains}
        verification={verify.data}
        pending={verify.isPending}
        error={verify.isError ? verify.error : null}
        onVerify={() => verify.mutate()}
        onShowRecord={showRecord}
      />
      <AdviceLedger
        items={records}
        variant="customer"
        caption={`Every verdict on ${possessiveOf(name)} advice record, newest first`}
        openIds={open}
        onToggle={toggle}
        broken={broken}
        focusId={focused}
      />
    </div>
  )
}

/** The RM speaks of a customer by first name, as on a call. */
function firstNameOf(full: string | undefined): string | null {
  if (!full) return null
  return full.trim().split(/\s+/)[0] ?? full
}

function possessiveOf(name: string): string {
  return `${name}’s`
}

/** For a sentence that starts with the name, which may be the "this customer" fallback. */
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
