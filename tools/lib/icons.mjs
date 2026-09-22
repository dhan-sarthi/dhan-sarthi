/**
 * The icon house style, and the functions that apply it.
 *
 * Extracted so the three sets — spend categories, merchant kinds, and the product and goal icons
 * in `packages/assets/icons/product` — cannot drift. They are drawn months apart and land in the
 * same app on the same screen, so they have to look like one family, and the only way to
 * guarantee that is one copy of the rules. (The product set drew into `apps/web/public/icons`
 * until that app was deleted on 20 September 2026; it now waits in `packages/assets` for the
 * `apps/mobile` screens that will read it.)
 *
 * **The set used to be green.** Every icon was built from the brand ladder with a single warm
 * accent, which held the family together by making every icon nearly the same icon: a grid of
 * teal objects where the eye has to read the label to tell a pizza from a router. The family is
 * now held together by *material and light* instead of by hue — one render style, one lighting
 * rig, one set of proportions — which leaves colour free to do the job colour is for: telling
 * the pizza from the router at 32px, and looking like something worth opening.
 *
 * The API, the key and the rate limit live in `./openai.mjs`, shared with the onboarding art,
 * which wants the same plumbing and none of these rules.
 */
import process from 'node:process'
import { writeFileSync } from 'node:fs'
import sharp from 'sharp'
import { image, key, runAll } from './openai.mjs'

/*
 * The style, as one paragraph.
 *
 * Every clause is load-bearing and most are a defect seen in a first pass. The lighting sentence
 * is what makes fifty-three separate API calls look like one commissioned set: a model given
 * "colourful 3D icon" and nothing else lights each one from wherever it feels like, and a grid
 * lit from four directions reads as clipart however pretty each tile is.
 *
 * "Shadows are a deeper version of the object's own colour" is the single clause that separates
 * premium from cheap. Desaturating into grey is what a renderer does by default and what every
 * free icon pack looks like; keeping the shade saturated is what the good sets do.
 *
 * "No text" stays from the green era, for the same reason: a certificate or a calendar invites
 * lettering, and lettering at 32px is a smear.
 */
const STYLE = [
  'A single icon object, centred, drawn as one compact piece.',
  'Style: premium 3D illustration. Chunky rounded forms with thick soft bevels, moulded in a smooth matte material, satin finish with a gentle sheen rather than mirror gloss.',
  'Lighting: one soft key light from the upper left, a cooler bounce light from the lower right, gentle ambient occlusion where forms meet, and a faint warm rim light along the top edge.',
  'Colour: PALETTE. Rich, saturated and vivid, with smooth tonal shading across every face.',
  "Shadows are deeper, more saturated versions of the object's own colour — never grey, never black, never muddy.",
  'One small bright specular highlight for lift.',
  'Fully transparent background. No tile, no circle, no card, no ground shadow, no cast shadow, no glow behind the object.',
  'No text, no letters, no numbers, no logos, no brand marks.',
  /* The first green pass put a dollar sign on the fees coin. This is an Indian bank, so a
     currency glyph is either wrong or a rupee rendered at two pixels; a plain coin says "money"
     without either problem. */
  'No currency symbols of any kind: no dollar sign, no rupee sign, no euro, no pound. Coins are plain.',
  'No outline stroke, no flat vector look, no photorealism, no background scenery or props.',
  'Upright and square to the viewer, not rotated or tilted at a jaunty angle.',
  'Centred with even margins, filling most of the frame, with a bold simple silhouette that stays legible when shrunk to 32 pixels.',
  'It belongs to one icon family: the same material, the same light direction and the same chunky proportions as every other icon in the set.',
].join(' ')

/** One icon, at the house style, as a PNG buffer. */
const draw = (subject, palette, apiKey) =>
  image(`${subject}. ${STYLE.replace('PALETTE', palette)}`, { size: '1024x1024' }, apiKey)

/**
 * What the model returns and what is kept.
 *
 * 224px is 4x the 56px the largest placement draws, and 256 colours is where quantisation stops
 * being visible: these are shaded 3D forms, not the flat art the green set was, so the old
 * 64-colour palette puts concentric bands across every curved surface — the water drop shows it
 * worst. 256 costs 40KB across the whole set over 64 and looks identical to full colour,
 * which is the trade to make. A megabyte of PNG per icon is not.
 */
const SIZE = 224
const COLOURS = 256

/**
 * One icon: draw it, size it, quantise it, write it, say what happened.
 *
 * A failure prints and returns false rather than throwing, because a run of fifty that dies on
 * the eleventh has spent money on ten icons and left the set half-redrawn — worse than a run
 * that finishes and names the three that need another go.
 *
 * The whole line is built and written at once, not printed as a label and completed later,
 * because `drawAll` has several of these in flight and half-written lines would interleave.
 */
async function render(label, file, subject, palette, apiKey) {
  try {
    const png = await draw(subject, palette, apiKey)
    const out = await sharp(png)
      .resize(SIZE, SIZE, { fit: 'inside' })
      .png({ palette: true, colours: COLOURS, effort: 10 })
      .toBuffer()
    writeFileSync(file, out)
    const saved = `${(png.length / 1024).toFixed(0)}KB -> ${(out.length / 1024).toFixed(0)}KB`
    process.stdout.write(`  ${label.padEnd(18)} ok  ${saved} at ${SIZE}px\n`)
    return true
  } catch (err) {
    process.stdout.write(
      `  ${label.padEnd(18)} FAILED  ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return false
  }
}

/** Draw a list of `{ label, file, subject, palette }`, a few at a time. Returns how many landed. */
const drawAll = (jobs, apiKey) =>
  runAll(jobs, (j) => render(j.label, j.file, j.subject, j.palette, apiKey))

export { STYLE, key, draw, render, drawAll }
