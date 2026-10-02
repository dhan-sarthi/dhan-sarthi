import type { Projection } from '@dhan/contracts'
import { futureValue } from '@dhan/core'
import { chart, color, web } from '@dhan/design'
import type { SortingState } from '@tanstack/react-table'
import { createColumnHelper } from '@tanstack/react-table'
import {
  ArrowRight,
  CircleHelp,
  FileText,
  Inbox,
  Phone,
  Plus,
  Search,
  Settings2,
  StickyNote,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import {
  AiLabel,
  AllocationBar,
  AreaChart,
  Avatar,
  Button,
  Card,
  CardFooter,
  CardHeader,
  Chip,
  CommandPalette,
  DataTable,
  DeltaPill,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  Disclaimer,
  EmptyState,
  ErrorState,
  Field,
  HealthDot,
  IconButton,
  Input,
  Kbd,
  LinkTabs,
  MaskedField,
  Money,
  MonthColumns,
  MonthLines,
  PageHeader,
  PROJECTION_SWATCH,
  ProjectionChart,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
  PropertyList,
  RankedBars,
  scenarioRoles,
  SEGMENT,
  SectionLabel,
  SegmentBadge,
  SegmentTabs,
  Select,
  SEVERITY,
  SeverityChip,
  SeverityMark,
  SideRail,
  Skeleton,
  SkeletonStat,
  SkeletonText,
  Sparkline,
  SplitView,
  StackedBar,
  Stat,
  StrengthBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  TimelineDiff,
  TimelineEvent,
  TimelineMonth,
  toast,
  ToggleGroup,
  Tooltip,
  VerifiedBadge,
  modKey,
  type CommandItemDef,
} from '../ui/index.ts'
import { ApiError } from '../api/client.ts'
import { formatDate, formatInrProse, formatLastActive } from '../lib/format.ts'
import { matchPage, rankCustomers } from '../lib/search.ts'
import { Brand } from '../shell/Brand.tsx'

/*
 * The style guide: every kit component, with sample props written by hand for this page. None of
 * it is customer data and none of it comes from the fixtures; the names and figures below are
 * invented to exercise layout (long names, big and small figures, empty and broken states).
 * Dev only: App.tsx registers the route only when import.meta.env.DEV is true.
 */

/* ---------------------------------------------------------------- Sample data */

interface SampleRow {
  id: string
  name: string
  initials: string
  age: number
  city: string
  segment: 'priority' | 'affluent' | 'mass'
  value: number
  series: number[]
  allocation: { cash: number; equity: number; fixed: number }
  health: 'on_track' | 'at_risk' | 'off_track'
  signal: { severity: 'urgent' | 'important' | 'opportunity'; title: string } | null
  strength: { level: 'high' | 'medium' | 'low'; reason: string }
  /** A calendar date, read against `KIT_AS_OF` the way the console reads the RM's as-of date. */
  lastActivityAt: string
}

/** The sample book's as-of date: every "last active" on this page is measured to it. */
const KIT_AS_OF = '2026-09-01'

/** The strength reason's first clause, worded as the API words it, from the same formatter. */
function activeClause(at: string): string {
  const ago = formatLastActive(at, KIT_AS_OF)
  return `Active ${ago.charAt(0).toLowerCase()}${ago.slice(1)}`
}

const SAMPLE_ROWS: SampleRow[] = [
  {
    id: 's1',
    name: 'Anika Raghunathan',
    initials: 'AR',
    age: 41,
    city: 'Pune',
    segment: 'affluent',
    value: 2840000,
    series: [21, 22, 22.5, 23, 22.8, 24, 25.2, 25.9, 26.4, 27, 27.8, 28.4],
    allocation: { cash: 620000, equity: 1540000, fixed: 680000 },
    health: 'on_track',
    signal: { severity: 'opportunity', title: '₹3.1L idle in savings for 4 months' },
    strength: {
      level: 'high',
      reason: `${activeClause('2026-08-26')} · 3 IDBI products · 62% of balances with IDBI`,
    },
    lastActivityAt: '2026-08-26',
  },
  {
    id: 's2',
    name: 'Dev Malhotra',
    initials: 'DM',
    age: 29,
    city: 'Indore',
    segment: 'mass',
    value: 412000,
    series: [5.2, 5.0, 4.9, 4.7, 4.6, 4.4, 4.5, 4.3, 4.2, 4.1, 4.15, 4.12],
    allocation: { cash: 180000, equity: 92000, fixed: 140000 },
    health: 'at_risk',
    signal: { severity: 'urgent', title: 'Card at 36.0% — ₹1.4L outstanding' },
    strength: {
      level: 'medium',
      reason: `${activeClause('2026-08-11')} · 1 IDBI product · 44% of balances with IDBI`,
    },
    lastActivityAt: '2026-08-11',
  },
  {
    id: 's3',
    name: 'Farah Siddiqui',
    initials: 'FS',
    age: 52,
    city: 'Kochi',
    segment: 'priority',
    value: 7650000,
    series: [70, 71, 71.5, 72, 73.4, 73, 74.1, 75, 75.2, 75.9, 76.1, 76.5],
    allocation: { cash: 900000, equity: 3900000, fixed: 2850000 },
    health: 'on_track',
    signal: { severity: 'important', title: 'FD of ₹8L matures in 12 days' },
    strength: {
      level: 'high',
      reason: `${activeClause('2026-08-30')} · 4 IDBI products · 81% of balances with IDBI`,
    },
    lastActivityAt: '2026-08-30',
  },
  {
    id: 's4',
    name: 'Gopal Venkatasubramanian',
    initials: 'GV',
    age: 63,
    city: 'Nagpur',
    segment: 'affluent',
    value: 1320000,
    series: [15, 14.6, 14.2, 14, 13.9, 13.6, 13.5, 13.4, 13.3, 13.3, 13.2, 13.2],
    allocation: { cash: 1010000, equity: 0, fixed: 310000 },
    health: 'off_track',
    signal: { severity: 'important', title: 'No health cover; ₹5L gap for his age' },
    strength: {
      level: 'low',
      reason: `${activeClause('2026-06-19')} · 1 IDBI product · 23% of balances with IDBI`,
    },
    lastActivityAt: '2026-06-19',
  },
  {
    id: 's5',
    name: 'Lata Pillai',
    initials: 'LP',
    age: 35,
    city: 'Mumbai',
    segment: 'mass',
    value: 690000,
    series: [5.9, 6, 6.1, 6.3, 6.2, 6.4, 6.5, 6.6, 6.7, 6.8, 6.85, 6.9],
    allocation: { cash: 210000, equity: 330000, fixed: 150000 },
    health: 'on_track',
    signal: null,
    strength: {
      level: 'medium',
      reason: `${activeClause('2026-08-21')} · 2 IDBI products · 55% of balances with IDBI`,
    },
    lastActivityAt: '2026-08-21',
  },
]

const MONTHS = [
  '2025-10',
  '2025-11',
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
]
const BALANCES = [3.82, 3.9, 3.86, 3.98, 4.05, 4.02, 4.18, 4.26, 4.31, 4.4, 4.46, 4.52].map(
  (v) => v * 1e7,
)
const WITH_IDBI = [2.1, 2.14, 2.12, 2.2, 2.26, 2.24, 2.32, 2.38, 2.4, 2.47, 2.5, 2.55].map(
  (v) => v * 1e7,
)

/* ---------------------------------------------------------------- Page */

const SECTIONS = [
  ['foundations', 'Foundations'],
  ['controls', 'Controls'],
  ['status', 'Status'],
  ['figures', 'Figures'],
  ['cards', 'Cards and tabs'],
  ['table', 'Table and rail'],
  ['forms', 'Forms'],
  ['overlays', 'Overlays'],
  ['states', 'States'],
  ['timeline', 'Timeline'],
  ['charts', 'Charts'],
  ['notices', 'Notices'],
] as const

export default function Kit() {
  return (
    <div className="min-h-screen bg-ground">
      <header className="sticky top-0 z-20 flex h-topbar items-center gap-6 border-b border-hairline bg-ground px-8">
        <Brand />
        <span className="text-label text-ink-soft">Component kit</span>
        <span className="ml-auto text-caption text-ink-faint">Sample props only · dev build</span>
      </header>
      <div className="mx-auto grid max-w-content grid-cols-[180px_minmax(0,1fr)] gap-10 px-8 py-10">
        <nav aria-label="Kit sections" className="sticky top-24 self-start">
          <ul className="grid gap-1">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="block rounded-sm px-2 py-1 text-label text-ink-soft hover:bg-ink/5 hover:text-ink"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <main className="grid min-w-0 gap-16">
          <PageHeader
            title="RM Desk component kit"
            subtitle="Every primitive the console is built from, on the tokens in packages/design/tokens.json."
          />
          <Foundations />
          <Controls />
          <Status />
          <Figures />
          <CardsAndTabs />
          <TableAndRail />
          <Forms />
          <Overlays />
          <States />
          <Timeline />
          <Charts />
          <Notices />
        </main>
      </div>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="mb-5 text-title text-ink">{title}</h2>
      {children}
    </section>
  )
}

function Specimen({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <SectionLabel as="h3" className="mb-3">
        {label}
      </SectionLabel>
      {children}
    </div>
  )
}

/* ---------------------------------------------------------------- Foundations */

/** Written out so Tailwind sees each class; a class built from a string at runtime never exists. */
const TYPE_CLASS = {
  figure: 'text-figure',
  display: 'text-display',
  title: 'text-title',
  heading: 'text-heading',
  body: 'text-body',
  label: 'text-label',
  caption: 'text-caption',
  micro: 'text-micro tracking-micro uppercase',
} as const

const kebab = (s: string): string => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

function Swatch({ name, cssVar, value }: { name: string; cssVar: string; value: string }) {
  return (
    <div className="grid gap-1.5">
      <div
        className="h-12 rounded-md ring-1 ring-hairline ring-inset"
        style={{ background: `var(${cssVar})` }}
      />
      <div className="text-caption text-ink">{name}</div>
      <div className="font-mono text-caption-plain text-ink-faint">{value}</div>
    </div>
  )
}

function Foundations() {
  const core = [
    'ink',
    'inkMid',
    'inkSoft',
    'inkFaint',
    'inkHint',
    'ground',
    'groundDeep',
    'surface',
    'brand',
    'brandDeep',
    'streak',
    'budget',
    'success',
    'danger',
    'dangerSoft',
  ] as const
  return (
    <Section id="foundations" title="Foundations">
      <div className="grid gap-10">
        <Specimen label="Colour">
          <div className="grid grid-cols-5 gap-4 xl:grid-cols-8">
            {core.map((k) => (
              <Swatch key={k} name={kebab(k)} cssVar={`--color-${kebab(k)}`} value={color[k]} />
            ))}
            {Object.entries(web.color).map(([k, v]) => (
              <Swatch key={k} name={kebab(k)} cssVar={`--color-${kebab(k)}`} value={v} />
            ))}
          </div>
        </Specimen>
        <Specimen label="Chart palette: categorical, then the sequential green and the neutral greys">
          <div className="grid gap-3">
            <div className="flex gap-2">
              {chart.categorical.map((c, i) => (
                <div key={c} className="grid flex-1 gap-1">
                  <div
                    className="h-10 rounded-sm"
                    style={{ background: `var(--color-chart-${i + 1})` }}
                  />
                  <span className="text-caption text-ink-faint">{i + 1}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-1">
              {Object.keys(chart.sequential).map((k) => (
                <div
                  key={k}
                  className="h-6 flex-1 first:rounded-l-sm last:rounded-r-sm"
                  style={{ background: `var(--color-chart-seq-${k})` }}
                />
              ))}
            </div>
            <div className="flex gap-1">
              {Object.keys(chart.neutral).map((k) => (
                <div
                  key={k}
                  className="h-6 flex-1 first:rounded-l-sm last:rounded-r-sm"
                  style={{ background: `var(--color-chart-neutral-${k})` }}
                />
              ))}
            </div>
          </div>
        </Specimen>
        <Specimen label="Type: one class per role">
          <Card className="grid gap-4">
            {Object.entries(web.type).map(([role, spec]) => (
              <div key={role} className="grid grid-cols-[140px_minmax(0,1fr)] items-baseline gap-6">
                <span className="font-mono text-caption-plain text-ink-faint">
                  text-{role} · {spec.size}/{spec.leading}
                </span>
                <span className={`${TYPE_CLASS[role as keyof typeof TYPE_CLASS]} text-ink`}>
                  {role === 'figure' || role === 'display'
                    ? '₹4,82,448 across 3 banks'
                    : 'Anika’s card is at 34.8% with ₹1.86L outstanding'}
                </span>
              </div>
            ))}
          </Card>
        </Specimen>
        <Specimen label="Radius and elevation">
          <div className="flex flex-wrap items-end gap-6">
            {Object.entries(web.radius).map(([k, v]) => (
              <div key={k} className="grid justify-items-center gap-2">
                <div
                  className="size-16 border border-hairline bg-surface"
                  style={{ borderRadius: v }}
                />
                <span className="text-caption text-ink-faint">rounded-{k}</span>
              </div>
            ))}
            <div className="grid justify-items-center gap-2">
              <div className="size-16 rounded-lg bg-surface shadow-popover" />
              <span className="text-caption text-ink-faint">shadow-popover</span>
            </div>
            <div className="grid justify-items-center gap-2">
              <div className="size-16 rounded-lg bg-surface shadow-overlay" />
              <span className="text-caption text-ink-faint">shadow-overlay</span>
            </div>
          </div>
        </Specimen>
      </div>
    </Section>
  )
}

/* ---------------------------------------------------------------- Controls */

function Controls() {
  return (
    <Section id="controls" title="Controls">
      <div className="grid gap-8">
        <Specimen label="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={<Phone aria-hidden />}>
              Log a call
            </Button>
            <Button icon={<StickyNote aria-hidden />}>Add note</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger">Remove note</Button>
            <Button variant="link" iconRight={<ArrowRight aria-hidden />}>
              Open file
            </Button>
            <Button variant="primary" loading>
              Verifying
            </Button>
            <Button disabled>Disabled</Button>
          </div>
        </Specimen>
        <Specimen label="Sizes">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg" variant="primary">
              Large
            </Button>
          </div>
        </Specimen>
        <Specimen label="Icon buttons and keys">
          <div className="flex flex-wrap items-center gap-3">
            <IconButton label="Settings" icon={<Settings2 aria-hidden />} />
            <IconButton label="Add" icon={<Plus aria-hidden />} variant="secondary" />
            <IconButton label="Help" icon={<CircleHelp aria-hidden />} size="sm" />
            <span className="ml-4 flex items-center gap-1 text-label text-ink-soft">
              Search <Kbd>{modKey()}</Kbd>
              <Kbd>K</Kbd>
            </span>
            <span className="flex items-center gap-1 text-label text-ink-soft">
              Close <Kbd>Esc</Kbd>
            </span>
          </div>
        </Specimen>
      </div>
    </Section>
  )
}

/* ---------------------------------------------------------------- Status */

function Status() {
  return (
    <Section id="status" title="Status">
      <div className="grid grid-cols-2 gap-8">
        <Specimen label="Chip tones">
          <div className="flex flex-wrap gap-2">
            <Chip tone="brand">Brand</Chip>
            <Chip tone="ink">Ink</Chip>
            <Chip tone="success">Success</Chip>
            <Chip tone="streak">Streak</Chip>
            <Chip tone="budget">Budget</Chip>
            <Chip tone="danger">Danger</Chip>
            <Chip tone="neutral">Neutral</Chip>
            <Chip tone="outline">Outline</Chip>
          </div>
        </Specimen>
        <Specimen label="Severity (RM voice): chip, filled mark, bare mark">
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              <SeverityChip severity="urgent" />
              <SeverityChip severity="important" />
              <SeverityChip severity="opportunity" />
              <SeverityChip severity="urgent" size="md" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SeverityMark severity="urgent" />
              <SeverityMark severity="important" />
              <SeverityMark severity="opportunity" />
              <SeverityMark severity="urgent" size="xs" />
              <span className="mx-2 h-4 w-px bg-hairline" aria-hidden />
              {(['urgent', 'important', 'opportunity'] as const).map((level) => (
                <span key={level} className="inline-flex items-center gap-1.5 text-label">
                  <SeverityMark severity={level} variant="bare" labelSuffix=": " />
                  {SEVERITY[level].label}
                </span>
              ))}
            </div>
          </div>
        </Specimen>
        <Specimen label="Segment: chip, and the quiet chip a dense table uses">
          <div className="flex flex-wrap gap-2">
            <SegmentBadge segment="priority" />
            <SegmentBadge segment="affluent" />
            <SegmentBadge segment="mass" />
            <span className="mx-2 h-5 w-px bg-hairline" aria-hidden />
            <SegmentBadge segment="priority" variant="quiet" />
            <SegmentBadge segment="affluent" variant="quiet" />
            <SegmentBadge segment="mass" variant="quiet" />
          </div>
        </Specimen>
        <Specimen label="Goal health">
          <div className="flex flex-wrap gap-5">
            <HealthDot health="on_track" />
            <HealthDot health="at_risk" />
            <HealthDot health="off_track" />
          </div>
        </Specimen>
        <Specimen label="Relationship strength (hover for the reason)">
          <div className="flex flex-wrap gap-5">
            {SAMPLE_ROWS.slice(1, 4).map((r) => (
              <StrengthBadge key={r.id} strength={r.strength} />
            ))}
          </div>
        </Specimen>
        <Specimen label="Avatars">
          <div className="flex items-center gap-3">
            {SAMPLE_ROWS.map((r) => (
              <Avatar key={r.id} name={r.name} initials={r.initials} />
            ))}
            <Avatar name="Sample Desk" size="lg" tone="brand" />
            <Avatar name="Anika Raghunathan" size="sm" />
          </div>
        </Specimen>
      </div>
    </Section>
  )
}

/* ---------------------------------------------------------------- Figures */

function Figures() {
  return (
    <Section id="figures" title="Figures">
      <div className="grid gap-8">
        <Specimen label="Money">
          <Card className="grid grid-cols-5 gap-6">
            <Example label="Full">
              <Money value={482448} className="text-title" />
            </Example>
            <Example label="Short">
              <Money value={48200000} short className="text-title" />
            </Example>
            <Example label="Paise">
              <Money value={482448.41} paise className="text-title" />
            </Example>
            <Example label="Signed, toned">
              <Money value={-186000} signed toned className="text-title" />
            </Example>
            <Example label="Crore">
              <Money value={124500000} className="text-title" />
            </Example>
          </Card>
        </Specimen>
        <Specimen label="Money in prose">
          <Card className="grid gap-3">
            <p className="text-body text-ink">
              <Money value={22501} short="auto" /> a month left after spending;{' '}
              <Money value={22770000} short="auto" /> short on life cover; a card balance of{' '}
              <Money value={186240} short="auto" />.
            </p>
            <p className="text-caption-plain text-ink-faint">
              <code>{'<Money short="auto">'}</code> and <code>formatInrProse</code>: in full under
              ₹1 lakh, short from there up. The exact figure stays in the hover title. As a string:{' '}
              {formatInrProse(99999)} · {formatInrProse(100000)} · {formatInrProse(-1862400)}
            </p>
          </Card>
        </Specimen>
        <Specimen label="Last active">
          <Card padded={false}>
            <table className="w-full text-label">
              <thead>
                <tr className="text-caption text-ink-faint">
                  <th className="px-5 py-2.5 text-left font-medium">Last activity</th>
                  <th className="px-5 py-2.5 text-left font-medium">
                    <code>formatLastActive</code>, as at {formatDate(KIT_AS_OF)}
                  </th>
                  <th className="px-5 py-2.5 text-left font-medium">
                    The strength reason&rsquo;s words
                  </th>
                </tr>
              </thead>
              <tbody>
                {['2026-09-01', '2026-08-31', '2026-08-26', '2026-08-01', '2026-03-01'].map(
                  (at) => (
                    <tr key={at} className="border-t border-hairline-soft">
                      <td className="px-5 py-2.5 tabular text-ink-soft">{formatDate(at)}</td>
                      <td className="px-5 py-2.5 text-ink">{formatLastActive(at, KIT_AS_OF)}</td>
                      <td className="px-5 py-2.5 text-ink-soft">{activeClause(at)}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </Card>
          <p className="mt-2 max-w-3xl text-caption-plain text-ink-faint">
            Whole days to the RM&rsquo;s as-of date, never the wall clock, so the Book row, the
            preview, the customer&rsquo;s highlight and the strength reason the API writes read the
            same words for the same fact.
          </p>
        </Specimen>
        <Specimen label="Deltas">
          <div className="flex flex-wrap items-center gap-3">
            <DeltaPill value={2.4} />
            <DeltaPill value={-4.2} />
            <DeltaPill value={0} />
            <DeltaPill value={1300000} unit="inr" />
            <DeltaPill value={3} unit="count" invert />
            <DeltaPill value={-1.5} unit="pp" />
          </div>
        </Specimen>
        <Specimen label="Compact strip (Stat size sm: the value truncates before it overprints)">
          <Card className="grid grid-cols-4 gap-4 py-4">
            <Stat
              size="sm"
              label="Book value"
              value={106000000}
              unit="inr"
              deltaLabel="As at 1 Sep 2026"
            />
            <Stat
              size="sm"
              label="With IDBI"
              value={51600000}
              unit="inr"
              deltaLabel="91.4% of balances"
            />
            <Stat
              size="sm"
              label="SIP book"
              value={443000}
              unit="inr"
              deltaLabel="registered SIPs"
            />
            <Stat size="sm" label="Asked for you" value={4} unit="count" />
          </Card>
        </Specimen>
        <Specimen label="KPI strip (Stat: a part of a whole says its denominator; a line names itself)">
          <div className="grid grid-cols-5 gap-4">
            <Card>
              <Stat
                label="Book value"
                value={45200000}
                unit="inr"
                delta={580000}
                deltaLabel="vs 1 Aug, balances"
                series={BALANCES}
              />
            </Card>
            <Card>
              <Stat
                label="Monthly SIP book"
                value={1840000}
                unit="inr"
                delta={1.5}
                deltaUnit="pct"
                deltaLabel="vs last month"
              />
            </Card>
            <Card>
              <Stat label="Goals on track" value={72} unit="pct" delta={-3} deltaLabel="vs 1 Aug" />
            </Card>
            <Card>
              <Stat
                label="Asked for you"
                value={3}
                outOf={46}
                unit="count"
                delta={1}
                invert
                deltaLabel="oldest waiting 4 days, which is the longest anyone has waited this month"
              />
            </Card>
            <Card>
              <Stat
                label="Book value, with its line named"
                value={45200000}
                unit="inr"
                series={BALANCES}
                seriesLabel="12 month-ends, Sep 2025 to Aug 2026"
              />
            </Card>
          </div>
        </Specimen>
        <Specimen label="Sparkline, allocation and stacked bar">
          <Card className="grid grid-cols-3 items-center gap-8">
            <div className="flex items-center gap-4">
              <Sparkline values={SAMPLE_ROWS[0]!.series} label="Balances over 12 months, rising" />
              <Sparkline values={SAMPLE_ROWS[1]!.series} tone="danger" />
              <Sparkline values={SAMPLE_ROWS[3]!.series} tone="neutral" area />
            </div>
            <AllocationBar allocation={SAMPLE_ROWS[0]!.allocation} />
            <AllocationBar allocation={SAMPLE_ROWS[3]!.allocation} legend size="regular" />
            <div className="grid gap-1">
              <span className="text-caption text-ink-faint">
                Window: the last three months over the year (fluid)
              </span>
              <Sparkline
                values={SAMPLE_ROWS[1]!.series}
                window={4}
                fluid
                height={36}
                label="Down over the year, up 6% in the last three months"
              />
            </div>
            <div className="col-span-2 grid gap-2">
              <span className="text-caption text-ink-faint">Stacked bar: segments by value</span>
              <StackedBar
                label="Priority 61%, Affluent 30%, Mass 9%"
                parts={[
                  { id: 'priority', value: 61, fill: SEGMENT.priority.fill },
                  { id: 'affluent', value: 30, fill: SEGMENT.affluent.fill },
                  { id: 'mass', value: 9, fill: SEGMENT.mass.fill },
                ]}
              />
            </div>
          </Card>
        </Specimen>
      </div>
    </Section>
  )
}

function Example({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-caption text-ink-faint">{label}</span>
      {children}
    </div>
  )
}

/* ---------------------------------------------------------------- Cards and tabs */

function CardsAndTabs() {
  const [segment, setSegment] = useState<
    'all' | 'priority' | 'affluent' | 'mass' | 'at_risk' | 'idle_cash'
  >('all')
  return (
    <Section id="cards" title="Cards and tabs">
      <div className="grid gap-8">
        <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-6">
          <Card>
            <CardHeader title="Call today" count={10} to="/kit" />
            <ul className="grid">
              {SAMPLE_ROWS.slice(0, 3).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 border-b border-hairline-soft py-3 last:border-0"
                >
                  <Avatar name={r.name} initials={r.initials} />
                  <div className="min-w-0 flex-1">
                    <p className="text-label text-ink">{r.name}</p>
                    <p className="truncate text-caption-plain text-ink-soft">
                      {r.signal?.title ?? 'Asked to talk to you'}
                    </p>
                  </div>
                  {r.signal ? <SeverityChip severity={r.signal.severity} /> : null}
                </li>
              ))}
            </ul>
            <CardFooter>
              <span>Ranked by severity, then deadline</span>
              <Button variant="link" size="sm" className="text-caption">
                How the queue is ranked
              </Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader title="Asked for you" count={0} />
            <EmptyState
              icon={<Inbox />}
              title="Nobody is waiting"
              body="When a customer taps Talk to your relationship manager in the app, they appear here."
            />
          </Card>
        </div>
        <Specimen label="Segment tabs: fill, and fit with groups (the Book's strip)">
          <div className="grid gap-3">
            <SegmentTabs
              label="Book segments"
              value={segment}
              onChange={setSegment}
              tabs={[
                { id: 'all', label: 'All', count: 46 },
                { id: 'priority', label: 'Priority', count: 5 },
                { id: 'affluent', label: 'Affluent', count: 17 },
                { id: 'mass', label: 'Mass', count: 24 },
                { id: 'at_risk', label: 'At risk', count: 9 },
                { id: 'idle_cash', label: 'Idle cash', count: 12 },
              ]}
            />
            <SegmentTabs
              label="Book segments and work"
              layout="fit"
              value={segment}
              onChange={setSegment}
              tabs={[
                { id: 'all', label: 'All', count: 46, group: 'who' },
                { id: 'priority', label: 'Priority', count: 5, group: 'who' },
                { id: 'affluent', label: 'Affluent', count: 17, group: 'who' },
                { id: 'mass', label: 'Mass', count: 24, group: 'who' },
                { id: 'at_risk', label: 'At risk', count: 9, group: 'work' },
                { id: 'idle_cash', label: 'Idle cash', count: 12, group: 'work' },
              ]}
            />
          </div>
        </Specimen>
        <Specimen label="Toggle group (call or note)">
          <KindToggle />
        </Specimen>
        <div className="grid grid-cols-2 gap-8">
          <Specimen label="Tabs (in page)">
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="journey" count={38}>
                  Journey
                </TabsTrigger>
                <TabsTrigger value="money">Money</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <SkeletonText lines={2} />
              </TabsContent>
              <TabsContent value="journey">
                <SkeletonText lines={3} />
              </TabsContent>
              <TabsContent value="money">
                <SkeletonText lines={1} />
              </TabsContent>
            </Tabs>
          </Specimen>
          <Specimen label="Link tabs (addresses)">
            <LinkTabs
              label="Sample file"
              tabs={[
                { to: '/kit', label: 'Overview', end: true },
                { to: '/kit/journey', label: 'Journey', count: 38 },
                { to: '/kit/money', label: 'Money' },
              ]}
            />
          </Specimen>
        </div>
      </div>
    </Section>
  )
}

function KindToggle() {
  const [kind, setKind] = useState<'call' | 'note'>('call')
  return (
    <ToggleGroup
      label="This is"
      showLabel
      value={kind}
      onChange={setKind}
      options={[
        { value: 'call', label: 'Call', icon: <Phone aria-hidden /> },
        { value: 'note', label: 'Note', icon: <StickyNote aria-hidden /> },
      ]}
    />
  )
}

/* ---------------------------------------------------------------- Table and rail */

const col = createColumnHelper<SampleRow>()

function TableAndRail() {
  const [selected, setSelected] = useState<string | null>(null)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'value', desc: true }])
  const row = SAMPLE_ROWS.find((r) => r.id === selected) ?? null

  const columns = useMemo(
    () => [
      col.accessor('name', {
        header: 'Customer',
        meta: { width: '26%' },
        cell: (c) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar name={c.row.original.name} initials={c.row.original.initials} size="sm" />
            <div className="min-w-0">
              <div className="truncate text-label text-ink">{c.getValue()}</div>
              <div className="truncate text-caption-plain text-ink-faint">
                {`${c.row.original.age} · ${c.row.original.city}`}
              </div>
            </div>
          </div>
        ),
        footer: (c) => `${c.table.getRowModel().rows.length} customers`,
      }),
      col.accessor('segment', {
        header: 'Segment',
        cell: (c) => <SegmentBadge segment={c.getValue()} variant="quiet" />,
      }),
      col.accessor('value', {
        header: 'Relationship value',
        meta: { align: 'right' },
        cell: (c) => (
          <div className="flex items-center justify-end gap-3">
            <Sparkline values={c.row.original.series} width={64} height={20} endDot={false} />
            <Money value={c.getValue()} short className="w-16 text-label" />
          </div>
        ),
        footer: (c) => (
          <Money
            value={c.table.getRowModel().rows.reduce((s, r) => s + r.original.value, 0)}
            short
            className="text-label text-ink"
          />
        ),
      }),
      col.display({
        id: 'allocation',
        header: 'Allocation',
        meta: { width: 120 },
        cell: (c) => <AllocationBar allocation={c.row.original.allocation} />,
      }),
      col.accessor('health', {
        header: 'Goal',
        cell: (c) => <HealthDot health={c.getValue()} />,
      }),
      col.accessor((r) => r.signal?.title ?? '', {
        id: 'signal',
        header: 'Top signal',
        enableSorting: false,
        cell: (c) =>
          c.row.original.signal ? (
            <span className="flex min-w-0 items-center gap-2">
              <SeverityChip severity={c.row.original.signal.severity} />
              <span className="truncate text-label text-ink-soft">
                {c.row.original.signal.title}
              </span>
            </span>
          ) : (
            <span className="text-label text-ink-faint">Nothing to act on</span>
          ),
        meta: { width: '28%' },
      }),
      col.accessor((r) => r.strength.level, {
        id: 'strength',
        header: 'Strength',
        cell: (c) => <StrengthBadge strength={c.row.original.strength} />,
      }),
    ],
    [],
  )

  return (
    <Section id="table" title="Table and rail">
      <p className="mb-4 max-w-3xl text-label-plain text-ink-soft">
        A clickable row is one Tab stop: the segment, allocation and strength badges inside it give
        theirs up (<code>InteractiveRow</code>), and their words reach a screen reader through their
        labels. The arrow keys walk the rows; with the preview open it follows the focus through{' '}
        <code>onRowFocus</code>. Every row carries <code>data-row-id</code>.
      </p>
      <SplitView
        open={row !== null}
        rail={
          row ? (
            <SideRail
              label="Customer preview"
              title={row.name}
              subtitle={`${row.age} · ${row.city}`}
              leading={<Avatar name={row.name} initials={row.initials} />}
              actions={
                <Button size="sm" iconRight={<ArrowRight aria-hidden />}>
                  Open file
                </Button>
              }
              onClose={() => setSelected(null)}
              stickyTop={72}
            >
              <div>
                <p className="text-caption text-ink-faint">Relationship value</p>
                <Money value={row.value} className="text-display" />
              </div>
              <AreaChart
                data={row.series.map((v, i) => ({ month: MONTHS[i] ?? '', v: v * 1e5 }))}
                x="month"
                series={[{ key: 'v', label: 'Balances' }]}
                height={120}
                yAxis={false}
                label="Balances over 12 months"
              />
              <AllocationBar allocation={row.allocation} legend size="regular" />
              <PropertyList
                items={[
                  { label: 'Segment', value: <SegmentBadge segment={row.segment} /> },
                  { label: 'Goal', value: <HealthDot health={row.health} /> },
                  { label: 'Strength', value: <StrengthBadge strength={row.strength} /> },
                  {
                    label: 'Last active',
                    value: (
                      <span title={formatDate(row.lastActivityAt)}>
                        {formatLastActive(row.lastActivityAt, KIT_AS_OF)}
                      </span>
                    ),
                  },
                ]}
              />
            </SideRail>
          ) : null
        }
      >
        <DataTable
          caption="Sample customers"
          data={SAMPLE_ROWS}
          columns={columns}
          getRowId={(r) => r.id}
          sorting={sorting}
          onSortingChange={setSorting}
          selectedId={selected}
          onRowClick={(r) => setSelected((cur) => (cur === r.id ? null : r.id))}
          // The preview follows the arrow keys only, so Tab from the chosen row goes into it.
          onRowFocus={(r, cause) => {
            if (cause === 'arrow') setSelected((cur) => (cur === null ? null : r.id))
          }}
          columnVisibility={row ? { signal: false, allocation: false, strength: false } : {}}
          empty={
            <EmptyState title="No customers match" body="Clear the search or pick another tab." />
          }
        />
      </SplitView>
      <div className="mt-6 grid grid-cols-2 gap-6">
        <DataTable
          caption="Loading"
          data={[]}
          columns={columns.slice(0, 4)}
          getRowId={(r) => r.id}
          loading
          density="dense"
        />
        <DataTable
          caption="Empty"
          data={[]}
          columns={columns.slice(0, 4)}
          getRowId={(r) => r.id}
          empty={
            <EmptyState
              icon={<Search />}
              title="No customers match ‘zz’"
              body="Search looks at names, CIFs and cities."
            />
          }
        />
      </div>
    </Section>
  )
}

/* ---------------------------------------------------------------- Forms */

function Forms() {
  return (
    <Section id="forms" title="Forms">
      <Card className="grid max-w-3xl grid-cols-2 gap-5">
        <Field label="Employee number" hint="Six digits, as on your ID card">
          {(c) => <Input {...c} placeholder="204117" inputMode="numeric" />}
        </Field>
        <Field label="Search" corner={<Kbd>/</Kbd>}>
          {(c) => <Input {...c} leading={<Search aria-hidden />} placeholder="Name, CIF or city" />}
        </Field>
        <Field label="Purpose" error="Say why you are opening the file.">
          {(c) => <Input {...c} />}
        </Field>
        <Field label="Sort by">
          {(c) => (
            <Select {...c} defaultValue="value">
              <option value="value">Relationship value</option>
              <option value="activity">Last activity</option>
              <option value="signal">Top signal</option>
            </Select>
          )}
        </Field>
        <Field
          label="Note"
          hint="Visible to you and in the customer’s journey"
          className="col-span-2"
        >
          {(c) => <Textarea {...c} placeholder="What was discussed, and what happens next" />}
        </Field>
      </Card>
    </Section>
  )
}

/* ---------------------------------------------------------------- Overlays */

const KIT_PAGE = { label: 'Book', hint: 'Every customer in your book' }

function Overlays() {
  const [palette, setPalette] = useState(false)
  // Opened by a plain onClick, as the console's pages open theirs: focus still comes back here.
  const [dialogOpen, setDialogOpen] = useState(false)
  const [query, setQuery] = useState('')
  const toItem = (r: SampleRow, highlight: readonly [number, number] | null): CommandItemDef => ({
    id: r.id,
    label: r.name,
    highlight,
    hint: `${SEGMENT[r.segment].label} · ${r.city}`,
    icon: <Avatar name={r.name} initials={r.initials} size="sm" />,
    onSelect: () => toast(`Opening ${r.name}`),
  })
  const sample = SAMPLE_ROWS.map((r) => ({ ...r, cif: `IDBI00000${r.id.slice(1)}0001` }))
  const ranked = rankCustomers(query, sample)
  return (
    <Section id="overlays" title="Overlays">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader
              title="Log a call"
              description="It goes into the customer’s journey and your access log."
            />
            <Field label="What was discussed">{(c) => <Textarea {...c} rows={4} />}</Field>
            <DialogFooter>
              <Button>Cancel</Button>
              <Button variant="primary">Log call</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" icon={<CircleHelp aria-hidden />}>
              Why?
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <PopoverTitle>Why this was suggested</PopoverTitle>
            <PopoverDescription className="mt-1">
              Savings above three months of spending have sat idle for 4 months.
            </PopoverDescription>
            <PropertyList
              className="mt-3"
              items={[
                { label: 'Insight', value: 'Idle cash' },
                { label: 'Source', value: 'Ledger, 12 months' },
                { label: 'Suggested', value: '1 Sep 2026' },
              ]}
            />
          </PopoverContent>
        </Popover>
        <Tooltip content="Tooltips label; they never hold the only copy of a fact.">
          <Button variant="ghost">Hover for tooltip</Button>
        </Tooltip>
        <Button icon={<Search aria-hidden />} onClick={() => setPalette(true)}>
          Command palette
        </Button>
        <Button
          onClick={() =>
            toast.success('Call logged', { description: 'Added to the journey for 1 Sep 2026.' })
          }
        >
          Show toast
        </Button>
        <Button
          onClick={() =>
            toast.error('The note did not save', {
              description: 'The server did not answer. Try again.',
            })
          }
        >
          Error toast
        </Button>
      </div>
      <p className="mt-3 max-w-3xl text-caption-plain text-ink-faint">
        The palette ranks with <code>lib/search.ts</code>: whole name, CIF, start of the name, start
        of a word, the CIF&rsquo;s ends, the city, then one typo in a longer word, offered only when
        nothing else matches. Nothing weaker is listed. Empty, it offers the customers opened last.
        Try &ldquo;sid&rdquo;, &ldquo;pune&rdquo; or &ldquo;Venkatasubramaniam&rdquo;.
      </p>
      <CommandPalette
        open={palette}
        onOpenChange={(next) => {
          if (!next) setQuery('')
          setPalette(next)
        }}
        query={query}
        onQueryChange={setQuery}
        groups={[
          query.trim() === ''
            ? { heading: 'Recent', items: SAMPLE_ROWS.slice(0, 2).map((r) => toItem(r, null)) }
            : {
                heading: 'Customers',
                items: ranked.map(({ row, match }) => toItem(row, match.highlight)),
              },
          {
            heading: 'Go to',
            items:
              query.trim() === '' || matchPage(query, KIT_PAGE) !== null
                ? [
                    {
                      id: 'p1',
                      ...KIT_PAGE,
                      icon: <FileText aria-hidden />,
                      onSelect: () => undefined,
                    },
                  ]
                : [],
          },
        ]}
      />
    </Section>
  )
}

/* ---------------------------------------------------------------- States */

function States() {
  return (
    <Section id="states" title="States">
      <div className="grid grid-cols-3 gap-6">
        <Card>
          <CardHeader title="Loading" />
          <SkeletonStat />
          <Skeleton className="mt-6 h-24 w-full" />
        </Card>
        <Card>
          <CardHeader title="Empty" />
          <EmptyState
            icon={<Inbox />}
            title="You’re all caught up"
            body="No refusals since your last visit."
          />
        </Card>
        <Card>
          <CardHeader title="Error" />
          <ErrorState
            title="Today did not load"
            error={new ApiError(0, 'NETWORK', 'Could not reach the server.')}
            onRetry={() => undefined}
          />
        </Card>
      </div>
    </Section>
  )
}

/* ---------------------------------------------------------------- Timeline */

function Timeline() {
  return (
    <Section id="timeline" title="Timeline">
      <Card className="max-w-3xl">
        <TimelineMonth label="August 2026" count={3}>
          <TimelineEvent
            kind="note"
            source="rm"
            at="2026-08-28"
            title="Called about the FD maturing"
            detail="Wants to keep half liquid for school fees in January."
          />
          <TimelineEvent
            kind="advice"
            tone="refused"
            source="uday"
            at="2026-08-21"
            title="Uday refused a ULIP"
            detail="“A ULIP mixes cover and investment, and your emergency fund is short by ₹62,000.”"
            aside={<Chip tone="danger">BLOCKED · rule 3 of 9</Chip>}
          />
          <TimelineEvent kind="plan" source="engine" at="2026-08-01" title="Plan version 7" last>
            <TimelineDiff
              rows={[
                { field: 'Monthly SIP', before: '₹8,000', after: '₹10,500' },
                { field: 'Goal date', before: 'Mar 2034', after: 'Nov 2033' },
                { field: 'Emergency fund', before: null, after: '₹1,80,000' },
              ]}
            />
          </TimelineEvent>
        </TimelineMonth>
        <TimelineMonth label="July 2026" count={1}>
          <TimelineEvent
            kind="ledger"
            source="ledger"
            at="2026-07-03"
            title="Salary up 12%"
            aside={<Money value={14200} signed toned className="text-label" />}
            last
          />
        </TimelineMonth>
      </Card>
    </Section>
  )
}

/* ---------------------------------------------------------------- Charts */

/** An invented projection whose corpora are core's own `futureValue`, so the band ends on them. */
const SAMPLE_PROJECTION: Projection = (() => {
  const monthly = 25000
  const existing = 400000
  const years = 14
  const scenario = (label: string, ratePct: number) => ({
    label,
    ratePct,
    corpus: futureValue(monthly, years, ratePct, existing),
    realCorpus: futureValue(monthly, years, ratePct - 5, existing),
    contributed: monthly * years * 12 + existing,
  })
  return {
    monthlyContribution: monthly,
    existingCorpus: existing,
    years,
    inflationPct: 5,
    scenarios: [scenario('Cautious', 7), scenario('Expected', 10), scenario('Optimistic', 12)],
    disclaimer: 'An illustration, not a promise.',
  }
})()
const SAMPLE_ROLES = scenarioRoles(SAMPLE_PROJECTION)!

function RuleFilter({ rows }: { rows: readonly { rule: string; count: number }[] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const total = rows.reduce((n, r) => n + r.count, 0)
  return (
    <RankedBars
      label="Refusals by rule. Choose one to filter the ledger."
      labelWidth="13rem"
      filter={{ selected, onSelect: setSelected }}
      rows={rows.map((r) => ({
        id: r.rule,
        label: r.rule,
        count: r.count,
        tooltip: `${r.count} of ${total} refusals`,
      }))}
    />
  )
}

function Charts() {
  const area = MONTHS.map((m, i) => ({
    month: m,
    total: BALANCES[i] ?? 0,
    withIdbi: WITH_IDBI[i] ?? 0,
  }))
  const bars = [
    { rule: 'Emergency fund first', count: 14 },
    { rule: 'Cover before investing', count: 9 },
    { rule: 'Affordable from surplus', count: 7 },
    { rule: 'Matches risk profile', count: 4 },
    { rule: 'Horizon fits product', count: 2 },
  ]
  return (
    <Section id="charts" title="Charts">
      <div className="grid gap-6">
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6">
          <Card>
            <CardHeader title="Balances we can see" />
            <AreaChart
              data={area}
              x="month"
              series={[
                { key: 'total', label: 'All banks' },
                { key: 'withIdbi', label: 'With IDBI', role: 'comparison' },
              ]}
              label="Book balances over 12 months, all banks against IDBI"
            />
          </Card>
          <Card>
            <CardHeader title="Refusals by rule (a filter)" />
            <RuleFilter rows={bars} />
          </Card>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
          <Card>
            <CardHeader title="Signals by kind (links)" />
            <RankedBars
              label="Signals across the book, by kind"
              rows={[
                {
                  id: 'idle',
                  label: 'Idle cash',
                  count: 12,
                  fill: SEVERITY.important.fill,
                  to: '/kit',
                },
                {
                  id: 'fd',
                  label: 'FD maturing',
                  count: 7,
                  fill: SEVERITY.important.fill,
                  to: '/kit',
                },
                {
                  id: 'missed',
                  label: 'Missed repayment',
                  count: 3,
                  fill: SEVERITY.urgent.fill,
                  to: '/kit',
                },
                { id: 'subs', label: 'Subscriptions', count: 18, fill: SEVERITY.opportunity.fill },
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Month tiles: a line and columns" />
            <div className="grid grid-cols-2 gap-4">
              <MonthLines
                months={MONTHS}
                lines={[
                  { key: 'total', label: 'All banks', values: BALANCES },
                  { key: 'idbi', label: 'With IDBI', values: WITH_IDBI, role: 'comparison' },
                ]}
                height={120}
                endLabels
                monthEnd
                label="Balances at each month-end, all banks against IDBI"
              />
              <MonthColumns
                months={MONTHS}
                values={[12, 18, 15, 22, 19, 25, 21, 28, 26, 31, 29, 34]}
                seriesLabel="Sessions"
                height={120}
                label="Customer sessions by month"
              />
            </div>
          </Card>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
          <Card>
            <CardHeader title="Across a unit boundary" />
            <AreaChart
              data={MONTHS.map((m, i) => ({
                month: m,
                v:
                  [96, 96.4, 97.1, 97.5, 98.2, 98.6, 99.3, 99.8, 100.4, 101.1, 101.6, 102][i]! *
                  1e5,
              }))}
              x="month"
              series={[{ key: 'v', label: 'Balances' }]}
              label="Balances crossing one crore"
            />
            <p className="mt-2 text-caption-plain text-ink-faint">
              Round ticks, each with the decimals it needs: never &ldquo;₹1Cr&rdquo; twice.
            </p>
          </Card>
          <Card>
            <CardHeader title="Projection band" />
            <ProjectionChart
              projection={SAMPLE_PROJECTION}
              roles={SAMPLE_ROLES}
              startYear={2026}
              startAge={41}
              height={220}
            />
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-soft">
              {(
                [
                  ['Cautious to optimistic', PROJECTION_SWATCH.high],
                  ['Expected', PROJECTION_SWATCH.mid],
                  ['Paid in', PROJECTION_SWATCH.paid],
                ] as const
              ).map(([name, swatch]) => (
                <li key={name} className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-0.5 w-3 rounded-full"
                    style={{ background: swatch }}
                  />
                  {name}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </Section>
  )
}

/* ---------------------------------------------------------------- Notices */

function Notices() {
  return (
    <Section id="notices" title="Notices">
      <div className="grid grid-cols-2 gap-6">
        <Card className="grid content-start gap-4">
          <CardHeader title="AI and record labels" className="mb-0" />
          <AiLabel />
          <AiLabel phrasedBy="rules" />
          <div className="flex flex-wrap gap-2">
            <VerifiedBadge status="verified" records={24} checkedAt="2026-10-02T09:41:00.000Z" />
            <VerifiedBadge status="broken" records={24} />
            <VerifiedBadge status="unchecked" />
          </div>
          <Disclaimer>
            Illustration at the rates shown (6%, 10% and 12% a year), not a promise. Real returns
            vary and can be negative.
          </Disclaimer>
        </Card>
        <Card className="grid content-start gap-4">
          <CardHeader title="Masked field" className="mb-0" />
          <MaskedField
            label="Date of birth"
            masked="•• ••• 1983"
            onReveal={() => new Promise((resolve) => setTimeout(() => resolve('14 Mar 1983'), 600))}
          />
          <MaskedField
            label="Date of birth, with the desk's reasons"
            masked="••/••/1983"
            layout="inline"
            reasons={['Verifying identity before a call', 'Customer asked for it', 'KYC update']}
            onReveal={() => new Promise((resolve) => setTimeout(() => resolve('14/03/1983'), 600))}
          />
          <MaskedField
            label="PAN"
            masked="•••••1234•"
            onReveal={() =>
              Promise.reject(new ApiError(429, 'RATE_LIMITED', 'Too many reveals this hour.'))
            }
          />
          {/* Inside a narrow rail's property row: the row's label names it, so the field's own
              caption is for screen readers only. */}
          <PropertyList
            labelWidth="narrow"
            items={[
              {
                label: 'Date of birth',
                value: (
                  <MaskedField
                    label="Date of birth"
                    masked="•• ••• 1983"
                    hideLabel
                    onReveal={() =>
                      new Promise((resolve) => setTimeout(() => resolve('14 Mar 1983'), 600))
                    }
                  />
                ),
              },
              { label: 'Family', value: 'Married · 2 dependents' },
            ]}
          />
        </Card>
      </div>
    </Section>
  )
}
