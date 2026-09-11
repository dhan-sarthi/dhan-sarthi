/**
 * The full-width strip that says something about the screen under it.
 *
 * This was `OfflineBadge`, hardwired to one message. `COMPONENT-GAP.md` marks it **Extend** —
 * SmartWealth's `InfoBanner` is structurally exactly it — so the shape is lifted here and the
 * offline badge becomes one caller of three lines.
 *
 * It goes in `Screen`'s `notice` slot, between the app bar and the content: a banner inside the
 * scroller is below the fold the moment anyone scrolls, and the things this carries are true of
 * the whole screen rather than of one card on it.
 *
 * Three tones and no more. Peach is attention (the clock, the offline badge); mint is
 * information that is not a warning; danger-soft is a refusal. Each pairs the tint with the ink
 * that clears AA on it, which is the whole reason a tone is a tone rather than two props.
 */
import type { ReactNode } from 'react'

const TONE = {
  clay: { strip: 'bg-tint-clay text-accent-text', action: 'border-accent text-accent-text' },
  sage: { strip: 'bg-tint-sage text-brand-deep', action: 'border-hairline-mint text-brand-deep' },
  danger: { strip: 'bg-danger-soft text-danger', action: 'border-danger text-danger' },
} as const

export function InfoBanner({
  tone = 'clay',
  action,
  onAction,
  actionDisabled,
  children,
}: {
  tone?: keyof typeof TONE
  /** The label on the inline button. Left out, the strip is text only. */
  action?: string
  onAction?: () => void
  actionDisabled?: boolean
  children: ReactNode
}): ReactNode {
  const t = TONE[tone]
  return (
    <div
      role="status"
      className={`flex flex-none items-center gap-3 px-4 py-2.5 text-[13px] leading-snug ${t.strip}`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {action ? (
        <button
          type="button"
          onClick={onAction}
          disabled={actionDisabled === true}
          className={`ds-press h-9 shrink-0 whitespace-nowrap rounded-pill border-[1.5px] border-solid bg-white px-3 text-[13px] font-semibold disabled:opacity-60 ${t.action}`}
        >
          {action}
        </button>
      ) : null}
    </div>
  )
}
