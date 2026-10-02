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

/*
 * `shortenFigures` reads the engine's English. These are plan-stage lines exactly as the API sends
 * them on a memory boot; a change to the engine's figure format that this no longer shortens fails
 * here, not on the Goals tab.
 */
test('the plan-stage lines the API sends today are shortened, word for word otherwise', () => {
  assert.equal(
    shortenFigures(
      '3 people depend on their income and ₹2,28,27,160 of cover is missing. The cheapest step here, and it gets dearer every year they wait.',
    ),
    '3 people depend on their income and ₹2.28Cr of cover is missing. The cheapest step here, and it gets dearer every year they wait.',
  )
  assert.equal(
    shortenFigures('Enough to stop working at 60: ₹1,00,00,000 by September 2031'),
    'Enough to stop working at 60: ₹1Cr by September 2031',
  )
  assert.equal(
    shortenFigures(
      'This needs ₹1,87,822 a month and they have ₹39,917 spare. Push the date back, lower the target, or find the difference in their spending.',
    ),
    'This needs ₹1.88L a month and they have ₹39,917 spare. Push the date back, lower the target, or find the difference in their spending.',
  )
})

test('a figure the pattern does not recognise is left exactly as written', () => {
  // Paise: shortening only the rupees would print "₹1.86L.50".
  assert.equal(shortenFigures('A refund of ₹1,86,240.50 is due'), 'A refund of ₹1,86,240.50 is due')
  // Western grouping and an unspaced figure are not the engine's format: left alone, not misread.
  assert.equal(shortenFigures('₹186,240 outstanding'), '₹186,240 outstanding')
  assert.equal(shortenFigures('₹186240 outstanding'), '₹186240 outstanding')
  // Crores of crores still read: ₹1,23,45,67,890 is the engine's grouping too.
  assert.equal(shortenFigures('₹1,23,45,67,890 in all'), '₹123.5Cr in all')
})
