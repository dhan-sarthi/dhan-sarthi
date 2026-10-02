import type { UpcomingItem } from '@dhan/contracts'
import { CalendarClock, ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '../../lib/cn.ts'
import { formatCount, formatDate } from '../../lib/format.ts'
import { duration, ease } from '../../lib/motion.ts'
import { Card, CardHeader, EmptyState, Money } from '../../ui/index.ts'
import {
  EVENT_LABEL,
  fundOf,
  groupUpcoming,
  rangeLabel,
  untilLabel,
  weekday,
  type EventGroup,
  type SipWeek,
} from './derive.ts'
import { Figures } from './parts.tsx'

/**
 * "Coming up": the next thirty days. What wants a conversation (a deposit maturing, an EMI
 * ending, a policy renewing) is one row each, first. SIP instalments only run, and there are
 * dozens, so they fold into weeks the RM can open.
 */
export function ComingUp({ upcoming, asOf }: { upcoming: readonly UpcomingItem[]; asOf: string }) {
  const groups = useMemo(() => groupUpcoming(upcoming, asOf), [upcoming, asOf])

  return (
    <Card>
      <CardHeader
        title="Coming up"
        actions={<span className="text-caption text-ink-faint">Next 30 days</span>}
      />
      {upcoming.length === 0 ? (
        <EmptyState
          icon={<CalendarClock />}
          title="Nothing in the next 30 days"
          body="Deposit maturities, EMIs ending and SIP dates appear here once they are a month away."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {groups.events.map((group) => (
            <EventList key={group.kind} group={group} asOf={asOf} />
          ))}
          {groups.weeks.length > 0 ? (
            <section aria-label="SIP dates" className="grid grid-cols-1 gap-1">
              <SubHeading
                label="SIP dates"
                detail={
                  <>
                    {formatCount(groups.sip.count)} instalments ·{' '}
                    <Money value={groups.sip.amount} short="auto" />
                  </>
                }
              />
              <ul className="-mx-2">
                {groups.weeks.map((week) => (
                  <WeekRow key={week.from} week={week} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </Card>
  )
}

function SubHeading({ label, detail }: { label: string; detail: ReactNode }) {
  return (
    <h3 className="flex items-baseline justify-between gap-3 text-label text-ink">
      {label}
      <span className="text-caption font-normal text-ink-faint tabular">{detail}</span>
    </h3>
  )
}

/** A date drawn the way a desk diary prints it: the day large, the weekday under it. */
function DateMark({ date }: { date: string }) {
  return (
    <span className="grid grid-cols-1 w-11 shrink-0 text-left leading-none">
      <span className="text-label text-ink tabular">{formatDate(date, { year: false })}</span>
      <span className="mt-1 text-caption font-normal text-ink-faint">
        {weekday(date, { short: true })}
      </span>
    </span>
  )
}

function EventList({ group, asOf }: { group: EventGroup; asOf: string }) {
  return (
    <section aria-label={EVENT_LABEL[group.kind]} className="grid grid-cols-1 gap-1">
      <SubHeading label={EVENT_LABEL[group.kind]} detail={formatCount(group.items.length)} />
      <ul className="-mx-2">
        {group.items.map((item, i) => (
          <li key={`${item.cif}-${item.date}-${i}`}>
            <Link
              to={`/customers/${item.cif}`}
              className="flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-row-hover focus-visible:outline-2 focus-visible:outline-focus"
            >
              <DateMark date={item.date} />
              <span className="grid grid-cols-1 min-w-0 flex-1 gap-0.5">
                <span className="truncate text-label text-ink">{item.name}</span>
                <Figures text={item.label} className="text-caption font-normal text-ink-soft" />
              </span>
              <span className="shrink-0 pt-px text-caption text-ink-faint">
                {untilLabel(item.date, asOf)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function WeekRow({ week }: { week: SipWeek }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-row-hover focus-visible:outline-2 focus-visible:outline-focus"
      >
        {/* Two lines, like the dated rows above: the range, then what runs in it. */}
        <span className="grid min-w-0 flex-1 grid-cols-1 gap-0.5">
          <span className="text-label text-ink tabular">{rangeLabel(week.from, week.to)}</span>
          <span className="text-caption font-normal text-ink-soft">
            {formatCount(week.count)} {week.count === 1 ? 'SIP' : 'SIPs'} ·{' '}
            {formatCount(week.customers)} {week.customers === 1 ? 'customer' : 'customers'}
          </span>
        </span>
        <Money value={week.amount} short="auto" className="text-label text-ink" />
        <ChevronDown
          aria-hidden
          className={cn(
            'size-4 shrink-0 text-ink-hint transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={panelId}
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
            <div className="grid grid-cols-1 gap-3 pt-1 pr-2 pb-3 pl-2">
              {week.days.map((day) => (
                <div key={day.date} className="grid grid-cols-1 gap-1">
                  <p className="flex items-baseline justify-between text-caption text-ink-faint">
                    <span>
                      {weekday(day.date, { short: true })} {formatDate(day.date, { year: false })}
                    </span>
                    <Money value={day.amount} short="auto" />
                  </p>
                  <ul className="grid grid-cols-1 gap-0.5 border-l border-hairline pl-3">
                    {day.items.map((item, i) => (
                      <li key={`${item.cif}-${i}`}>
                        <Link
                          to={`/customers/${item.cif}`}
                          title={`${item.name} · ${item.label}`}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 rounded-sm py-0.5 text-caption hover:text-brand focus-visible:outline-2 focus-visible:outline-focus"
                        >
                          <span className="min-w-0 truncate text-ink">
                            {item.name}
                            <span className="font-normal text-ink-faint">
                              {' '}
                              · {fundOf(item.label)}
                            </span>
                          </span>
                          {item.amount !== null ? (
                            <Money value={item.amount} className="text-ink-soft" />
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  )
}
