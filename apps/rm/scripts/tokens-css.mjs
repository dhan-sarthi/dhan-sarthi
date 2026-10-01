/**
 * Writes `src/styles/tokens.generated.css`, the console's Tailwind v4 theme, from
 * `packages/design/tokens.json`.
 *
 * tokens.json is the one source of truth for colour, type, radius and shadow; the mobile app reads
 * it through the NativeWind preset and this console reads it through the file this script writes.
 * Nothing in `src/` spells a hex: a utility class (`bg-brand-soft`, `text-micro`) or a
 * `var(--color-…)` is the only way a colour reaches the screen, and both come from here.
 *
 * Tailwind's own palette, type scale, radii and shadows are reset (`--color-*: initial` and so
 * on) so that `bg-blue-500` or `shadow-lg` simply does not exist in this app. A colour that is not
 * in tokens.json cannot be used by accident.
 *
 * `@theme static` emits every variable whether or not a class uses it, because the chart wrappers
 * and inline styles read them with `var()` at runtime.
 *
 * The output is gitignored and regenerated before every dev, build and preview (package.json), so
 * it can never drift from the JSON.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const TOKENS = resolve(HERE, '../../../packages/design/tokens.json')
const OUT = resolve(HERE, '../src/styles/tokens.generated.css')
const FAVICON = resolve(HERE, '../public/favicon.svg')

const t = JSON.parse(readFileSync(TOKENS, 'utf8'))

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
const px = (n) => `${n}px`

/** One section: a comment line, then `--name: value;` rows. */
function block(title, rows) {
  return [`  /* ${title} */`, ...rows.map(([k, v]) => `  --${k}: ${v};`), ''].join('\n')
}

const sections = []

sections.push(
  block('Resets: only what tokens.json declares exists in this app', [
    ['color-*', 'initial'],
    ['text-*', 'initial'],
    ['radius-*', 'initial'],
    ['shadow-*', 'initial'],
    // Not `--font-*`: that prefix also covers `--font-weight-*`, and `font-semibold` has to
    // survive. The two families are overridden below instead.
  ]),
)

// The shared palette, under the same names the NativeWind preset gives it (`ink-mid`,
// `ground-deep`), so a class reads the same in both apps.
sections.push(
  block(
    'color (shared with the mobile app)',
    Object.entries(t.color).map(([k, v]) => [`color-${kebab(k)}`, v]),
  ),
)
sections.push(
  block(
    'web.color (console soft fills and states)',
    Object.entries(t.web.color).map(([k, v]) => [`color-${kebab(k)}`, v]),
  ),
)
sections.push(
  block(
    'web.avatar (initials tints, picked by a hash of the name)',
    t.web.avatar.flatMap((a, i) => [
      [`color-avatar-${i + 1}-bg`, a.bg],
      [`color-avatar-${i + 1}-fg`, a.fg],
    ]),
  ),
)

const c = t.chart
sections.push(
  block('chart (validated: CVD-safe adjacent, first three all-pairs, >= 3:1 on surface)', [
    ...c.categorical.map((v, i) => [`color-chart-${i + 1}`, v]),
    ...Object.entries(c.allocation).map(([k, v]) => [`color-chart-${kebab(k)}`, v]),
    ...Object.entries(c.sequential).map(([k, v]) => [`color-chart-seq-${k}`, v]),
    ...Object.entries(c.neutral).map(([k, v]) => [`color-chart-neutral-${k}`, v]),
    ['color-chart-grid', c.grid],
    ['color-chart-baseline', c.baseline],
    ['color-chart-axis', c.axis],
    ['color-chart-tooltip', c.tooltip],
    ['color-chart-tooltip-text', c.tooltipText],
    ['color-chart-tooltip-muted', c.tooltipMuted],
    ['chart-area-opacity', String(c.areaOpacity)],
  ]),
)

// Size, leading, weight and tracking travel together as one role, which is what `text-label`
// means: a role, not a size. Case is the one thing a role cannot carry here, so `micro` callers
// add `uppercase` themselves (SectionLabel does).
sections.push(
  block(
    'web.type (the desktop scale: one class per role)',
    Object.entries(t.web.type).flatMap(([k, v]) => [
      [`text-${k}`, px(v.size)],
      [`text-${k}--line-height`, px(v.leading)],
      [`text-${k}--font-weight`, v.weight],
      [`text-${k}--letter-spacing`, v.tracking],
    ]),
  ),
)
sections.push(
  block('web.font (system stack only: no web fonts, so the rupee sign always renders)', [
    ['font-sans', t.web.font.sans],
    ['font-mono', t.web.font.mono],
    ['tracking-micro', t.web.type.micro.tracking],
  ]),
)
sections.push(
  block(
    'web.radius',
    Object.entries(t.web.radius).map(([k, v]) => [`radius-${k}`, px(v)]),
  ),
)
sections.push(
  block('web.size (layout)', [
    ...Object.entries(t.web.size)
      .filter(([k]) => k !== 'content')
      .map(([k, v]) => [`spacing-${kebab(k)}`, px(v)]),
    ['container-content', px(t.web.size.content)],
  ]),
)
sections.push(
  block(
    'elevation (popovers and overlays only: everything else is a hairline)',
    Object.entries(t.elevation).map(([k, v]) => [`shadow-${k}`, v]),
  ),
)
sections.push(
  block('motion', [
    ...Object.entries(t.motion.ease).map(([k, v]) => [
      `ease-${kebab(k)}`,
      `cubic-bezier(${v.join(', ')})`,
    ]),
    ...Object.entries(t.motion.duration).map(([k, v]) => [`duration-${k}`, `${v}ms`]),
  ]),
)

const css = [
  '/* Generated by apps/rm/scripts/tokens-css.mjs from packages/design/tokens.json. Do not edit. */',
  '@theme static {',
  sections.join('\n').trimEnd(),
  '}',
  '',
].join('\n')

// The tab icon is the sidebar's mark, in the same brand green, so it is generated here too
// rather than committed with a colour of its own.
const favicon = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">',
  `<rect width="32" height="32" rx="8" fill="${t.color.brand}"/>`,
  `<path d="M7 23l7-7 4.5 4.5L25 13" fill="none" stroke="${t.color.onBrand}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  `<path d="M19.5 13H25v5.5" fill="none" stroke="${t.color.onBrand}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  '</svg>',
  '',
].join('')

/** Rewriting an identical file would still bump its mtime and make Vite reload every open tab. */
function writeIfChanged(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  let previous = ''
  try {
    previous = readFileSync(path, 'utf8')
  } catch {
    // First run: nothing to compare against.
  }
  if (previous !== content) writeFileSync(path, content)
}

writeIfChanged(OUT, css)
writeIfChanged(FAVICON, favicon)
process.stdout.write(
  `tokens-css: ${join('src/styles', 'tokens.generated.css')} and public/favicon.svg up to date\n`,
)
