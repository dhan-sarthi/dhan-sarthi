/**
 * The two operator reads that go to the bank.
 *
 * Distinct from `test/avatar/operator.test.ts`, which is about the operator key and the avatar
 * rows. This one pins the rule the seed route carries: provenance is stamped per file, so one
 * customer file is loaded to read it — and where there is no customer, none is loaded at all.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MappingReportResponse } from '@dhan/contracts'
import { OperatorService } from '../../src/application/operator.service.ts'
import type { SeedInfo } from '../../src/application/seed-info.ts'
import type { BankDataPort } from '../../src/ports/index.ts'

const CIF = 'IDBI0009182731'
const FRESHNESS = '2026-09-01'
const PROVENANCE = {
  PROFILE: 'idbi',
  ACCOUNTS: 'idbi',
  TXN: 'idbi',
  LIABILITIES: 'idbi',
  HOLDINGS: 'declared',
} as const

const SEED: SeedInfo = {
  provenance: async () => null,
  drift: async () => ({ checked: false, ok: null, expectedSha256: null, actualSha256: null }),
}

interface FakeBank extends BankDataPort {
  readonly loads: [string, string, number][]
}

function fakeBank(customers: { cif: string }[]): FakeBank {
  const loads: [string, string, number][] = []
  const refuse = (): never => {
    throw new Error('the operator service reached the bank for something it should not')
  }
  return {
    loads,
    listCustomers: async () => customers as never,
    describe: () => ({
      source: 'idbi-sandbox',
      simulatedClock: false,
      dataFreshnessDate: FRESHNESS,
    }),
    loadCustomerFile: async (cif: string, asOf: string, windowMonths: number) => {
      loads.push([cif, asOf, windowMonths])
      return { file: {}, provenance: PROVENANCE } as never
    },
    getCustomer: refuse,
    getAccounts: refuse,
    getTransactions: refuse,
    getLiabilities: refuse,
    getHoldings: refuse,
    getConsent: refuse,
    ledgerHorizon: refuse,
    health: refuse,
  } as unknown as FakeBank
}

describe('the operator reads', () => {
  it('reads the provenance map off the first customer’s file, at the freshness date', async () => {
    const bank = fakeBank([{ cif: CIF }, { cif: 'IDBI0004471902' }])
    const status = await new OperatorService({
      bank,
      seed: SEED,
      mappingReport: () => null,
    }).seedStatus()
    assert.deepEqual(bank.loads, [[CIF, FRESHNESS, 1]])
    assert.deepEqual(status.provenance, PROVENANCE)
    assert.equal(status.bankSource, 'idbi-sandbox')
    assert.equal(status.seedRun, null)
  })

  it('loads no file at all where there is no customer, and says everything is fixture', async () => {
    const bank = fakeBank([])
    const status = await new OperatorService({
      bank,
      seed: SEED,
      mappingReport: () => null,
    }).seedStatus()
    assert.deepEqual(bank.loads, [])
    assert.deepEqual(status.provenance, {
      PROFILE: 'fixture',
      ACCOUNTS: 'fixture',
      TXN: 'fixture',
      LIABILITIES: 'fixture',
      HOLDINGS: 'fixture',
    })
  })

  it('pairs the source with whatever the mapping report function answers, including null', async () => {
    const bank = fakeBank([{ cif: CIF }])
    const empty = new OperatorService({ bank, seed: SEED, mappingReport: () => null }).mapping()
    assert.deepEqual(empty, { source: 'idbi-sandbox', report: null })

    const report: MappingReportResponse['report'] = {
      codeFallbacks: [],
      unmappedPaths: ['customer.gender'],
      notes: [],
    }
    const full = new OperatorService({ bank, seed: SEED, mappingReport: () => report }).mapping()
    assert.deepEqual(full, { source: 'idbi-sandbox', report })
  })
})
