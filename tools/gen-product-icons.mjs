/**
 * Draw the product-category, goal and measure icons into `packages/assets/icons/product`.
 *
 * Fourteen product categories, one per kind of thing IDBI's shelf carries; ten `goal-*` — eight
 * dreams plus `goal-buffer` and `goal-debt`, the two pots the plan opens itself and the two ids
 * `packages/core/src/goal.ts:53,:69` still emit; and two `measure-*` marks that tell the plan's
 * two branches apart.
 *
 * These drew into `apps/web/public/icons` until that app was deleted on 20 September 2026
 * (`docs/architecture/adr/ADR-0001.md`), which took the artwork and the screens that read it —
 * `screens/invest/CategoryGrid.tsx`, `screens/goals/dreams.ts`, `screens/plan/parts.tsx`. The
 * output now goes where its two siblings put theirs, so `packages/assets` can export it the
 * moment `apps/mobile` grows the screens; until then nothing imports the set.
 *
 * The script the originals came from is not in the repo, so the subjects below were read back
 * off the artwork rather than inherited: same objects, redrawn. Keep them that way. A category
 * whose picture changes meaning between releases is a category nobody learns.
 *
 * House style comes from `tools/lib/icons.mjs`, shared with the spend and merchant sets.
 *
 * Not in `pnpm assets:icons` and not part of any build: it costs money, it overwrites artwork,
 * and it has no consumer yet. It runs when somebody asks.
 *
 *   node tools/gen-product-icons.mjs             # only what is missing
 *   node tools/gen-product-icons.mjs --force      # redraw everything
 *   node tools/gen-product-icons.mjs ppf goal-car # redraw some
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { drawAll, key } from './lib/icons.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'packages/assets/icons/product')

/*
 * Subject and palette per icon.
 *
 * Two notes on collisions, both of them defects in the green set that are fixed here:
 *
 * `nps` and `goal-retirement` were both a rocking chair, which in a screen that can show the two
 * together is one icon printed twice. The chair stays with the dream — it is the picture a
 * customer picks — and NPS takes cupped hands and a sunrise, which says "a pension being built"
 * rather than "being retired".
 *
 * `goal-wealth` (a cut gem) and `jewellery` in the merchant set (a ring with a stone) are close.
 * They never appear on the same screen — one is a savings dream, the other a statement row — and
 * the gem is what the catalogue tile has always shown, so it stays.
 */
