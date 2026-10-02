import { FileQuestion, Lock } from 'lucide-react'
import { useState } from 'react'
import { Link, Outlet } from 'react-router'
import { isApiError } from '../../api/client.ts'
import { CopilotPanel } from '../../features/copilot/index.tsx'
import { Button, EmptyState, ErrorState, LinkTabs, LoadingRegion } from '../../ui/index.ts'
import { firstName, useCustomerFile, type FileContext } from './customer-file.ts'
import { CustomerHeader, HeaderSkeleton, Highlights } from './CustomerHeader.tsx'
import { NoteDialog, type NoteKind } from './NoteDialog.tsx'
import { useOpenRequest } from './open-request.ts'
import { ProfileRail, RailSkeleton } from './ProfileRail.tsx'

/**
 * A customer's file: header, highlights, the tabs, and the profile rail beside every tab. The tabs
 * are addresses (`/customers/:cif/journey`), so a view can be bookmarked or sent to a colleague,
 * and the browser's back button walks them.
 *
 * The file is read once, here; each tab reads the same cached answer. While it loads the tabs
 * still render, so a tab with its own data (the journey, the record) is not held up by this one.
 */
export function Customer() {
  const { cif, query } = useCustomerFile()
  const [note, setNote] = useState<NoteKind | null>(null)
  const request = useOpenRequest(cif, query.data?.asOf)
  const base = `/customers/${encodeURIComponent(cif)}`
  const context: FileContext = { request, logCall: () => setNote('call') }

  if (query.isError)
    return (
      <FileError
        cif={cif}
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    )

  const customer = query.data
  const tabs = (
    <LinkTabs
      label="Customer file"
      className="mb-4"
      tabs={[
        { to: base, label: 'Overview', end: true },
        { to: `${base}/journey`, label: 'Journey' },
        { to: `${base}/money`, label: 'Money' },
        { to: `${base}/goals`, label: 'Goals & plan' },
        { to: `${base}/record`, label: 'Advice record' },
      ]}
    />
  )

  return (
    <>
      {customer ? (
        <>
          <CustomerHeader
            customer={customer}
            onLogCall={() => setNote('call')}
            onAddNote={() => setNote('note')}
          />
          <Highlights customer={customer} />
        </>
      ) : (
        <LoadingRegion label="Loading the customer">
          <HeaderSkeleton />
        </LoadingRegion>
      )}
      {tabs}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18.75rem] min-[87.5rem]:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <Outlet context={context} />
        </div>
        {customer ? <ProfileRail customer={customer} /> : <RailSkeleton />}
      </div>
      {customer ? (
        <>
          <NoteDialog
            cif={customer.profile.cif}
            name={firstName(customer.profile.name)}
            gender={customer.profile.gender}
            asOf={customer.asOf}
            request={request}
            kind={note}
            onKindChange={setNote}
            onClose={() => setNote(null)}
          />
          <CopilotPanel cif={customer.profile.cif} />
        </>
      ) : null}
    </>
  )
}

/**
 * Three ways a file fails to open, each said differently: not this RM's customer (the book is the
 * boundary, and the API says so with a 403), no such customer, or the server did not answer.
 */
function FileError({
  cif,
  error,
  onRetry,
  retrying,
}: {
  cif: string
  error: unknown
  onRetry: () => void
  retrying: boolean
}) {
  const back = (
    <Button asChild variant="primary">
      <Link to="/book">Back to your book</Link>
    </Button>
  )
  if (isApiError(error) && error.code === 'FORBIDDEN') {
    return (
      <EmptyState
        size="page"
        icon={<Lock />}
        title="This customer is not in your book"
        body={
          <>
            CIF <span className="tabular">{cif}</span> is assigned to another relationship manager,
            so the file stays closed.
          </>
        }
        action={back}
      />
    )
  }
  if (isApiError(error) && error.code === 'NOT_FOUND') {
    return (
      <EmptyState
        size="page"
        icon={<FileQuestion />}
        title="No customer with this CIF"
        body={
          <>
            Nothing is on record for <span className="tabular">{cif}</span>. Check the number, or
            find the customer with search.
          </>
        }
        action={back}
      />
    )
  }
  return (
    <ErrorState
      size="page"
      title="The customer file did not open"
      error={error}
      onRetry={onRetry}
      retrying={retrying}
    />
  )
}
