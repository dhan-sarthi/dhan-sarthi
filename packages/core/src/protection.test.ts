/**
 * The protection rule, against literals.
 *
 * Unit level on purpose: these state what the rule *is*, with no fixture in sight, so a
 * reader can check the carve-out without knowing what is on the shelf. The companion
 * assertions against the real 14-product shelf belong in `packages/fixtures`, which is the
 * one place allowed to see both this package and the generator.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  NOMINAL_PREMIUM_MAX,
  isProtectionProduct,
  protectionShelf,
  shelfGroup,
} from './protection.ts'

describe('isProtectionProduct', () => {
  it('admits the three pure-cover categories', () => {
    assert.equal(isProtectionProduct({ category: 'Term Insurance' }), true)
    assert.equal(isProtectionProduct({ category: 'Health Insurance' }), true)
    assert.equal(isProtectionProduct({ category: 'Government Insurance' }), true)
  })

  it('refuses a cover product that bundles investment — the carve-out is the point', () => {
    assert.equal(
      isProtectionProduct({ category: 'Term Insurance', bundlesProtectionAndInvestment: true }),
      false,
    )
  })

  it('refuses everything that is not pure cover', () => {
    for (const category of ['ULIP', 'Endowment', 'Index Fund', 'PPF', 'Equity', 'NPS']) {
      assert.equal(isProtectionProduct({ category }), false, category)
    }
  })

  it('is not fooled by the product name — this is the defect it replaces', () => {
    // "LIC Jeevan Anand Endowment" matched a name regex on the word *Jeevan* and rendered
    // under "Proper cover" on the Protect tab. Its category is what decides it.
    assert.equal(
      isProtectionProduct({ category: 'Endowment', bundlesProtectionAndInvestment: true }),
      false,
    )
  })
})

describe('shelfGroup', () => {
  it('lets the manufacturer win, matching the Invest list it replaces', () => {
    assert.equal(shelfGroup({ manufacturer: 'IDBI Bank', category: 'Term Insurance' }), 'idbi_own')
  })

  it('files pure cover as protection and everything else as market-linked', () => {
    assert.equal(shelfGroup({ manufacturer: 'LIC', category: 'Term Insurance' }), 'protection')
    assert.equal(shelfGroup({ manufacturer: 'LIC', category: 'ULIP' }), 'market_linked')
    assert.equal(
      shelfGroup({
        manufacturer: 'LIC',
        category: 'Endowment',
        bundlesProtectionAndInvestment: true,
      }),
      'market_linked',
    )
  })
})

describe('protectionShelf', () => {
  const p = (productId: string, category: string, minInvestment: number) => ({
    productId,
    category,
    minInvestment,
  })

  it('splits on the nominal premium inclusively', () => {
    const { nominal, full } = protectionShelf([
      p('AT_THE_LINE', 'Government Insurance', NOMINAL_PREMIUM_MAX),
      p('OVER_THE_LINE', 'Term Insurance', NOMINAL_PREMIUM_MAX + 1),
    ])
    assert.deepEqual(
      nominal.map((x) => x.productId),
      ['AT_THE_LINE'],
    )
    assert.deepEqual(
      full.map((x) => x.productId),
      ['OVER_THE_LINE'],
    )
  })

  it('drops a bundled product from both halves', () => {
    const shelf = [
      { productId: 'ENDOW', category: 'Endowment', minInvestment: 4_200 },
      { productId: 'TERM', category: 'Term Insurance', minInvestment: 1_100 },
    ]
    const { nominal, full } = protectionShelf(shelf)
    assert.deepEqual(
      [...nominal, ...full].map((x) => x.productId),
      ['TERM'],
    )
  })
})
