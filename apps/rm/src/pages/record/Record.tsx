import type { AdviceItem, RmRefusals } from '@dhan/contracts'
import { ShieldCheck, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useRefusals, useVerifyBook } from '../../api/queries.ts'
import { formatCount, formatDate, formatMonth } from '../../lib/format.ts'
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Money,
  PageHeader,
  SectionLabel,
  Select,
  Skeleton,
  SkeletonStat,
} from '../../ui/index.ts'
import { PageLoading } from '../placeholder.tsx'
import { RULE_COUNT, RULES, refusedStake, ruleName } from './advice.ts'
import { AdviceLedger, LedgerSkeleton } from './AdviceLedger.tsx'
import { RuleBars } from './RuleBars.tsx'
import { VerifyBookStrip } from './VerifyBookStrip.tsx'

/**
 * Mis-sales prevented: every product Uday refused anywhere in the book, the rule behind each,
 * the sentence the customer heard, and one button that proves none of it has been touched.
 *
 * The page makes one claim (a count) and then shows its working: the count by rule, the latest
 * refusal in the customer's own words, the full ledger, and the hash chains verified on demand.
 * The rule filter lives in the address (`?rule=RISK_CEILING`), so another page can link
 * straight to one rule's refusals.
 *
 * The sidebar calls this page "Advice record", which is what it holds; the title says what the
 * record proves. The active sidebar item (and the window's title) already name the page the RM
 * clicked, so the heading stands on its own, with no label stacked above it.
 */

const TITLE = 'Mis-sales prevented'

export function Record() {
  const refusals = useRefusals()
  const [search, setSearch] = useSearchParams()
  const rule = search.get('rule')

  const setRule = useCallback(
    (next: string | null) => {
      setSearch(
        (prev) => {
          const params = new URLSearchParams(prev)
          if (next === null) params.delete('rule')
          else params.set('rule', next)
          return params
        },
        { replace: true },
      )
    },
    [setSearch],
  )

  if (refusals.isError) {
    return (
      <>
        <PageHeader title={TITLE} />
        <Card>
          <ErrorState
            size="page"
            title="The advice record did not load"
            error={refusals.error}
            onRetry={() => void refusals.refetch()}
            retrying={refusals.isFetching}
          />
        </Card>
      </>
    )
  }

  if (!refusals.data) return <RecordSkeleton />

  return <RecordView data={refusals.data} rule={rule} onRule={setRule} />
}

