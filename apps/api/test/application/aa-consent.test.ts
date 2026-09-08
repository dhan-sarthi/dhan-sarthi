/**
 * The consent flow, and the one property that has to hold.
 *
 * An inbound notification is an unsigned POST to a route that must be reachable without a
 * session, because IDBI is the caller and IDBI has no session. So the flow is written so that a
 * notification grants nothing: it appends an event, and only asking the bank (591) can make a
 * consent ACTIVE. These tests are what stop that being quietly refactored away — the failure
 * mode is not a broken screen, it is anyone who can guess a consent handle causing the app to
 * pull a customer's statements.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AaConsentService } from '../../src/application/aa-consent.service.ts'
import { InMemoryAaConsents } from '../../src/adapters/memory/aa-consent.memory.ts'
import { silentLogger } from '../../src/infra/logger.ts'
import type { Clock } from '../../src/ports/index.ts'
import { Forbidden } from '../../src/application/errors.ts'
import type { AaConsentSummary, AaGatewayPort } from '../../src/ports/aa-gateway.port.ts'

const CIF = '98655854'
const HANDLE = '6afdd734-be3b-475f-a8fc-3fcd18c04714'
const clock: Clock = {
  now: () => new Date('2026-09-08T00:00:00.000Z'),
  today: () => '2026-09-08',
}

interface FakeOptions {
  status?: string
  handleEcho?: boolean
  consents?: AaConsentSummary[]
}

function fakeGateway(options: FakeOptions = {}): AaGatewayPort & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    requestConsent: async () => {
      calls.push('590')
      return { consentHandle: HANDLE, status: 'PENDING' }
    },
    consentRedirectUrl: async () => {
      calls.push('592')
      return 'https://webrd.onemoney.in/uat/v2/?ecreq=x'
    },
    decryptConsentCallback: async () => {
      calls.push('593')
      return { status: 'S', consentHandle: HANDLE, sessionId: 'sess-1' }
    },
    consents: async () => {
      calls.push('591')
      return (
        options.consents ?? [
          {
            consentId: 'CONSENT-0001',
            consentHandle: options.handleEcho === false ? null : HANDLE,
            status: options.status ?? 'ACTIVE',
            createdAt: '2026-06-22',
            accounts: [],
          },
        ]
      )
    },
  }
}

function service(gateway: AaGatewayPort) {
  const store = new InMemoryAaConsents(clock)
  return {
    store,
    svc: new AaConsentService({
      gateway,
      store,
      clock,
      log: silentLogger,
      redirectUrl: 'https://myapp.com/consent/callback',
    }),
  }
}

describe('the Account Aggregator consent flow', () => {
  it('raises a handle and a redirection URL, in that order', async () => {
    const gateway = fakeGateway()
    const { svc } = service(gateway)
    const record = await svc.start(CIF)
    assert.deepEqual(gateway.calls, ['590', '592'])
    assert.equal(record.consentHandle, HANDLE)
    assert.equal(record.status, 'AWAITING_APPROVAL')
    assert.match(record.redirectionUrl ?? '', /^https:\/\/webrd\.onemoney\.in/)
  })

  it('keeps the handle when the redirection URL cannot be built', async () => {
    // 592 validates the redirect URL against its own fixture, so this is the sandbox's normal
    // behaviour for any deployment that is not `myapp.com` — and a handle without a URL is
    // still progress: the customer can be sent again without 590 notifying them twice.
    const gateway = fakeGateway()
    gateway.consentRedirectUrl = async (): Promise<string> => {
      throw new Error('redirectUrl does not match')
    }
    const { svc } = service(gateway)
    const record = await svc.start(CIF)
    assert.equal(record.consentHandle, HANDLE)
    assert.equal(record.status, 'REQUESTED')
    assert.equal(record.redirectionUrl, null)
  })

  it('records a notification without making it true', async () => {
    const gateway = fakeGateway()
    const { svc } = service(gateway)
    await svc.start(CIF)
    gateway.calls.length = 0

    const record = await svc.notified({
      consentHandle: HANDLE,
      eventType: 'CONSENT',
      eventStatus: 'CONSENT_APPROVED',
      raw: {},
    })

    // The event is kept, the status says only that something was reported, and — the part that
    // matters — the notification made no call to the bank of its own.
    assert.equal(record.events.length, 1)
    assert.equal(record.status, 'REPORTED')
    assert.deepEqual(gateway.calls, [])
    assert.notEqual(record.status, 'ACTIVE')
  })

  it('will not make a consent active on a notification alone, however it is spelled', async () => {
    const { svc } = service(fakeGateway())
    await svc.start(CIF)
    for (const eventStatus of ['CONSENT_APPROVED', 'ACTIVE', 'ready', 'SUCCESS']) {
      const record = await svc.notified({
        consentHandle: HANDLE,
        eventType: 'CONSENT',
        eventStatus,
        raw: {},
      })
      assert.notEqual(record.status, 'ACTIVE', `${eventStatus} moved the consent to ACTIVE`)
    }
  })

  it('keeps a notification for a handle nobody raised, uncorrelated', async () => {
    // Dropping it would be worse: an unexplained event is evidence, and a missing one is how a
    // consent that never arrived becomes impossible to account for. An empty cif is the signal.
    const { svc, store } = service(fakeGateway())
    await svc.notified({
      consentHandle: 'handle-nobody-asked-for',
      eventType: 'CONSENT',
      eventStatus: 'CONSENT_APPROVED',
      raw: {},
    })
    const found = await store.find('handle-nobody-asked-for')
    assert.ok(found)
    assert.equal(found.cif, '')
    assert.equal(found.events.length, 1)
  })

  it('only becomes active when the bank says so', async () => {
    const gateway = fakeGateway()
    const { svc } = service(gateway)
    await svc.start(CIF)
    await svc.notified({
      consentHandle: HANDLE,
      eventType: 'CONSENT',
      eventStatus: 'CONSENT_APPROVED',
      raw: {},
    })
    gateway.calls.length = 0

    const verified = await svc.verify(CIF, HANDLE)
    assert.deepEqual(gateway.calls, ['591'])
    assert.equal(verified.status, 'ACTIVE')
    assert.equal(verified.consentId, 'CONSENT-0001')
    assert.equal(verified.validFrom, '2026-06-22')
  })

  it('closes the request when the bank reports anything other than active', async () => {
    const gateway = fakeGateway({ status: 'REVOKED' })
    const { svc } = service(gateway)
    await svc.start(CIF)
    const verified = await svc.verify(CIF, HANDLE)
    assert.equal(verified.status, 'CLOSED')
  })

  it('leaves the request alone while the bank reports nothing at all', async () => {
    const gateway = fakeGateway({ consents: [] })
    const { svc } = service(gateway)
    await svc.start(CIF)
    const verified = await svc.verify(CIF, HANDLE)
    assert.equal(verified.status, 'AWAITING_APPROVAL')
    assert.equal(verified.consentId, null)
  })

  it('accepts a single consent as the answer when 591 does not echo the handle', async () => {
    // The sandbox's 591 does not always return the handle it was asked about, so one active
    // consent for the right customer is taken as the answer. More than one and it is not.
    const gateway = fakeGateway({ handleEcho: false })
    const { svc } = service(gateway)
    await svc.start(CIF)
    assert.equal((await svc.verify(CIF, HANDLE)).status, 'ACTIVE')
  })

  it('refuses to verify a handle raised for another customer', async () => {
    const { svc } = service(fakeGateway())
    await svc.start(CIF)
    await assert.rejects(() => svc.verify('88234567', HANDLE), Forbidden)
  })

  it('treats a browser redirect as a notification and then asks the bank', async () => {
    const gateway = fakeGateway()
    const { svc } = service(gateway)
    await svc.start(CIF)
    gateway.calls.length = 0

    const record = await svc.returned(CIF, { ecres: 'x', resdate: 'y', fi: 'z' })
    // Decrypted, recorded, and only then verified — the redirect's own `status: "S"` is the
    // aggregator's word carried by the customer's browser, so it settles nothing by itself.
    assert.deepEqual(gateway.calls, ['593', '591'])
    assert.equal(record.status, 'ACTIVE')
    assert.deepEqual(
      record.events.map((e) => e.eventType),
      ['REDIRECT'],
    )
  })
})
