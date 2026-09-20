/**
 * Regenerate the logo and merchant-icon blocks of `packages/assets/src/index.ts`.
 *
 * Both sets are drawn or fetched by other tools and change in bulk, and hand-editing ninety
 * import lines is how a file ends up with one that no longer has a PNG behind it. This reads
 * what is actually on disk and rewrites only the two generated blocks, leaving everything
 * else in the file — the spend-category map, the portraits — exactly where it was.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'packages/assets/src/index.ts')
const LOGOS = join(ROOT, 'packages/assets/logos')
const MERCHANT = join(ROOT, 'packages/assets/icons/merchant')

const pngs = (dir) => readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)).sort()
const ident = (slug, prefix = '') => {
  const camel = slug.split('-').map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1))).join('')
  return prefix ? prefix + camel[0].toUpperCase() + camel.slice(1) : camel
}

const logos = pngs(LOGOS)
const kinds = pngs(MERCHANT)
const sizes = JSON.parse(readFileSync(join(LOGOS, 'sizes.json'), 'utf8'))

const BEGIN = '// <generated: assets>'
const END = '// </generated: assets>'

const imports = [
  ...logos.map((s) => `import ${ident(s, 'logo')} from '../logos/${s}.png'`),
  '',
  ...kinds.map((s) => `import ${ident(s, 'kind')} from '../icons/merchant/${s}.png'`),
].join('\n')

const body = `
/**
 * Merchant logos, keyed by a slug of the merchant name.
 *
 * Bundled rather than fetched: the app has to render a statement with no network beyond the
 * bank, an IDBI sandbox will not reach a logo CDN, and a row whose icon arrives half a second
 * late looks broken. \`tools/fetch-merchant-logos.mjs\` refreshes them.
 *
 * \`width\` is the logo's real pixel width, and it is here because most of these brands publish
 * nothing larger than a favicon. Stretching a 48px mark to fill a 40pt plate is a smear, so the
 * caller renders at native size and lets the plate hold the padding. Anything under 32px is not
 * bundled at all — a drawn icon is the better picture.
 */
const MERCHANT_LOGO: Record<string, { src: IconRef; width: number }> = {
${logos.map((s) => `  '${s}': { src: ${ident(s, 'logo')}, width: ${sizes[s] ?? 96} },`).join('\n')}
}

/**
 * One drawing per kind of merchant, from \`tools/gen-merchant-icons.mjs\`.
 *
 * These sit between the brand logo and the spend-category illustration. The category says
 * "Food & dining", which is equally true of a pizza order, a chai stall and a biryani house —
 * drawing all three the same way is how a statement stops being read.
 */
const MERCHANT_KIND_ICON: Record<string, IconRef> = {
${kinds.map((s) => `  '${s}': ${ident(s, 'kind')},`).join('\n')}
}

export const logoSlug = (merchant: string): string =>
  merchant.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** The brand's logo and its true pixel width, or undefined where this merchant has none. */
export function merchantLogo(
  merchant: string | null | undefined,
): { src: IconRef; width: number } | undefined {
  if (!merchant) return undefined
  const slug = logoSlug(merchant)
  if (MERCHANT_LOGO[slug]) return MERCHANT_LOGO[slug]
  // "Swiggy Instamart" has its own logo; "Reliance Digital Mumbai" should still find Reliance.
  const prefix = Object.keys(MERCHANT_LOGO)
    .filter((key) => slug.startsWith(\`\${key}-\`))
    .sort((a, b) => b.length - a.length)[0]
  return prefix ? MERCHANT_LOGO[prefix] : undefined
}

/** The drawing for what this merchant is, or undefined when nothing recognises it. */
export function merchantKindIcon(merchant: string | null | undefined): IconRef | undefined {
  const kind = merchantKind(merchant)
  return kind ? MERCHANT_KIND_ICON[kind] : undefined
}
`

let src = readFileSync(SRC, 'utf8')

// Drop every previously generated import and block, then re-add.
src = src
  .split('\n')
  .filter((l) => !(l.startsWith('import ') && (l.includes("/logos/") || l.includes("/icons/merchant/"))))
  .join('\n')

if (src.includes(BEGIN)) {
  src = src.slice(0, src.indexOf(BEGIN)) + src.slice(src.indexOf(END) + END.length)
} else {
  // First run: remove the hand-written block this replaces.
  const marker = '/**\n * Merchant logos, keyed by a slug of the merchant name.'
  if (src.includes(marker)) {
    const start = src.indexOf(marker)
    const end = src.indexOf('\n}\n', src.indexOf('export function merchantLogo(')) + 3
    src = src.slice(0, start) + src.slice(end)
  }
}

src = src.replace(
  "import type { SpendCategory } from '@dhan/contracts'",
  `import type { SpendCategory } from '@dhan/contracts'\nimport { merchantKind } from './merchant-kind.ts'\n\n${imports}`,
)

writeFileSync(SRC, `${src.trimEnd()}\n\n${BEGIN}\n${body.trim()}\n${END}\n`)
console.log(`index rewritten: ${logos.length} logos, ${kinds.length} merchant icons`)
