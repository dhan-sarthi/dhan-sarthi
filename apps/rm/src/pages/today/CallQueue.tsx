import type { Handoff, QueueItem } from '@dhan/contracts'
import { ArrowRight, Check, ChevronDown, ChevronRight, Info, PhoneCall, Quote } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import { cn } from '../../lib/cn.ts'
import { formatCount } from '../../lib/format.ts'
import { duration, ease } from '../../lib/motion.ts'
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  InteractiveRow,
  SegmentBadge,
  Tooltip,
} from '../../ui/index.ts'
import {
  firstName,
  openerFor,
  requestFor,
  requestLine,
  rowLine,
  udayRead,
  unqueuedRequests,
} from './derive.ts'
import { LogCall } from './LogCall.tsx'
import { Figures, SourceChip } from './parts.tsx'
import { RequestActions } from './RequestActions.tsx'
import { useHandoffAction } from './useHandoffAction.ts'

export interface CallQueueProps {
  queue: readonly QueueItem[]
  /** Open and contacted requests: each is dealt with on its customer's row, or below the list. */
  handoffs: readonly Handoff[]
  asOf: string
}

/** Said once, behind the info mark beside the title: useful the first morning, noise after. */
const ORDER_NOTE =
  'Customers who asked for a call come first, longest wait first. Then one signal per customer, by severity, deadline and rupee value.'

/**
 * "Who do I call today, and why?" The ranked queue, one row per customer, and the page's hero.
 *
 * The rows are an accordion with the first one open: the page's first action is already on the
 * screen (who, why, what to say) without a click. Opening another row closes the last, so the
 * one primary button on the page is always the call the RM is looking at.
 *
 * A customer's request to talk lives on their row and nowhere else on Today: what Uday read on
 * the day they asked, and Mark contacted and Resolve beside the call. Requests already called
 * about whose customer has left the queue are listed under it, so each can still be resolved.
 */
export function CallQueue({ queue, handoffs, asOf }: CallQueueProps) {
  const [openId, setOpenId] = useState<string | null>(queue[0]?.id ?? null)
  // A refetch can drop the open row (a request resolved); then nothing is open rather than a row
  // the RM did not choose.
  const current = queue.some((item) => item.id === openId) ? openId : null
  // Calls logged from this page in this visit. The journey keeps the record; this only stops a
  // row the RM has just dealt with from looking untouched.
  const [logged, setLogged] = useState<ReadonlySet<string>>(() => new Set())
  // Unsaved call notes by customer. Opening another row unmounts this one's composer, and a note
  // half-written about a phone call should not vanish because the RM glanced at the next row.
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({})
  const action = useHandoffAction()
  const leftover = unqueuedRequests(queue, handoffs)

  return (
    <Card padded={false}>
      <QueueHeader count={queue.length} />
      {queue.length === 0 ? (
        <EmptyState
          icon={<Check />}
          title="Nobody needs a call today"
          body="No customer has asked for a call and no signal in the book needs a person. New requests and signals appear here as they come in."
          className="pb-12"
        />
      ) : (
        <ol className="border-t border-hairline-soft">
          {queue.map((item) => {
            const request = requestFor(item, handoffs)
            return (
              <QueueRow
                key={item.id}
                item={item}
                request={request}
                open={current === item.id}
                onToggle={() => setOpenId(current === item.id ? null : item.id)}
                asOf={asOf}
                logged={logged.has(item.cif)}
                onLogged={() => setLogged((prev) => new Set(prev).add(item.cif))}
                draft={drafts[item.cif] ?? ''}
                onDraft={(text) =>
                  setDrafts((prev) => {
                    const { [item.cif]: _dropped, ...rest } = prev
                    return text === '' ? rest : { ...rest, [item.cif]: text }
                  })
                }
                busy={request !== null && action.pendingId === request.id}
                onRequest={(status, note) =>
                  request ? action.run(request, status, note) : Promise.resolve(false)
                }
              />
            )
          })}
        </ol>
      )}
      {leftover.length > 0 ? (
        <CalledNotResolved
          requests={leftover}
          pendingId={action.pendingId}
          onChange={(request, status, note) => action.run(request, status, note)}
        />
      ) : null}
    </Card>
  )
}

/**
 * The hero card's title: a heading, not the micro caps the side cards use, with the count as a
 * pill and the ordering rule behind an info mark.
 */
