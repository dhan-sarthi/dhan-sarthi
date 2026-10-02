import { Check, Copy, Phone, StickyNote } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { CopilotButton } from '../../features/copilot/index.tsx'
import { formatAgo, formatDate, formatMonth, formatPct } from '../../lib/format.ts'
import {
  Avatar,
  Button,
  Card,
  HealthDot,
  IconButton,
  Money,
  SegmentBadge,
  Skeleton,
  StrengthBadge,
  toast,
} from '../../ui/index.ts'
import { plural, type CustomerFile } from './customer-file.ts'
import { Dot } from './parts.tsx'

/**
 * The top of the file: who this is, how strong the relationship is and why, and the three things
 * an RM does from here. Log a call is the primary action: it is what the page is for after the
 * phone goes down.
 */
export function CustomerHeader({
  customer,
  onLogCall,
  onAddNote,
}: {
  customer: CustomerFile
  onLogCall: () => void
  onAddNote: () => void
}) {
  const { profile, strength } = customer
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
      <div className="flex min-w-0 items-start gap-4">
        <Avatar name={profile.name} initials={profile.initials} size="xl" />
        <div className="min-w-0 pt-0.5">
          <h1 className="truncate text-display text-ink">{profile.name}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-ink-soft">
            <span>
              Age <span className="tabular">{profile.age}</span>
            </span>
            <Dot />
            <span>{profile.city}</span>
            <Dot />
            <SegmentBadge segment={customer.segment} />
            <Dot />
            <span>{profile.riskProfile} risk profile</span>
            <Dot />
            <CifLabel cif={profile.cif} />
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-faint">
            <span>Relationship strength</span>
            <StrengthBadge strength={strength} />
            <Dot />
            <span className="text-ink-soft">{strength.reason}</span>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <CopilotButton cif={profile.cif} label="Brief me" />
        <Button icon={<StickyNote aria-hidden />} onClick={onAddNote}>
          Add note
        </Button>
        <Button variant="primary" icon={<Phone aria-hidden />} onClick={onLogCall}>
          Log a call
        </Button>
      </div>
    </header>
  )
}

/** The CIF in tabular figures with a copy button: RMs paste it into the core banking screen. */
function CifLabel({ cif }: { cif: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(cif)
      setCopied(true)
      toast.success('CIF copied')
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard access can be refused (an insecure origin, a browser setting); the CIF is
      // still on screen to select by hand, so say so rather than fail silently.
      toast('Copy was blocked by the browser', { description: 'Select the CIF to copy it.' })
    }
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-ink-faint">CIF</span>
      <span className="tabular text-ink select-all">{cif}</span>
      <IconButton
        label={copied ? 'Copied' : 'Copy CIF'}
        size="sm"
        icon={copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        onClick={() => void copy()}
        className="size-6 [&_svg]:size-3"
      />
    </span>
  )
}

/* ---------------------------------------------------------------- Highlights */

/**
 * Five facts in one strip, one hairline apart: what the customer is worth to the bank, what they
 * are worth, what is left each month, where the goal stands, and when they were last seen.
 */
export function Highlights({ customer }: { customer: CustomerFile }) {
  const { highlights, money, goal, uday, asOf } = customer
  const surplus = highlights.monthlySurplus
  const banks = new Set(money.accounts.map((a) => a.institution)).size

  return (
    <Card padded={false} className="mb-6">
      {/* The goal's cell gets more room: its name is the one hint that runs long. */}
      <dl className="grid grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.35fr)_minmax(0,1fr)] divide-x divide-hairline-soft">
        <Cell
          label="Relationship value"
          value={<Money value={highlights.relationshipValue} short />}
          hint={
            money.walletSharePct !== null
              ? `${formatPct(Math.round(money.walletSharePct))} with IDBI · ${plural(banks, 'bank')}`
              : `No balances at any bank`
          }
        />
        <Cell
          label="Net worth"
          value={
            <Money
              value={highlights.netWorth}
              short
              className={highlights.netWorth < 0 ? 'text-danger' : 'text-ink'}
            />
          }
          hint={
            money.netWorth.liabilities > 0 ? (
              <>
                After <Money value={money.netWorth.liabilities} short /> of debt
              </>
            ) : (
              'No debt on record'
            )
          }
        />
        <Cell
          label="Monthly surplus"
          value={
            <Money
              value={surplus}
              short={Math.abs(surplus) >= 1e5}
              className={surplus < 0 ? 'text-danger' : 'text-ink'}
            />
          }
          hint={surplus < 0 ? 'Spends more than comes in' : 'A month, after spending'}
        />
        <Cell
          label="Goal"
          value={<HealthDot health={goal.health} className="text-heading" />}
          hint={`${goal.label}, ${formatMonth(goal.targetDate)}`}
        />
        <Cell
          label="Last active"
          value={
            highlights.lastActivityAt ? (
              <span title={formatDate(highlights.lastActivityAt)}>
                {formatAgo(highlights.lastActivityAt, asOf)}
              </span>
            ) : (
              <span className="text-ink-soft">No activity yet</span>
            )
          }
          hint={
            uday.calls > 0
              ? `${plural(uday.calls, 'Uday call')}${
                  uday.lastCallAt ? `, last ${formatDate(uday.lastCallAt)}` : ''
                }`
              : 'No Uday calls yet'
          }
        />
      </dl>
    </Card>
  )
}

function Cell({ label, value, hint }: { label: string; value: ReactNode; hint: ReactNode }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <dt className="text-caption text-ink-faint">{label}</dt>
      <dd className="mt-1.5 truncate text-title text-ink">{value}</dd>
      <dd className="mt-1 truncate text-caption font-normal text-ink-soft">{hint}</dd>
    </div>
  )
}

/* ---------------------------------------------------------------- Skeleton */

export function HeaderSkeleton() {
  return (
    <>
      <header className="mb-6 flex items-start justify-between gap-8">
        <div className="flex items-start gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="grid gap-2.5 pt-1">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-96" />
            <Skeleton className="h-3.5 w-80" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-control w-28 rounded-md" />
          <Skeleton className="h-control w-28 rounded-md" />
        </div>
      </header>
      <Card padded={false} className="mb-6">
        <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.35fr)_minmax(0,1fr)] divide-x divide-hairline-soft">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="grid gap-2 px-5 py-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