function RecordView({
  data,
  rule,
  onRule,
}: {
  data: RmRefusals
  rule: string | null
  onRule: (rule: string | null) => void
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const verify = useVerifyBook()
  const broken = useMemo(
    () => new Set((verify.data?.broken ?? []).map((b) => b.brokenAt)),
    [verify.data],
  )
  const summary = useMemo(() => summarise(data.items), [data.items])
  const shown = useMemo(
    () => (rule === null ? data.items : data.items.filter((i) => i.ruleId === rule)),
    [data.items, rule],
  )

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const subtitle =
    data.total === 0 ? (
      'Every refusal, the rule behind it and the words the customer heard, hash-chained.'
    ) : (
      <>
        <span className="tabular">{formatCount(summary.customers)}</span> customer
        {summary.customers === 1 ? '' : 's'} in your book had a sale refused
        {summary.from ? <>, {spanLabel(summary.from, summary.to)}</> : null}. Each refusal is a
        verdict of the rules, kept word for word in a hash chain.
      </>
    )

  return (
    <>
      <PageHeader title={TITLE} subtitle={subtitle} />

      <Card padded={false} className="mb-8">
        {data.total === 0 ? (
          <EmptyState
            icon={<ShieldCheck />}
            title="Uday has not refused anything in your book yet"
            body="When a customer asks about a product the rules say is wrong for them, the refusal, the rule and the exact sentence they heard land here, chained to the record before it."
            className="py-14 text-pretty"
          />
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)]">
            <Headline data={data} summary={summary} />
            <div className="border-t border-hairline-soft p-6 lg:border-t-0 lg:border-l">
              <CardHeader
                title="By rule"
                count={data.byRule.length}
                actions={
                  rule !== null ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<X aria-hidden />}
                      onClick={() => onRule(null)}
                    >
                      Show every rule
                    </Button>
                  ) : (
                    <span className="text-caption-plain text-ink-faint">
                      Choose a rule to filter the ledger
                    </span>
                  )
                }
              />
              <RuleBars rules={data.byRule} total={data.total} selected={rule} onSelect={onRule} />
            </div>
          </div>
        )}
        <VerifyBookStrip verify={verify} names={summary.names} />
      </Card>

      {data.total > 0 ? (
        <section aria-labelledby="ledger-title">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-baseline gap-2.5">
              <h2 id="ledger-title" className="text-title text-ink">
                Every refusal
              </h2>
              <span className="text-label-plain text-ink-faint tabular">
                {rule === null
                  ? `${formatCount(data.total)}, newest first`
                  : `${formatCount(shown.length)} of ${formatCount(data.total)}`}
              </span>
            </div>
            <label className="flex items-center gap-2 text-label text-ink-soft">
              Rule
              <Select
                value={rule ?? ''}
                onChange={(e) => onRule(e.target.value === '' ? null : e.target.value)}
                className="w-64"
              >
                <option value="">Every rule</option>
                {RULES.filter((r) => data.byRule.some((b) => b.ruleId === r.id)).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          {shown.length > 0 ? (
            <AdviceLedger
              items={shown}
              variant="book"
              caption={
                rule === null
                  ? 'Every refusal in your book, newest first'
                  : `Refusals under ${ruleName(rule)}, newest first`
              }
              openIds={open}
              onToggle={toggle}
              broken={broken}
            />
          ) : (
            <Card>
              <EmptyState
                title="No refusals under this rule"
                body="The rule in the address is not one Uday has refused anything under in your book."
                action={
                  <Button size="sm" onClick={() => onRule(null)}>
                    Show every rule
                  </Button>
                }
              />
            </Card>
          )}
        </section>
      ) : null}
    </>
  )
}

interface Summary {
  customers: number
  products: number
  stake: ReturnType<typeof refusedStake>
  from: string | null
  to: string | null
  latest: AdviceItem | null
  names: ReadonlyMap<string, string>
}

/** What the headline says beside the count, all of it counted from the ledger itself. */
function summarise(items: readonly AdviceItem[]): Summary {
  const names = new Map<string, string>()
  const products = new Set<string>()
  let from: string | null = null
  let to: string | null = null
  for (const item of items) {
    names.set(item.cif, item.name)
    products.add(item.productId ?? item.productName ?? item.id)
    if (from === null || item.at < from) from = item.at
    if (to === null || item.at > to) to = item.at
  }
  return {
    customers: names.size,
    products: products.size,
    stake: refusedStake(items),
    from,
    to,
    // Newest first is the route's order; the first item is the latest refusal.
    latest: items[0] ?? null,
    names,
  }
}

/** "Sep 2025 to Aug 2026", or "Aug 2026" when it is one month. */
function spanLabel(from: string | null, to: string | null): string {
  if (!from || !to) return ''
  const a = formatMonth(from)
  const b = formatMonth(to)
  return a === b ? a : `${a} to ${b}`
}

