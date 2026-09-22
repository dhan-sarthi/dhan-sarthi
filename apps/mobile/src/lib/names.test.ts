/**
 * What a target or a merchant is called mid-sentence, and what a challenge is called.
 *
 * The failure this guards is silent: a kind of place dropped into a sentence as core writes it
 * reads "Spend less on Coffee shop", and a brand lower-cased reads "spend less on swiggy". Both
 * look like typos, not bugs, so nothing else catches them.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { asModifier, challengeTitle, inSentence } from './names.ts'

describe('inSentence', () => {
  it('reads a kind of place in lower case, plural where people say it that way', () => {
    assert.equal(inSentence('Coffee shop'), 'coffee shops')
    assert.equal(inSentence('Fast food'), 'fast food')
    assert.equal(inSentence('Restaurant'), 'restaurants')
    assert.equal(inSentence('Supermarket'), 'supermarkets')
    assert.equal(inSentence('Local kirana'), 'local kiranas')
    assert.equal(inSentence('Streaming'), 'streaming')
  })

  it('gives an adjective the noun it needs', () => {
    assert.equal(inSentence('Rail & bus'), 'rail & bus tickets')
    assert.equal(inSentence('Mobile'), 'mobile bills')
  })

  it('keeps a brand exactly as the brand writes it', () => {
    for (const brand of [
      'Swiggy',
      'Swiggy Instamart',
      'Reliance Retail',
      'Starbucks',
      'DMart',
      'BigBasket',
      'Cult.fit',
      'NPS',
    ]) {
      assert.equal(inSentence(brand), brand)
    }
  })

  it('treats a name it has never seen as a brand', () => {
    assert.equal(inSentence('Pizza Hut'), 'Pizza Hut')
  })

  it('reads a category in lower case and keeps its initials', () => {
    assert.equal(inSentence('Food & dining'), 'food & dining')
    assert.equal(inSentence('Groceries'), 'groceries')
    assert.equal(inSentence('Entertainment'), 'entertainment')
    assert.equal(inSentence('Loan EMI'), 'loan EMIs')
    assert.equal(inSentence('Cash'), 'cash withdrawals')
  })

  it('reads as the sentences that use it', () => {
    assert.equal(`Spend less on ${inSentence('Coffee shop')}`, 'Spend less on coffee shops')
    assert.equal(
      `Spend less on ${inSentence('Fast food')} for 14 days`,
      'Spend less on fast food for 14 days',
    )
    assert.equal(`Spend less on ${inSentence('Swiggy')}`, 'Spend less on Swiggy')
  })

  it('adds a plural only where it is natural', () => {
    // "Spend less on fuels" and "on travels" are not how anyone says it.
    for (const kind of ['Fuel', 'Gas', 'Travel', 'Cinema', 'Retail', 'Fast food']) {
      assert.equal(inSentence(kind), kind.toLowerCase())
    }
  })
})

describe('asModifier', () => {
  it('lower-cases a kind of place and keeps it singular', () => {
    assert.equal(asModifier('Coffee shop'), 'coffee shop')
    assert.equal(asModifier('Fast food'), 'fast food')
  })

  it('leaves a brand alone', () => {
    assert.equal(asModifier('Swiggy'), 'Swiggy')
    assert.equal(asModifier('Reliance Retail'), 'Reliance Retail')
  })
})

describe('challengeTitle', () => {
  it('leads with the name as written, then sentence case', () => {
    assert.equal(challengeTitle('Fast food'), 'Fast food challenge')
    assert.equal(challengeTitle('Coffee shop'), 'Coffee shop challenge')
    assert.equal(challengeTitle('Swiggy'), 'Swiggy challenge')
    assert.equal(challengeTitle('Food & dining'), 'Food & dining challenge')
  })
})
