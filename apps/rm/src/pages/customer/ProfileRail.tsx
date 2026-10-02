import type { Customer360Consent } from '@dhan/contracts'
import { BadgeCheck, CircleAlert, CircleCheck, CircleMinus, UserRoundCheck } from 'lucide-react'
import { useMe, useReveal } from '../../api/queries.ts'
import { cn } from '../../lib/cn.ts'
import { formatDate, formatDuration, daysBetween } from '../../lib/format.ts'
import {
  Avatar,
  Card,
  CardDivider,
  Chip,
  Money,
  PropertyList,
  SectionLabel,
  Skeleton,
} from '../../ui/index.ts'
import { languageName, plural, type CustomerFile } from './customer-file.ts'
import { RevealField } from './RevealField.tsx'

/**
 * The typed attributes beside every tab, after Attio's record rail: who the customer is, whether
 * the bank may rely on what it holds about them (KYC, consent per scope), and whose book they are
 * in. One card, sections a hairline apart, so the rail reads as one record rather than a stack.
 */
export function ProfileRail({ customer }: { customer: CustomerFile }) {
  const { profile, income, asOf } = customer
  const reveal = useReveal(profile.cif)
  const tenure = daysBetween(profile.customerSince, asOf)

  return (
    <aside
      aria-label="Customer details"
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6"
    >
      <Card>
        <SectionLabel className="mb-4">Profile</SectionLabel>
        <PropertyList
          labelWidth="narrow"
          items={[
            {
              label: 'Date of birth',
              value: (
                <RevealField
                  label="Date of birth"
                  masked={profile.dateOfBirthMasked}
                  onReveal={async (reason) => {
                    const reply = await reveal.mutateAsync({ field: 'dateOfBirth', reason })
                    return /^\d{4}-\d{2}-\d{2}$/.test(reply.value)
                      ? formatDate(reply.value)
                      : reply.value
                  }}
                />
              ),
            },
            { label: 'Age', value: <span className="tabular">{profile.age}</span> },
            { label: 'Gender', value: profile.gender },
            {
              label: 'Family',
              value: (
                <span>
                  {profile.maritalStatus}
                  <span className="block text-caption font-normal text-ink-faint">
                    {profile.dependents > 0
                      ? plural(profile.dependents, 'dependent')
                      : 'No dependents'}
                  </span>
                </span>
              ),
            },
            { label: 'Work', value: profile.employmentType },
            {
              label: 'Income',
              value: (
                <span>
                  <Money value={income.monthly} /> a month
                  <span className="block text-caption font-normal text-ink-faint">
                    {income.stability === 'regular' ? 'Regular' : 'Variable'}
                    {income.payDay !== null ? `, paid on day ${income.payDay}` : ''}
                  </span>
                </span>
              ),
            },
            { label: 'Risk profile', value: profile.riskProfile },
            { label: 'Language', value: languageName(profile.language) },
            {
              label: 'Customer since',
              value: (
                <span>
                  {formatDate(profile.customerSince)}
                  {tenure > 0 ? (
                    <span className="block text-caption font-normal text-ink-faint">
                      {formatDuration(tenure)}
                    </span>
                  ) : null}
                </span>
              ),
            },
          ]}
        />

        <CardDivider />
        <SectionLabel className="mb-3">KYC</SectionLabel>
        <KycStatus status={profile.kycStatus} />

        <CardDivider />
        <ConsentBlock consent={customer.consent} />

        <CardDivider />
        <AssignedRm assigned={profile.assignedRm} />
      </Card>
    </aside>
  )
}

/**
 * Whose book the customer is in. In the RM's own book that is always them, so it is one line;
 * the full card (name, desk, employee number) is for a file someone else holds.
 */
