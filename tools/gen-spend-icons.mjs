/**
 * Draw the fifteen spend-category icons.
 *
 * They answer "what sort of spending is this" for every row in the ledger, and they sit in the
 * same list as the merchant-kind set, so the house style in `tools/lib/icons.mjs` is shared
 * rather than restated. It used to be restated here, and the copies had already drifted.
 *
 * Not part of any build. It costs money and it overwrites artwork, so it runs when somebody asks.
 *
 *   node tools/gen-spend-icons.mjs            # only what is missing
 *   node tools/gen-spend-icons.mjs --force     # redraw everything
 *   node tools/gen-spend-icons.mjs Groceries   # redraw one
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { drawAll, key } from './lib/icons.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'packages/assets/icons/spend')

/*
 * Subject and palette per category.
 *
 * These fifteen are the set most likely to be seen *together* — a category breakdown draws all
 * of them in one grid — so the hues are spread deliberately across the wheel rather than taken
 * from each subject alone. Two adjacent tiles in the same red would read as one long tile.
 *
 * `Income` and `Cash` both concern notes, so they stay drawn as different objects — an envelope
 * and a banded bundle — because two similar icons in one list is worse than one vague one.
 */
const ICONS = [
  [
    'Income',
    'income',
    'an open pay envelope with a single coin emerging from it',
    'cream envelope with a mint-green lining, a bright gold coin',
  ],
  [
    'Rent & bills',
    'rent-and-bills',
    'a small house with a folded paper bill leaning against it',
    'cream house with a coral-red roof, a sky-blue paper bill, a warm amber door',
  ],
  [
    'Groceries',
    'groceries',
    'a woven shopping basket filled with vegetables and a loaf',
    'tan woven basket, tomato red, carrot orange and leafy green produce, a golden loaf',
  ],
  [
    'Food & dining',
    'food-and-dining',
    'a covered restaurant dish on a plate with a fork beside it',
    'a glossy red cloche with a gold handle, a cream plate, a silver fork',
  ],
  [
    'Transport',
    'transport',
    'a chunky city bus seen from a front three-quarter angle',
    'sunflower-yellow body, sky-blue windows, a scarlet stripe, chrome bumper',
  ],
  [
    'Shopping',
    'shopping',
    'a paper shopping bag with rope handles and a folded top',
    'magenta-pink bag, a gold rope handle, a lilac side panel',
  ],
  [
    'Entertainment',
    'entertainment',
    'a film clapperboard with a pair of tickets tucked behind it',
    'deep navy clapperboard with cream stripes, coral-orange tickets',
  ],
  [
    'Health',
    'health',
    'a first aid kit case with a cross on its lid and a clasp',
    'cherry-red case, a white cross, a steel clasp and handle',
  ],
  [
    'Education',
    'education',
    'a stack of three books with a graduation cap resting on top',
    'coral, teal and gold books, a deep navy cap with a gold tassel',
  ],
  [
    'Investment',
    'investment',
    'three ascending blocks with a small sprouting plant on the tallest',
    'teal, sky-blue and violet blocks, a fresh spring-green sprout',
  ],
  [
    'Insurance',
    'insurance',
    'a rounded shield with an umbrella motif raised on its face',
    'cobalt-blue shield with gold trim, a cream umbrella motif',
  ],
  [
    'Loan EMI',
    'loan-emi',
    'a desk calendar with one date marked and a coin resting on it',
    'cream calendar with a coral header, one sky-blue marked date, a gold coin',
  ],
  [
    'Cash',
    'cash',
    'a banded bundle of folded banknotes lying flat',
    'mint-green notes, a coral paper band, gold edges',
  ],
  [
    'Transfers',
    'transfers',
    'two rounded cards side by side with two curved arrows circling between them',
    'a violet card and a sky-blue card, two gold curved arrows',
  ],
  [
    'Fees & charges',
    'fees-and-charges',
    'a curling paper receipt with a torn lower edge and a small coin',
    'cream receipt with coral ruled lines, a gold coin',
  ],
]

const args = process.argv.slice(2)
const force = args.includes('--force')
const only = args.filter((a) => !a.startsWith('--'))
const wanted =
  only.length > 0 ? ICONS.filter((i) => only.includes(i[0]) || only.includes(i[1])) : ICONS
if (wanted.length === 0) throw new Error(`nothing matched: ${only.join(', ')}`)

mkdirSync(OUT, { recursive: true })
const jobs = []
let skipped = 0

for (const [label, slug, subject, palette] of wanted) {
  const file = join(OUT, `${slug}.png`)
  if (existsSync(file) && !force && only.length === 0) {
    skipped += 1
    continue
  }
  jobs.push({ label, file, subject, palette })
}

const made = jobs.length > 0 ? await drawAll(jobs, await key()) : 0

process.stdout.write(`\n${made} drawn, ${skipped} already present (pass --force to redraw)\n`)
