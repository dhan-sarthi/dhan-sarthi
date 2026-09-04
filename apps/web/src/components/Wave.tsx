/**
 * IDBI's wave.
 *
 * GO Mobile+ carries a set of soft, overlapping curves across its header and its account cards.
 * It is the bank's single most recognisable surface mark and costs one inline SVG, so our header
 * slab and the day's hero panel carry it too — this is most of what makes a screen read as part
 * of their app rather than as a generic finance card.
 *
 * Drawn once as a viewBox that stretches: `preserveAspectRatio="none"` lets the same three paths
 * fill a 64px strip or a 200px panel without a second asset. Purely decorative, so it is hidden
 * from assistive technology and never carries meaning a sighted user gets and a screen reader
 * does not.
 */
import type { ReactNode } from 'react'

export function Wave({
  tone = 'light',
  className = '',
}: {
  /**
   * `light` for the mint header, where the curves are white over a tint; `dark` for the green
   * hero panel, where they are white at a much lower opacity so the number stays the brightest
   * thing on it.
   */
  tone?: 'light' | 'dark'
  className?: string
}): ReactNode {
  const fill = tone === 'dark' ? '#ffffff' : '#ffffff'
  const [a, b, c] = tone === 'dark' ? [0.07, 0.05, 0.04] : [0.55, 0.38, 0.22]
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 390 160"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-0 size-full ${className}`}
    >
      <path d="M0 96 C 74 40, 138 132, 210 84 S 330 26, 390 62 V160 H0 Z" fill={fill} opacity={a} />
      <path
        d="M0 118 C 88 70, 150 150, 232 106 S 338 62, 390 92 V160 H0 Z"
        fill={fill}
        opacity={b}
      />
      <path
        d="M0 62 C 60 18, 128 78, 196 46 S 318 4, 390 30"
        fill="none"
        stroke={fill}
        strokeWidth="1.5"
        opacity={c}
      />
    </svg>
  )
}
