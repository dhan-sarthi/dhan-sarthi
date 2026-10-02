import assert from 'node:assert/strict'
import { test } from 'node:test'
import { midSentence, rupeesTitle, shortenFigures } from './prose.ts'

test('a figure in a sentence prints as the API prints it', () => {
  assert.equal(rupeesTitle(22770000), '₹2.28Cr')
  assert.equal(rupeesTitle(186240), '₹1.86L')
  assert.equal(rupeesTitle(22501), '₹22,501')
  assert.equal(rupeesTitle(10000000), '₹1Cr')
})

test('a plan stage keeps its words and loses only the long figures', () => {
  assert.equal(
    shortenFigures(
      '2 people depend on their income and ₹2,27,70,000 of cover is missing. The cheapest step here.',
    ),
    '2 people depend on their income and ₹2.28Cr of cover is missing. The cheapest step here.',
  )
  assert.equal(
    shortenFigures('Enough to stop working at 60: ₹11,10,00,000 by September 2042'),
    'Enough to stop working at 60: ₹11.1Cr by September 2042',
  )
  assert.equal(
    shortenFigures('This needs ₹3,48,033 a month and they have ₹2,29,584 spare.'),
    'This needs ₹3.48L a month and they have ₹2.3L spare.',
  )
})

test('figures under a lakh, percentages and short forms are left alone', () => {
  const text = 'Clear ₹99,999 at 34.8%, about 11 months; ₹985 a month; ₹1.86L outstanding'
  assert.equal(shortenFigures(text), text)
  assert.equal(shortenFigures('Clear ₹1,86,240 at 34.8%'), 'Clear ₹1.86L at 34.8%')
})

test('a label read mid-sentence keeps its month capitalised', () => {
  assert.equal(midSentence('As at 1 Sep 2026'), 'as at 1 Sep 2026')
  assert.equal(
    midSentence('12 month-ends, Sep 2025 to Aug 2026'),
    '12 month-ends, Sep 2025 to Aug 2026',
  )
})
