/**
 * The square that stands where the AMC logo goes.
 *
 * Every fund row and every scheme card in SmartWealth carries a 44pt logo tile. We have no logos,
 * and we are not going to ship other companies' marks into a bank's app to fill a square. That
 * part of the original note stands and is not up for revisiting.
 *
 * What has changed is what fills the square instead. It used to be a monogram — `LIC`, `UTI`,
 * `NB`, `GI`, `PFR` — and a monogram is not a mark, it is the absence of one: three letters in a
 * tinted box is the shape every unfinished app ships while it waits for the real asset. So each
 * issuer now gets a **drawn device for the kind of institution it is** — a seat of state, a bank
 * house, a life cover, a health cover, a pension seal, a fund's growth. Not a logo, not a
 * likeness, nothing that could be mistaken for a brand asset: the same thing a stock certificate
 * does when it draws a generic allegory rather than a wordmark. An issuer with no device still
 * gets the monogram, so the shelf can grow without this file being touched.
 *
 * ## Why these are drawn in code and the category icons are files
 *
 * `DESIGN.md` splits it that way already, and this lands on the chrome side of the split for a
 * reason that is about size rather than taste. The illustrated set in `public/icons` is generated
 * raster drawn to read at 56px; this tile renders at **40 and 44**, and the mark inside it at
 * about 34. A 224px painting resampled to 34 loses exactly the soft two-tone shading that makes
 * it look painted and keeps the internal parts that make it look busy — a sticker, which is the
 * failure the More menu already refused once at 34px. A mark drawn *for* 34 has the opposite
 * problem to solve and solves it with fewer parts, a heavier silhouette and no resampling at all.
 * `goals/JarMark.tsx` is the precedent: chrome that has to align across a grid and take its
 * colour from the ground is an SVG from tokens.
 *
 * They stay in the same visual language as the files, which is what stops a fund row and the
 * Discover grid above it reading as two apps: filled shapes only, the green ladder for the body,
 * **one accent per mark** from the four in `tokens.css` — gold, coral, sky, violet — used as a
 * highlight of roughly a tenth of the artwork, and no black. Same rule, drawn by hand.
 *
 * ## The one thing to hold if you add an eighth
 *
 * Silhouette, not detail, is what identifies a mark at 34px. The seven below are a dome, a
 * pediment, a canopy, a stack, a shield, a medallion and a stair — no two of which share an
 * outline. Internal parts are the first thing to go if a new mark will not resolve; a hue is not
 * a distinguisher, because two of these already share every accent.
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
 * The fallback, now, and only that: an issuer the shelf grows that has no device yet. An acronym
 * short enough to stand is kept whole, because `LIC` says more than `LM` does.
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

/*
 * The seven devices, on a 24-unit grid with the art running roughly 2 → 22.
 *
 * Read them as silhouettes, because that is all the tile has room to say: dome and pennant for
 * the state, pediment on columns for the bank, canopy for the life cover, cross on a shield for
 * the health cover, medallion and ribbons for the pension authority, and two different growth
 * devices for the two fund houses — a coin stack under an arrow, and a stair of bars — because
 * "a fund house" drawn once would make LIC MF and UTI MF the same picture, which is worse than
 * the monogram it replaces.
 */

/** Seat of state — a domed house under a pennant. Accent: gold. */
function GovernmentMark(): ReactNode {
  return (
    <>
      <rect x="1.6" y="19.6" width="20.8" height="2.8" rx="1.3" className="fill-brand-deep" />
      <rect x="3.4" y="13.8" width="17.2" height="5.8" className="fill-brand" />
      <rect x="5.4" y="15.6" width="2.4" height="4" rx="1.2" className="fill-chart-5" />
      <rect x="10.8" y="15.6" width="2.4" height="4" rx="1.2" className="fill-chart-5" />
      <rect x="16.2" y="15.6" width="2.4" height="4" rx="1.2" className="fill-chart-5" />
      <rect x="8.4" y="10.4" width="7.2" height="3.4" className="fill-brand-deep" />
      <path d="M8.4 10.4a3.6 3.6 0 0 1 7.2 0Z" className="fill-brand-deep" />
      <path d="M9.9 10.4a2.1 2.1 0 0 1 4.2 0Z" className="fill-chart-4" />
      <rect x="11.5" y="2.6" width="1" height="4.6" rx="0.5" className="fill-brand-deep" />
      <path d="M12.5 2.9h3.7l-1.2 1.3 1.2 1.3h-3.7Z" className="fill-art-gold" />
    </>
  )
}

/** A bank — pediment, three columns, one plinth. Accent: sky. */
function BankMark(): ReactNode {
  return (
    <>
      <rect x="1.6" y="19.4" width="20.8" height="2.9" rx="1.3" className="fill-brand-deep" />
      <rect x="4.4" y="11.6" width="3" height="7.8" rx="0.9" className="fill-chart-4" />
      <rect x="10.5" y="11.6" width="3" height="7.8" rx="0.9" className="fill-chart-4" />
      <rect x="16.6" y="11.6" width="3" height="7.8" rx="0.9" className="fill-chart-4" />
      <rect x="3" y="9.6" width="18" height="2.2" rx="0.6" className="fill-brand" />
      <path d="M12 2.6 22.4 9.6H1.6Z" className="fill-brand-deep" />
      <circle cx="12" cy="7.4" r="1.5" className="fill-art-sky" />
    </>
  )
}

