/**
 * What the customer owns, through the interface.
 *
 * Two of these pin rules that had no test at all while they lived in a Fastify handler: that
 * the read is taken at the session's simulated today rather than at the bank's freshness date
 * — eighteen months apart under the fixtures source, which is how the Holdings tab once said
 * ₹2,32,050 beside ₹1,24,950 in the same screen — and that `draftOf` drops explicitly-undefined
 * keys before the store sees them.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { HoldingDraftRequest } from '@dhan/contracts'
import { HoldingsView } from '../../src/application/holdings-view.ts'
import { ReadOnlyBlock } from '../../src/application/errors.ts'
import type { HoldingDraft, HoldingRecord, HoldingsStore, Session } from '../../src/ports/index.ts'

const SESSION = { cif: 'IDBI0009182731', asOf: '2026-09-01' } as Session

function record(holdingId: string, currentValue: number): HoldingRecord {
  return {
    holdingId,
    holdingType: 'MUTUAL_FUND',
    name: holdingId,
    assetClass: 'Equity',
    investedAmount: 1000,
    currentValue,
    sipActive: false,
  }
}

interface FakeStore extends HoldingsStore {
  readonly asOfSeen: (string | undefined)[]
  readonly drafts: HoldingDraft[]
}

function fakeStore(
  options: { editable?: boolean; onWrite?: () => never; holdings?: HoldingRecord[] } = {},
): FakeStore {
  const asOfSeen: (string | undefined)[] = []
  const drafts: HoldingDraft[] = []
  return {
    asOfSeen,
    drafts,
    editable: () => options.editable ?? true,
    get: async (_cif, asOf) => {
      asOfSeen.push(asOf)
      return {
        holdings: options.holdings ?? [record('h1', 100.005), record('h2', 50.001)],
        policies: [record('p1', 9_999_999)],
        updatedAt: '2026-09-01T00:00:00.000Z',
      }
    },
    add: async (_cif, draft) => {
      options.onWrite?.()
      drafts.push(draft)
      return { ...draft, holdingId: 'new' }
    },
    replace: async (_cif, holdingId, draft) => {
      options.onWrite?.()
      drafts.push(draft)
      return { ...draft, holdingId }
    },
    remove: async () => {
      options.onWrite?.()
    },
  }
}

function draft(over: Partial<HoldingDraftRequest> = {}): HoldingDraftRequest {
  return {
    holdingType: 'MUTUAL_FUND',
    name: 'Parag Parikh Flexi Cap',
    assetClass: 'Equity',
    investedAmount: 1000,
    currentValue: 1200,
    sipActive: false,
    sipAmount: undefined,
    ...over,
  } as HoldingDraftRequest
}

describe('the holdings view', () => {
  it('reads at the session’s simulated today, not the bank’s freshness date', async () => {
    const store = fakeStore()
    await new HoldingsView({ holdings: store }).view(SESSION)
    assert.deepEqual(store.asOfSeen, ['2026-09-01'])
  })

  it('totals currentValue over holdings alone, rounded to two places', async () => {
    const view = await new HoldingsView({ holdings: fakeStore() }).view(SESSION)
    // 100.005 + 50.001 = 150.006, and the ₹99,99,999 policy is cover rather than capital.
    assert.equal(view.totalValue, 150.01)
    assert.equal(view.policies.length, 1)
  })

  it('reports whatever the store says about editability', async () => {
    const off = await new HoldingsView({ holdings: fakeStore({ editable: false }) }).view(SESSION)
    assert.equal(off.editable, false)
    const on = await new HoldingsView({ holdings: fakeStore({ editable: true }) }).view(SESSION)
    assert.equal(on.editable, true)
  })

  it('drops an explicitly-undefined key before the store sees the draft', async () => {
    const store = fakeStore()
    const holdings = new HoldingsView({ holdings: store })
    await holdings.add(SESSION, draft())
    await holdings.replace(SESSION, 'h1', draft({ sipActive: true, sipAmount: 5000 }))
    assert.equal(Object.hasOwn(store.drafts[0] ?? {}, 'sipAmount'), false)
    assert.equal(store.drafts[1]?.sipAmount, 5000)
  })

  it('lets the store’s refusal through untouched', async () => {
    const store = fakeStore({
      onWrite: () => {
        throw new ReadOnlyBlock('holdings', 'memory')
      },
    })
    const holdings = new HoldingsView({ holdings: store })
    await assert.rejects(() => holdings.add(SESSION, draft()), ReadOnlyBlock)
    await assert.rejects(() => holdings.remove(SESSION, 'h1'), ReadOnlyBlock)
  })
})
