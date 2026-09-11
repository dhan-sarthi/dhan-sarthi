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
  | 'family-invite'
  | 'rebalance-balance'
  | 'rebalance-balance-dark'
  | 'profile-result'
  | 'order-recorded'
  | 'onboarding-ready'
  | 'reports-statement'
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