function QueueHeader({ count }: { count: number }) {
  return (
    <header className="flex min-h-14 items-center justify-between gap-3 px-5 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="text-heading text-ink">Call today</h2>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ground-deep px-1.5 text-caption text-ink-soft tabular">
          {formatCount(count)}
        </span>
        <Tooltip content={ORDER_NOTE} side="bottom" align="start">
          <button
            type="button"
            aria-label="How this list is ordered"
            className="inline-flex size-6 items-center justify-center rounded-full text-ink-hint transition-colors hover:text-ink-soft focus-visible:outline-2 focus-visible:outline-focus"
          >
            <Info aria-hidden className="size-4" />
          </button>
        </Tooltip>
      </div>
      <Link
        to="/book"
        className="group inline-flex items-center gap-0.5 rounded-sm text-caption text-ink-soft transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-focus"
      >
        Whole book
        <ChevronRight
          aria-hidden
          className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
        />
      </Link>
    </header>
  )
}

function QueueRow({
  item,
  request,
  open,
  onToggle,
  asOf,
  logged,
  onLogged,
  draft,
  onDraft,
  busy,
  onRequest,
}: {
  item: QueueItem
  /** The customer's open or contacted request to talk, if they have one. */
  request: Handoff | null
  open: boolean
  onToggle: () => void
  asOf: string
  logged: boolean
  onLogged: () => void
  draft: string
  onDraft: (text: string) => void
  busy: boolean
  onRequest: (status: 'contacted' | 'resolved', note?: string) => Promise<boolean>
}) {
  const id = useId()
  const panelId = `${id}-panel`
  // A row with a note in progress reopens with the note, not with the buttons.
  const [composing, setComposing] = useState(draft !== '')
  const line = rowLine(item, request)
  // A row the RM has dealt with should not look untouched: a call logged here this visit, or a
  // request already marked contacted, whose customer is back in the queue for a signal. (A row
  // the request raised says "Contacted" on its own chip.)
  const marker = logged
    ? 'Call logged'
    : item.source === 'signal' && request?.status === 'contacted'
      ? 'Contacted'
      : null

  return (
    <li
      className={cn(
        'border-b border-hairline-soft transition-colors duration-150 last:border-b-0',
        open ? 'bg-canvas-top/70' : 'hover:bg-row-hover',
      )}
    >
      {/*
        The whole row toggles, through the name's button stretched over it. The row is one Tab
        stop: the badges inside give theirs up and the button names them as its description.
      */}
      <InteractiveRow>
        <div className="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3.5 px-5 py-3">
          <Avatar name={item.name} initials={item.initials} className="mt-0.5" />
          <div className="grid min-w-0 grid-cols-1 gap-0.5">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="min-w-0 truncate text-body font-semibold text-ink">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  aria-describedby={`${id}-source ${id}-line`}
                  onClick={onToggle}
                  className="text-left after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus"
                >
                  {item.name}
                </button>
              </h3>
              <span className="relative z-10 inline-flex">
                <SegmentBadge segment={item.segment} />
              </span>
              {marker ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-caption text-brand">
                  <Check aria-hidden className="size-3.5" />
                  {marker}
                </span>
              ) : null}
              <span className="relative z-10 ml-auto inline-flex shrink-0 pl-2">
                <SourceChip item={item} request={request} id={`${id}-source`} />
              </span>
            </div>
            <Figures
              text={line}
              id={`${id}-line`}
              className="text-label font-normal text-ink-soft"
            />
          </div>
          <ChevronDown
            aria-hidden
            className={cn(
              'pointer-events-none mt-2 size-4 text-ink-hint transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </div>
      </InteractiveRow>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={panelId}
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: 'auto',
              opacity: 1,
              transition: { duration: duration.state, ease: ease.out },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: { duration: duration.feedback, ease: ease.in },
            }}
            className="overflow-hidden"
          >
            {/* Indented to the text column, so the panel reads as this customer's and nobody else's. */}
            <div className="@container grid grid-cols-1 gap-3 pr-5 pb-4 pl-[4.375rem]">
              {/*
                What to say, with what to do beside it: the opener and the two buttons share a line
                wherever the row is wide enough, so an open row stays short and the list stays a
                list.
              */}
              <div className="grid grid-cols-1 items-start gap-3 @lg:grid-cols-[minmax(0,1fr)_auto]">
                {/* A tinted speech block, not a field: the RM says it, nobody types into it. */}
                <figure>
                  <figcaption className="sr-only">Suggested opener</figcaption>
                  <blockquote className="flex gap-2.5 rounded-lg bg-brand-wash px-4 py-2.5 text-body text-ink">
                    <Quote aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
                    <span>{openerFor(item, request)}</span>
                  </blockquote>
                </figure>
                {composing ? null : (
                  <div className="flex flex-wrap items-center gap-2 @lg:pt-1">
                    {/* Only one row is open at a time, so this is the page's one primary button. */}
                    <Button
                      variant="primary"
                      size="md"
                      icon={<PhoneCall aria-hidden />}
                      onClick={() => setComposing(true)}
                    >
                      Log call
                    </Button>
                    <Button asChild variant="ghost" size="md">
                      <Link to={`/customers/${item.cif}`}>
                        Open file
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </div>
                )}
              </div>

              {/* The row's line has the title; this is what it does not hold, figures exact. */}
              {item.signal ? (
                <Figures
                  text={item.signal.detail}
                  className="block text-label font-normal text-ink-soft"
                />
              ) : null}

              {request ? (
                <RequestBlock
                  request={request}
                  line={line}
                  busy={busy}
                  onChange={onRequest}
                  // While a call is being logged its own "also mark contacted" box is the one way
                  // to do it; the request's buttons come back with the composer's Cancel.
                  actions={!composing}
                />
              ) : null}

              {composing ? (
                <LogCall
                  cif={item.cif}
                  name={item.name}
                  asOf={asOf}
                  handoff={request?.status === 'open' ? request : null}
                  draft={draft}
                  onDraft={onDraft}
                  onCancel={() => setComposing(false)}
                  onSaved={() => {
                    setComposing(false)
                    onLogged()
                  }}
                />
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  )
}

/**
 * The customer's request on their own row: when they asked, what Uday read that day, and the two
 * steps that close it. The read is a snapshot from the day they asked, and says so; the row's
 * line above it is today's.
 */
function RequestBlock({
  request,
  line,
  busy,
  onChange,
  actions,
}: {
  request: Handoff
  line: string
  busy: boolean
  onChange: (status: 'contacted' | 'resolved', note?: string) => Promise<boolean>
  actions: boolean
}) {
  const read = udayRead(request, line)
  return (
    <section
      aria-label={`${firstName(request.name)}’s request for a call`}
      className="grid grid-cols-1 gap-1.5 border-l-2 border-brand-soft pl-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className="text-label text-ink tabular">{requestLine(request)}</p>
        {actions ? <RequestActions request={request} busy={busy} onChange={onChange} /> : null}
      </div>
      {read.length > 0 ? (
        <div className="grid grid-cols-1 gap-1">
          <p className="text-caption text-ink-faint">Uday’s read that day</p>
          <ul className="grid grid-cols-1 gap-0.5">
            {read.map((text, i) => (
              <li
                key={i}
                className="grid grid-cols-[0.75rem_minmax(0,1fr)] text-caption font-normal text-ink-soft"
              >
                <span aria-hidden className="mt-[0.4375rem] size-1 rounded-full bg-ink-hint/60" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {request.note ? (
        <p className="text-caption font-normal text-ink-soft">
          <span className="text-ink-faint">Your note: </span>
          {request.note}
        </p>
      ) : null}
    </section>
  )
}

/**
 * Requests already called about whose customer is no longer in the queue. Short rows: the call
 * has happened, and all that is left is to say the matter is settled.
 */
function CalledNotResolved({
  requests,
  pendingId,
  onChange,
}: {
  requests: readonly Handoff[]
  pendingId: string | null
  onChange: (request: Handoff, status: 'contacted' | 'resolved', note?: string) => Promise<boolean>
}) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-b-lg border-t border-hairline-soft bg-canvas-top/60 px-5 pt-3 pb-2"
    >
      <h3 id={headingId} className="flex items-baseline gap-2 text-label text-ink">
        Called, not yet resolved
        <span className="text-caption font-normal text-ink-faint tabular">
          {formatCount(requests.length)}
        </span>
      </h3>
      <ul className="mt-1">
        <AnimatePresence initial={false}>
          {requests.map((request) => (
            <motion.li
              key={request.id}
              layout="position"
              exit={{
                opacity: 0,
                height: 0,
                transition: { duration: duration.state, ease: ease.in },
              }}
              className="flex items-center gap-3 overflow-hidden border-b border-hairline-soft py-2 last:border-b-0"
            >
              <Avatar name={request.name} size="sm" />
              <div className="min-w-0 flex-1">
                <Link
                  to={`/customers/${request.cif}`}
                  className="block truncate text-label font-semibold text-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                >
                  {request.name}
                </Link>
                <p className="truncate text-caption text-ink-faint tabular">
                  {requestLine(request)}
                  {request.note ? ` · ${request.note}` : ''}
                </p>
              </div>
              <RequestActions
                request={request}
                busy={pendingId === request.id}
                onChange={(status, note) => onChange(request, status, note)}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  )
}
