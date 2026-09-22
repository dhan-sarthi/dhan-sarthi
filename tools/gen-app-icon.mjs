/**
 * Draw the app's launcher icon: the brand's two letters, cream on the ink.
 *
 * There was no icon until the APK, because the web deployment never needed one, and an APK
 * without one shows Android's default on the home screen — the first thing anybody who installs
 * it sees, and it reads as unfinished. The mark is the wordmark's own weight (the README banner),
 * in the two colours every surface of the app already uses, so it adds nothing to the palette.
 *
 * Two files, because Android draws icons two ways:
 *
 *   assets/icon.png           the whole icon, ink ground included, for launchers that do not
 *                             mask (and for iOS, which rounds the corners itself)
 *   assets/adaptive-icon.png  the letters alone on transparency. Android lays them over the ink
 *                             `adaptiveIcon.backgroundColor` in app.json and crops the pair to the
 *                             launcher's own shape, circle or squircle, so the letters stay inside
 *                             the central safe zone every shape keeps.
 *
 * The letters are set in the system's Helvetica Neue by librsvg, so a run on another machine may
 * pick another face. The PNGs are what ship; run this only to redraw them.
 *
 *   node tools/gen-app-icon.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'apps/mobile/assets')
const { color } = JSON.parse(readFileSync(join(ROOT, 'packages/design/tokens.json'), 'utf8'))

const SIZE = 1024
/** The letters' height as a share of the canvas. The adaptive one sits inside the 66% safe zone. */
const LETTERS = { icon: 0.3, adaptive: 0.22 }

/** The two letters, cropped tight to their ink, at the given pixel height. */
async function letters(height) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1200">
    <text x="1200" y="800" text-anchor="middle" font-family="Helvetica Neue" font-weight="800"
      font-size="720" letter-spacing="-28" fill="${color.onInk}">DS</text>
  </svg>`
  const tight = await sharp(Buffer.from(svg)).trim().png().toBuffer()
  return sharp(tight).resize({ height }).png().toBuffer()
}

async function draw(file, background, share) {
  const mark = await letters(Math.round(SIZE * share))
  await sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background },
  })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toFile(join(OUT, file))
  process.stdout.write(`wrote apps/mobile/assets/${file}\n`)
}

await draw('icon.png', color.ink, LETTERS.icon)
await draw('adaptive-icon.png', { r: 0, g: 0, b: 0, alpha: 0 }, LETTERS.adaptive)