/** A life cover — an open umbrella. Accent: coral. */
function LifeCoverMark(): ReactNode {
  return (
    <>
      <rect x="11.3" y="12.6" width="1.4" height="5.8" className="fill-brand-deep" />
      <path
        d="M12.7 18.2a2.3 2.3 0 0 1-4.6 0"
        className="stroke-brand-deep"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M2.2 13.2a9.8 9.8 0 0 1 19.6 0Z" className="fill-brand-deep" />
      <path d="M6.6 13.2a5.4 5.4 0 0 1 10.8 0Z" className="fill-chart-3" />
      <circle cx="12" cy="2.6" r="1.6" className="fill-art-coral" />
    </>
  )
}

/** A health cover — a cross on a shield. Accent: coral. */
function HealthCoverMark(): ReactNode {
  return (
    <>
      <path
        d="M12 1.8 20.8 4.9v7.3c0 4.8-3.7 8.1-8.8 10-5.1-1.9-8.8-5.2-8.8-10V4.9Z"
        className="fill-brand-deep"
      />
      <path
        d="M12 4.4 18.5 6.7v5.6c0 3.5-2.7 6-6.5 7.5-3.8-1.5-6.5-4-6.5-7.5V6.7Z"
        className="fill-chart-3"
      />
      <rect x="11.05" y="8.6" width="1.9" height="6.8" rx="0.7" className="fill-art-coral" />
      <rect x="8.6" y="11.05" width="6.8" height="1.9" rx="0.7" className="fill-art-coral" />
    </>
  )
}

/** A pension authority — a sealed medallion on ribbons. Accent: violet. */
function AuthorityMark(): ReactNode {
  return (
    <>
      <path d="M10.2 14 7 22.8l2.9-1.4 1.5 1.5Z" className="fill-art-violet" />
      <path d="M13.8 14 17 22.8l-2.9-1.4-1.5 1.5Z" className="fill-art-violet" />
      <circle cx="12" cy="10.4" r="7.6" className="fill-brand-deep" />
      <circle cx="12" cy="10.4" r="5.4" className="fill-chart-3" />
      <path d="M12 6.2l3.2 3.4h-1.9v3.6h-2.6V9.6H8.8Z" className="fill-chart-5" />
    </>
  )
}

/** A fund house — a stack of coins under a rising arrow. Accent: gold. */
function FundStackMark(): ReactNode {
  return (
    <>
      <path d="M12 0.8l3.4 3.6h-2V7h-2.8V4.4h-2Z" className="fill-art-gold" />
      <rect x="3.4" y="15.4" width="17.2" height="4.6" rx="2.3" className="fill-brand-deep" />
      <rect x="3.4" y="10.9" width="17.2" height="4.6" rx="2.3" className="fill-brand" />
      <rect x="3.4" y="6.4" width="17.2" height="4.6" rx="2.3" className="fill-chart-4" />
      <rect x="6" y="8.1" width="5.4" height="1.4" rx="0.7" className="fill-chart-5" />
    </>
  )
}

/** A fund house — a stair of bars under a marker. Accent: sky. */
function FundGrowthMark(): ReactNode {
  return (
    <>
      <circle cx="18.1" cy="3.9" r="2.3" className="fill-art-sky" />
      <rect x="1.8" y="19.8" width="20.4" height="2.6" rx="1.3" className="fill-brand-deep" />
      <rect x="3.6" y="13.4" width="4.6" height="6.4" rx="1.5" className="fill-chart-4" />
      <rect x="9.7" y="10" width="4.6" height="9.8" rx="1.5" className="fill-brand" />
      <rect x="15.8" y="6.2" width="4.6" height="13.6" rx="1.5" className="fill-brand-deep" />
    </>
  )
}

/**
 * Which device an issuer gets, by exact name.
 *
 * Exact rather than fuzzy on purpose. A substring rule that turned every name containing `Bank`
 * into the bank house would silently give a bank's *fund arm* the wrong institution, and getting
 * an issuer's kind wrong is worse than falling back to its initials. Add a row when the shelf
 * adds a house.
 */
const DEVICE: Readonly<Record<string, () => ReactNode>> = {
  'Government of India': GovernmentMark,
  'IDBI Bank': BankMark,
  'LIC of India': LifeCoverMark,
  'LIC Mutual Fund': FundStackMark,
  'Niva Bupa': HealthCoverMark,
  PFRDA: AuthorityMark,
  'UTI Mutual Fund': FundGrowthMark,
}

/**
 * The mark alone, with no tile under it.
 *
 * `ListRow`'s leading tile is the same recipe as this component's — `size-10 rounded-sm
 * bg-legend-chip text-brand-deep` — so a row that already has one takes the glyph rather than a
 * second square inside the first. The add-a-scheme sheet is the caller.
 */
export function SchemeGlyph({ manufacturer }: { manufacturer: string }): ReactNode {
  const Device = DEVICE[manufacturer.trim()]
  if (!Device) {
    return <span className="text-[11px] font-bold tracking-tight">{monogram(manufacturer)}</span>
  }
  /* 86% of the tile, which is the 3px inset the reference gives its logo squares at 44 and the
     most the mark can take before the tint stops reading as a tile at all. */
  return (
    <svg viewBox="0 0 24 24" focusable="false" className="size-[86%]">
      <Device />
    </svg>
  )
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
      className={`grid flex-none place-items-center rounded-sm bg-legend-chip text-brand-deep ${
        size === 'md' ? 'size-11' : 'size-10'
      }`}
    >
      <SchemeGlyph manufacturer={manufacturer} />
    </span>
  )
}
