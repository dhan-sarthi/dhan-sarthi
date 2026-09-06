import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { seedBundles } from '@dhan/fixtures'
import type { SeedBundle } from '@dhan/fixtures'
import type { ProvenanceMap } from '@dhan/contracts'
import {
  buildCatalogueSeedPayload,
  projectCatalogueSeedPayload,
} from '../../src/adapters/idbi-sandbox/catalogue-seed.ts'
import type { CatalogueSeedPayload } from '../../src/adapters/idbi-sandbox/catalogue-seed.ts'
import { CatalogueReplayBankData } from '../../src/adapters/idbi-sandbox/catalogue-replay.ts'
import { InMemoryBankData } from '../../src/adapters/memory/bank-data.memory.ts'

const bundles = seedBundles()
const bundle = bundles[0]
assert.ok(bundle)

interface StatementPacket {
  result: {
    accountBalances: Record<string, { amountValue: string }>
    transactionDetails: { txnId: string }[]
  }
}

/** Either consume a changed observation or reject its conflict; silently ignoring it is unsafe. */
function mustAffectProjection(payload: CatalogueSeedPayload, original: SeedBundle): void {
  let projected: SeedBundle
  try {
    projected = projectCatalogueSeedPayload(payload)
  } catch {
    return
  }
  assert.notDeepEqual(projected, original, 'changed bank observation was silently ignored')
}

describe('catalogue seed trust boundary', () => {
  it('does not silently ignore any of the five captured statement balances', () => {
    for (const kind of [
      'availableBalance',
      'ledgerBalance',
      'floatingBalance',
      'fFDBalance',
      'userDefinedBalance',
    ]) {
      const payload = buildCatalogueSeedPayload(bundle)
      for (const capture of payload.captures.filter((entry) => entry.endpoint === '393')) {
        const packet = capture.response as StatementPacket
        const amount = packet.result.accountBalances[kind]
        assert.ok(amount)
        amount.amountValue = '1.00'
      }
      mustAffectProjection(payload, bundle)
    }
  })

  it('cannot discard a captured missed repayment while retaining a debt-free fixture state', () => {
    const payload = buildCatalogueSeedPayload(bundle)
    const capture = payload.captures.find((entry) => entry.endpoint === '402')
    assert.ok(capture)
    const packet = capture.response as { result: { overdueDetails: { dpd: string }[] } }
    const overdue = packet.result.overdueDetails[0]
    assert.ok(overdue)
    overdue.dpd = '90'
    mustAffectProjection(payload, bundle)
  })

  it('rejects a capture whose next request does not continue the previous response', () => {
    const payload = buildCatalogueSeedPayload(bundle)
    const second = payload.captures.filter((entry) => entry.endpoint === '393')[1]
    assert.ok(second)
    const request = second.request as { input: { paginationDetails: { lastTxnId: string } } }
    request.input.paginationDetails.lastTxnId = 'different-transaction'
    assert.throws(() => projectCatalogueSeedPayload(payload))
  })

  it('rejects a capture whose requested account differs from its fixture account', () => {
    const payload = buildCatalogueSeedPayload(bundle)
    const capture = payload.captures.find((entry) => entry.endpoint === '393')
    assert.ok(capture)
    const request = capture.request as { input: { acid: string } }
    request.input.acid = 'different-account'
    assert.throws(() => projectCatalogueSeedPayload(payload))
  })

  it('requires a bijection before restoring fixture transaction IDs and enrichment', () => {
    const payload = buildCatalogueSeedPayload(bundle)
    const capture = payload.captures.find((entry) => entry.endpoint === '393')
    assert.ok(capture)
    const rows = (capture.response as StatementPacket).result.transactionDetails
    const first = rows[0]
    const second = rows[1]
    assert.ok(first)
    assert.ok(second)
    // Distinct statement serials legitimately survive the bank parser. Restoring the same
    // fixture ID twice would overwrite evidence in core's enrichment/commitment maps.
    second.txnId = first.txnId
    assert.throws(() => projectCatalogueSeedPayload(payload))
  })

  it('rejects excess precision before the seed serializer can round it away', () => {
    const changed = structuredClone(bundle)
    const first = changed.transactions[0]
    assert.ok(first)
    first.txnAmount = 1.005
    assert.throws(() => projectCatalogueSeedPayload(buildCatalogueSeedPayload(changed)))
  })
})

describe('catalogue replay port history', () => {
  it('rejects any observed block before replacing its provenance with fixture labels', async () => {
    const scopes: (keyof ProvenanceMap)[] = [
      'PROFILE',
      'ACCOUNTS',
      'TXN',
      'LIABILITIES',
      'HOLDINGS',
    ]
    for (const scope of scopes) {
      const records = new InMemoryBankData(bundles, {
        generatorVersion: 'adversarial-test',
        ranAt: '2026-09-01T00:00:00Z',
      })
      const load = records.loadCustomerFile.bind(records)
      records.loadCustomerFile = async (...args) => {
        const loaded = await load(...args)
        return { ...loaded, provenance: { ...loaded.provenance, [scope]: 'idbi' } }
      }
      const replay = new CatalogueReplayBankData(records)
      await assert.rejects(
        replay.loadCustomerFile(bundle.customer.cif, bundle.horizon.anchor, 24),
        /only explicitly fixture-origin/,
      )
    }
  })

  it('rejects observed transaction provenance before recapturing a requested range', async () => {
    const records = new InMemoryBankData(bundles, {
      generatorVersion: 'adversarial-test',
      ranAt: '2026-09-01T00:00:00Z',
    })
    const load = records.loadCustomerFile.bind(records)
    records.loadCustomerFile = async (...args) => {
      const loaded = await load(...args)
      return { ...loaded, provenance: { ...loaded.provenance, TXN: 'idbi' } }
    }
    const replay = new CatalogueReplayBankData(records)
    await assert.rejects(
      replay.getTransactions(bundle.customer.cif, {
        from: bundle.horizon.from,
        to: bundle.horizon.anchor,
      }),
      /only explicitly fixture-origin/,
    )
  })

  it('preserves the complete requested transaction range for a longer fixture history', async () => {
    const longer = seedBundles({ historyMonths: 36 })
    const first = longer[0]
    assert.ok(first)
    const records = new InMemoryBankData(longer, {
      generatorVersion: 'adversarial-test',
      ranAt: '2026-09-01T00:00:00Z',
    })
    const replay = new CatalogueReplayBankData(records)
    const range = { from: first.horizon.from, to: first.horizon.anchor }
    const expected = await records.getTransactions(first.customer.cif, range)
    assert.ok(expected.some((entry) => entry.txnDate < '2024-10-01'))
    assert.deepEqual(await replay.getTransactions(first.customer.cif, range), expected)
  })
})
