import type { Handoff, QueueItem } from '@dhan/contracts'
import { ArrowRight, Check, ChevronDown, PhoneCall, Quote } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import { cn } from '../../lib/cn.ts'
import { duration, ease } from '../../lib/motion.ts'
import {
  Avatar,
  Button,
  Card,
  CardFooter,
  CardHeader,
  EmptyState,
  SegmentBadge,
} from '../../ui/index.ts'
import { LogCall } from './LogCall.tsx'
import { Figures, SourceChip } from './parts.tsx'

export interface CallQueueProps {
  queue: readonly QueueItem[]
  /** Open and contacted requests, so a call logged from a handoff row can close the loop. */
  handoffs: readonly Handoff[]
  asOf: string
}

/**
 * "Who do I call today, and why?" The ranked queue, one row per customer.
 *
 * The rows are an accordion with the first one open: the page's first action is already on the
 * screen (who, why, what to say) without a click. Opening another row closes the last, so the
 * one primary button on the page is always the call the RM is looking at.
 */
export function CallQueue({ queue, handoffs, asOf }: CallQueueProps) {
  const [openId, setOpenId] = useState<string | null>(queue[0]?.id ?? null)
  // A refetch can drop the open row (a request resolved elsewhere); then nothing is open rather
  // than a row the RM did not choose.
  const current = queue.some((item) => item.id === openId) ? openId : null
  // Calls logged from this page in this visit. The journey keeps the record; this only stops a
  // row the RM has just dealt with from looking untouched.
  const [logged, setLogged] = useState<ReadonlySet<string>>(() => new Set())
  // Unsaved call notes by customer. Opening another row unmounts this one's composer, and a note
  // half-written about a phone call should not vanish because the RM glanced at the next row.
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({})

  return (
    <Card padded={false}>
      <div className="px-5 pt-5">
        <CardHeader title="Call today" count={queue.length} to="/book" actionLabel="Whole book" />
      </div>
      {queue.length === 0 ? (
        <EmptyState
          icon={<Check />}
          title="Nobody needs a call today"
          body="No customer has asked for you and no signal in the book needs a person. New requests and signals appear here as they come in."
          className="pb-12"
        />
      ) : (
        <ol className="border-t border-hairline-soft">
          {queue.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              open={current === item.id}
              onToggle={() => setOpenId(current === item.id ? null : item.id)}
              handoff={
                item.source === 'handoff'
                  ? (handoffs.find((h) => h.cif === item.cif && h.status === 'open') ?? null)
                  : null
              }
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
            />
          ))}
        </ol>
      )}
      {queue.length > 0 ? (
        <CardFooter className="mx-0 mb-0 mt-0">
          <span>
            Customers who asked for you come first, longest wait first. Then one signal each, by
            severity, deadline and rupee value.
          </span>
        </CardFooter>
      ) : null}
    </Card>
  )
}

function QueueRow({
  item,
  open,
  onToggle,
  handoff,
  asOf,
  logged,
  onLogged,
  draft,
  onDraft,
}: {
  item: QueueItem
  open: boolean
  onToggle: () => void
  handoff: Handoff | null
  asOf: string
  logged: boolean
  onLogged: () => void
  draft: string
  onDraft: (text: string) => void
}) {
  const panelId = useId()
  // A row with a note in progress reopens with the note, not with the buttons.
  const [composing, setComposing] = useState(draft !== '')

  return (
    <li
      className={cn(
        'border-b border-hairline-soft transition-colors duration-150 last:border-b-0',
        open ? 'bg-canvas-top/70' : 'hover:bg-row-hover',
      )}
    >
      {/*
        The whole row toggles, through the name's button stretched over it, so the segment and
        source chips beside the name stay their own focusable tooltips instead of nesting inside
        a button.
      */}
      <div className="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3.5 px-5 py-3.5">
        <Avatar name={item.name} initials={item.initials} className="mt-0.5" />
        <div className="grid grid-cols-1 min-w-0 gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="min-w-0 truncate text-body font-semibold text-ink">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={onToggle}
                className="text-left after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus"
              >
                {item.name}
              </button>
            </h3>
            <span className="relative z-10 inline-flex">
              <SegmentBadge segment={item.segment} />
            </span>
            {logged ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-caption text-brand">
                <Check aria-hidden className="size-3.5" />
                Call logged
              </span>
            ) : null}
            <span className="relative z-10 ml-auto inline-flex shrink-0 pl-2">
              <SourceChip item={item} />
            </span>
          </div>
          <Figures text={item.why} className="text-label font-normal text-ink-soft" />
        </div>
        <ChevronDown
          aria-hidden
          className={cn(
            'pointer-events-none mt-2 size-4 text-ink-hint transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </div>

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
            <div className="grid grid-cols-1 gap-4 pr-5 pb-5 pl-[4.375rem]">
              {/* A tinted speech block, not a field: the RM says it, nobody types into it. */}
              <figure className="grid grid-cols-1 gap-1.5">
                <figcaption className="text-caption text-ink-faint">Suggested opener</figcaption>
                <blockquote className="flex gap-2.5 rounded-lg bg-brand-wash px-4 py-3 text-body text-ink">
                  <Quote aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
                  <span>{item.opener}</span>
                </blockquote>
              </figure>

              {/* The chip names the kind and the sentence above has the title; this is what neither holds. */}
              {item.signal ? (
                <Figures
                  text={item.signal.detail}
                  className="block text-label font-normal text-ink-soft"
                />
              ) : null}

              {composing ? (
                <LogCall
                  cif={item.cif}
                  name={item.name}
                  asOf={asOf}
                  handoff={handoff}
                  draft={draft}
                  onDraft={onDraft}
                  onCancel={() => setComposing(false)}
                  onSaved={() => {
                    setComposing(false)
                    onLogged()
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-2">
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  )
}
