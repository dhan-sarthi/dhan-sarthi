import type { AdviceItem, VerdictOutcome } from '@dhan/contracts'
import { Ban, Check, ChevronDown, CircleHelp, Minus, Quote, ShieldAlert } from 'lucide-react'
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { Link } from 'react-router'
import { cn } from '../../lib/cn.ts'
import { formatDate } from '../../lib/format.ts'
import { Avatar, Chip, Money, SectionLabel, Skeleton } from '../../ui/index.ts'
import {
  RULE_COUNT,
  SOURCE_WORDS,
  VERDICT_WORDS,
  isGenesis,
  ladder,
  ruleIndex,
  ruleName,
  ruleSentence,
  shortHash,
  type RungState,
} from './advice.ts'

/*
 * The advice ledger: one row per verdict, the sentence the customer heard under it, and on
 * demand the recorded wording, the rule ladder and both hashes.
 *
 * A plain table rather than the kit's DataTable because each record is three rows (the verdict,
 * what was heard, the details), and a record's rows must open and close together. Each record
 * is its own <tbody>, so a screen reader still reads it as one group, and the borders sit
 * between records rather than between a verdict and its own sentence.
 */

export type LedgerVariant = 'book' | 'customer'

export interface AdviceLedgerProps {
  items: readonly AdviceItem[]
  /** `book` adds the customer and drops the verdict (every row there is a refusal). */
  variant: LedgerVariant
  /** What the table is, for a screen reader. */
  caption: string
  openIds: ReadonlySet<string>
  onToggle: (id: string) => void
  /** Records the last verification said break their chain. */
  broken?: ReadonlySet<string>
  /** A record another page linked to: scrolled into view once and marked. */
  focusId?: string | null
  className?: string
}

interface Column {
  id: string
  header: ReactNode
  width?: string
  align?: 'right'
}

function columnsFor(variant: LedgerVariant): Column[] {
  return variant === 'book'
    ? [
        { id: 'date', header: 'Date', width: '7rem' },
        { id: 'customer', header: 'Customer', width: '13.5rem' },
        { id: 'product', header: 'Product they asked about' },
        { id: 'rule', header: 'Refused under', width: '14rem' },
        { id: 'hash', header: 'Hash', width: '6.5rem' },
        { id: 'toggle', header: <span className="sr-only">Details</span>, width: '3rem' },
      ]
    : // One customer's record sits beside the profile rail, in a column as narrow as 40rem, so
      // the short hash goes under the date (the record's identity, in one cell) and the product
      // keeps the room to be read.
      [
        { id: 'date', header: 'Date · hash', width: '7rem' },
        { id: 'product', header: 'Product' },
        { id: 'verdict', header: 'Verdict', width: '7.25rem' },
        { id: 'rule', header: 'Rule', width: '11.5rem' },
        { id: 'toggle', header: <span className="sr-only">Details</span>, width: '2.75rem' },
      ]
}

const VERDICT_TONE: Record<VerdictOutcome, 'danger' | 'brand' | 'neutral'> = {
  BLOCKED: 'danger',
  PASS: 'brand',
  UNKNOWN_PRODUCT: 'neutral',
}

export function VerdictChip({ verdict }: { verdict: VerdictOutcome }) {
  const Icon = verdict === 'BLOCKED' ? Ban : verdict === 'PASS' ? Check : CircleHelp
  return (
    <Chip
      tone={VERDICT_TONE[verdict]}
      icon={<Icon aria-hidden />}
      className="font-semibold tracking-wide"
    >
      {VERDICT_WORDS[verdict]}
    </Chip>
  )
}

