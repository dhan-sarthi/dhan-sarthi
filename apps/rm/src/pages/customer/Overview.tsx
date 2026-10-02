import type { Customer360Action, Signal } from '@dhan/contracts'
import {
  CalendarCheck2,
  CircleCheck,
  CircleDashed,
  Hand,
  Phone,
  ShieldAlert,
  ShieldCheck,
  ShieldMinus,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { CopilotButton } from '../../features/copilot/index.tsx'
import { formatDate, formatIn, formatMonth, formatPct } from '../../lib/format.ts'
import {
  AiLabel,
  Button,
  Card,
  CardDivider,
  CardFooter,
  CardHeader,
  Chip,
  EmptyState,
  HealthDot,
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
  SectionLabel,
  SeverityChip,
} from '../../ui/index.ts'
import {
  ACTION_ICON,
  UPCOMING_ICON,
  UPCOMING_LABEL,
  firstName,
  plural,
  possessive,
  useCustomerFile,
  useFileContext,
  type CustomerFile,
} from './customer-file.ts'
import { rmActions, type RmAction } from './next-actions.ts'
import { midSentence } from './prose.ts'
import { Block, CardSkeleton, TAB_STACK, TabLoading } from './parts.tsx'
import { ProseInr } from './figures.tsx'

/**
 * Overview: the engine's read of the customer, then what to do next and why. Each signal is said
 * once: under the action that answers it, or in one line under "Also seen" where no action does,
 * so the RM's next step is on the first screen rather than below a second list of the same
 * things. Then what they hold against what they could, and what falls due. The AI brief is one
 * click away behind Brief me; this tab is what the rules alone say, so it can never be wrong in a
 * way the record would not show.
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
      <div className="grid grid-cols-1 items-start gap-6 @min-[47.5rem]/tab:grid-cols-2">
        <Products customer={customer} />
        <ComingUp customer={customer} />
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Uday's read */

/**
 * A deterministic read of the file, written by rules from the customer's own figures: the goal
 * and where it stands, the signal to raise first where no action below answers it, the money,
 * the cover, and any attrition flag. Labelled as the rules' text; the model-written brief lives
 * behind Brief me.
 */
function UdaysRead({ customer }: { customer: CustomerFile }) {
  const name = firstName(customer.profile.name)
  const rows = readRows(customer)
  return (
    <Card>
      <CardHeader title="Uday’s read" actions={<AiLabel phrasedBy="rules" />} />
      <dl className="grid gap-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-4"
          >
            <dt className="text-label-plain text-ink-faint">{row.label}</dt>
            <dd className="max-w-prose text-body text-ink">{row.text}</dd>
          </div>
        ))}
      </dl>
      <CardFooter>
        <span>
          From {possessive(name)} figures, {midSentence(customer.basis.asOfLabel)}. For a cited
          meeting brief, use Brief me.
        </span>
        <CopilotButton cif={customer.profile.cif} label={`Ask about ${name}`} mode="ask" />
      </CardFooter>
    </Card>
  )
}

/**
 * The engine's top signal when no suggested action answers it: the read raises it, so the action
 * card's "Also seen" leaves it out. Null when an action already says it.
 */
function raisedInRead(c: CustomerFile): Signal | null {
  const top = c.signals[0]
  if (!top || c.nextActions.some((a) => a.why.signal?.kind === top.kind)) return null
  return top
}

interface ReadRow {
  label: string
  text: ReactNode
}

