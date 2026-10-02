import type { ReactNode } from 'react'

/**
 * Today's two columns: the queue and the refusals in the wide one, the inbox and the calendar in
 * the narrow one.
 *
 * Below xl the page is one column, and it reads in order of what to do: call, who asked, what is
 * coming, what Uday refused. The columns' wrappers are `display: contents` there, so the four
 * cards become items of one grid and `order` can interleave them; at xl the wrappers come back as
 * the two columns.
 *
 * Every single-column grid on this page names its track `minmax(0, 1fr)` (`grid-cols-1`): an
 * implicit `auto` track grows to its widest unbreakable row, and a week of SIP dates in the
 * 320px side column pushed Coming up out of its own card at 1280.
 */
export function TodayGrid({
  queue,
  asked,
  upcoming,
  refused,
}: {
  queue: ReactNode
  asked: ReactNode
  upcoming: ReactNode
  refused: ReactNode
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
      <div className="contents xl:grid xl:grid-cols-1 xl:content-start xl:gap-6">
        <div className="order-1 min-w-0 xl:order-none">{queue}</div>
        <div className="order-4 min-w-0 xl:order-none">{refused}</div>
      </div>
      <div className="contents xl:grid xl:grid-cols-1 xl:content-start xl:gap-6">
        <div className="order-2 min-w-0 xl:order-none">{asked}</div>
        <div className="order-3 min-w-0 xl:order-none">{upcoming}</div>
      </div>
    </div>
  )
}
