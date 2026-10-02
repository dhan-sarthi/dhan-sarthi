import type { Customer360Stage, GoalKind, Signal } from '@dhan/contracts'
import { Check, Flag, LineChart } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { daysBetween, formatDuration, formatMonth, formatPct } from '../../lib/format.ts'
import {
  Card,
  CardFooter,
  CardHeader,
  Chip,
  Disclaimer,
  EmptyState,
  HealthDot,
  PROJECTION_SWATCH as SWATCH,
  ProjectionChart,
  SeverityChip,
  scenarioRoles,
  type ScenarioRoles,
} from '../../ui/index.ts'
import {
  STAGE_ICON,
  firstName,
  plural,
  useCustomerFile,
  type CustomerFile,
} from './customer-file.ts'
import { Block, CardSkeleton, TAB_STACK, TabLoading } from './parts.tsx'
import { ProseInr, ShortInr } from './figures.tsx'
import { shortenFigures } from './prose.ts'

/**
 * Goals & plan: the goal and where it stands, the roadmap as a stepper with the running stage
 * marked, and the projection as a band with its rates, its real-terms figure and the disclaimer.
 * Never a single projected number: the band is the answer.
 */
export function CustomerGoals() {
  const { query } = useCustomerFile()
  const customer = query.data
  if (!customer) {
    return (
      <TabLoading label="Loading the plan">
        <CardSkeleton lines={3} />
        <CardSkeleton rows={3} />
        <CardSkeleton lines={6} />
      </TabLoading>
    )
  }
  return (
    <div className={TAB_STACK}>
      <GoalCard customer={customer} />
      <Roadmap customer={customer} />
      <ProjectionCard customer={customer} />
    </div>
  )
}

/** The urgent debt signal that holds every investment back, if there is one. */
function blockingDebt(signals: readonly Signal[]): Signal | undefined {
  return signals.find(
    (s) =>
      s.severity === 'urgent' && (s.kind === 'missed_repayment' || s.kind === 'expensive_debt'),
  )
}

/** Which money a goal's target is in, said beside it. A debt is owed now, so it needs no word. */
function basisWord(goal: CustomerFile['goal']): string | undefined {
  if (goal.kind === 'debt_payoff') return undefined
  return goal.amountBasis === 'today'
    ? 'In today’s money'
    : `In ${goal.targetDate.slice(0, 4)} rupees`
}

/* ---------------------------------------------------------------- Goal */