/** A figure in one of the read's sentences: short from a lakh, as the signals beside it are. */
const strong = (children: ReactNode) => <span className="font-medium text-ink">{children}</span>
const inr = (value: number, className?: string) =>
  strong(<ProseInr value={value} {...(className ? { className } : {})} />)

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
        <> {inr(roadmap.monthlyCommitment)} a month gets there.</>
      ) : null
  } else if (shortfall > 0) {
    why = <> The plan is {inr(shortfall)} a month short.</>
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
        <span className="text-ink-soft">·</span> {goal.label}, {inr(goal.targetAmount)}
        {goal.amountBasis === 'today' && goal.kind !== 'debt_payoff'
          ? ' in today’s money'
          : ''} by {formatMonth(goal.targetDate)}.{why}
      </>
    ),
  })

  // Raise first: the engine's top signal, only where no suggested action below already answers
  // it. Where one does, that action says it, with this signal under it, so it is said once.
  const top = raisedInRead(c)
  if (top) {
    rows.push({
      label: 'Raise first',
      text: (
        <>
          {strong(top.title)}. <span className="text-ink-soft">{top.detail}</span>
        </>
      ),
    })
  }

  // Money: what we can see, how much of it is with us, what is left each month. With IDBI is a
  // rupee figure, as on the Book's preview; the wallet share is a share of balances (With IDBI
  // over every bank's), not of the relationship value before it, so it says so.
  const banks = new Set(money.accounts.map((a) => a.institution)).size
  const surplus = highlights.monthlySurplus
  rows.push({
    label: 'Money',
    text: (
      <>
        {inr(highlights.relationshipValue)} we can see across {plural(banks, 'bank')}
        {money.walletSharePct !== null ? (
          <>
            , {inr(money.withIdbi)} with IDBI ({strong(formatPct(Math.round(money.walletSharePct)))}{' '}
            of balances)
          </>
        ) : null}
        .{' '}
        {surplus > 0 ? (
          <>{inr(surplus)} a month left after spending.</>
        ) : surplus < 0 ? (
          <>Spending runs {inr(-surplus, 'text-danger')} a month ahead of income.</>
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
          <>{inr(protection.gap)} short on life cover</>
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
  const { request, logCall } = useFileContext()
  const name = firstName(customer.profile.name)
  const raised = raisedInRead(customer)
  const { actions, alsoSeen } = rmActions(
    customer.nextActions,
    // The signal Uday's read raises first is said there, not again here.
    customer.signals.filter((signal) => signal !== raised),
    { name, gender: customer.profile.gender },
    request,
  )
  return (
    <Block title="Suggested next actions" count={actions.length}>
      {actions.length === 0 ? (
        <EmptyState
          className="py-5"
          icon={<CircleCheck />}
          title="Nothing to suggest today"
          body={`The engine has no next step for ${name}. The plan runs as it is.`}
        />
      ) : (
        <ul className="-my-1">
          {actions.map((action) => (
            <ActionRow key={action.id} action={action} asOf={customer.asOf} onLogCall={logCall} />
          ))}
        </ul>
      )}
      {alsoSeen.length > 0 ? (
        <>
          <CardDivider />
          <AlsoSeen signals={alsoSeen} />
        </>
      ) : null}
    </Block>
  )
}

function ActionRow({
  action,
  asOf,
  onLogCall,
}: {
  action: RmAction
  asOf: string
  onLogCall: () => void
}) {
  const Icon = action.kind === 'open_request' ? Phone : ACTION_ICON[action.kind]
  return (
    <li className="flex items-start gap-3 border-b border-hairline-soft py-3 last:border-0">
      <span
        aria-hidden
        className={
          action.asked
            ? 'mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand [&_svg]:size-3.5'
            : 'mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface text-ink-soft [&_svg]:size-3.5'
        }
      >
        <Icon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-label text-ink">{action.title}</p>
        {action.reason ? (
          <p className="mt-0.5 text-caption-plain text-ink-soft">{action.reason}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {action.asked ? (
          <>
            <Chip tone="brand" icon={<Hand aria-hidden />}>
              Asked for you
            </Chip>
            <Button size="sm" variant="primary" icon={<Phone aria-hidden />} onClick={onLogCall}>
              Log call
            </Button>
          </>
        ) : (
          <>
            {action.severity ? <SeverityChip severity={action.severity} /> : null}
            {action.source ? (
              <WhyPopover action={action.source} title={action.title} asOf={asOf} />
            ) : null}
          </>
        )}
      </div>
    </li>
  )
}

/**
 * The signals no suggested action answers, one line each: severity, the figure-first title, and
 * the detail where it fits. They are still on the file; they just have no step attached yet.
 */
function AlsoSeen({ signals }: { signals: readonly Signal[] }) {
  return (
    <section aria-label="Also seen">
      <SectionLabel as="h3" className="mb-2">
        Also seen <span className="ml-1 tabular text-ink-hint">{signals.length}</span>
      </SectionLabel>
      <ul className="grid gap-1.5">
        {signals.map((signal) => (
          <li
            key={signal.kind}
            className="grid grid-cols-[7.25rem_minmax(0,1fr)] items-baseline gap-3 text-label"
          >
            <span>
              <SeverityChip severity={signal.severity} />
            </span>
            <p className="min-w-0 truncate" title={`${signal.title}. ${signal.detail}`}>
              <span className="text-ink">{signal.title}</span>
              {signal.deadlineDays !== null ? (
                <span className="text-ink-soft">
                  {' '}
                  ·{' '}
                  {signal.deadlineDays <= 0
                    ? 'due now'
                    : `in ${plural(signal.deadlineDays, 'day')}`}
                </span>
              ) : null}
              <span className="font-normal text-ink-faint"> · {signal.detail}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * "Why this was suggested", after Lightfield: the signal behind the action, the evidence the
 * engine read, the product where there is one, and what the suitability rules said. An action
 * with no product has nothing for the rules to judge, and the popover says that rather than
 * borrowing a verdict.
 */
function WhyPopover({
  action,
  title,
  asOf,
}: {
  action: Customer360Action
  title: string
  asOf: string
}) {
  const { signal, evidence, rulesPassed, verdict } = action.why
  // The product's own line, without the engine's advice to the customer after it.
  const product = verdict !== null ? (action.detail.split('. ')[0] ?? null) : null
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Why: ${title}`}>
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
              <p className="text-label-plain text-ink-soft">{signal.detail}</p>
            </div>
          ) : (
            <p className="text-label-plain text-ink-soft">
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
          {product ? (
            <div>
              <SectionLabel as="p" className="mb-1.5">
                Product
              </SectionLabel>
              <p className="text-label text-ink">{product.replace(/\.$/, '')}</p>
            </div>
          ) : null}
          <div>
            <SectionLabel as="p" className="mb-1.5">
              Suitability
            </SectionLabel>
            <RulesLine rulesPassed={rulesPassed} verdict={verdict} />
          </div>
        </div>
        <p className="rounded-b-lg border-t border-hairline-soft bg-footer-wash px-4 py-2.5 text-caption-plain text-ink-faint">
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
    <p className="flex items-center gap-1.5 text-label-plain text-ink-soft">
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
          className="grid grid-cols-[0.75rem_minmax(0,1fr)] text-label-plain text-ink-soft"
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
            <p className="text-label-plain text-ink-soft">None yet.</p>
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
            <p className="text-label-plain text-ink-soft">No gap the shelf could fill.</p>
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
 * This customer's dates in the next thirty days, soonest first, from the file itself: the same
 * items Today's Coming up lists for this CIF, with no book-wide read behind them.
 */
function ComingUp({ customer }: { customer: CustomerFile }) {
  const name = firstName(customer.profile.name)
  const items = customer.upcoming
  return (
    <Block title="Coming up" {...(items.length > 0 ? { count: items.length } : {})}>
      {items.length === 0 ? (
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
                  <p className="flex items-center gap-1 text-caption-plain text-ink-faint">
                    <Icon aria-hidden className="size-3" />
                    {UPCOMING_LABEL[item.kind]} · {formatIn(item.date, customer.asOf)}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Block>
  )
}

/** A calendar date some days on, for "before 1 Oct". UTC, as the simulation's calendar is. */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)
  return new Date(t).toISOString().slice(0, 10)
}
