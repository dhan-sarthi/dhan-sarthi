/**
 * `src/ports/index.ts` is a hand-written list, and a hand-written list rots.
 *
 * It rotted once already: the header said "ten ports" while the file exported fifteen, and
 * avatar-tool-webhook.port.ts and language-model.port.ts were not exported at all — while
 * http/routes/services.ts was importing `AvatarToolWebhook` from the barrel, an import that
 * resolved to nothing and would have broken the typecheck for whoever added the next port.
 * Nothing in the suite noticed, because nothing looked.
 *
 * So this looks. Every `*.port.ts` in the directory must be exported by the barrel, the barrel
 * must export nothing else, and the count written in its own doc comment must be that number
 * spelled out. The last of those is the cheap one to forget and the one a reader trusts most.
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const PORTS_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../src/ports')

/** Enough of them to cover any plausible number of ports; a gap here fails loudly below. */
const NUMBERS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
  'twenty-one',
  'twenty-two',
  'twenty-three',
  'twenty-four',
  'twenty-five',
]

describe('the ports barrel', () => {
  const files = readdirSync(PORTS_DIR)
    .filter((name) => name.endsWith('.port.ts'))
    .sort()
  const barrel = readFileSync(join(PORTS_DIR, 'index.ts'), 'utf8')
  const exported = [...barrel.matchAll(/^export type \* from '\.\/(.+?)'$/gm)]
    .map((m) => m[1] ?? '')
    .sort()

  it('exports every port file, and nothing that is not one', () => {
    assert.deepEqual(exported, files)
  })

  it('exports each one exactly once', () => {
    assert.equal(new Set(exported).size, exported.length)
  })

  it('states the real count in its own doc comment', () => {
    const word = NUMBERS[files.length]
    assert.ok(word, `add ${files.length} to NUMBERS in this test`)
    assert.match(
      barrel,
      new RegExp(`^ \\* The ${word} ports\\.`, 'm'),
      `the barrel should open "The ${word} ports." for the ${files.length} files in src/ports`,
    )
  })
})
