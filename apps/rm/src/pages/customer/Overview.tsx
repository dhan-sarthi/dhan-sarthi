import type { Customer360Action, Signal } from '@dhan/contracts'
import {
  CalendarCheck2,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  ShieldAlert,
  ShieldCheck,
  ShieldMinus,
} from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { useToday } from '../../api/queries.ts'
import { CopilotButton } from '../../features/copilot/index.tsx'
import { cn } from '../../lib/cn.ts'
import { formatDate, formatIn, formatMonth, formatPct } from '../../lib/format.ts'
import {
  AiLabel,
  Button,
  Card,
  CardFooter,
  CardHeader,
  Chip,
  EmptyState,
  ErrorState,
  HealthDot,
  Money,
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
  SectionLabel,
  SeverityChip,
  Skeleton,
} from '../../ui/index.ts'
import {
  ACTION_ICON,
  UPCOMING_ICON,
  UPCOMING_LABEL,
  firstName,
  plural,
  possessive,
  useCustomerFile,
  type CustomerFile,
} from './customer-file.ts'
import { Block, CardSkeleton, TAB_STACK, TabLoading } from './parts.tsx'

/**
 * Overview: the engine's read of the customer, what to do next and why, every signal, and what
 * they hold against what they could. The AI brief is one click away behind Brief me; this tab is
 * what the rules alone say, so it can never be wrong in a way the record would not show.
 */
export function CustomerOverview() {
  const { query } = useCustomerFile()
  const customer = query.data
  if (!customer) {
    return (
      <TabLoading label="Loading the overview">
        <CardSkeleton lines={5} />
        <CardSkeleton rows={4} />
        <CardSkeleton rows={3} />
      </TabLoading>
    )
  }
  return (
    <div className={TAB_STACK}>
      <UdaysRead customer={customer} />
      <NextActions customer={customer} />
      <Signals customer={customer} />
      <div className="grid items-start gap-6 min-[87.5rem]:grid-cols-2">
        <Products customer={customer} />
        <ComingUp customer={customer} />
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Uday's read */

/**
 * A deterministic read of the file, written by rules from the customer's own figures: the goal
 * and where it stands, the signal to raise first, the money, the cover, and any attrition flag.
 * Labelled as the rules' text; the model-written brief lives behind Brief me.
 */
function UdaysRead({ customer }: { customer: CustomerFile }) {
  const name = firstName(customer.profile.name)
  const rows = readRows(customer)
  return (
    <Card>
      <CardHeader title="Uday’s read" actions={<AiLabel phrasedBy="rules" />} />
      <dl className="grid gap-3.5">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-4"
          >
            <dt className="text-label font-normal text-ink-faint">{row.label}</dt>
            <dd className="max-w-prose text-body text-ink">{row.text}</dd>
          </div>
        ))}
      </dl>
      <CardFooter>
        <span>
          From {possessive(name)} figures as at {formatDate(customer.asOf)}. For a cited meeting
          brief, use Brief me.
        </span>
        <CopilotButton cif={customer.profile.cif} label={`Ask about ${name}`} />
      </CardFooter>
    </Card>
  )
}

interface ReadRow {
  label: string
  text: ReactNode
}

const strong = (children: ReactNode) => <span className="font-medium text-ink">{children}</span>

