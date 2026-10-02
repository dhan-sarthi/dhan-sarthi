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
  BarChart,
  Button,
  Card,
  CardFooter,
  CardHeader,
  CellStack,
  Chip,
  CommandPalette,
  DataTable,
  DeltaPill,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTrigger,
  Disclaimer,
  Donut,
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
  PageHeader,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
  PropertyList,
  SectionLabel,
  SegmentBadge,
  SegmentTabs,
  Select,
  SeverityChip,
  SideRail,
  Skeleton,
  SkeletonStat,
  SkeletonText,
  SmallMultiple,
  Sparkline,
  SplitView,
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
  Tooltip,
  VerifiedBadge,
  modKey,
} from '../ui/index.ts'
import { ApiError } from '../api/client.ts'
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
  lastActive: string
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
      reason: 'Active 6 days ago · 3 IDBI products · 62% of balances with IDBI',
    },
    lastActive: '6 days ago',
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
      reason: 'Active 3 weeks ago · 1 IDBI product · 44% of balances with IDBI',
    },
    lastActive: '3 weeks ago',
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
      reason: 'Active 2 days ago · 4 IDBI products · 81% of balances with IDBI',
    },
    lastActive: '2 days ago',
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
      reason: 'No activity in 74 days · 1 IDBI product · 23% of balances with IDBI',
    },
    lastActive: '2 months ago',
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
      reason: 'Active 11 days ago · 2 IDBI products · 55% of balances with IDBI',
    },
    lastActive: '11 days ago',
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
      <div className="font-mono text-caption font-normal text-ink-faint">{value}</div>
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
                <span className="font-mono text-caption font-normal text-ink-faint">
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
        <Specimen label="Severity (RM voice)">
          <div className="flex flex-wrap gap-2">
            <SeverityChip severity="urgent" />
            <SeverityChip severity="important" />
            <SeverityChip severity="opportunity" />
            <SeverityChip severity="urgent" size="md" />
          </div>
        </Specimen>
        <Specimen label="Segment">
          <div className="flex flex-wrap gap-2">
            <SegmentBadge segment="priority" />
            <SegmentBadge segment="affluent" />
            <SegmentBadge segment="mass" />
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
        <Specimen label="KPI strip">
          <div className="grid grid-cols-4 gap-4">
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
                label="Open handoffs"
                value={3}
                unit="count"
                delta={1}
                invert
                deltaLabel="oldest waiting 4 days"
              />
            </Card>
          </div>
        </Specimen>
        <Specimen label="Sparkline and allocation">
          <Card className="grid grid-cols-3 items-center gap-8">
            <div className="flex items-center gap-4">
              <Sparkline values={SAMPLE_ROWS[0]!.series} label="Balances over 12 months, rising" />
              <Sparkline values={SAMPLE_ROWS[1]!.series} tone="danger" />
              <Sparkline values={SAMPLE_ROWS[3]!.series} tone="neutral" area />
            </div>
            <AllocationBar allocation={SAMPLE_ROWS[0]!.allocation} />
            <AllocationBar allocation={SAMPLE_ROWS[3]!.allocation} legend size="regular" />
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
                    <p className="truncate text-caption font-normal text-ink-soft">
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
        <Specimen label="Segment tabs">
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
          <CellStack
            leading={
              <Avatar name={c.row.original.name} initials={c.row.original.initials} size="sm" />
            }
            title={c.getValue()}
            subtitle={`${c.row.original.age} · ${c.row.original.city}`}
          />
        ),
        footer: (c) => `${c.table.getRowModel().rows.length} customers`,
      }),
      col.accessor('segment', {
        header: 'Segment',
        cell: (c) => <SegmentBadge segment={c.getValue()} />,
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
            <span className="text-label text-ink-hint">Nothing to act on</span>
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
                  { label: 'Last active', value: row.lastActive },
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
          columnVisibility={row ? { signal: false, allocation: false, strength: false } : {}}
          stickyTop={56}
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

function Overlays() {
  const [palette, setPalette] = useState(false)
  return (
    <Section id="overlays" title="Overlays">
      <div className="flex flex-wrap items-center gap-3">
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open dialog</Button>
          </DialogTrigger>
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
      <CommandPalette
        open={palette}
        onOpenChange={setPalette}
        groups={[
          {
            heading: 'Customers',
            items: SAMPLE_ROWS.map((r) => ({
              id: r.id,
              label: r.name,
              hint: r.city,
              icon: <Avatar name={r.name} initials={r.initials} size="sm" />,
              onSelect: () => toast(`Opening ${r.name}`),
            })),
          },
          {
            heading: 'Go to',
            items: [
              {
                id: 'p1',
                label: 'Book',
                hint: 'Every customer in your book',
                icon: <FileText aria-hidden />,
                onSelect: () => undefined,
              },
            ],
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
        <TimelineMonth label="August 2026" count={3} stickyTop={56}>
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
        <TimelineMonth label="July 2026" count={1} stickyTop={56}>
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
            <CardHeader title="Refusals by rule" />
            <BarChart
              data={bars}
              x="rule"
              y="count"
              yLabel="Refusals"
              horizontal
              highlight={(_, i) => i === 0}
              height={220}
              label="Refusals by rule"
            />
          </Card>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
          <Card>
            <CardHeader title="Allocation" />
            <Donut
              data={[
                { id: 'equity', label: 'Equity', value: 18.4e7 },
                { id: 'fixed', label: 'Fixed income', value: 14.1e7 },
                { id: 'cash', label: 'Cash', value: 12.7e7 },
              ]}
              centerValue={<Money value={45.2e7} short />}
              centerLabel="we can see"
              label="Book allocation by asset class"
            />
          </Card>
          <Card>
            <CardHeader title="Activity by month" />
            <BarChart
              data={MONTHS.map((m, i) => ({
                month: m,
                sessions: [12, 18, 15, 22, 19, 25, 21, 28, 26, 31, 29, 34][i] ?? 0,
              }))}
              x="month"
              y="sessions"
              yLabel="Sessions"
              highlight={(_, i) => i === 11}
              label="Customer sessions by month"
            />
          </Card>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <SmallMultiple
            title="Book value"
            value={BALANCES[11] ?? 0}
            months={MONTHS}
            values={BALANCES}
          />
          <SmallMultiple
            title="SIP book"
            value={1840000}
            months={MONTHS}
            values={[14, 14.5, 15, 15.1, 15.8, 16, 16.4, 17, 17.2, 17.6, 18, 18.4].map(
              (v) => v * 1e5,
            )}
          />
          <SmallMultiple
            title="Goals on track"
            value={72}
            format="pct"
            months={MONTHS}
            values={[70, 71, 74, 75, 73, 76, 75, 77, 76, 75, 75, 72]}
          />
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
