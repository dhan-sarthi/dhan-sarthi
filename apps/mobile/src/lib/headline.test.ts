import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { headline } from './headline.ts'

const NAMES = new Map([['LIC_TERM_201', 'LIC Term Assurance, ₹1 crore cover']])

describe('headline', () => {
  it('prefers the action to the product when a record carries both', () => {
    assert.equal(headline('buy_term_cover', 'LIC_TERM_201', new Map()), 'Buy term cover')
  })

  it('unscores the kind and capitalises only the first letter', () => {
    assert.equal(headline('start_sip', null, new Map()), 'Start sip')
  })

  it('names the product where there was no action', () => {
    assert.equal(
      headline(null, 'LIC_TERM_201', NAMES),
      'Asked about LIC Term Assurance, ₹1 crore cover',
    )
  })

  // The branch the Record screen's own header calls unacceptable. Pinned rather than wished
  // away: a product off the current shelf still has a record, and this is what it prints.
  it('falls back to the raw id for a product no longer on the shelf', () => {
    assert.equal(headline(null, 'LIC_ULIP_401', NAMES), 'Asked about LIC_ULIP_401')
  })

  it('says something rather than nothing when a record carries neither', () => {
    assert.equal(headline(null, null, NAMES), 'Advice given')
  })

  // The one place the truthiness test rather than a null check is load-bearing.
  it('treats an empty action kind as no action at all', () => {
    assert.equal(
      headline('', 'LIC_TERM_201', NAMES),
      'Asked about LIC Term Assurance, ₹1 crore cover',
    )
  })
})
