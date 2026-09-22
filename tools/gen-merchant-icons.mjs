/**
 * Draw the merchant-kind icons.
 *
 * The fifteen spend-category icons answer "what sort of spending is this". They are not enough
 * on their own: a statement where every restaurant, chai stall and pizza order shows the same
 * covered dish is a category list wearing pictures, and the eye stops reading it. These are the
 * next level down — what the merchant actually *is* — for merchants with no brand logo, which
 * in an Indian ledger is most of them.
 *
 * House style comes from `tools/lib/icons.mjs`, shared with the other two sets, because they
 * appear in the same list and must look like one family.
 *
 * Not part of any build. It costs money and it overwrites artwork, so it runs when somebody asks.
 *
 *   node tools/gen-merchant-icons.mjs            # only what is missing
 *   node tools/gen-merchant-icons.mjs --force     # redraw everything
 *   node tools/gen-merchant-icons.mjs pizza chai  # redraw some
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { drawAll, key } from './lib/icons.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'packages/assets/icons/merchant')

/*
 * Subject and palette per kind.
 *
 * The palette is the icon's own — a pizza is tomato and crust, a fuel pump is forecourt red —
 * because an object drawn in the colour it actually is gets recognised at 32px before it gets
 * read. That is the whole argument for dropping the old single-hue ladder.
 *
 * Neighbouring hues are still spread on purpose: `pizza`, `burger` and `snacks` sit near each
 * other in a food-heavy statement, so they take tomato, golden bun and paper-cone cream rather
 * than three reds. Where two kinds are close in meaning — chai and coffee, kirana and
 * supermarket — they stay drawn as plainly different objects, because two icons that need a
 * second look are worse than one.
 */
