import type { ReactNode } from 'react'

/**
 * A spot illustration.
 *
 * Six marks, one system: flat vector, the green ladder from `tokens.css` and nothing else, drawn
 * on transparency so they sit on any surface the app has. They are decoration in the strict
 * sense — every one of them appears beside copy that already says the same thing — so each is
 * `aria-hidden` and none of them is ever the only carrier of a meaning.
 *
 * Two grounds, not one. The marks are drawn in the dark end of the green ladder, which reads on
 * white and disappears on `--tint-ink`; a `-dark` variant is drawn in the light end for the one
 * hero card that is dark. Pick by the surface, not by preference.
 *
 * Sized in three steps rather than freely: a mark that appears at an arbitrary width on each
 * screen stops reading as a system. The files are 512px square, which is 2x the largest step.
 *
 * ## The other two registries, because this is not the only place a mark lives
 *
 * This file is the *spot illustrations* — the large ones, `public/art`, 80 to 160px. There are
 * two more sets and neither belongs here, so if you are looking for a mark and it is not in the
 * union below:
 *
 * - **`public/icons`** — the illustrated icons, 224px files drawn to read at 56. Fourteen product
 *   categories keyed in `screens/invest/categories.ts`, ten `goal-*` keyed in
 *   `screens/goals/dreams.ts`, two `measure-*` in `screens/plan/parts.tsx`. Referenced by file
 *   stem rather than through a component, because the container differs at every placement.
 * - **`screens/invest/SchemeMark.tsx`** — the seven issuer marks, drawn in code from tokens
 *   because they render at 40 and 44px, which is below where a resampled painting holds. Its
 *   `DEVICE` record is the manifest. `DESIGN.md` § Drawn marks has the table and the rules.
 */
const SIZE = { sm: 'size-20', md: 'size-32', lg: 'size-40' } as const

/*
 * The two hero marks are landscape and sit beside a headline number rather than above copy, so
 * they are sized by height and left to find their own width. Everything else is square.
 */
const WIDE = new Set<ArtName>(['hero-holdings', 'hero-plan'])

export type ArtName =
  | 'jar-create'
  | 'empty-jars'
  | 'empty-commitments'
  | 'empty-basket'
  | 'family-invite'
  | 'rebalance-balance'
  | 'rebalance-balance-dark'
  | 'profile-result'
  | 'order-recorded'
  | 'onboarding-ready'
  | 'reports-statement'
  | 'external-folios'
  | 'external-synced'
  | 'promo-start-small'
  | 'promo-advisor'
  | 'hero-holdings'
  | 'hero-plan'

export function Art({
  name,
  size = 'md',
  className = '',
}: {
  name: ArtName
  size?: keyof typeof SIZE
  className?: string
}): ReactNode {
  return (
    <img
      src={`/art/${name}.png`}
      alt=""
      aria-hidden="true"
      /* Decorative and never above the fold on its screen, so it waits its turn. */
      loading="lazy"
      decoding="async"
      width={512}
      height={512}
      className={`${WIDE.has(name) ? 'h-20 w-auto' : SIZE[size]} flex-none select-none object-contain ${className}`}
    />
  )
}
