/**
 * Pull the merchant logos the demo ledger actually uses, and bundle them.
 *
 * Bundled, not fetched at runtime, for three reasons: the app must render a statement with
 * no network beyond the bank, an IDBI sandbox will not reach a logo CDN, and a row whose
 * icon pops in half a second late looks broken. They are small, and there are forty.
 *
 * Only brands with a real public identity are listed. A neighbourhood kirana or a chai
 * stall has no logo, and inventing one would be dressing — those rows fall back to the
 * spend-category illustration, which is the honest answer and already exists.
 *
 * Not part of any build; it hits the network and overwrites artwork.
 *
 *   node tools/fetch-merchant-logos.mjs           # only what is missing
 *   node tools/fetch-merchant-logos.mjs --force   # refetch everything
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'packages/assets/logos')
const FORCE = process.argv.includes('--force')

/**
 * Below this, a logo is not worth having.
 *
 * Most of these brands publish nothing bigger than a favicon, and a 16px favicon blown up to
 * fill a 40pt plate is a smear — worse than no logo at all, because it reads as a broken
 * image rather than as a considered choice. Anything under this falls back to the
 * spend-category illustration, which is sharp at any size.
 */
const MIN_NATIVE = 32

/** The plate is 40pt; 96 covers it at @2x and there is nothing to gain past that. */
const MAX_NATIVE = 96

const widthOf = (file) => {
  const out = execFileSync('sips', ['-g', 'pixelWidth', file], { encoding: 'utf8' })
  return Number(/pixelWidth:\s*(\d+)/.exec(out)?.[1] ?? 0)
}

/**
 * Merchant name as the narration parser produces it → the brand's primary domain.
 *
 * Meesho, Chaayos, Ola, IRCTC and Zudio are deliberately absent: no logo source still serves
 * one for them. They fall back to the spend-category illustration, same as a kirana store.
 */
const BRANDS = {
  Amazon: 'amazon.in',
  Flipkart: 'flipkart.com',
  Myntra: 'myntra.com',
  Nykaa: 'nykaa.com',
  Ajio: 'ajio.com',
  Swiggy: 'swiggy.com',
  'Swiggy Dineout': 'swiggy.com',
  'Swiggy Instamart': 'swiggy.com',
  Zomato: 'zomato.com',
  Zepto: 'zeptonow.com',
  Blinkit: 'blinkit.com',
  Bigbasket: 'bigbasket.com',
  Dmart: 'dmart.in',
  Dominos: 'dominos.co.in',
  Starbucks: 'starbucks.in',
  'Third Wave Coffee': 'thirdwavecoffee.in',
  Uber: 'uber.com',
  Rapido: 'rapido.bike',
  Bookmyshow: 'bookmyshow.com',
  Pvr: 'pvrcinemas.com',
  Inox: 'inoxmovies.com',
  Crossword: 'crossword.in',
  Lenskart: 'lenskart.com',
  'Apollo Pharmacy': 'apollopharmacy.in',
  Medplus: 'medplusmart.com',
  Netflix: 'netflix.com',
  Spotify: 'spotify.com',
  Hotstar: 'hotstar.com',
  Airtel: 'airtel.in',
  'Airtel Prepaid': 'airtel.in',
  'Jio Fiber': 'jio.com',
  Hpcl: 'hindustanpetroleum.com',
  Bpcl: 'bharatpetroleum.in',
  Croma: 'croma.com',
  Lulu: 'lulumall.in',
  Reliance: 'relianceretail.com',
  'Reliance Fresh': 'relianceretail.com',
  'Reliance Smart': 'relianceretail.com',
  Smaaash: 'smaaash.in',
  Makemytrip: 'makemytrip.com',
  Cleartrip: 'cleartrip.com',
  Idbi: 'idbibank.in',
}

/**
 * Logos given by hand, where no favicon service has a usable one.
 *
 * Spencer's publishes a 16px favicon; this is the same mark at 400px. A direct URL is the
 * escape hatch for a brand whose own site is not the best source of its own logo.
 */
const MANUAL = {
  Spencer:
    'https://icon2.cleanpng.com/20180617/vos/kisspng-spencer-s-retail-spencer-s-hyper-store-grocery-sto-5b26a32ee5a037.7041912315292587989406.jpg',
}

export const slugOf = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

mkdirSync(OUT, { recursive: true })

let made = 0
let skipped = 0
const failed = []

/**
 * Each logo's real pixel width, so the app can render it at native size rather than
 * stretching it to fill the plate. Written beside the images and read by the assets index.
 */
const SIZES_FILE = join(OUT, 'sizes.json')
const sizes = existsSync(SIZES_FILE) ? JSON.parse(readFileSync(SIZES_FILE, 'utf8')) : {}

for (const [name, source] of [
  ...Object.entries(BRANDS).map(([n, d]) => [
    n,
    `https://www.google.com/s2/favicons?domain=${d}&sz=256`,
  ]),
  ...Object.entries(MANUAL),
]) {
  const domain = source.replace(/^https?:\/\//, '').split('/')[0]
  const file = join(OUT, `${slugOf(name)}.png`)
  if (existsSync(file) && !FORCE) {
    skipped += 1
    continue
  }
  try {
    // Google's favicon service is the one source still answering for most of these. It
    // returns whatever size the site published, so everything is measured afterwards.
    const res = await fetch(source)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length < 400) throw new Error('placeholder-sized response')
    writeFileSync(file, bytes)
    execFileSync('sips', ['-s', 'format', 'png', file, '--out', file], { stdio: 'ignore' })

    const native = widthOf(file)
    if (native < MIN_NATIVE) {
      // Deliberately not kept. The illustration is the better picture.
      execFileSync('rm', ['-f', file])
      failed.push(`${name} (${domain}): only ${native}px, below the ${MIN_NATIVE}px floor`)
      continue
    }
    // Shrink an oversized icon; never stretch a small one, which is the whole point.
    if (native > MAX_NATIVE) {
      execFileSync('sips', ['-Z', String(MAX_NATIVE), file, '--out', file], { stdio: 'ignore' })
    }
    sizes[slugOf(name)] = Math.min(native, MAX_NATIVE)
    made += 1
    console.log(`  ${name} <- ${domain} (${Math.min(native, MAX_NATIVE)}px)`)
  } catch (err) {
    failed.push(`${name} (${domain}): ${err.message}`)
  }
}

writeFileSync(SIZES_FILE, `${JSON.stringify(sizes, null, 2)}\n`)

console.log(`\n${made} fetched, ${skipped} already present, ${failed.length} skipped`)
for (const f of failed) console.log(`  ! ${f}`)
