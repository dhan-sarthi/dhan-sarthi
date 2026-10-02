import type { Customer360Stage, GoalKind } from '@dhan/contracts'
import { Check, Flag, LineChart } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import {
  daysBetween,
  formatDate,
  formatDuration,
  formatMonth,
  formatPct,
} from '../../lib/format.ts'
import { Card, CardHeader, Chip, Disclaimer, EmptyState, HealthDot, Money } from '../../ui/index.ts'
import {
  STAGE_ICON,
  firstName,
  plural,
  useCustomerFile,
  type CustomerFile,
} from './customer-file.ts'
import { Block, CardSkeleton, TAB_STACK, TabLoading } from './parts.tsx'
import { ProjectionChart, SWATCH, scenarioRoles, type ScenarioRoles } from './ProjectionChart.tsx'

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
          The plan cannot reach it as set: it is <Money value={shortfall} /> a month short.
        </>
      ) : (
        'The plan cannot reach it as set.'
      )
  } else if (shortfall > 0) {
    health = (
      <>
        Reachable, but <Money value={shortfall} /> a month short.
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
      <CardHeader title="Goal" actions={<HealthDot health={goal.health} />} />
      <h2 className="text-title text-ink">{goal.label}</h2>
      <p className="mt-1 max-w-prose text-body text-ink-soft">{health}</p>
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-hairline-soft pt-4 lg:grid-cols-4">
        <GoalFact label="Target">
          <Money value={goal.targetAmount} />
        </GoalFact>
        <GoalFact label="By" hint={away > 0 ? `In ${formatDuration(away)}` : undefined}>
          {formatMonth(goal.targetDate)}
        </GoalFact>
        <GoalFact label="Plan asks, a month">
          {roadmap.monthlyCommitment > 0 ? (
            <Money value={roadmap.monthlyCommitment} />
          ) : (
            'Nothing yet'
          )}
        </GoalFact>
        {shortfall > 0 ? (
          <GoalFact label="Short, a month" tone="danger">
            <Money value={shortfall} />
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
      {hint ? <dd className="mt-0.5 text-caption font-normal text-ink-faint">{hint}</dd> : null}
    </div>
  )
}

/* ---------------------------------------------------------------- Roadmap */

/**
 * The roadmap as a vertical stepper. The running stage is marked and tinted; a stage with no end
 * (a debt that will not clear at this amount, cover that cannot be placed) shows where it starts
 * and says it has no end, never a date the engine did not give.
 */
function Roadmap({ customer }: { customer: CustomerFile }) {
  const { stages, currentStageIndex, feasible } = customer.roadmap
  return (
    <Block
      title="Roadmap"
      count={stages.length}
      actions={
        feasible ? (
          <Chip tone="brand">Feasible</Chip>
        ) : (
          <Chip tone="danger">Not feasible as set</Chip>
        )
      }
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
            />
          ))}
        </ol>
      )}
    </Block>
  )
}

function StageStep({
  stage,
  state,
  last,
}: {
  stage: Customer360Stage
  state: 'done' | 'current' | 'next'
  last: boolean
}) {
  const Icon = STAGE_ICON[stage.kind]
  const meta = [
    stage.monthly > 0 ? (
      <span key="m">
        <Money value={stage.monthly} /> a month
      </span>
    ) : (
      <span key="m">No monthly amount</span>
    ),
    stage.targetAmount !== null ? (
      <span key="t">
        Target <Money value={stage.targetAmount} />
      </span>
    ) : null,
    <span key="d">
      {stage.completesOn
        ? `${formatMonth(stage.startsOn)} to ${formatMonth(stage.completesOn)}`
        : `From ${formatMonth(stage.startsOn)}, no end date`}
    </span>,
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
          state === 'next' && 'border border-hairline bg-surface text-ink-soft',
        )}
      >
        {state === 'done' ? <Check /> : <Icon />}
      </span>
      <div className={cn('min-w-0 rounded-md px-3 py-2.5', state === 'current' && 'bg-brand-wash')}>
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <p className="min-w-0 text-heading text-ink">
            <span className="mr-1.5 text-caption tabular text-ink-hint">{stage.index}</span>
            {stage.label}
          </p>
          <div className="flex shrink-0 flex-wrap gap-1.5">
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
        <p className="mt-1 max-w-prose text-label font-normal text-ink-soft">{stage.why}</p>
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

