/**
 * The two blocks the app owns, over HTTP.
 *
 * `/profile` and `/holdings` exist because IDBI has no endpoint for either: no operation in the
 * catalogue carries a declared income, an employment type or a risk profile, and none carries a
 * mutual fund, a deposit book or a policy. That makes them the only writable customer data in
 * the app, and the only place a customer can change what the advice is built on.
 *
 * Run on the memory profile, where the generator brings its own holdings, so the read-only
 * refusal is exercised as well as the editable path.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { DeclaredProfileResponse, ErrorBody, HoldingsResponse, View } from '@dhan/contracts'
import { ROHAN_CIF, bearer, createSession, makeRoot } from '../helpers/app.ts'

/** IDBI's own customer, from `api/customers.ts`. Not one of the generator's personas. */
const PRIYA_IDBI_CIF = '98655854'
import type { TestRoot } from '../helpers/app.ts'

describe('the profile and holdings the app owns', () => {
  let root: TestRoot
  let token: string

  before(async () => {
    root = await makeRoot()
    token = (await createSession(root.app, ROHAN_CIF)).token
  })
  after(() => root.close())

  const get = (url: string) => root.app.inject({ method: 'GET', url, headers: bearer(token) })
  // `payload` always present: the conditional spread widens the object enough that Fastify's
  // inject overloads stop resolving, and every response then types as `void`.
  const send = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload: unknown = {}) =>
    root.app.inject({ method, url, headers: bearer(token), payload: payload as object })

  it('reads the declared profile, and says nothing is missing when the bank has it', async () => {
    const res = await get('/api/v1/profile')
    assert.equal(res.statusCode, 200)
    const profile = res.json<DeclaredProfileResponse>()
    assert.equal(profile.cif, ROHAN_CIF)
    assert.ok(profile.declaredAnnualIncome > 0)
    // The generator supplies a date of birth, so there is nothing to ask the customer for.
    assert.deepEqual(profile.missing, [])
  })

  it('moves only the fields a patch names', async () => {
    const before = (await get('/api/v1/profile')).json<DeclaredProfileResponse>()
    const res = await send('PATCH', '/api/v1/profile', { declaredAnnualIncome: 2_400_000 })
    assert.equal(res.statusCode, 200)
    const after = res.json<DeclaredProfileResponse>()
    assert.equal(after.declaredAnnualIncome, 2_400_000)
    // Everything else is untouched: an absent key means "leave it", never "clear it".
    assert.equal(after.riskProfile, before.riskProfile)
    assert.equal(after.employmentType, before.employmentType)
    assert.equal(after.dependents, before.dependents)
    assert.notEqual(after.updatedAt, '')
  })

  it('refuses a patch that names nothing', async () => {
    // Not a no-op worth accepting: it would stamp updatedAt and tell the customer we recorded
    // a change we did not make.
    const res = await send('PATCH', '/api/v1/profile', {})
    assert.equal(res.statusCode, 400)
    assert.equal(res.json<ErrorBody>().code, 'VALIDATION')
  })

  it('refuses a risk profile that is not one of the three', async () => {
    const res = await send('PATCH', '/api/v1/profile', { riskProfile: 'Reckless' })
    assert.equal(res.statusCode, 400)
  })

  it('reads the holdings, and marks them read-only under a source that brings its own', async () => {
    const res = await get('/api/v1/holdings')
    assert.equal(res.statusCode, 200)
    const held = res.json<HoldingsResponse>()
    assert.ok(held.holdings.length > 0, 'the generator produces a portfolio')
    assert.equal(held.editable, false)
    // Policies carry cover in `investedAmount` and no capital, so a total that included them
    // would be wrong by the sum assured.
    const capital = held.holdings.reduce((s, h) => s + h.currentValue, 0)
    assert.equal(held.totalValue, Math.round(capital * 100) / 100)
  })

  it('refuses a write to holdings this source owns', async () => {
    const res = await send('POST', '/api/v1/holdings', {
      holdingType: 'MUTUAL_FUND',
      name: 'Something',
      assetClass: 'Equity',
      investedAmount: 1000,
      currentValue: 1200,
      sipActive: false,
    })
    assert.equal(res.statusCode, 409)
    assert.equal(res.json<ErrorBody>().code, 'READ_ONLY_BLOCK')
  })

  it('answers the consent list, and refuses to raise one with no aggregator behind it', async () => {
    const list = await get('/api/v1/consent/aa')
    assert.equal(list.statusCode, 200)
    assert.deepEqual(list.json(), [])

    // A source with no Account Aggregator says so rather than the route disappearing.
    const raise = await send('POST', '/api/v1/consent/aa')
    assert.equal(raise.statusCode, 503)
  })

  it('takes an unauthenticated consent notification, and grants nothing for it', async () => {
    const res = await root.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/idbi/consent',
      payload: {
        consentHandle: 'handle-from-nowhere',
        eventType: 'CONSENT',
        eventStatus: 'CONSENT_APPROVED',
        consentId: 'CONSENT-0001',
      },
    })
    // No session, because the bank has none. IDBI's own 497 answers this body.
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.json(), { message: 'Success' })

    // And it granted nothing: the customer's own consent list is still empty.
    assert.deepEqual((await get('/api/v1/consent/aa')).json(), [])
  })

  it('refuses a notification with no handle to record it against', async () => {
    const res = await root.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/idbi/consent',
      payload: { consentHandle: '', eventType: 'CONSENT', eventStatus: 'X' },
    })
    assert.equal(res.statusCode, 400)
  })
})

