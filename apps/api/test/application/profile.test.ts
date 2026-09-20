/**
 * The declared profile, and the regression that started the module.
 *
 * `missing` used to be recovered by grepping the adapter's 403 message for the string
 * 'dateOfBirth'. Case 2 below throws an `IncompleteProfile` whose message does not contain
 * that word — on the old code it came back empty, which is the UI being told there is nothing
 * to ask the customer for.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ProfileService } from '../../src/application/profile.service.ts'
import {
  IncompleteProfile,
  NotFound,
  Unavailable,
  ValidationFailed,
} from '../../src/application/errors.ts'
import type {
  BankDataPort,
  DeclaredProfile,
  DeclaredProfileStore,
  Session,
} from '../../src/ports/index.ts'

const CIF = 'IDBI0009182731'
const SESSION = { cif: CIF, asOf: '2026-09-01' } as Session

function profileOf(over: Partial<DeclaredProfile> = {}): DeclaredProfile {
  return {
    cif: CIF,
    maritalStatus: 'Married',
    dependents: 2,
    employmentType: 'Salaried',
    declaredAnnualIncome: 1_800_000,
    preferredLanguage: 'en',
    riskProfile: 'Balanced',
    taxRegime: 'New',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  } as DeclaredProfile
}

interface FakeStore extends DeclaredProfileStore {
  readonly patches: unknown[]
}

function fakeStore(profile: DeclaredProfile | Error = profileOf()): FakeStore {
  const patches: unknown[] = []
  const held = profile instanceof Error ? null : profile
  return {
    patches,
    get: async () => {
      if (profile instanceof Error) throw profile
      return profile
    },
    find: async () => held,
    list: async () => (held ? [held] : []),
    patch: async (_cif, patch) => {
      patches.push(patch)
      const moved = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
      return { ...(held ?? profileOf()), ...moved, updatedAt: '2026-09-02T00:00:00.000Z' }
    },
  }
}

function fakeBank(onGetCustomer: () => void = () => {}): BankDataPort {
  const refuse = (): never => {
    throw new Error('the profile service reached the bank for something other than the customer')
  }
  return {
    getCustomer: async () => {
      onGetCustomer()
      return { cif: CIF } as never
    },
    listCustomers: refuse,
    getAccounts: refuse,
    getTransactions: refuse,
    getLiabilities: refuse,
    getHoldings: refuse,
    getConsent: refuse,
    loadCustomerFile: refuse,
    ledgerHorizon: refuse,
    describe: refuse,
    health: refuse,
  } as unknown as BankDataPort
}

function service(bank: BankDataPort, store: FakeStore = fakeStore()) {
  return { store, svc: new ProfileService({ profiles: store, bank }) }
}

describe('the declared profile', () => {
  it('reports nothing missing where the bank can answer for the customer', async () => {
    const { svc } = service(fakeBank())
    assert.deepEqual((await svc.get(SESSION)).missing, [])
  })

  it('reads the missing fields off the typed error, not off its wording', async () => {
    const { svc } = service(
      fakeBank(() => {
        // Deliberately a sentence with no 'dateOfBirth' in it. The string match returned [].
        throw new IncompleteProfile(['dateOfBirth'], 'the profile is not complete')
      }),
    )
    assert.deepEqual((await svc.get(SESSION)).missing, ['dateOfBirth'])
  })

  it('carries every named field back, in order', async () => {
    const { svc } = service(
      fakeBank(() => {
        throw new IncompleteProfile(['dateOfBirth', 'riskProfile'], 'short of two things')
      }),
    )
    assert.deepEqual((await svc.get(SESSION)).missing, ['dateOfBirth', 'riskProfile'])
  })

  it('lets anything else the bank throws through', async () => {
    const notFound = service(
      fakeBank(() => {
        throw new NotFound('no such customer')
      }),
    )
    await assert.rejects(() => notFound.svc.get(SESSION), NotFound)

    const down = service(
      fakeBank(() => {
        throw new Unavailable('the bank is down')
      }),
    )
    await assert.rejects(() => down.svc.get(SESSION), Unavailable)
  })

  it('refuses an empty patch before it reaches the store', async () => {
    const { svc, store } = service(fakeBank())
    await assert.rejects(() => svc.patch(SESSION, {}), ValidationFailed)
    assert.deepEqual(store.patches, [])
  })

  it('answers a patch with the profile as it now stands, and omits an absent date of birth', async () => {
    const { svc } = service(fakeBank(), fakeStore(profileOf()))
    const patched = await svc.patch(SESSION, { declaredAnnualIncome: 2_400_000 })
    assert.equal(patched.declaredAnnualIncome, 2_400_000)
    assert.equal(patched.updatedAt, '2026-09-02T00:00:00.000Z')
    assert.deepEqual(patched.missing, [])
    // Absent, not present-and-undefined: `exactOptionalPropertyTypes` and the wire schema
    // both care, and JSON.stringify would drop the key either way only by accident.
    assert.equal(Object.hasOwn(patched, 'dateOfBirth'), false)
  })
})