function Headline({ data, summary }: { data: RmRefusals; summary: Summary }) {
  const latest = summary.latest
  const first = latest ? (latest.name.split(/\s+/)[0] ?? latest.name) : ''
  const stake = summary.stake
  return (
    <div className="flex flex-col p-6">
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <div>
          <p className="text-figure text-ink tabular">{formatCount(data.total)}</p>
          <p className="mt-1 text-heading text-pretty text-ink">
            sale{data.total === 1 ? '' : 's'} Uday refused to make
          </p>
        </div>
        {/* The stake in rupees, summed from the same records: what the customers asked to put
            into the products the rules turned down. */}
        {stake.monthly > 0 || stake.oneOff > 0 ? (
          <div className="sm:border-l sm:border-hairline-soft sm:pl-8">
            <p className="text-figure text-ink">
              <Money value={stake.monthly > 0 ? stake.monthly : stake.oneOff} short="auto" />
            </p>
            <p className="mt-1 text-heading text-pretty text-ink">
              {stake.monthly > 0 ? 'a month' : 'in one-off sums'} customers asked to put in
            </p>
          </div>
        ) : null}
      </div>
      <p className="mt-3 text-label-plain text-pretty text-ink-soft">
        On <span className="tabular">{summary.products}</span> product
        {summary.products === 1 ? '' : 's'}, under{' '}
        <span className="tabular">{data.byRule.length}</span> of the{' '}
        <span className="tabular">{RULE_COUNT}</span> rules
        {stake.monthly > 0 && stake.oneOff > 0 ? (
          <>
            , and <Money value={stake.oneOff} short="auto" /> more in one-off sums
          </>
        ) : null}
        . Each amount is the one the customer asked about, summed from the records below.
      </p>

      {latest && latest.spoken ? (
        <figure className="mt-6 border-t border-hairline-soft pt-5">
          <div className="flex items-baseline justify-between gap-3">
            <SectionLabel as="h2">Latest refusal</SectionLabel>
            <time dateTime={latest.at} className="text-caption-plain text-ink-faint tabular">
              {formatDate(latest.at)}
            </time>
          </div>
          <blockquote className="mt-3 max-w-[60ch] text-body text-ink">
            “{latest.spoken}”
          </blockquote>
          <figcaption className="mt-3 flex min-w-0 items-start gap-2 text-caption-plain text-ink-soft">
            <Avatar name={latest.name} size="sm" />
            <span className="min-w-0 pt-1.5 text-pretty">
              Said to{' '}
              <Link
                to={`/customers/${encodeURIComponent(latest.cif)}/record?record=${encodeURIComponent(latest.id)}`}
                className="rounded-sm font-medium text-ink underline-offset-3 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
              >
                {first}
              </Link>{' '}
              about {latest.productName ?? 'a product off the shelf'}
              {latest.ruleId ? <> · {ruleName(latest.ruleId)}</> : null}
            </span>
          </figcaption>
        </figure>
      ) : null}
    </div>
  )
}

function RecordSkeleton() {
  return (
    <>
      <PageHeader title={TITLE} subtitle={<Skeleton className="mt-1 h-4 w-96" />} />
      <PageLoading label="Loading the advice record">
        <Card padded={false} className="mb-8">
          <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)]">
            <div className="grid content-start gap-6 p-6">
              <SkeletonStat />
              <div className="grid gap-2 border-t border-hairline-soft pt-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
            <div className="grid content-start gap-3.5 border-l border-hairline-soft p-6">
              <Skeleton className="mb-2 h-3 w-16" />
              {[92, 92, 78, 64, 40, 40, 40].map((w, i) => (
                <div key={i} className="grid grid-cols-[11rem_minmax(0,1fr)_2rem] gap-4">
                  <Skeleton className="h-3 w-36" />
                  <Skeleton className="h-2 self-center" style={{ width: `${w}%` }} />
                  <Skeleton className="h-3 w-5 justify-self-end" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-b-lg border-t border-hairline-soft bg-canvas-top px-6 py-4">
            <Skeleton className="size-9 rounded-full" />
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="h-3 w-96" />
            </div>
            <Skeleton className="h-9 w-40 rounded-md" />
          </div>
        </Card>
        <Skeleton className="mb-3 h-6 w-40" />
        <LedgerSkeleton rows={6} />
      </PageLoading>
    </>
  )
}