const ICONS = [
  // The shelf: fourteen product categories.
  [
    'sweep-in-fd',
    'a bank safe with an arc of coins sweeping into a slot in its top',
    'deep teal safe with brass corners, a gold dial, a sweep of bright gold coins',
  ],
  [
    'fixed-deposit',
    'a chunky bank safe with a round combination dial and a handle',
    'deep teal body, brass corners and a polished gold dial',
  ],
  [
    'recurring-deposit',
    'a tiered stack of coins with a circular arrow curving around it',
    'stacked gold and amber coins, a mint-green circular arrow',
  ],
  [
    'liquid-fund',
    'a single round water drop resting in a shallow dish',
    'vivid cyan-blue drop with a white highlight, a teal dish',
  ],
  [
    'debt-fund',
    'a bond certificate with ruled lines and a wax seal at its corner',
    'cream paper with teal ruled lines, a cobalt-blue wax seal and ribbon',
  ],
  [
    'index-fund',
    'three ascending bars with an arrow rising across them',
    'sky-blue, violet and teal bars, a bright coral arrow',
  ],
  [
    'elss',
    'a potted seedling with a small shield badge leaning against the pot',
    'terracotta pot, a vivid spring-green seedling, a gold shield badge',
  ],
  [
    'term-insurance',
    'a rounded shield with a heart at its centre',
    'deep cobalt-blue shield with a lighter rim, a bright crimson heart',
  ],
  [
    'health-insurance',
    'a rounded plate with a medical cross on it and a pulse line across',
    'cream plate, a mint-green cross, a coral pulse line',
  ],
  [
    'govt-insurance',
    'a shield with a star at its centre and a small banner across its foot',
    'royal-blue shield, a bright gold star, a cream banner',
  ],
  [
    'nps',
    'a pair of cupped hands holding a single coin, with a small sun rising behind them',
    'warm sand hands, a bright gold coin, a soft coral sunrise arc',
  ],
  [
    'ppf',
    'a round leafy tree with small round fruit and a short trunk',
    'rich leaf-green canopy, golden-orange fruit, a warm brown trunk',
  ],
  [
    'ulip',
    'a clipboard holding a lined sheet with a small chart clipped to it',
    'violet clipboard, cream lined sheet, a sky-blue chart and clip',
  ],
  [
    'endowment',
    'a policy document with a rosette seal and a ribbon at its lower corner',
    'cream document with teal ruled lines, a gold rosette, a violet ribbon',
  ],

  // The eight dreams, plus the two pots the plan opens itself.
  [
    'goal-custom',
    'a rounded gift tag on a short string, with two small sparkles beside it',
    'aqua-turquoise tag, a warm gold string and eyelet, bright gold sparkles',
  ],
  [
    'goal-car',
    'a small hatchback car seen from a front three-quarter angle',
    'cherry-red bodywork, sky-blue windows, chrome trim, charcoal tyres',
  ],
  [
    'goal-home',
    'a small house with a pitched roof, a door and two shrubs at its base',
    'cream walls, a coral-red roof, warm amber windows, leaf-green shrubs',
  ],
  [
    'goal-education',
    'a graduation cap with a tassel resting beside a rolled scroll',
    'deep navy cap, a gold tassel, a cream scroll with a violet ribbon',
  ],
  [
    'goal-retirement',
    'a wooden rocking chair seen from a three-quarter angle',
    'honey-wood frame, a soft coral cushion, cream backrest slats',
  ],
  [
    'goal-wedding',
    'two interlocking rings, one set with a single stone',
    'polished gold bands, a ruby-red stone with a white sparkle',
  ],
  [
    'goal-holiday',
    'a beach umbrella with a deckchair beside it on a small patch of sand',
    'coral and cream striped umbrella, a teal deckchair, golden sand',
  ],
  [
    'goal-wealth',
    'a single large cut gemstone with faceted sides',
    'brilliant cyan-turquoise facets, deep teal shadow faces, white sparkle',
  ],
  [
    'goal-buffer',
    'an open umbrella with a few raindrops falling above it',
    'mint-green and cream canopy, a crimson tip, sky-blue raindrops',
  ],
  [
    'goal-debt',
    'a payment card seen at a slight angle, with a chip and a stripe',
    'indigo-violet card, a gold chip, a magenta stripe',
  ],

  // The two measures the plan screen branches into.
  [
    'measure-add',
    'a short stack of coins with a small plus badge at its upper corner',
    'stacked gold and amber coins, a warm orange plus badge',
  ],
  [
    'measure-align',
    'a thick donut ring split into segments with one segment lifted clear',
    'violet, teal and sky-blue segments, the lifted one in bright violet',
  ],
]

const args = process.argv.slice(2)
const force = args.includes('--force')
const only = args.filter((a) => !a.startsWith('--'))
const wanted = only.length > 0 ? ICONS.filter((i) => only.includes(i[0])) : ICONS
if (wanted.length === 0) throw new Error(`nothing matched: ${only.join(', ')}`)

mkdirSync(OUT, { recursive: true })
const jobs = []
let skipped = 0

for (const [slug, subject, palette] of wanted) {
  const file = join(OUT, `${slug}.png`)
  if (existsSync(file) && !force && only.length === 0) {
    skipped += 1
    continue
  }
  jobs.push({ label: slug, file, subject, palette })
}

const made = jobs.length > 0 ? await drawAll(jobs, await key()) : 0

process.stdout.write(`\n${made} drawn, ${skipped} already present (pass --force to redraw)\n`)
