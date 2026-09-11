/**
 * The jar the dream sits inside.
 *
 * `spec/images/04-smart-jars/02-jar-catalogue.png` is the most distinctive screen in the whole
 * reference and this is the reason: every tile on that dark ground is a *lit outlined jar with a
 * bright object inside it*, and the grid reads as a shelf of dreams rather than as a list of
 * categories. A stroke glyph in a rounded square would carry the same words and none of that,
 * which is the exact failure `PARITY.md` opens with.
 *
 * ## Why the jar is drawn here and the dream is a file
 *
 * `DESIGN.md` splits them: the chrome is one green, and the illustration is where the colour is.
 * The jar is chrome — it is identical on all eight tiles, it has to align to the pixel across a
 * grid, and it changes colour with the ground it is on. So it is an SVG in code, from tokens.
 * The dream inside it is illustration, so it is one of the generated files in `public/icons`,
 * the same set and the same 224px asset the Discover grid and the jar card use.
 *
 * ## Why the glass is filled where the reference's is not
 *
 * SmartWealth draws a periwinkle outline on navy and puts a bright glyph in the hole. That works
 * because its glyphs are drawn light. This app's illustrated set is drawn for a light ground —
 * green ladder down to `#0d3b30`, which is the whole point of it, and what lets one file serve
 * the catalogue tile, the jar card and the form's carousel instead of three near-copies. On a
 * `brand-deep` ground those files would sink. So the jar's glass is filled pale and the dream
 * sits *in* the jar rather than in a hole cut through it — which is also nearer the metaphor,
 * and gives the frames' glow without a second art style.
 *
 * The halo is a blurred sibling rather than a `drop-shadow` filter: a filter on the SVG blurs
 * the `<img>` inside it too.
 */
import type { ReactNode } from 'react'

/**
 * One size, because there is one placement.
 *
 * The jar belongs to the catalogue tile and nowhere else, and the frames are the reason rather
 * than economy: `12-rebalancing/01` gives the jar *card* a plain illustrated square and
 * `05-create-jar-form` gives the carousel an illustrated plate, so a jar at 40px on a list row
 * would be this app inventing a shape the reference deliberately does not draw. If a second
 * placement ever wants one, it gets a step here rather than an arbitrary width at the call site.
 */
const BOX = 'size-[94px]'

/**
 * The dream, sized and dropped to sit *inside* the glass rather than across it.
 *
 * The glass is `x 6→66, y 15→77` of the 72×80 box below, so its centre is at 57.5% of the mark's
 * height where the mark's own centre is 50%. An icon simply centred therefore rides up over the
 * lid, which is what the first pass did and it turned every tile into a picture with a pale
 * rectangle behind it. 64% wide is the proportion the frames give the glyph inside the jar, and
 * the translate is that 7.5% offset expressed against the icon's own height.
 *
 * It is a width and a nudge rather than `inset-[…]` on an absolute box, and that is not a style
 * preference: an `<img>` carrying `width`/`height` attributes has a used `width`, so the `right`
 * offset is ignored and the icon renders at the mark's full size however tight the inset reads in
 * the source. Measured — 88px wide against an intended 50 — which is exactly the sort of thing
 * that looks deliberate in a screenshot nobody opened.
 */
const DREAM = 'w-[64%] translate-y-[11%]'

export function JarMark({
  icon,
  dashed = false,
  onDark = false,
  className = '',
}: {
  /** A file stem in `public/icons`. Always decorative — the label beside it carries the meaning. */
  icon: string
  /**
   * The `Create your own` slot's jar: outlined, unfilled, quieter than its neighbours. The
   * reference dashes the tile's border for this; dashing the jar as well would be two dashed
   * rectangles in one 190px tile.
   */
  dashed?: boolean
  /** On `brand-deep`. Off, the mark is for a light card and drops the halo. */
  onDark?: boolean
  className?: string
}): ReactNode {
  return (
    <span className={`relative grid flex-none place-items-center ${BOX} ${className}`}>
      {onDark ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-[-14%] rounded-pill bg-white/10 blur-[10px]"
        />
      ) : null}
      <svg
        viewBox="0 0 72 80"
        aria-hidden="true"
        focusable="false"
        className="absolute inset-0 size-full"
      >
        {/* The lid: a wide rounded bar with an inner line, sitting clear of the body. Both are
            in the frames at 5x zoom and the inner line is what stops it reading as a handle. */}
        <rect
          x="17"
          y="2.5"
          width="38"
          height="9"
          rx="4.5"
          className={
            dashed ? 'fill-none stroke-white/45' : 'fill-accent-soft/90 stroke-accent-soft'
          }
          strokeWidth="2"
        />
        <path
          d="M22.5 7h27"
          className={dashed ? 'stroke-white/30' : 'stroke-brand-deep/30'}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        {/* The two short shoulders between the lid and the glass. */}
        <path
          d="M25 11.5v3.5M47 11.5v3.5"
          className={dashed ? 'stroke-white/45' : 'stroke-accent-soft'}
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* The glass. */}
        <rect
          x="6"
          y="15"
          width="60"
          height="62"
          rx="13"
          className={
            dashed ? 'fill-white/[0.04] stroke-white/45' : 'fill-accent-soft stroke-accent-soft'
          }
          strokeWidth="2"
        />
        {/* One highlight down the left shoulder — the frames' jars all carry it, and without it
            the filled glass reads as a plain rounded square. */}
        <path
          d="M14.5 26.5v40"
          className={dashed ? 'stroke-white/25' : 'stroke-white/70'}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <img
        src={`/icons/${icon}.png`}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        width={224}
        height={224}
        className={`relative z-[1] ${DREAM} select-none object-contain ${dashed ? 'opacity-90' : ''}`}
      />
    </span>
  )
}
