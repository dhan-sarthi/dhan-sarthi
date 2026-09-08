/**
 * Which of IDBI's twenty-four operations the app can actually reach.
 *
 * A registry entry and a schema prove nothing on their own — an operation nothing calls is
 * documentation. This drives the gateway over the replayed captures and asserts against the
 * calls the transport actually saw, so an operation that falls out of use shows up here rather
 * than rotting quietly.
 *
 * Four are deliberately unreachable from the customer app, and each one is named below with
 * the reason. Anything else missing is a gap.
 */
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { IdbiGateway } from '../../src/adapters/idbi-sandbox/api/gateway.ts'
import { IdbiTransport } from '../../src/adapters/idbi-sandbox/api/transport.ts'
import {
  REPLAY_BASE_URL,
  createReplayTransport,
} from '../../src/adapters/idbi-sandbox/api/replay.ts'
import { loadCapturedCalls } from '../../src/adapters/idbi-sandbox/api/captured.ts'
import {
  IDBI_SANDBOX_CUSTOMERS,
  sandboxCustomer,
} from '../../src/adapters/idbi-sandbox/api/customers.ts'
import { OPERATIONS, operationByPath } from '../../src/adapters/idbi-sandbox/api/operations.ts'
import type { ServiceCode } from '../../src/adapters/idbi-sandbox/api/operations.ts'
import { newReport } from '../../src/adapters/idbi-sandbox/api/to-domain.ts'
import { silentLogger } from '../../src/infra/logger.ts'
import type { ReplayTransport } from '../../src/adapters/idbi-sandbox/api/replay.ts'

/**
 * The four the customer app does not call, and why.
 *
 * 497 and 498 are IDBI calling *us*: we host the equivalent routes at
 * `/api/v1/webhooks/idbi/*`, and calling theirs would inject a synthetic event into their
 * sandbox — which the capture script does behind `--writes` and an app never should.
 *
 * 408 and 415 spend a real credit enquiry and a real registry search and need credentials we
 * were not given. Their response shapes are mapped anyway, because 433 returns both bodies in
 * full without spending either.
 */
const NOT_CALLED_BY_THE_APP = new Set<ServiceCode>(['497', '498', '408', '415'])

const PRIYA = '98655854'