export function AdviceLedger({
  items,
  variant,
  caption,
  openIds,
  onToggle,
  broken,
  focusId = null,
  className,
}: AdviceLedgerProps) {
  const columns = columnsFor(variant)
  const focusRef = useRef<HTMLTableSectionElement | null>(null)

  // A record linked to from the journey is brought into view once, when it first renders. The
  // page's sticky top bar would cover a row scrolled flush to the top, so it is centred instead.
  const scrolledTo = useRef<string | null>(null)
  useEffect(() => {
    if (!focusId || scrolledTo.current === focusId || !focusRef.current) return
    scrolledTo.current = focusId
    focusRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focusId, items])

  return (
    <div className={cn('rounded-lg border border-hairline bg-surface', className)}>
      <table className="w-full table-fixed border-separate border-spacing-0 text-body">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          {columns.map((c) => (
            <col key={c.id} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th
                key={c.id}
                scope="col"
                style={{ top: 56 }}
                className={cn(
                  'sticky z-10 h-9 border-b border-hairline bg-surface px-3 text-left text-caption font-medium whitespace-nowrap text-ink-faint',
                  i === 0 && 'rounded-tl-lg pl-4',
                  i === columns.length - 1 && 'rounded-tr-lg pr-4',
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        {items.map((item, index) => (
          <LedgerRecord
            key={item.id}
            item={item}
            variant={variant}
            columns={columns.length}
            first={index === 0}
            last={index === items.length - 1}
            open={openIds.has(item.id)}
            onToggle={() => onToggle(item.id)}
            broken={broken?.has(item.id) ?? false}
            focused={item.id === focusId}
            sectionRef={item.id === focusId ? focusRef : undefined}
          />
        ))}
      </table>
    </div>
  )
}

function LedgerRecord({
  item,
  variant,
  columns,
  first,
  last,
  open,
  onToggle,
  broken,
  focused,
  sectionRef,
}: {
  item: AdviceItem
  variant: LedgerVariant
  columns: number
  first: boolean
  last: boolean
  open: boolean
  onToggle: () => void
  broken: boolean
  focused: boolean
  sectionRef: RefObject<HTMLTableSectionElement | null> | undefined
}) {
  const detailsId = `record-${item.id}`
  // A PASS has no sentence to show (nothing was refused), so it is one row, not two: an empty
  // "heard" line under every pass would read as a missing record.
  const heard = item.spoken !== null || item.verdict !== 'PASS'
  const closesTable = last && !open && !heard
  const cell = cn('px-3 align-top', !first && 'border-t border-hairline-soft', !heard && 'pb-3.5')
  const tint = broken ? 'bg-danger-soft/45' : focused ? 'bg-brand-wash' : open ? 'bg-row-hover' : ''

  return (
    <tbody
      ref={sectionRef}
      id={`advice-${item.id}`}
      className={cn('group/record transition-colors duration-150', tint)}
    >
      <tr
        onClick={onToggle}
        className={cn('cursor-pointer', !tint && 'group-hover/record:bg-row-hover')}
      >
        <td
          className={cn(
            cell,
            'pt-3 pl-4 text-label font-normal whitespace-nowrap text-ink-soft',
            closesTable && 'rounded-bl-lg',
          )}
        >
          <time dateTime={item.at} className="tabular">
            {formatDate(item.at)}
          </time>
          {variant === 'customer' ? (
            <div className="mt-0.5">
              <HashMark hash={item.hash} broken={broken} />
            </div>
          ) : null}
        </td>

        {variant === 'book' ? (
          <td className={cn(cell, 'pt-2.5')}>
            <Link
              to={`/customers/${encodeURIComponent(item.cif)}/record?record=${encodeURIComponent(item.id)}`}
              onClick={(e) => e.stopPropagation()}
              className="group/name -mx-1 inline-flex max-w-full items-center gap-2 rounded-sm px-1 focus-visible:outline-2 focus-visible:outline-focus"
            >
              <Avatar name={item.name} size="sm" />
              <span className="truncate text-label text-ink underline-offset-3 group-hover/name:underline">
                {item.name}
              </span>
            </Link>
          </td>
        ) : null}

        <td className={cn(cell, 'pt-2.5')}>
          <div className="line-clamp-2 text-label text-ink">
            {item.productName ?? 'A product not on the shelf'}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 truncate text-caption font-normal text-ink-faint">
            {item.amount !== null ? <Money value={item.amount} /> : null}
            {item.amount !== null ? <span aria-hidden>·</span> : null}
            <span className="truncate">{SOURCE_WORDS[item.source]}</span>
          </div>
        </td>

        {variant === 'customer' ? (
          <td className={cn(cell, 'pt-2.5')}>
            <VerdictChip verdict={item.verdict} />
          </td>
        ) : null}

        <td className={cn(cell, 'pt-2.5')}>
          <RuleCell item={item} />
        </td>

        {variant === 'book' ? (
          <td className={cn(cell, 'pt-3')}>
            <HashMark hash={item.hash} broken={broken} />
          </td>
        ) : null}

        <td className={cn(cell, 'pt-2 pr-3 text-right', closesTable && 'rounded-br-lg')}>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailsId}
            aria-label={
              open ? 'Hide the recorded wording and hashes' : 'Show the recorded wording and hashes'
            }
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
            className="inline-flex size-7 items-center justify-center rounded-sm text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
          >
            <ChevronDown
              aria-hidden
              className={cn('size-4 transition-transform duration-200', open && 'rotate-180')}
            />
          </button>
        </td>
      </tr>

      {heard ? (
        <tr
          onClick={onToggle}
          className={cn('cursor-pointer', !tint && 'group-hover/record:bg-row-hover')}
        >
          <td className={cn('pl-4', !open && last && 'rounded-bl-lg')} />
          <td colSpan={columns - 2} className={cn('px-3 pt-1.5', open ? 'pb-3' : 'pb-3.5')}>
            <Heard item={item} open={open} />
          </td>
          <td className={cn(!open && last && 'rounded-br-lg')} />
        </tr>
      ) : null}

      {open ? (
        <tr id={detailsId}>
          <td
            colSpan={columns}
            className={cn('border-t border-hairline-soft px-4 pt-4 pb-5', last && 'rounded-b-lg')}
          >
            <RecordDetails item={item} variant={variant} />
          </td>
        </tr>
      ) : null}
    </tbody>
  )
}

/** The first eight hex digits of the record's hash, or where the last check found it broken. */
function HashMark({ hash, broken }: { hash: string; broken: boolean }) {
  if (broken) {
    return (
      <span className="inline-flex items-center gap-1 text-caption whitespace-nowrap text-danger">
        <ShieldAlert aria-hidden className="size-3.5" />
        Breaks here
      </span>
    )
  }
  return (
    <code title={`SHA-256 ${hash}`} className="font-mono text-caption text-ink-faint tabular">
      {shortHash(hash)}
    </code>
  )
}

function RuleCell({ item }: { item: AdviceItem }) {
  if (item.verdict === 'BLOCKED' && item.ruleId) {
    const at = ruleIndex(item.ruleId)
    return (
      <>
        <div
          className="text-label text-pretty text-ink"
          title={ruleSentence(item.ruleId) ?? undefined}
        >
          {ruleName(item.ruleId)}
        </div>
        {at !== null ? (
          <div className="mt-0.5 text-caption font-normal text-ink-faint tabular">
            Rule {at} of {RULE_COUNT}
          </div>
        ) : null}
      </>
    )
  }
  if (item.verdict === 'PASS') {
    return (
      <div className="pt-0.5 text-label font-normal text-ink-soft">
        All {item.rulesPassed.length} rules cleared
      </div>
    )
  }
  return <div className="pt-0.5 text-label font-normal text-ink-faint">Not put to the rules</div>
}

/**
 * The sentence the customer heard, word for word. A product off the shelf was never put to the
 * rules and may have no sentence; its recorded wording stands in, in the quieter ink.
 */
function Heard({ item, open }: { item: AdviceItem; open: boolean }) {
  if (item.spoken === null) {
    return <p className="text-label font-normal text-ink-faint">{item.recorded}</p>
  }
  return (
    <p className="flex gap-2 text-label font-normal text-ink">
      <Quote aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-hint" />
      <span className="sr-only">The customer heard: </span>
      <span className={cn('max-w-[80ch]', !open && 'line-clamp-2')}>{item.spoken}</span>
    </p>
  )
}

const RUNG: Record<RungState, { icon: typeof Check; text: string; word: string }> = {
  passed: { icon: Check, text: 'text-ink-soft', word: 'Cleared' },
  failed: { icon: Ban, text: 'text-danger', word: 'Stopped here' },
  not_reached: { icon: Minus, text: 'text-ink-hint', word: 'Not reached' },
}

function RecordDetails({ item, variant }: { item: AdviceItem; variant: LedgerVariant }) {
  const rungs = ladder(item)
  const genesis = isGenesis(item.prevHash)
  const first = item.name.split(/\s+/)[0] ?? item.name
  return (
    <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(17rem,24rem)] lg:justify-between">
      <div className="grid min-w-0 content-start gap-5">
        <section>
          <SectionLabel as="h3">Recorded wording</SectionLabel>
          <p className="mt-1.5 max-w-[72ch] text-label font-normal text-ink">{item.recorded}</p>
          {item.verdict === 'BLOCKED' && item.ruleId && ruleSentence(item.ruleId) ? (
            <p className="mt-2 max-w-[72ch] text-caption font-normal text-ink-faint">
              The rule: {ruleSentence(item.ruleId)}
            </p>
          ) : null}
        </section>

        <section>
          <SectionLabel as="h3">Hash chain</SectionLabel>
          <dl className="mt-2 grid gap-1.5 text-caption">
            <HashLine label="This record">{item.hash}</HashLine>
            <HashLine label="Follows">
              {genesis ? (
                <span className="font-sans text-ink-faint">
                  Nothing. This is the first record in its chain.
                </span>
              ) : (
                item.prevHash
              )}
            </HashLine>
            <HashLine label="Record id">{item.id}</HashLine>
          </dl>
        </section>

        {variant === 'book' ? (
          <Link
            to={`/customers/${encodeURIComponent(item.cif)}/record?record=${encodeURIComponent(item.id)}`}
            className="w-fit rounded-sm text-label text-brand underline-offset-3 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
          >
            Open {first}’s advice record
          </Link>
        ) : null}
      </div>

      <section className="min-w-0">
        <SectionLabel as="h3">The rules, in the order they run</SectionLabel>
        <ol className="mt-2 grid gap-1">
          {rungs.map((rung, i) => {
            const { icon: Icon, text, word } = RUNG[rung.state]
            return (
              <li
                key={rung.id}
                className={cn(
                  'grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 text-label font-normal',
                  text,
                )}
              >
                <Icon aria-hidden className="size-3.5" />
                <span className={cn('truncate', rung.state === 'failed' && 'font-medium')}>
                  <span className="mr-1.5 text-ink-hint tabular">{i + 1}</span>
                  {rung.label}
                </span>
                <span className="text-caption">{word}</span>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}

function HashLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-3">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="font-mono break-all text-ink-soft">{children}</dd>
    </div>
  )
}

/** Rows in the shape of a ledger record, for a page that is still loading. */
export function LedgerSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden className="rounded-lg border border-hairline bg-surface">
      <div className="flex h-9 items-center gap-6 border-b border-hairline px-4">
        {[10, 18, 30, 16, 8].map((w, i) => (
          <Skeleton key={i} className="h-2.5" style={{ width: `${w}%` }} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="grid grid-cols-[6rem_minmax(0,1fr)_10rem_5rem] gap-4 border-t border-hairline-soft px-4 py-4 first-of-type:border-0"
        >
          <Skeleton className="h-3 w-16" />
          <div className="grid gap-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-14" />
        </div>
      ))}
    </div>
  )
}
