/**
 * The three rows under a projection, and the assumption they rest on.
 *
 * The second describe block is the important one: it pins what `Scenario.contributed`
 * means, which is the thing no test anywhere held and which the Plan tab's arithmetic had
 * already got wrong once.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { contributionSplit } from './contribution.ts'
import { project } from './projection.ts'

describe('contributionSplit', () => {
  it('reads the existing corpus out of `contributed` rather than off the top of it', () => {
    const split = contributionSplit(
      { existingCorpus: 400_000 },
      { corpus: 3_400_000, contributed: 2_200_000 },
    )
    assert.deepEqual(split, { already: 400_000, paidIn: 1_800_000, growth: 1_200_000 })
  })

  it('sums to the corpus the card prints above it', () => {
    const projection = { existingCorpus: 400_000 }
    const scenario = { corpus: 3_400_000, contributed: 2_200_000 }
    const { already, paidIn, growth } = contributionSplit(projection, scenario)
    assert.equal(already + paidIn + growth, scenario.corpus)
  })

  it('still sums when there is nothing already invested', () => {
    const { already, paidIn, growth } = contributionSplit(
      { existingCorpus: 0 },
      { corpus: 1_000_000, contributed: 600_000 },
    )
    assert.deepEqual([already, paidIn, growth], [0, 600_000, 400_000])
  })

  it('does not floor a negative growth away — an assumed rate below zero says so', () => {
    const { growth, already, paidIn } = contributionSplit(
      { existingCorpus: 100_000 },
      { corpus: 500_000, contributed: 600_000 },
    )
    assert.equal(growth, -100_000)
    assert.equal(already + paidIn + growth, 500_000)
  })
})

describe('the assumption the split rests on', () => {
  it('`project()` folds the existing corpus into `contributed`', () => {
    const projection = project(15_000, 10, 400_000)
    const scenario = projection.scenarios[0]
    assert.ok(scenario)
    // 15,000 x 120 months = 18,00,000, plus the 4,00,000 already invested.
    assert.equal(scenario.contributed, 2_200_000)
  })

  it('so the split recovers exactly the contributions and nothing else', () => {
    const projection = project(15_000, 10, 400_000)
    const scenario = projection.scenarios[0]
    assert.ok(scenario)
    const { already, paidIn, growth } = contributionSplit(projection, scenario)
    assert.equal(already, 400_000)
    assert.equal(paidIn, 1_800_000)
    assert.equal(already + paidIn + growth, scenario.corpus)
    // The rate is positive, so the corpus is worth more than what went into it.
    assert.ok(growth > 0)
  })

  it('leaves nothing paid in where the whole projection is an existing corpus', () => {
    const projection = project(0, 5, 250_000)
    const scenario = projection.scenarios[1]
    assert.ok(scenario)
    const { already, paidIn, growth } = contributionSplit(projection, scenario)
    assert.equal(already, 250_000)
    assert.equal(paidIn, 0)
    assert.equal(already + paidIn + growth, scenario.corpus)
  })
})
