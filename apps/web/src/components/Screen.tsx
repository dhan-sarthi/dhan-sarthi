/**
 * The shape every screen has, written once.
 *
 * Before this each screen open-coded the same four lines — a `Head`, sometimes a ribbon or a
 * `Segments` row, a `PullToRefresh` carrying the `scroll` class, and the sheets after it — and
 * the ordering of those four is not a preference. It is the layout invariant the whole app rests
 * on, recorded in `DESIGN.md` and in the comment above `.app` in `tokens.css`:
 *
 *   `.app` is a fixed-height flex column that never grows. `.scroll` is the *one* scrolling
 *   region inside it. The header, the tab row and any footer are `flex-none` siblings of
 *   `.scroll`, never absolutely positioned — which is what makes it structurally impossible for
 *   the tab bar to end up below the fold.
 *
 * A screen that gets this wrong does not look broken in a screenshot; it is simply unusable on a
 * phone. So the invariant stops being something each screen remembers and becomes the only way
 * this component can be assembled.
 *
 * ## The header that scrolls
 *
 * SmartWealth's signature is content cards starting ~50pt *up inside* the app bar, so the bar
 * reads as a backdrop rather than a band. That cannot be done with a `flex-none` header: the
 * card would have to hang out of `.scroll`, and `.scroll` clips at its own padding box because
 * that is what `overflow-y: auto` means. Paint the header above the scroller instead and the
 * card goes behind it, which is the same picture upside down.
 *
 * The reference resolves it by scrolling the bar — `06-dashboard/01-dashboard-home.md` records
 * that regions 1–6 scroll away and only the nav is fixed — and so does this. `scrollHeader`
 * moves the header, the notice and the tab row inside `.scroll` as its first child; `overlap`
 * then pulls the block after them up into the slab's extra bottom padding. Still one scrolling
 * region, still nothing absolutely positioned. It costs the tab row's stickiness, so it is opt
 * in and the four re-homed screens do not take it.
 */
import type { ReactNode } from 'react'
import { PullToRefresh } from './PullToRefresh.tsx'

/**
 * The chrome above the scroll region, as one value.
 *
 * It travels as a bundle because of what happens when it does not: a screen with panes — the
 * Dashboard's four — has to draw the *same* bar and the *same* tab row for every one of them, or
 * the header flickers as you move between panes that each drew their own. Passing one object
 * from the owner down into whichever pane is mounted makes that structural.
 */
export interface ScreenChrome {
  header: ReactNode
  notice?: ReactNode
  tabs?: ReactNode
}

export function Screen({
  header,
  notice,
  tabs,
  footer,
  onRefresh,
  scrollHeader = false,
  overlap = false,
  after,
  children,
}: {
  /** The app bar. A `Head`, in one of its three variants. */
  header: ReactNode
  /** Between the bar and the tab row: the data-source ribbon, an InfoBanner. */
  notice?: ReactNode
  /** The screen's own tab row — `Segments`, usually the `underline` variant. */
  tabs?: ReactNode
  /**
   * A bar pinned under the scroller: the transaction spine's "Proceed", and nothing else yet.
   * Same recipe as `Sheet`'s footer, different parent — which is the whole of what it needed.
   */
  footer?: ReactNode
  /** Given, the scroll region gains pull-to-refresh. */
  onRefresh?: () => Promise<void>
  /** Move the header inside the scroller so it scrolls away. Required by `overlap`. */
  scrollHeader?: boolean
  /** Pull the first block of content up into the header slab. Pair with `Head overlap`. */
  overlap?: boolean
  /**
   * Rendered after the scroller and the footer.
   *
   * Sheets go here, and they have to. A sheet is `position: fixed`, and a fixed element inside a
   * transformed ancestor positions against that ancestor rather than the viewport — so a sheet
   * mounted inside the scroller, which runs the entrance stagger, puts its scrim over the page
   * and its panel nowhere.
   */
  after?: ReactNode
  children: ReactNode
}): ReactNode {
  const chrome = scrollHeader ? null : (
    <>
      {header}
      {notice}
      {tabs}
    </>
  )
  /* The stagger is `nth-child` on the content wrapper's children, so the overlap has to be a
     margin on one of those children rather than a wrapper around all of them. With a scrolling
     header the header block is the first child and the screen's own content starts at the
     second. */
  const content = `ds-enter${overlap && scrollHeader ? ' [&>*:nth-child(2)]:-mt-12' : ''}`
  const body = (
    <>
      {scrollHeader ? (
        /* -mx-4 to escape `.scroll`'s 16px gutter: the slab is full bleed. */
        <div className="-mx-4">
          {header}
          {notice}
          {tabs}
        </div>
      ) : null}
      {children}
    </>
  )

  return (
    <>
      {chrome}
      {onRefresh ? (
        <PullToRefresh
          as="main"
          className="scroll"
          contentClassName={content}
          onRefresh={onRefresh}
        >
          {body}
        </PullToRefresh>
      ) : (
        <main className="scroll">
          <div className={content}>{body}</div>
        </main>
      )}
      {footer ? (
        <div className="flex-none border-0 border-t border-solid border-hairline-mint bg-surface p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
          {footer}
        </div>
      ) : null}
      {after}
    </>
  )
}