const NO_PROJECTION: Record<GoalKind, string> = {
  debt_payoff:
    'Clearing a debt grows nothing, so there is nothing to project. The roadmap above shows when it clears.',
  emergency_fund:
    'An emergency fund is kept safe and to hand, not invested, so there is nothing to project.',
  protection: 'Cover is bought, not grown, so there is nothing to project.',
  wealth_target: 'The roadmap has nothing to grow yet, so there is nothing to project.',
  retirement: 'The roadmap has nothing to grow yet, so there is nothing to project.',
}

function ProjectionCard({ customer }: { customer: CustomerFile }) {
  const { projection, goal, asOf, profile } = customer
  const roles = projection ? scenarioRoles(projection) : null

  if (!projection || !roles) {
    return (
      <Block title="Projection">
        <EmptyState
          className="py-5"
          icon={<LineChart />}
          title="No projection for this goal"
          body={NO_PROJECTION[goal.kind]}
        />
      </Block>
    )
  }

  const startYear = Number(asOf.slice(0, 4))
  const endYear = startYear + projection.years
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
        <Money value={projection.monthlyContribution} className="font-semibold text-ink" /> a month
        {projection.existingCorpus > 0 ? (
          <>
            {' '}
            on top of <Money
              value={projection.existingCorpus}
              className="font-semibold text-ink"
            />{' '}
            already invested
          </>
        ) : null}
        , over {plural(Math.round(projection.years), 'year')} to {Math.floor(endYear)}.
      </p>
      <ScenarioLegend projection={projection} roles={roles} />
      <div className="mt-4">
        <ProjectionChart
          projection={projection}
          roles={roles}
          startYear={startYear}
          startAge={profile.age}
        />
      </div>
      <div className="mt-4 grid gap-2 border-t border-hairline-soft pt-4">
        <p className="text-label font-normal text-ink-soft">
          In today&rsquo;s money, at {formatPct(projection.inflationPct)} inflation a year, the{' '}
          {roles.mid.label.toLowerCase()} <Money value={roles.mid.corpus} short /> is worth{' '}
          <Money value={roles.mid.realCorpus} short className="font-semibold text-ink" />.
        </p>
        <Disclaimer>{projection.disclaimer}</Disclaimer>
        <p className="text-caption font-normal text-ink-faint">As at {formatDate(asOf)}.</p>
      </div>
    </Card>
  )
}

/**
 * The legend doubles as the figures: each scenario's rate, its corpus at the horizon and the same
 * in today's money, ordered as the band reads from the bottom up. Paid in sits last, in grey.
 */
function ScenarioLegend({
  projection,
  roles,
}: {
  projection: NonNullable<CustomerFile['projection']>
  roles: ScenarioRoles
}) {
  const contributed = roles.mid.contributed
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
            <Money value={s.corpus} short />
          </dd>
          <dd className="mt-0.5 text-caption tabular text-ink-soft">
            At {formatPct(s.ratePct)} a year
          </dd>
          <dd className="text-caption font-normal text-ink-faint">
            <Money value={s.realCorpus} short /> in today&rsquo;s money
          </dd>
        </div>
      ))}
      <div className="bg-surface px-4 py-3">
        <dt className="flex items-center gap-1.5 text-caption text-ink-soft">
          <LegendLine color={SWATCH.paid} weight={2} />
          Paid in
        </dt>
        <dd className="mt-1 text-title text-ink">
          <Money value={contributed} short />
        </dd>
        <dd className="mt-0.5 text-caption text-ink-soft">Before any growth</dd>
        <dd className="text-caption font-normal text-ink-faint">
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
