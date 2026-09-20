/**
 * Draw the five photographs the onboarding flow opens and closes on.
 *
 * Four are the pre-login carousel in `app/(onboarding)/welcome.tsx`, one per promise; the fifth
 * is the handover in `ready.tsx`. They are the first thing anybody sees, they are full-bleed,
 * and they carry the whole first impression on their own — there is no product on screen yet.
 *
 * **The set they replace was dim.** Every frame was graded to the same heavy amber gloom with
 * crushed shadows and desaturated mid-tones, which reads as stock rather than as campaign: murky
 * is what a generative model produces when nobody tells it not to. The rules below are mostly
 * that defect, written out. A bank's onboarding should look like a good day, not like dusk.
 *
 * Not part of any build. It costs money and it overwrites artwork, so it runs when somebody asks.
 *
 *   node tools/gen-onboarding-art.mjs              # only what is missing
 *   node tools/gen-onboarding-art.mjs --force       # redraw everything
 *   node tools/gen-onboarding-art.mjs ready         # redraw one
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { image, key, runAll } from './lib/openai.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'apps/mobile/assets/onboarding')

/*
 * What every frame has in common.
 *
 * Two clauses are doing most of the work and both are corrections:
 *
 * "Bright, open, high-key" against the old gloom. The copy sits in a gradient down to the brand
 * ink, so the *photograph* does not also need to be dark to make white type legible — the
 * gradient already does that, and a dark photograph under a dark gradient is just mud.
 *
 * "Face in the upper third" because `welcome.tsx` lays a gradient over the bottom 58% of the
 * frame and a headline inside it. A portrait centred in its own frame is a portrait with a
 * headline across the mouth, which is exactly what the old set did.
 */
const STYLE = [
  'A premium editorial lifestyle photograph, the kind a national brand campaign would run.',
  'Bright, open, high-key natural daylight. Clean lifted shadows and luminous highlights.',
  'Rich saturated colour with a crisp modern grade: deep greens, warm terracotta, marigold, clean whites.',
  'Never murky, never muddy, no heavy amber wash over everything, no crushed blacks, no dim interior gloom.',
  'Genuine unforced joy — real smiles that reach the eyes, caught mid-moment rather than posed at the lens.',
  'Shot on a fast prime lens: the people tack sharp, the background falling away into a soft creamy blur.',
  'Contemporary urban India, modern and aspirational, warm rather than showy.',
  'Natural skin texture and true skin tones. No plastic retouching, no waxy skin, no uncanny faces, no extra fingers.',
  'Vertical portrait frame.',
  /* The bottom of every frame is spent on the gradient and the headline. Anything composed there
     is paid for and never seen. */
  'Faces sit in the upper third of the frame, and the lower half is quiet, simple and free of anything important.',
  'No text, no lettering, no signage, no logos, no watermarks, no visible phone or computer screens.',
  'One consistent campaign: the same grade, the same light and the same optimism across every frame in the set.',
].join(' ')

/*
 * One frame per promise, in the order `welcome.tsx` makes them.
 *
 * The carousel's fourth promise is the refusal — "and when to do nothing" — and it is the one
 * frame that must not show somebody buying, earning or celebrating. It is drawn as unhurried
 * company, because restraint photographs as calm and nothing else.
 *
 * **`ready` is the one frame that may not show a single person, and the headline is why.** It
 * reads `{firstName}, ready?` off the actual customer record, so whoever is in that frame is
 * being offered as the customer — and a lone woman there is wrong for every male customer, with
 * no second variant behind it to fix it. It is drawn as a family across three generations, both
 * genders and sixty years of age between them: nobody in it can be read as *you*, and the frame
 * still has faces in it, which is what makes the hand-off warm. The carousel does not have this
 * problem — its copy is about the product and never says "you" — so those four keep their
 * single subjects.
 *
 * It also used to have its subject facing *away* from the camera under a headline asking whether
 * she was ready. Whoever is in this frame looks back.
 */
const SHOTS = [
  [
    'welcome-1',
    'A young Indian woman at a sunlit table by a window, looking up from a sheet of paper in her hand with a small delighted smile, as though something just added up better than she expected. Bright airy room, fresh greenery behind her.',
  ],
  [
    'welcome-2',
    'A young Indian man walking through a bright open-air market in the late morning, cloth bags of fruit and vegetables in each hand, laughing at something off to one side. Vivid produce, marigold garlands and colourful awnings blurred behind him.',
  ],
  [
    'welcome-3',
    'An Indian woman in her thirties standing on a bright balcony in the morning, a cup of tea in both hands, mid-laugh with her eyes lit. Clear open sky and green plants behind her, sunlight on her face.',
  ],
  [
    'welcome-4',
    'An older Indian father and his grown daughter sitting together on a sofa in a bright modern living room, both laughing easily, unhurried, sunlight pouring in through a large window behind them onto plants and warm textiles.',
  ],
  [
    'ready',
    'An Indian family of three generations together on a bright balcony in the morning — an older man, a woman in her thirties and a teenage boy — all laughing easily, leaning in towards each other. Plants, warm textiles, clear sky and soft city greenery behind them.',
  ],
]

/*
 * 800x1200 is what the screens draw and 1024x1536 is the nearest size the API offers, so the
 * frame is generated large and resampled down — a downscale sharpens a photograph and an upscale
 * would soften it. JPEG at 86 because these are photographs: PNG would be five times the bundle
 * for a difference nobody can see through a gradient.
 */
const WIDTH = 800
const HEIGHT = 1200
const QUALITY = 86

async function shoot(slug, subject, apiKey) {
  const file = join(OUT, `${slug}.jpg`)
  try {
    const raw = await image(`${subject} ${STYLE}`, { size: '1024x1536', background: 'opaque' }, apiKey)
    const out = await sharp(raw)
      .resize(WIDTH, HEIGHT, { fit: 'cover' })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer()
    writeFileSync(file, out)
    process.stdout.write(`  ${slug.padEnd(12)} ok  ${(out.length / 1024).toFixed(0)}KB at ${WIDTH}x${HEIGHT}\n`)
    return true
  } catch (err) {
    process.stdout.write(`  ${slug.padEnd(12)} FAILED  ${err instanceof Error ? err.message : String(err)}\n`)
    return false
  }
}

const args = process.argv.slice(2)
const force = args.includes('--force')
const only = args.filter((a) => !a.startsWith('--'))
const wanted = only.length > 0 ? SHOTS.filter((s) => only.includes(s[0])) : SHOTS
if (wanted.length === 0) throw new Error(`nothing matched: ${only.join(', ')}`)

mkdirSync(OUT, { recursive: true })
const jobs = []
let skipped = 0

for (const [slug, subject] of wanted) {
  if (existsSync(join(OUT, `${slug}.jpg`)) && !force && only.length === 0) {
    skipped += 1
    continue
  }
  jobs.push({ slug, subject })
}

const apiKey = jobs.length > 0 ? await key() : null
const made = jobs.length > 0 ? await runAll(jobs, (j) => shoot(j.slug, j.subject, apiKey)) : 0

process.stdout.write(`\n${made} shot, ${skipped} already present (pass --force to redraw)\n`)
