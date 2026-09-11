/**
 * The square that stands where the AMC logo goes.
 *
 * Every fund row and every scheme card in SmartWealth carries a 44pt logo tile. We have no
 * logos, and we are not going to ship other companies' marks into a bank's app to fill a square.
 * A monogram in the neutral chip colours does the same job — it makes the row scannable by
 * manufacturer — without pretending to be a brand asset.
 *
 * `03-PALETTE-MAP.md` sends the reference's `#F1F4FA` icon tile to `--legend-chip` with `--brand`
 * ink, which is what `ListRow`'s leading tile already uses, so the two line up down a list.
 */
import type { ReactNode } from 'react'

/** Words that are not part of a house name. `Government of India` is `GI`, not `GO`. */
const NOISE = new Set(['of', 'the', 'and', 'bank', 'mutual', 'fund', 'india'])

/**
 * `LIC Mutual Fund` → `LIC`, `Niva Bupa` → `NB`, `PFRDA` → `PFR`.
 *
 * An acronym that is already short enough is kept whole, because `LIC` says more than `LM` does.
 */
function monogram(manufacturer: string): string {
  const parts = manufacturer.split(/\s+/).filter(Boolean)
  const first = parts[0] ?? ''
  if (first.length <= 4 && first === first.toUpperCase()) return first

  const initials = parts
    .filter((w) => !NOISE.has(w.toLowerCase()))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  return initials.length >= 2 ? initials : first.slice(0, 3).toUpperCase()
}

export function SchemeMark({
  manufacturer,
  size = 'sm',
}: {
  manufacturer: string
  /** `sm` is the 40px list tile; `md` is the 44px one on the scheme card. */
  size?: 'sm' | 'md'
}): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={`grid flex-none place-items-center rounded-sm bg-legend-chip font-bold tracking-tight text-brand-deep ${
        size === 'md' ? 'size-11 text-[12px]' : 'size-10 text-[11px]'
      }`}
    >
      {monogram(manufacturer)}
    </span>
  )
}