function AssignedRm({ assigned }: { assigned: CustomerFile['profile']['assignedRm'] }) {
  const me = useMe()
  if (me.data?.rm.rmId === assigned.rmId) {
    return (
      <p
        className="flex items-center gap-2 text-label text-ink-soft"
        title={`Assigned to you, ${assigned.desk}, ${assigned.city}`}
      >
        <UserRoundCheck aria-hidden className="size-4 shrink-0 text-brand" />
        Your customer
      </p>
    )
  }
  return (
    <section>
      <SectionLabel className="mb-3">Assigned RM</SectionLabel>
      <div className="flex items-center gap-3">
        <Avatar name={assigned.name} initials={assigned.initials} size="md" tone="brand" />
        <div className="min-w-0">
          <p className="truncate text-label text-ink">{assigned.name}</p>
          <p className="text-caption font-normal text-ink-faint">
            {assigned.desk}, {assigned.city}
          </p>
          <p className="text-caption font-normal text-ink-faint">
            Employee no. <span className="tabular">{assigned.employeeNo}</span>
          </p>
        </div>
      </div>
    </section>
  )
}

/**
 * KYC as the bank records it. "Verified" is the only state that clears an RM to transact; every
 * other string is shown as given, in amber, so nothing the bank says is softened or renamed.
 */
function KycStatus({ status }: { status: string }) {
  const verified = status.trim().toLowerCase() === 'verified'
  return (
    <div className="flex items-center gap-2">
      <Chip
        tone={verified ? 'brand' : 'streak'}
        size="md"
        icon={verified ? <BadgeCheck aria-hidden /> : <CircleAlert aria-hidden />}
      >
        {status}
      </Chip>
      {verified ? null : (
        <span className="text-caption font-normal text-ink-faint">As the bank records it</span>
      )}
    </div>
  )
}

const CONSENT_STATUS: Record<
  NonNullable<Customer360Consent['status']>,
  { label: string; tone: 'brand' | 'streak' | 'danger' }
> = {
  ACTIVE: { label: 'Active', tone: 'brand' },
  EXPIRED: { label: 'Expired', tone: 'streak' },
  REVOKED: { label: 'Withdrawn', tone: 'danger' },
}

/**
 * Consent per scope. A scope the customer withdrew is greyed and says why, in words the RM can
 * repeat back to them; the figures it covered may be stale or missing elsewhere on the file.
 */
function ConsentBlock({ consent }: { consent: Customer360Consent }) {
  const status = consent.status ? CONSENT_STATUS[consent.status] : null
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <SectionLabel>Consent</SectionLabel>
        {status ? (
          <Chip tone={status.tone}>{status.label}</Chip>
        ) : (
          <Chip tone="neutral">None on record</Chip>
        )}
      </div>
      {consent.scopes.length === 0 ? (
        <p className="text-caption font-normal text-ink-soft">
          The bank holds no consent for this customer, so only IDBI&rsquo;s own records are shown.
        </p>
      ) : (
        <ul className="grid gap-2">
          {consent.scopes.map((scope) => (
            <li
              key={scope.scope}
              className={cn(
                'grid grid-cols-[1rem_minmax(0,1fr)] gap-2',
                !scope.active && 'opacity-70',
              )}
            >
              {scope.active ? (
                <CircleCheck aria-hidden className="mt-0.5 size-3.5 text-brand" />
              ) : (
                <CircleMinus aria-hidden className="mt-0.5 size-3.5 text-ink-hint" />
              )}
              <div className="min-w-0">
                <p
                  className={cn(
                    'text-label',
                    scope.active
                      ? 'text-ink'
                      : 'text-ink-faint line-through decoration-ink-hint/40',
                  )}
                >
                  {scope.label}
                  <span className="sr-only">{scope.active ? ', shared' : ', not shared'}</span>
                </p>
                {!scope.active ? (
                  <p className="text-caption font-normal text-ink-soft">
                    {scope.reason ?? 'Not shared. No reason was recorded.'}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function RailSkeleton() {
  return (
    <div className="grid content-start gap-6" aria-hidden>
      <Card>
        <Skeleton className="mb-5 h-3 w-16" />
        <div className="grid gap-3">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="grid grid-cols-[7rem_1fr] gap-3">
              <Skeleton className="h-3" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-8 h-3 w-24" />
        <div className="mt-3 grid gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-3 w-2/3" />
          ))}
        </div>
      </Card>
    </div>
  )
}
