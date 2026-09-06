import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildRoadmap,
  derive,
  evaluate,
  findInsights,
  reachableOwnFunds,
  suggestGoal,
} from '@dhan/core'
import type { Account } from '@dhan/core'
import { generateCustomerFile, PERSONAS, PRODUCT_SHELF, seedBundles } from '@dhan/fixtures'
import {
  buildCatalogueSeedPayload,
  projectCatalogueSeedPayload,
  replayCatalogueFile,
} from '../../src/adapters/idbi-sandbox/catalogue-seed.ts'
import { CatalogueReplayBankData } from '../../src/adapters/idbi-sandbox/catalogue-replay.ts'
import { InMemoryBankData } from '../../src/adapters/memory/bank-data.memory.ts'

const AS_OF = '2026-09-01'

describe('catalogue replay and fixture provenance', () => {
  it('replays every bank-shaped seed through the shared projector without losing fixture facts', () => {
    for (const bundle of seedBundles()) {
      const payload = buildCatalogueSeedPayload(bundle)
      assert.equal('transactions' in payload.supplement, false)
      assert.ok(payload.captures.filter((c) => c.endpoint === '393').length > 1)
      assert.deepEqual(projectCatalogueSeedPayload(JSON.parse(JSON.stringify(payload))), bundle)
    }
  })

  it('preserves snapshots, insights, roadmaps and refusals at six clock positions for all personas', () => {
    for (const spec of PERSONAS) {
      for (const asOf of [
        '2026-09-01',
        '2026-09-02',
        '2026-09-08',
        '2026-10-01',
        '2027-01-01',
        '2027-09-01',
      ]) {
        const file = generateCustomerFile(spec, { asOf })
        const expected = derive(file, asOf)
        const actual = derive(replayCatalogueFile(file, asOf), asOf)
        assert.deepEqual(actual, expected, `${spec.slug} ${asOf}`)
        assert.deepEqual(findInsights(actual), findInsights(expected))
        assert.deepEqual(
          buildRoadmap(actual, suggestGoal(actual, asOf, null), PRODUCT_SHELF, asOf),
          buildRoadmap(expected, suggestGoal(expected, asOf, null), PRODUCT_SHELF, asOf),
        )
        for (const product of PRODUCT_SHELF) {
          assert.deepEqual(
            evaluate({ product, snapshot: actual, amount: 5_000, alternatives: PRODUCT_SHELF }),
            evaluate({ product, snapshot: expected, amount: 5_000, alternatives: PRODUCT_SHELF }),
          )
        }
      }
    }
  })

  it('never labels a synthetic replay as bank-origin data', async () => {
    const records = new InMemoryBankData(seedBundles(), {
      generatorVersion: 'test',
      ranAt: `${AS_OF}T00:00:00Z`,
    })
    const bank = new CatalogueReplayBankData(records)
    const cif = PERSONAS[0]!.customer.cif
    const loaded = await bank.loadCustomerFile(cif, AS_OF, 24)
    assert.ok(Object.values(loaded.provenance).every((source) => source === 'fixture'))
    assert.equal(bank.describe().simulatedClock, false)
    assert.deepEqual(loaded.file, (await records.loadCustomerFile(cif, AS_OF, 24)).file)
  })

  it('refuses incomplete captures before any seed rows can be projected', () => {
    const payload = buildCatalogueSeedPayload(seedBundles()[0]!)
    const lastPage = payload.captures.findLastIndex((c) => c.endpoint === '393')
    payload.captures.splice(lastPage, 1)
    assert.throws(() => projectCatalogueSeedPayload(payload), /incomplete/)
  })
})

describe('reachable owned funds', () => {
  const account: Account = {
    accountNumberMasked: 'XXXX1234',
    accountType: 'Savings',
    currentBalance: 100_000,
    accountOpeningDate: '2020-01-01',
    liquidity: {
      observedOn: AS_OF,
      availableBalance: 70_000,
      lienAmount: 30_000,
      floatingBalance: 0,
      fFDBalance: 200_000,
      userDefinedBalance: 0,
    },
  }

  it('does not subtract an already-deducted lien twice or add sweep/borrowed funds', () => {
    assert.equal(reachableOwnFunds(account, AS_OF), 70_000)
    assert.equal(
      reachableOwnFunds(
        { ...account, liquidity: { ...account.liquidity!, availableBalance: 150_000 } },
        AS_OF,
      ),
      70_000,
    )
  })
  it('does not treat missing or stale liquidity observations as available money', () => {
    assert.equal(reachableOwnFunds(account, '2026-09-02'), 0)
    assert.equal(
      reachableOwnFunds(
        { ...account, liquidity: { ...account.liquidity!, lienAmount: null } },
        AS_OF,
      ),
      0,
    )
  })
  it('keeps the buffer, its explanation and the idle action bounded by reachable funds', () => {
    const file = generateCustomerFile(PERSONAS[0]!)
    file.accounts = [account]
    const snap = derive(file, AS_OF)
    assert.equal(snap.balances.savings, 100_000)
    assert.equal(snap.balances.availableSavings, 70_000)
    assert.equal(snap.balances.lockedSavings, 30_000)
    assert.equal(snap.balances.availableTotal, 70_000)
    assert.ok(snap.balances.idleFloor <= 70_000)
  })
  it('counts an explicitly linked deposit only once and preserves an independent holding', () => {
    const file = generateCustomerFile(PERSONAS[0]!)
    const snap = derive(file, AS_OF)
    const fd = file.holdings.find((h) => h.holdingType === 'FD')!
    assert.equal(snap.holdings.total - snap.holdings.outsideAccounts, fd.currentValue)
    fd.accountNumberMasked = 'XXXXUNLINKED'
    const independent = derive(file, AS_OF)
    assert.equal(independent.holdings.outsideAccounts, independent.holdings.total)
  })
})