function readRows(c: CustomerFile): ReadRow[] {
  const rows: ReadRow[] = []
  const { goal, roadmap, signals, money, highlights } = c
  const protection = money.protection

  // Goal: what, how much, by when, and the one reason it is where it is.
  const urgent = signals.filter((s) => s.severity === 'urgent').length
  const shortfall = roadmap.shortfallMonthly
  let why: ReactNode = null
  if (goal.health === 'on_track') {
    why =
      roadmap.monthlyCommitment > 0 ? (
        <> {strong(<Money value={roadmap.monthlyCommitment} />)} a month gets there.</>
      ) : null
  } else if (shortfall > 0) {
    why = <> The plan is {strong(<Money value={shortfall} />)} a month short.</>
  } else if (goal.health === 'off_track') {
    why = <> The plan cannot reach it as set.</>
  } else if (urgent > 0) {
    why = <> {plural(urgent, 'urgent signal')} in the way.</>
  }
  rows.push({
    label: 'Goal',
    text: (
      <>
        <HealthDot health={goal.health} className="mr-1.5 align-[-1px]" />
        <span className="text-ink-soft">·</span> {goal.label},{' '}
        {strong(<Money value={goal.targetAmount} />)} by {formatMonth(goal.targetDate)}.{why}
      </>
    ),
  })

  // Raise first: the engine's own top signal, in its own RM-voiced words.
  const top = signals[0]
  rows.push({
    label: 'Raise first',
    text: top ? (
      <>
        {strong(top.title)}. <span className="text-ink-soft">{top.detail}</span>
      </>
    ) : (
      <span className="text-ink-soft">Nothing flagged. The engine has no signal open.</span>
    ),
  })

  // Money: what we can see, how much of it is with us, what is left each month.
  const banks = new Set(money.accounts.map((a) => a.institution)).size
  const surplus = highlights.monthlySurplus
  rows.push({
    label: 'Money',
    text: (
      <>
        {strong(<Money value={highlights.relationshipValue} short />)} we can see across{' '}
        {plural(banks, 'bank')}
        {money.walletSharePct !== null ? (
          <>, {strong(formatPct(Math.round(money.walletSharePct)))} with IDBI</>
        ) : null}
        .{' '}
        {surplus > 0 ? (
          <>{strong(<Money value={surplus} />)} a month left after spending.</>
        ) : surplus < 0 ? (
          <>
            Spending runs {strong(<Money value={-surplus} className="text-danger" />)} a month ahead
            of income.
          </>
        ) : (
          <>Nothing is left after spending.</>
        )}
      </>
    ),
  })

  // Cover: the life-cover gap against the rule of thumb, and whether health cover exists.
  rows.push({
    label: 'Cover',
    text: (
      <>
        {protection.lifeCoverNeeded === 0 ? (
          <>No dependents, so no life cover is needed by the rule of thumb</>
        ) : protection.gap > 0 ? (
          <>{strong(<Money value={protection.gap} />)} short on life cover</>
        ) : (
          <>Life cover meets the need</>
        )}
        ; {protection.healthCover ? 'health cover in place.' : 'no health cover on record.'}
      </>
    ),
  })

  if (c.attrition.flagged) {
    rows.push({
      label: 'Watch',
      text: <span className="text-ink-soft">{c.attrition.reasons.join(' · ')}</span>,
    })
  }
  return rows
}

/* ---------------------------------------------------------------- Next actions */

function NextActions({ customer }: { customer: CustomerFile }) {
  const actions = customer.nextActions
  return (
    <Block title="Suggested next actions" count={actions.length}>
      {actions.length === 0 ? (
        <EmptyState
          className="py-5"
          icon={<CircleCheck />}
          title="Nothing to suggest today"
          body={`The engine has no next step for ${firstName(customer.profile.name)}. The plan runs as it is.`}
        />
      ) : (
        <ul className="-my-1">
          {actions.map((action) => (
            <ActionRow key={action.id} action={action} asOf={customer.asOf} />
          ))}
        </ul>
      )}
    </Block>
  )
}

function ActionRow({ action, asOf }: { action: Customer360Action; asOf: string }) {
  const Icon = ACTION_ICON[action.kind]
  return (
    <li className="flex items-start gap-3 border-b border-hairline-soft py-3 last:border-0">
      <span
        aria-hidden
        className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface text-ink-soft [&_svg]:size-3.5"
      >
        <Icon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-label text-ink">{action.label}</p>
        <p className="mt-0.5 text-caption font-normal text-ink-soft">{action.detail}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {action.why.signal ? <SeverityChip severity={action.why.signal.severity} /> : null}
        <WhyPopover action={action} asOf={asOf} />
      </div>
    </li>
  )
}

/**
 * "Why this was suggested", after Lightfield: the signal behind the action, the evidence the
 * engine read, and what the suitability rules said. An action with no product has nothing for the
 * rules to judge, and the popover says that rather than borrowing a verdict.
 */