function GoalCard({ customer }: { customer: CustomerFile }) {
  const { goal, roadmap, signals, asOf } = customer
  const urgent = signals.filter((s) => s.severity === 'urgent')
  const shortfall = roadmap.shortfallMonthly
  const away = daysBetween(asOf, goal.targetDate)

  let health: ReactNode
  if (goal.health === 'on_track') {
    health = 'The plan is feasible, nothing is short each month, and no urgent signal is open.'
  } else if (goal.health === 'off_track') {
    health =
      shortfall > 0 ? (
        <>
          The plan cannot reach it as set: it is <ProseInr value={shortfall} /> a month short.
        </>
      ) : (
        'The plan cannot reach it as set.'
      )
  } else if (shortfall > 0) {
    health = (
      <>
        Reachable, but <ProseInr value={shortfall} /> a month short.
      </>
    )
  } else {
    health = (
      <>
        Reachable, but {plural(urgent.length, 'urgent signal')} stand
        {urgent.length === 1 ? 's' : ''} in the way
        {urgent.length > 0 ? `: ${urgent.map((s) => inSentence(s.title)).join('; ')}` : ''}.
      </>
    )
  }

  return (
    <Card>
      {/* The goal's name is the heading, with its health beside it: no "Goal" label above. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-title text-ink">{goal.label}</h2>
        <HealthDot health={goal.health} />
      </div>
      <p className="mt-1 max-w-prose text-body text-ink-soft">{health}</p>
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-hairline-soft pt-4 lg:grid-cols-4">
        <GoalFact label="Target" hint={basisWord(goal)}>
          <ProseInr value={goal.targetAmount} />
        </GoalFact>
        <GoalFact label="By" hint={away > 0 ? `In ${formatDuration(away)}` : undefined}>
          {formatMonth(goal.targetDate)}
        </GoalFact>
        <GoalFact label="Plan asks, a month">
          {roadmap.monthlyCommitment > 0 ? (
            <ProseInr value={roadmap.monthlyCommitment} />
          ) : (
            'Nothing yet'
          )}
        </GoalFact>
        {shortfall > 0 ? (
          <GoalFact label="Short, a month" tone="danger">
            <ProseInr value={shortfall} />
          </GoalFact>
        ) : (
          <GoalFact label="Plan completes">
            {roadmap.completesOn ? formatMonth(roadmap.completesOn) : 'Not at this pace'}
          </GoalFact>
        )}
      </dl>
    </Card>
  )
}

function GoalFact({
  label,
  hint,
  tone,
  children,
}: {
  label: string
  hint?: string | undefined
  tone?: 'danger'
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-ink-faint">{label}</dt>
      <dd
        className={cn('mt-1 text-heading tabular', tone === 'danger' ? 'text-danger' : 'text-ink')}
      >
        {children}
      </dd>
      {hint ? <dd className="mt-0.5 text-caption-plain text-ink-faint">{hint}</dd> : null}
    </div>
  )
}

/* ---------------------------------------------------------------- Roadmap */

/**
 * One verdict on the goal, not two. "Feasible" in green beside a goal marked At risk reads as the
 * page disagreeing with itself, so a feasible plan with urgent signals open says both halves.
 */
function RoadmapVerdict({ customer }: { customer: CustomerFile }) {
  const { roadmap, goal, signals } = customer
  if (!roadmap.feasible) return <Chip tone="danger">Not feasible as set</Chip>
  if (goal.health === 'at_risk') {
    const urgent = signals.filter((s) => s.severity === 'urgent').length
    return (
      <Chip tone="streak">
        {urgent > 0
          ? `Feasible: ${plural(urgent, 'urgent signal')} in the way`
          : 'Feasible, at risk'}
      </Chip>
    )
  }
  return <Chip tone="brand">Feasible</Chip>
}

/**
 * The roadmap as a vertical stepper. The running stage is marked and tinted; a stage with no end
 * (a debt that will not clear at this amount, cover that cannot be placed) shows where it starts
 * and says it has no end, never a date the engine did not give.
 *
 * While an urgent debt holds every investment back, the plan's debt stages say so, and a stage
 * that needs no money (catching up a missed instalment) is marked to raise now: the engine places
 * it in sequence after the stages that need money, but nothing has to be saved before the RM can
 * bring it up. Cover runs alongside because it is not an investment.
 */
function Roadmap({ customer }: { customer: CustomerFile }) {
  const { stages, currentStageIndex } = customer.roadmap
  const blocker = blockingDebt(customer.signals)
  const disclaimer = customer.projection?.disclaimer ?? null
  return (
    <Block
      title="Roadmap"
      count={stages.length}
      actions={<RoadmapVerdict customer={customer} />}
      footer={customer.projection ? null : <NoProjection kind={customer.goal.kind} />}
    >
      {stages.length === 0 ? (
        <EmptyState
          className="py-5"
          title="No roadmap yet"
          body={`The engine has not cut a plan for ${firstName(customer.profile.name)}.`}
        />
      ) : (
        <ol>
          {stages.map((stage, i) => (
            <StageStep
              key={stage.index}
              stage={stage}
              state={i < currentStageIndex ? 'done' : i === currentStageIndex ? 'current' : 'next'}
              last={i === stages.length - 1}
              blocked={blocker !== undefined}
              disclaimer={disclaimer}
              asOf={customer.asOf}
            />
          ))}
        </ol>
      )}
    </Block>
  )
}

/** One line under the roadmap where a goal has nothing to project, rather than an empty card. */
const NO_PROJECTION: Record<GoalKind, string> = {
  debt_payoff:
    'Debt goals have no projection: clearing a debt grows nothing. The roadmap shows when it clears.',
  emergency_fund: 'No projection: an emergency fund is kept safe and to hand, not invested.',
  protection: 'No projection: cover is bought, not grown.',
  wealth_target: 'No projection yet: the roadmap has nothing to grow.',
  retirement: 'No projection yet: the roadmap has nothing to grow.',
}

function NoProjection({ kind }: { kind: GoalKind }) {
  return (
    <CardFooter variant="note" className="justify-start gap-2">
      <LineChart aria-hidden className="size-3.5 shrink-0 text-ink-hint" />
      <p>{NO_PROJECTION[kind]}</p>
    </CardFooter>
  )
}

function StageStep({
  stage,
  state,
  last,
  blocked,
  disclaimer,
  asOf,
}: {
  stage: Customer360Stage
  asOf: string
  state: 'done' | 'current' | 'next'
  last: boolean
  /** An urgent debt holds every investment back. */
  blocked: boolean
  /** The projection's disclaimer, shown once on the tab; a stage that repeats it drops it. */
  disclaimer: string | null
}) {
  const Icon = STAGE_ICON[stage.kind]
  const debt = blocked && stage.kind === 'clear_debt' && state !== 'done'
  // Catching up an instalment costs nothing to set aside: it is a conversation, not a saving.
  const raiseNow = debt && stage.monthly === 0 && stage.targetAmount === null
  const alongside = blocked && stage.cadence === 'ongoing' && stage.kind === 'get_cover'
  const why = shortenFigures(disclaimer ? stage.why.replace(disclaimer, '').trim() : stage.why)
  const span = stage.completesOn
    ? `${formatMonth(stage.startsOn)} to ${formatMonth(stage.completesOn)}`
    : `From ${formatMonth(stage.startsOn)}, no end date`
  const meta = raiseNow
    ? [
        <span key="m">Nothing to set aside</span>,
        <span key="r" className="font-semibold text-danger">
          Raise it now
        </span>,
        // Placed later in the plan's sequence, the engine's dates say when; raised now, they would
        // read as a contradiction without saying so.
        <span key="d">{stage.startsOn > asOf ? `In the plan’s sequence: ${span}` : span}</span>,
      ]
    : [
        stage.monthly > 0 ? (
          <span key="m">
            <ProseInr value={stage.monthly} /> a month
          </span>
        ) : (
          <span key="m">No monthly amount</span>
        ),
        stage.targetAmount !== null ? (
          <span key="t">
            Target <ProseInr value={stage.targetAmount} />
          </span>
        ) : null,
        <span key="d">{span}</span>,
      ].filter(Boolean)

  return (
    <li
      className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-3 pb-5 last:pb-0"
      aria-current={state === 'current' ? 'step' : undefined}
    >
      {!last ? (
        <span aria-hidden className="absolute top-9 bottom-1 left-[15.5px] w-px bg-hairline" />
      ) : null}
      <span
        aria-hidden
        className={cn(
          'relative z-[1] mt-1 inline-flex size-8 items-center justify-center rounded-full [&_svg]:size-4',
          state === 'current' && 'bg-brand text-on-brand ring-4 ring-brand-soft',
          state === 'done' && 'bg-brand-soft text-brand-deep',
          state === 'next' && !raiseNow && 'border border-hairline bg-surface text-ink-soft',
          state === 'next' && raiseNow && 'border border-danger-edge bg-danger-soft text-danger',
        )}
      >
        {state === 'done' ? <Check /> : <Icon />}
      </span>
      <div
        className={cn(
          'min-w-0 rounded-md px-3 py-2.5',
          state === 'current' && 'bg-brand-wash',
          raiseNow && state !== 'current' && 'bg-danger-wash',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div className="min-w-0">
            {debt ? (
              <p className="text-caption text-danger">
                {raiseNow ? 'Blocks investing: raise first' : 'Blocks investing until it clears'}
              </p>
            ) : null}
            <p className="text-heading text-ink">
              <span className="mr-1.5 text-caption tabular text-ink-faint">{stage.index}</span>
              {shortenFigures(stage.label)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {raiseNow ? <SeverityChip severity="urgent" /> : null}
            {state === 'current' ? <Chip tone="brand">Now</Chip> : null}
            {state === 'done' ? <Chip tone="neutral">Done</Chip> : null}
            {stage.isGoal ? (
              <Chip tone="outline" icon={<Flag aria-hidden />}>
                Goal
              </Chip>
            ) : null}
            {stage.cadence === 'ongoing' ? <Chip tone="neutral">Runs alongside</Chip> : null}
          </div>
        </div>
        {why ? <p className="mt-1 max-w-prose text-label-plain text-ink-soft">{why}</p> : null}
        {alongside ? (
          <p className="mt-1 max-w-prose text-label-plain text-ink-soft">
            Cover is not an investment, so it runs alongside clearing the debt.
          </p>
        ) : null}
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-faint">
          {meta.map((node, i) => (
            <span key={i} className="inline-flex items-center gap-2">
              {i > 0 ? (
                <span aria-hidden className="text-ink-hint">
                  ·
                </span>
              ) : null}
              {node}
            </span>
          ))}
        </p>
      </div>
    </li>
  )
}

/* ---------------------------------------------------------------- Projection */

function ProjectionCard({ customer }: { customer: CustomerFile }) {
  const { projection, goal, profile, basis } = customer
  const roles = projection ? scenarioRoles(projection) : null
  // Nothing to project: the roadmap's own footer says why in one line.
  if (!projection || !roles) return null

  const startYear = Number(basis.asOf.slice(0, 4))
  const endYear = startYear + projection.years
  const today = goal.amountBasis === 'today'
  return (
    <Card>
      <CardHeader
        title="Projection"
        actions={
          <Chip tone="outline" size="md">
            Illustration
          </Chip>
        }
      />
      <p className="mb-5 max-w-prose text-body text-ink-soft">
        <ProseInr value={projection.monthlyContribution} className="font-semibold text-ink" /> a
        month
        {projection.existingCorpus > 0 ? (
          <>
            {' '}
            on top of{' '}
            <ProseInr value={projection.existingCorpus} className="font-semibold text-ink" />{' '}
            already invested
          </>
        ) : null}
        , over {plural(Math.round(projection.years), 'year')} to {Math.floor(endYear)}. The target
        is <ProseInr value={goal.targetAmount} className="font-semibold text-ink" />{' '}
        {today ? (
          <>
            in today&rsquo;s money, so read it against each path&rsquo;s{' '}
            <span className="text-ink">in today&rsquo;s money</span> figure.
          </>
        ) : (
          <>in {Math.floor(endYear)} rupees, so read it against the paths as drawn.</>
        )}
      </p>
      <ScenarioLegend projection={projection} roles={roles} goal={goal} />
      <div className="mt-4">
        <ProjectionChart
          projection={projection}
          roles={roles}
          startYear={startYear}
          startAge={profile.age}
        />
      </div>
      <div className="mt-4 grid gap-2 border-t border-hairline-soft pt-4">
        <p className="text-label-plain text-ink-soft">
          In today&rsquo;s money, at {formatPct(projection.inflationPct)} inflation a year, the{' '}
          {roles.mid.label.toLowerCase()} <ProseInr value={roles.mid.corpus} /> is worth{' '}
          <ProseInr value={roles.mid.realCorpus} className="font-semibold text-ink" />.
        </p>
        <Disclaimer>{projection.disclaimer}</Disclaimer>
        <p className="text-caption-plain text-ink-faint">{basis.asOfLabel}.</p>
      </div>
    </Card>
  )
}

/**
 * The legend doubles as the figures: each scenario's rate, its corpus at the horizon and the same
 * in today's money, ordered as the band reads from the bottom up. The figure the goal's target is
 * comparable with is the one in ink; paid in sits last, in grey.
 */
function ScenarioLegend({
  projection,
  roles,
  goal,
}: {
  projection: NonNullable<CustomerFile['projection']>
  roles: ScenarioRoles
  goal: CustomerFile['goal']
}) {
  const contributed = roles.mid.contributed
  const today = goal.amountBasis === 'today'
  const tiles = [
    { key: 'low', s: roles.low, swatch: SWATCH.low, weight: 1.25 },
    { key: 'mid', s: roles.mid, swatch: SWATCH.mid, weight: 2 },
    { key: 'high', s: roles.high, swatch: SWATCH.high, weight: 1.25 },
  ] as const
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-hairline-soft bg-hairline-soft min-[87.5rem]:grid-cols-4">
      {tiles.map(({ key, s, swatch, weight }) => (
        <div key={key} className={cn('bg-surface px-4 py-3', key === 'mid' && 'bg-brand-wash')}>
          <dt className="flex items-center gap-1.5 text-caption text-ink-soft">
            <LegendLine color={swatch} weight={weight + 0.75} />
            {s.label}
          </dt>
          <dd className="mt-1 text-title text-ink">
            <ShortInr value={s.corpus} />
          </dd>
          <dd className="mt-0.5 text-caption tabular text-ink-soft">
            At {formatPct(s.ratePct)} a year
          </dd>
          <dd
            className={cn(
              'text-caption tabular',
              today ? 'font-semibold text-ink' : 'font-normal text-ink-faint',
            )}
          >
            <ProseInr value={s.realCorpus} /> in today&rsquo;s money
          </dd>
        </div>
      ))}
      <div className="bg-surface px-4 py-3">
        <dt className="flex items-center gap-1.5 text-caption text-ink-soft">
          <LegendLine color={SWATCH.paid} weight={2} />
          Paid in
        </dt>
        <dd className="mt-1 text-title text-ink">
          <ShortInr value={contributed} />
        </dd>
        <dd className="mt-0.5 text-caption text-ink-soft">Before any growth</dd>
        <dd className="text-caption-plain text-ink-faint">
          {projection.existingCorpus > 0 ? 'Invested now, plus each month' : 'Each month, added up'}
        </dd>
      </div>
    </dl>
  )
}

/** A short line in a series' own colour and weight, so the legend reads as the chart does. */
function LegendLine({ color, weight }: { color: string; weight: number }) {
  return (
    <svg aria-hidden width="14" height="8" className="shrink-0">
      <line
        x1="1"
        x2="13"
        y1="4"
        y2="4"
        stroke={color}
        strokeWidth={weight}
        strokeLinecap="round"
      />
    </svg>
  )
}

/** "Card at 34.8%" reads "card at 34.8%" mid-sentence; "EMI…" and "₹30,500…" stay as written. */
function inSentence(title: string): string {
  return /^[A-Z][a-z]/.test(title) ? title.charAt(0).toLowerCase() + title.slice(1) : title
}
