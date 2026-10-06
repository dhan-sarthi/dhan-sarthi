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
 * in tokens.json cannot be used by accident, and neither can one of the mobile app's own colours:
 * the shared palette is emitted through an allow-list (`CONSOLE_COLORS`), so `bg-scrim` or
 * `bg-hero` does not compile here beside the console's `bg-overlay` and `bg-brand`.
 *
 * `@theme static` emits every variable whether or not a class uses it, because the chart wrappers
 * and inline styles read them with `var()` at runtime.
 *
 * Before writing, every colour role that carries contrast is checked against the surfaces it sits
 * on (`CONTRAST`): text roles at 4.5:1, focus rings, field edges and chart marks at 3:1. A token
 * change that breaks one fails here, not on a low-vision RM's screen.
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
/** Type is sized in rem, so the RM's browser font-size setting reaches it; 16px is the root. */
const rem = (n) => `${Number((n / 16).toFixed(4))}rem`

function fail(line) {
  process.stderr.write(`tokens-css: ${line}\n`)
  process.exit(1)
}

/**
 * The shared colours the console uses. The rest of `color` is the mobile app's own (its chat
 * canvas, its scrims, its hero), and emitting it here would make `bg-scrim` a valid class beside
 * the console's `bg-overlay`. Adding a name here is a decision that the console needs the role.
 */
const CONSOLE_COLORS = [
  'ink',
  'inkSoft',
  'inkFaint',
  'inkHint',
  'onInk',
  'ground',
  'groundDeep',
  'surface',
  'brand',
  'brandDeep',
  'onBrand',
  'streak',
  'budget',
  'success',
  'danger',
  'dangerSoft',
  'hairline',
  'hairlineSoft',
  'canvasTop',
]

/**
 * `web.color.focus`, the 35% tint, measured 1.7:1 on every surface, so the ring is `focusRing`
 * (opaque brand) under the role's old name, `--color-focus`, and every `outline-focus` class picks
 * it up. The tint stays in tokens.json, which only ever grows, but is not emitted.
 */
const WEB_COLOR_RENAMES = { focusRing: 'focus' }
const WEB_COLOR_SKIPPED = new Set(['focus'])

/* ---------------------------------------------------------------- Contrast */

function rgba(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) {
    const n = Number.parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(value)
  if (fn) {
    const [r, g, b, a = '1'] = fn[1].split(',').map((s) => s.trim())
    return [Number(r), Number(g), Number(b), Number(a)]
  }
  fail(`cannot read the colour ${value}`)
  return [0, 0, 0, 1]
}

/** `fg` laid over an opaque `bg`, as the browser composites it. */
function over(fg, bg) {
  const [r, g, b, a] = rgba(fg)
  const [br, bgg, bb] = rgba(bg)
  return [r * a + br * (1 - a), g * a + bgg * (1 - a), b * a + bb * (1 - a)]
}

function luminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(fg, bg) {
  const a = luminance(over(fg, bg))
  const b = luminance(over(bg, '#FFFFFF'))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const C = t.color
const W = t.web.color
/** Every fill text and marks sit on, by role name. */
const SURFACES = {
  surface: C.surface,
  ground: C.ground,
  groundDeep: C.groundDeep,
  canvasTop: C.canvasTop,
  rowHover: W.rowHover,
  rowSelected: W.rowSelected,
  brandWash: W.brandWash,
  brandSoft: W.brandSoft,
  footerWash: W.footerWash,
  dangerWash: W.dangerWash,
  dangerSoft: C.dangerSoft,
}
const pick = (...names) => Object.fromEntries(names.map((n) => [n, SURFACES[n]]))
const chartMarks = {
  ...Object.fromEntries(t.chart.categorical.map((v, i) => [`chart-${i + 1}`, v])),
  comparison: t.chart.comparison,
  bandEdge: t.chart.bandEdge,
  contextBar: t.chart.contextBar,
}

/** [what, foreground, the backgrounds it sits on, the minimum]. */
const CONTRAST = [
  // Muted text: secondary (ink-soft) and tertiary (ink-faint) hold on every tint; ink-hint only
  // on the white surface, which is the rule `ui/Card.tsx` writes down.
  ['ink-soft text', C.inkSoft, SURFACES, 4.5],
  ['ink-faint text', C.inkFaint, SURFACES, 4.5],
  ['ink-hint text', C.inkHint, pick('surface'), 4.5],
  ['on-brand-muted text', W.onBrandMuted, { brand: C.brand }, 4.5],
  ['on-ink-muted text', W.onInkMuted, { ink: C.ink, brandDeep: C.brandDeep }, 4.5],
  ['chart axis text', t.chart.axis, pick('surface'), 4.5],
  ['chart tooltip muted text', t.chart.tooltipMuted, { tooltip: t.chart.tooltip }, 4.5],
  [
    'focus ring',
    W.focusRing,
    pick(
      'surface',
      'ground',
      'groundDeep',
      'canvasTop',
      'rowHover',
      'rowSelected',
      'brandWash',
      'brandSoft',
    ),
    3,
  ],
  ['field edge', W.fieldEdge, pick('surface', 'ground'), 3],
  ...Object.entries(chartMarks).map(([name, value]) => [
    `chart mark ${name}`,
    value,
    pick('surface'),
    3,
  ]),
]

const misses = []
for (const [what, fg, backgrounds, min] of CONTRAST) {
  for (const [name, bg] of Object.entries(backgrounds)) {
    const ratio = contrast(fg, bg)
    if (ratio < min) misses.push(`${what} on ${name} is ${ratio.toFixed(2)}:1, under ${min}:1`)
  }
}
if (misses.length > 0) fail(`contrast check failed:\n  ${misses.join('\n  ')}`)

/* ---------------------------------------------------------------- Theme */

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

// The shared palette, under the same names the NativeWind preset gives it (`ink-soft`,
// `ground-deep`), so a class reads the same in both apps.
for (const name of CONSOLE_COLORS) {
  if (!(name in t.color)) fail(`CONSOLE_COLORS names "${name}", which tokens.json does not have`)
}
sections.push(
  block(
    'color (shared with the mobile app: the roles the console uses)',
    CONSOLE_COLORS.map((k) => [`color-${kebab(k)}`, t.color[k]]),
  ),
)
sections.push(
  block(
    'web.color (console soft fills and states)',
    Object.entries(t.web.color)
      .filter(([k]) => !WEB_COLOR_SKIPPED.has(k))
      .map(([k, v]) => [`color-${kebab(WEB_COLOR_RENAMES[k] ?? k)}`, v]),
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
  block(
    'chart (validated above: every mark role >= 3:1 on surface; categorical CVD-safe adjacent, first three all-pairs)',
    [
      ...c.categorical.map((v, i) => [`color-chart-${i + 1}`, v]),
      ...Object.entries(c.allocation).map(([k, v]) => [`color-chart-${kebab(k)}`, v]),
      ...Object.entries(c.sequential).map(([k, v]) => [`color-chart-seq-${k}`, v]),
      ...Object.entries(c.neutral).map(([k, v]) => [`color-chart-neutral-${k}`, v]),
      // Roles, not ramp steps: a comparison line, a band's edges, a context bar.
      ['color-chart-comparison', c.comparison],
      ['color-chart-band-edge', c.bandEdge],
      ['color-chart-context-bar', c.contextBar],
      ['color-chart-grid', c.grid],
      ['color-chart-baseline', c.baseline],
      ['color-chart-axis', c.axis],
      ['color-chart-tooltip', c.tooltip],
      ['color-chart-tooltip-text', c.tooltipText],
      ['color-chart-tooltip-muted', c.tooltipMuted],
      ['chart-area-opacity', String(c.areaOpacity)],
    ],
  ),
)

// Size, leading, weight and tracking travel together as one role, which is what `text-label`
// means: a role, not a size. A role that needs a second weight is a second role
// (`caption-plain`, `label-plain`) rather than a `font-normal` beside the first, and numerals on
// an axis have their own (`axis`). Case is the one thing a role cannot carry here, so `micro`
// callers add `uppercase` themselves (SectionLabel does). Sizes and line heights are rem, so the
// browser's font-size setting scales the text and its leading together.
sections.push(
  block(
    'web.type (the desktop scale: one class per role)',
    Object.entries(t.web.type).flatMap(([k, v]) => [
      [`text-${kebab(k)}`, rem(v.size)],
      [`text-${kebab(k)}--line-height`, rem(v.leading)],
      [`text-${kebab(k)}--font-weight`, v.weight],
      [`text-${kebab(k)}--letter-spacing`, v.tracking],
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
    Object.entries(t.web.radius).map(([k, v]) => [`radius-${kebab(k)}`, px(v)]),
  ),
)
// Layout sizes stay in px: the sidebar, the rail and a row hold their density whatever the font.
sections.push(
  block('web.size (layout)', [
    ...Object.entries(t.web.size)
      .filter(([k]) => k !== 'content')
      .map(([k, v]) => [`spacing-${kebab(k)}`, px(v)]),
    ['container-content', px(t.web.size.content)],
  ]),
)
// The shell's two steps: the icon rail from `tablet`, the full sidebar from `laptop`. In rem, as
// Tailwind's own are, so `tablet:` and `md:` agree at the default font size.
sections.push(
  block(
    'web.breakpoint (the shell: drawer below tablet, icon rail below laptop)',
    Object.entries(t.web.breakpoint).map(([k, v]) => [`breakpoint-${kebab(k)}`, rem(v)]),
  ),
)
sections.push(
  block(
    'elevation (popovers and overlays only: everything else is a hairline)',
    Object.entries(t.elevation).map(([k, v]) => [`shadow-${k}`, v]),
  ),
)
// Durations twice: `--duration-*` for app.css's keyframes, and `--transition-duration-*`, the
// namespace Tailwind's `duration-*` utilities read, so `duration-feedback` is a class. A bare
// `transition-colors` runs on the feedback clock too.
sections.push(
  block('motion', [
    ...Object.entries(t.motion.ease).map(([k, v]) => [
      `ease-${kebab(k)}`,
      `cubic-bezier(${v.join(', ')})`,
    ]),
    ...Object.entries(t.motion.duration).map(([k, v]) => [`duration-${k}`, `${v}ms`]),
    ...Object.entries(t.motion.duration).map(([k, v]) => [`transition-duration-${k}`, `${v}ms`]),
    ['default-transition-duration', `${t.motion.duration.feedback}ms`],
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
  `tokens-css: ${join('src/styles', 'tokens.generated.css')} and public/favicon.svg up to date, ${CONTRAST.length} contrast roles checked\n`,
)