function WhyPopover({ action, asOf }: { action: Customer360Action; asOf: string }) {
  const { signal, evidence, rulesPassed, verdict } = action.why
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Why: ${action.label}`}>
          Why?
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="grid gap-3 p-4">
          <PopoverTitle className="text-label text-ink-faint">Why this was suggested</PopoverTitle>
          {signal ? (
            <div className="grid gap-1.5">
              <SeverityChip severity={signal.severity} className="w-fit" />
              <p className="text-heading text-ink">{signal.title}</p>
              <p className="text-label font-normal text-ink-soft">{signal.detail}</p>
            </div>
          ) : (
            <p className="text-label font-normal text-ink-soft">
              From the plan itself, not from a signal.
            </p>
          )}
          {evidence.length > 0 ? (
            <div>
              <SectionLabel as="p" className="mb-1.5">
                Evidence
              </SectionLabel>
              <EvidenceList lines={evidence} />
            </div>
          ) : null}
          <div>
            <SectionLabel as="p" className="mb-1.5">
              Suitability
            </SectionLabel>
            <RulesLine rulesPassed={rulesPassed} verdict={verdict} />
          </div>
        </div>
        <p className="rounded-b-lg border-t border-hairline-soft bg-canvas-top/60 px-4 py-2.5 text-caption font-normal text-ink-faint">
          Suggested by the engine as at {formatDate(asOf)}
        </p>
      </PopoverContent>
    </Popover>
  )
}

function RulesLine({
  rulesPassed,
  verdict,
}: {
  rulesPassed: number | null
  verdict: Customer360Action['why']['verdict']
}) {
  if (verdict === 'BLOCKED') {
    return (
      <p className="flex items-center gap-1.5 text-label text-danger">
        <ShieldAlert aria-hidden className="size-4" />
        Blocked by the rules
        {rulesPassed !== null ? (
          <span className="font-normal text-ink-soft">
            {' '}
            · {plural(rulesPassed, 'rule')} passed first
          </span>
        ) : null}
      </p>
    )
  }
  if (verdict === 'PASS') {
    return (
      <p className="flex items-center gap-1.5 text-label text-brand-deep">
        <ShieldCheck aria-hidden className="size-4" />
        Passed
        {rulesPassed !== null ? (
          <span className="font-normal text-ink-soft">
            {' '}
            · {plural(rulesPassed, 'rule')} checked
          </span>
        ) : null}
      </p>
    )
  }
  return (
    <p className="flex items-center gap-1.5 text-label font-normal text-ink-soft">
      <ShieldMinus aria-hidden className="size-4 text-ink-hint" />
      No product involved, so no rules ran.
    </p>
  )
}

function EvidenceList({ lines }: { lines: readonly string[] }) {
  return (
    <ul className="grid gap-1">
      {lines.map((line, i) => (
        <li
          key={i}
          className="grid grid-cols-[0.75rem_minmax(0,1fr)] text-label font-normal text-ink-soft"
        >
          <span aria-hidden className="text-ink-hint">
            –
          </span>
          <span className="tabular">{line}</span>
        </li>
      ))}
    </ul>
  )
}

/* ---------------------------------------------------------------- Signals */

function Signals({ customer }: { customer: CustomerFile }) {
  const signals = customer.signals
  return (
    <Block title="Signals" count={signals.length}>
      {signals.length === 0 ? (
        <EmptyState
          className="py-5"
          icon={<CircleCheck />}
          title="No signals"
          body={`The engine sees nothing in ${possessive(firstName(customer.profile.name))} money that needs a person today.`}
        />
      ) : (
        <ul className="-my-1">
          {signals.map((signal) => (
            <SignalRow key={signal.kind} signal={signal} />
          ))}
        </ul>
      )}
    </Block>
  )
}

function SignalRow({ signal }: { signal: Signal }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <li className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-4 border-b border-hairline-soft py-3 last:border-0">
      <div className="pt-px">
        <SeverityChip severity={signal.severity} />
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-label text-ink">{signal.title}</p>
          {signal.deadlineDays !== null ? (
            <Chip tone="outline" className="shrink-0">
              {signal.deadlineDays <= 0 ? 'Due now' : `In ${plural(signal.deadlineDays, 'day')}`}
            </Chip>
          ) : null}
        </div>
        <p className="mt-0.5 text-caption font-normal text-ink-soft">{signal.detail}</p>
        {signal.evidence.length > 0 ? (
          <>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={id}
              onClick={() => setOpen((v) => !v)}
              className="mt-1.5 inline-flex items-center gap-1 rounded-sm text-caption text-ink-faint transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
            >
              <ChevronDown
                aria-hidden
                className={cn('size-3.5 transition-transform duration-150', open && 'rotate-180')}
              />
              {open ? 'Hide evidence' : `Evidence (${signal.evidence.length})`}
            </button>
            {open ? (
              <div id={id} className="mt-2">
                <EvidenceList lines={signal.evidence} />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </li>
  )
}

/* ---------------------------------------------------------------- Products */

/** What the customer holds with IDBI against what on the shelf would fit them. */
function Products({ customer }: { customer: CustomerFile }) {
  const { held, gaps } = customer.products
  return (
    <Block title="Products">
      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="mb-2 text-caption text-ink-faint">
            Held with IDBI <span className="tabular text-ink-hint">{held.length}</span>
          </p>
          {held.length === 0 ? (
            <p className="text-label font-normal text-ink-soft">None yet.</p>
          ) : (
            <ul className="grid gap-1.5">
              {held.map((p) => (
                <li key={p} className="flex items-start gap-2 text-label text-ink">
                  <CircleCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-brand" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-2 text-caption text-ink-faint">
            Gaps <span className="tabular text-ink-hint">{gaps.length}</span>
          </p>
          {gaps.length === 0 ? (
            <p className="text-label font-normal text-ink-soft">No gap the shelf could fill.</p>
          ) : (
            <ul className="grid gap-1.5">
              {gaps.map((p) => (
                <li key={p} className="flex items-start gap-2 text-label text-ink-soft">
                  <CircleDashed aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-hint" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Block>
  )
}

/* ---------------------------------------------------------------- Coming up */

/**
 * This customer's dates in the next thirty days. The customer file does not carry them, so they
 * are read from Today's book-wide list (usually cached already) and filtered to this CIF.
 */
function ComingUp({ customer }: { customer: CustomerFile }) {
  const today = useToday()
  const cif = customer.profile.cif
  const name = firstName(customer.profile.name)

  let body: ReactNode
  if (today.isPending) {
    body = (
      <div className="grid gap-3" aria-hidden>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-9 w-10 rounded-md" />
            <div className="grid flex-1 gap-1.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    )
  } else if (today.isError) {
    body = (
      <ErrorState
        className="py-4"
        title="Dates did not load"
        error={today.error}
        onRetry={() => void today.refetch()}
        retrying={today.isFetching}
      />
    )
  } else {
    const items = today.data.upcoming
      .filter((u) => u.cif === cif)
      .sort((a, b) => a.date.localeCompare(b.date))
    body =
      items.length === 0 ? (
        <EmptyState
          className="py-5"
          icon={<CalendarCheck2 />}
          title="Nothing due in 30 days"
          body={`No SIP date, maturity, last EMI or renewal for ${name} before ${formatDate(addDays(customer.asOf, 30))}.`}
        />
      ) : (
        <ul className="-my-1">
          {items.map((item, i) => {
            const Icon = UPCOMING_ICON[item.kind]
            const [, , day] = item.date.split('-')
            return (
              <li
                key={`${item.kind}-${item.date}-${i}`}
                className="flex items-center gap-3 border-b border-hairline-soft py-2.5 last:border-0"
              >
                <time
                  dateTime={item.date}
                  className="grid w-10 shrink-0 justify-items-center rounded-md border border-hairline-soft bg-canvas-top py-1 leading-none"
                >
                  <span className="text-heading tabular text-ink">{Number(day)}</span>
                  <span className="mt-0.5 text-micro tracking-micro text-ink-faint uppercase">
                    {formatMonth(item.date, { year: false })}
                  </span>
                </time>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-label text-ink" title={item.label}>
                    {item.label}
                  </p>
                  <p className="flex items-center gap-1 text-caption font-normal text-ink-faint">
                    <Icon aria-hidden className="size-3" />
                    {UPCOMING_LABEL[item.kind]} · {formatIn(item.date, customer.asOf)}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )
  }
  return <Block title="Coming up">{body}</Block>
}

/** A calendar date some days on, for "before 1 Oct". UTC, as the simulation's calendar is. */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)
  return new Date(t).toISOString().slice(0, 10)
}
