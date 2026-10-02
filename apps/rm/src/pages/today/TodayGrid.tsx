import type { ReactNode } from 'react'

/**
 * Today's two columns: the call queue in the wide one, what is coming and what Uday refused in
 * the narrow one, which is context for the calls rather than more calls.
 *
 * The grid measures the room the page has, not the window (a 1024 window beside the icon rail
 * leaves 920px; a 768 one, 664): two columns from about 900px, so a 1280 laptop keeps the queue
 * beside the side cards. Below that the page is one column in reading order (call, coming up,
 * refused), with the two side cards side by side under the queue while there is room for both
 * rather than stretching to its width.
 *
 * Every single-column grid on this page names its track `minmax(0, 1fr)` (`grid-cols-1`): an
 * implicit `auto` track grows to its widest unbreakable row, and a week of SIP dates in the
 * 320px side column pushed Coming up out of its own card at 1280.
 */
export function TodayGrid({
  queue,
  upcoming,
  refused,
}: {
  queue: ReactNode
  upcoming: ReactNode
  refused: ReactNode
}) {
  return (
    <div className="@container">
      <div className="grid grid-cols-1 items-start gap-6 @4xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <div className="min-w-0">{queue}</div>
        <div className="grid min-w-0 grid-cols-1 content-start items-start gap-6 @2xl:grid-cols-2 @4xl:grid-cols-1">
          <div className="min-w-0">{upcoming}</div>
          <div className="min-w-0">{refused}</div>
        </div>
      </div>
    </div>
  )
}