describe('the reach of the IDBI gateway', () => {
  let replay: ReplayTransport
  let gateway: IdbiGateway

  before(async () => {
    replay = createReplayTransport({ captures: loadCapturedCalls() })
    const transport = new IdbiTransport({
      baseUrl: REPLAY_BASE_URL,
      fetch: replay.fetch,
      logger: silentLogger,
      // Off: this test counts calls, and a cache would hide the second one.
      readCacheMs: 0,
    })
    gateway = new IdbiGateway({ transport, logger: silentLogger })

    const priya = sandboxCustomer(PRIYA)
    assert.ok(priya)
    const report = newReport()

    // Everything the app does, in one pass. A refusal is fine — the point is that the call was
    // made, which is what proves the operation is wired rather than merely registered.
    const attempts: Promise<unknown>[] = [
      gateway.verifyKey(priya),
      gateway.customerRecord(),
      gateway.accounts(priya),
      gateway.transactions(priya, priya.primaryAcctId, { from: '2025-05-01', to: '2025-05-20' }),
      gateway.liabilities(priya),
      gateway.customer(priya, {
        custId: priya.custId,
        maritalStatus: 'Married',
        dependents: 1,
        employmentType: 'Salaried',
        declaredAnnualIncome: 1_800_000,
        preferredLanguage: 'en',
        riskProfile: 'Balanced',
        taxRegime: 'new',
      }),
      gateway.consentList(priya, report),
      gateway.consent(priya, { validFrom: '2025-05-01', validTo: '2026-05-01' }),
      gateway.requestConsent(PRIYA),
      gateway.consentRedirectUrl('handle', 'https://myapp.com/consent/callback'),
      gateway.decryptConsentCallback({ ecres: 'x', resdate: 'y', fi: 'z' }),
      gateway.consentedStatement('CONSENT-0001', ['19818fc6-d5ee-429b-9d14-4dfd5d92fc8e']),
      gateway.consentedStatement('CONSENT-0001', ['76ae28bd-eebf-4a49-8701-68a14346d996'], {
        viaFinPro: true,
      }),
      gateway.overduePosition(priya),
      gateway.accountLimits(priya.primaryAcctId),
      gateway.repaymentSchedule({ amount: 100_000, ratePct: 1.2, months: 24 }),
      gateway.payoffQuote(priya.primaryAcctId),
      gateway.employee('137075'),
      gateway.createLead({
        cif: PRIYA,
        product: { name: 'Term Life', category: 'Term Insurance', subCategory: 'LIC' },
        estimatedAmount: 18_500,
        leadId: 'DS-coverage-0001',
        firstName: 'PRIYA',
        lastName: 'PATIL',
        mobileNo: '9988776655',
        pan: 'FGHPP4567T',
        emailId: null,
        addressLine1: null,
        pincode: null,
        state: null,
      }),
    ]
    // A refusal from the sandbox is a legitimate outcome here; only the call matters.
    await Promise.allSettled(attempts)
  })

  it('calls every operation the customer app is meant to', () => {
    const called = new Set(
      replay.calls
        .map((c) => operationByPath(c.op)?.code)
        .filter((code): code is ServiceCode => code !== undefined),
    )
    const missing = OPERATIONS.filter(
      (o) => !NOT_CALLED_BY_THE_APP.has(o.code) && !called.has(o.code),
    ).map((o) => `${o.code} ${o.name}`)
    assert.deepEqual(missing, [], 'operations registered but never called')
    assert.equal(called.size, OPERATIONS.length - NOT_CALLED_BY_THE_APP.size)
  })

  it('does not call the four it must not', () => {
    const called = new Set(replay.calls.map((c) => operationByPath(c.op)?.code))
    for (const code of NOT_CALLED_BY_THE_APP) {
      assert.ok(!called.has(code), `${code} was called and should not have been`)
    }
  })

  it('registers twenty-four operations across twenty-nine paths', () => {
    assert.equal(OPERATIONS.length, 24)
    const paths = OPERATIONS.flatMap((o) => [o.op, ...o.variants])
    assert.equal(paths.length, 29)
    assert.equal(new Set(paths).size, 29, 'a path is registered twice')
  })

  it('has a tier on every operation, and gates the five that change something', () => {
    const writes = OPERATIONS.filter((o) => o.tier === 'write').map((o) => o.code)
    const bureau = OPERATIONS.filter((o) => o.tier === 'bureau').map((o) => o.code)
    // Five operations behind --writes in the capture script — seven calls, because 428 has
    // three samples — and two behind --bureau.
    assert.deepEqual(writes.slice().sort(), ['428', '497', '498', '508', '590'])
    assert.deepEqual(bureau.slice().sort(), ['408', '415'])
    // Everything a write does is stated, so nobody has to read the code to find out.
    for (const o of OPERATIONS) {
      if (o.tier === 'read') continue
      assert.ok(
        o.sideEffect !== undefined && o.sideEffect.length > 0,
        `${o.code} has no sideEffect`,
      )
    }
  })

  it('knows a customer for every picker entry, and a coverage flag for each', () => {
    for (const c of IDBI_SANDBOX_CUSTOMERS) {
      assert.ok(c.cif !== '' && c.custId !== '' && c.branchId !== '' && c.primaryAcctId !== '')
      // The AA flags and the pulls have to agree, or the app asks for a consented statement
      // under a consent this sandbox will refuse.
      if (!c.coverage.accountAggregator) assert.equal(c.aaPulls.length, 0, c.name)
    }
  })
})