const ICONS = [
  // Food, which is where a single "covered dish" fails hardest.
  [
    'pizza',
    'a thick wedge of pizza with raised toppings and a folded crust',
    'tomato-red sauce, golden-brown crust, melted cheese in warm amber, two basil-green leaves',
  ],
  [
    'biryani',
    'a lidded handi pot with a wisp of steam escaping under the lid',
    'burnished copper and warm brass, saffron-orange trim, a pale cream wisp of steam',
  ],
  [
    'chai',
    'a small glass tumbler of chai on a saucer beside a tiny kettle',
    'caramel-amber tea, creamy off-white foam, terracotta saucer, a warm steel kettle',
  ],
  [
    'coffee',
    'a takeaway coffee cup with a domed lid and a wrap-around sleeve',
    'cream cup, deep espresso-brown lid, a burnt-orange kraft sleeve',
  ],
  [
    'sweets',
    'a small tray stacked with round Indian sweets in a pyramid',
    'saffron-orange, pistachio-green and rose-pink sweets on a silver tray with gold trim',
  ],
  [
    'thali',
    'a round metal thali tray with three small bowls set on it',
    'polished steel tray, bowls of curry-orange, spinach-green and turmeric-yellow',
  ],
  [
    'burger',
    'a stacked burger with a domed sesame bun',
    'golden sesame bun, lettuce green, tomato red, cheddar orange',
  ],
  [
    'snacks',
    'a paper cone of hot street snacks with a small skewer',
    'cream and red striped paper cone, golden fried snacks, a scatter of coriander green',
  ],

  // Groceries.
  [
    'kirana',
    'a small shopfront with a scalloped awning over a counter of stacked jars',
    'mustard-yellow and red striped awning, warm teal shopfront, jars of amber and green',
  ],
  [
    'supermarket',
    'a four-wheeled shopping trolley seen from a front three-quarter angle',
    'bright cherry-red trolley, cool chrome frame and wheels, a cobalt-blue basket liner',
  ],

  // Getting about.
  [
    'metro',
    'the front car of a metro train emerging from a rounded tunnel arch',
    'cobalt-blue train with a white flank stripe, warm amber windows, a soft slate tunnel',
  ],
  [
    'fuel',
    'a fuel pump with its nozzle hooked on the side',
    'crimson-red pump body, chrome nozzle and hose, a bright cyan display panel',
  ],
  [
    'bike-taxi',
    'a scooter seen from a front three-quarter angle',
    'sunflower-yellow bodywork, charcoal-blue seat, chrome mirrors and trim',
  ],
  [
    'train',
    'a railway locomotive seen from a front three-quarter angle',
    'deep indigo-blue body, a scarlet nose panel, gold lamp, silver buffers',
  ],
  [
    'flight',
    'an aeroplane banking, seen from above',
    'white and sky-blue fuselage, a coral-orange tail fin and wingtips',
  ],

  // The bills, which are a third of an Indian statement and all looked identical.
  [
    'electricity',
    'a rounded light bulb with a bolt motif inside its glass',
    'warm golden glass, a bright amber filament bolt, a brushed silver base',
  ],
  [
    'gas',
    'a domestic gas cylinder with a regulator fitted on top',
    'poppy-red cylinder, pale grey collar, a steel regulator',
  ],
  [
    'broadband',
    'a wifi router with two aerials and an arc of signal rising from it',
    'deep navy-graphite router, cyan aerial tips, a mint-green signal arc',
  ],
  [
    'mobile',
    'a smartphone standing upright with a small signal arc beside it',
    'indigo-violet body, a vivid aqua screen, a coral signal arc',
  ],
  [
    'water',
    'a tap with a single round drop falling below it',
    'chrome and pale steel tap, a vivid cyan-blue drop',
  ],

  // Health.
  [
    'pharmacy',
    'a medicine bottle with a strip of tablets leaning against it',
    'amber-orange bottle, white cap, a mint-green tablet strip, a small red cross',
  ],
  [
    'lab-test',
    'a single test tube standing in a small rack with a drop above it',
    'clear glass tube with a magenta sample, teal rack, a cyan drop',
  ],
  [
    'clinic',
    'a stethoscope coiled into a loose circle',
    'royal-blue tubing, a chrome chest piece, coral ear tips',
  ],
  ['gym', 'a dumbbell lying flat', 'charcoal-navy plates, crimson grip, steel collars'],

  // Entertainment.
  [
    'streaming',
    'a television screen on a stand with a play triangle on it',
    'slate-navy bezel, a bright aqua screen, a coral play triangle, warm wood stand',
  ],
  [
    'music',
    'a pair of over-ear headphones',
    'violet shells, peach ear cushions, a silver headband',
  ],
  [
    'gaming',
    'a game controller seen from above',
    'cobalt-blue shell, lime, magenta and amber buttons, light grey sticks',
  ],
  [
    'cinema',
    'a tub of popcorn with kernels spilling over its rim',
    'red and white striped tub, golden buttered popcorn',
  ],

  // Shopping, where "a paper bag" says nothing about what was bought.
  [
    'clothing',
    'a folded t-shirt hanging on a wooden hanger',
    'turquoise shirt, a warm honey-wood hanger',
  ],
  [
    'electronics',
    'a laptop open at an angle',
    'silver-grey shell, a screen glowing blue into magenta',
  ],
  [
    'jewellery',
    'a ring standing upright with a single faceted stone',
    'polished gold band, a brilliant cyan-white gemstone',
  ],
  [
    'books',
    'an open book lying flat with its pages fanned',
    'coral-red cover, cream pages with gilt edges, a teal ribbon marker',
  ],
  ['eyewear', 'a pair of spectacles, folded', 'tortoiseshell amber frames, pale sky-blue lenses'],
  [
    'beauty',
    'a cosmetics bottle with a pump top beside a small round pot',
    'blush-pink bottle, a gold pump, a lilac pot',
  ],
  [
    'software',
    'a cursor arrow resting over a rounded app tile',
    'periwinkle-blue tile, a mint-green cursor, a violet underside',
  ],

  // People and school.
  [
    'school',
    'a school satchel with a buckled flap',
    'cherry-red satchel, navy straps, gold buckles',
  ],
  [
    'person',
    'a single rounded person figure from the shoulders up, no facial features',
    'warm sand head, a teal shirt, indigo shoulders',
  ],
  [
    'interest',
    'a plain coin with a small arrow curving upward beside it',
    'bright gold coin with a deeper amber rim, a fresh mint-green arrow',
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