/**
 * The same two blocks over IDBI, where they are the only source there is.
 *
 * Built on the replayed captures, so this runs anywhere: `BANK_SOURCE=idbi-sandbox` with no
 * base URL serves the bank's own recorded bytes in process. It is also the only configuration
 * where the profile is load-bearing — under the generator the customer file already carries a
 * declared income, and here nothing does.
 */
describe('the app-owned blocks over IDBI', () => {
  let root: TestRoot
  let token: string

  before(async () => {
    root = await makeRoot({ env: { BANK_SOURCE: 'idbi-sandbox' } })
    token = (await createSession(root.app, PRIYA_IDBI_CIF)).token
  })
  after(() => root.close())

  const get = (url: string) => root.app.inject({ method: 'GET', url, headers: bearer(token) })
  // `payload` always present: the conditional spread widens the object enough that Fastify's
  // inject overloads stop resolving, and every response then types as `void`.
  const send = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload: unknown = {}) =>
    root.app.inject({ method, url, headers: bearer(token), payload: payload as object })

  it('feeds the engine: a declared income change moves the cover requirement', async () => {
    await send('PATCH', '/api/v1/profile', { declaredAnnualIncome: 1_200_000, dependents: 2 })
    const low = (await get('/api/v1/view')).json<View>()
    await send('PATCH', '/api/v1/profile', { declaredAnnualIncome: 3_600_000 })
    const high = (await get('/api/v1/view')).json<View>()

    // Ten times annual income, and the whole reason the profile is editable: the number it
    // drives has to move when it does. IDBI's statement carries no recognisable salary, so the
    // declared figure is the only income there is and this is the only path to a cover figure.
    assert.ok(low.snapshot.protection.lifeCoverNeeded > 0)
    assert.ok(
      high.snapshot.protection.lifeCoverNeeded > low.snapshot.protection.lifeCoverNeeded,
      'raising declared income did not raise the indicative cover',
    )
  })

  it('owns the holdings here, and a write changes what the engine sees', async () => {
    const before = (await get('/api/v1/holdings')).json<HoldingsResponse>()
    assert.equal(before.editable, true, 'IDBI has no holdings endpoint, so the app owns the block')

    const added = await send('POST', '/api/v1/holdings', {
      holdingType: 'MUTUAL_FUND',
      name: 'Test Flexi Cap',
      assetClass: 'Equity',
      investedAmount: 50_000,
      currentValue: 61_250,
      sipActive: true,
      sipAmount: 2_500,
    })
    assert.equal(added.statusCode, 200)
    const id = added.json<{ holdingId: string }>().holdingId

    const view = (await get('/api/v1/view')).json<View>()
    assert.equal(view.snapshot.holdings.total, Math.round((before.totalValue + 61_250) * 100) / 100)
    // The mandate is on the holding, not in the statement, and the snapshot has to carry it:
    // IDBI's narrations show no SIP debit, so this is the only place it exists.
    assert.ok(view.snapshot.holdings.sipMonthly >= 2_500)

    assert.equal((await send('DELETE', `/api/v1/holdings/${id}`)).statusCode, 204)
    const after = (await get('/api/v1/holdings')).json<HoldingsResponse>()
    assert.equal(after.totalValue, before.totalValue)
  })

  it('lists the accounts themselves, with the spendable floor the bank sent', async () => {
    const view = (await get('/api/v1/view')).json<View>()
    assert.equal(view.accounts.length, 1)
    const account = view.accounts[0]
    assert.ok(account)
    assert.equal(account.accountNumberMasked, 'XXXXXXXX0003')
    assert.equal(account.currentBalance, 56_780.25)
    // EFFAVL as the bank sent it, never AVAIL less LIEN recomputed.
    assert.equal(account.effectiveAvailableBalance, 50_780.25)
    assert.equal(account.lienAmount, 5_000)
  })

  it('raises a consent request against the replayed bank', async () => {
    const raised = await send('POST', '/api/v1/consent/aa')
    assert.equal(raised.statusCode, 200)
    const record = raised.json<{ consentHandle: string; status: string }>()
    assert.equal(record.consentHandle, '6afdd734-be3b-475f-a8fc-3fcd18c04714')

    // A notification records and grants nothing; only a verify against 591 can make it active.
    await root.app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/idbi/consent',
      payload: {
        consentHandle: record.consentHandle,
        eventType: 'CONSENT',
        eventStatus: 'CONSENT_APPROVED',
      },
    })
    const reported = (await get('/api/v1/consent/aa')).json<{ status: string }[]>()
    assert.equal(reported[0]?.status, 'REPORTED')

    const verified = await send('POST', `/api/v1/consent/aa/${record.consentHandle}/verify`)
    assert.equal(verified.statusCode, 200)
    assert.equal(verified.json<{ status: string }>().status, 'ACTIVE')
  })
})
