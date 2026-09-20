/**
 * The Account Aggregator consent flow, orchestrated.
 *
 * Six chained calls and only three of them are ours to make in order: 590 for a handle, 592 for
 * the URL the customer approves at, then a wait, then 591 to find out what they decided. The
 * wait is the interesting part. It ends either because IDBI posted a notification to our
 * webhook (497), or because the customer's browser came back to our redirect carrying an
 * `ecres` for 593 to decrypt — and neither of those is trustworthy on its own.
 *
 * So the rule this service enforces: **nothing but 591 can make a consent active.** A
 * notification is an unsigned POST to a route that has to be reachable without a session,
 * because the bank calls it; a redirect payload arrives through the customer's own browser. Both
 * are recorded, both mark the handle as worth re-checking, and neither is allowed to change
 * what the app believes it may read. `verify` asks the bank, and the bank's answer is the only
 * thing that moves a request to ACTIVE.
 *
 * That is not defensiveness for its own sake. Without it, anyone who can guess a consent handle
 * could post an approval and cause the app to pull a customer's statements.
 */
import type { ConsentRequestResponse } from '@dhan/contracts'
import { Forbidden, NotFound, ValidationFailed } from './errors.ts'
import type { Clock } from '../ports/index.ts'
import type {
  AaConsentStore,
  ConsentEvent,
  ConsentRequestRecord,
} from '../ports/aa-consent.port.ts'
import type { AaGatewayPort } from '../ports/aa-gateway.port.ts'
import type { Logger } from '../infra/logger.ts'

export interface AaConsentServiceDeps {
  gateway: AaGatewayPort
  store: AaConsentStore
  clock: Clock
  log: Logger
  /**
   * Where the aggregator sends the customer back to. Must be a URL the app serves; it is what
   * 592 encrypts into the redirection, and it is where an `ecres` arrives from.
   */
  redirectUrl: string
}

/** An inbound notification, before anything has been made of it. */
export interface InboundNotification {
  consentHandle: string
  eventType: string
  eventStatus: string
  eventMessage?: string | undefined
  consentId?: string | undefined
  sessionId?: string | undefined
  linkRefNumbers?: readonly string[] | undefined
  raw: unknown
}

/**
 * The stored record as the wire sees it: everything except `cif`, which the caller already
 * knows because they had to be that customer to get here, and the raw notification bodies,
 * which are the audit trail's business and not the app's.
 *
 * This lives here rather than in the route file on purpose. The four reads below are the whole
 * of what a caller may know about a consent request, so the response type IS this module's
 * interface; hand-copying ten fields in `http/routes/consent-aa.ts` made the route the place
 * that decided it, and made the http layer import a port type to see the shape it was copying
 * from — which `route-handlers-do-not-name-ports` in .dependency-cruiser.cjs now forbids.
 */
function present(record: ConsentRequestRecord): ConsentRequestResponse {
  return {
    consentHandle: record.consentHandle,
    status: record.status,
    redirectionUrl: record.redirectionUrl,
    consentId: record.consentId,
    validFrom: record.validFrom,
    validTo: record.validTo,
    events: record.events.map((e) => ({
      eventType: e.eventType,
      eventStatus: e.eventStatus,
      eventMessage: e.eventMessage,
      consentId: e.consentId,
      sessionId: e.sessionId,
      linkRefNumbers: [...e.linkRefNumbers],
      receivedAt: e.receivedAt,
    })),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export class AaConsentService {
  private readonly d: AaConsentServiceDeps

  constructor(deps: AaConsentServiceDeps) {
    this.d = deps
  }

  /**
   * Steps one and two: raise a request and hand back somewhere to send the customer.
   *
   * 590 may notify the customer, so this is not a read and is never called to warm a cache.
   */
  async start(cif: string): Promise<ConsentRequestResponse> {
    const { consentHandle, status } = await this.d.gateway.requestConsent(cif)
    this.d.log.info({ cif, consentHandle, bankStatus: status }, 'raised an AA consent request')
    await this.d.store.open({ consentHandle, cif, status: 'REQUESTED' })

    // 592 is a separate call and can fail on its own; a handle with no URL is still progress
    // worth keeping, because the customer can be sent again without re-notifying them.
    try {
      const url = await this.d.gateway.consentRedirectUrl(consentHandle, this.d.redirectUrl)
      return present(
        await this.d.store.update(consentHandle, {
          status: 'AWAITING_APPROVAL',
          redirectionUrl: url,
        }),
      )
    } catch (err) {
      this.d.log.warn(
        { cif, consentHandle, err: err instanceof Error ? err.message : String(err) },
        'the consent handle was raised but no redirection URL could be built',
      )
      return present(await this.d.store.update(consentHandle, { status: 'REQUESTED' }))
    }
  }

  /**
   * A notification from the bank, recorded and nothing more.
   *
   * Deliberately returns the record rather than a verdict, and deliberately does not call the
   * bank: a webhook that triggers outbound calls is a webhook that can be used to make them.
   * The next `verify` picks it up.
   */
  async notified(inbound: InboundNotification): Promise<ConsentRequestRecord> {
    if (inbound.consentHandle.trim() === '') {
      throw new ValidationFailed('The notification carried no consent handle.')
    }
    const event: ConsentEvent = {
      eventType: inbound.eventType,
      eventStatus: inbound.eventStatus,
      eventMessage: inbound.eventMessage ?? null,
      consentId: inbound.consentId ?? null,
      sessionId: inbound.sessionId ?? null,
      linkRefNumbers: inbound.linkRefNumbers ?? [],
      receivedAt: this.d.clock.now().toISOString(),
      raw: inbound.raw,
    }
    const record = await this.d.store.record(inbound.consentHandle, event)
    this.d.log.info(
      {
        consentHandle: inbound.consentHandle,
        eventType: inbound.eventType,
        eventStatus: inbound.eventStatus,
        correlated: record.cif !== '',
      },
      'recorded an inbound AA notification',
    )
    return record
  }

  /**
   * The redirect coming back through the customer's browser.
   *
   * 593 decrypts it, and the result is treated exactly like a notification: recorded, not
   * believed. The `status` inside is the aggregator's word carried by an untrusted courier.
   */
  async returned(
    cif: string,
    payload: { ecres: string; resdate: string; fi: string },
  ): Promise<ConsentRequestResponse> {
    const decrypted = await this.d.gateway.decryptConsentCallback(payload)
    const handle = decrypted.consentHandle
    if (handle === null) {
      throw new ValidationFailed('The redirect payload decrypted to no consent handle.')
    }
    await this.notified({
      consentHandle: handle,
      eventType: 'REDIRECT',
      eventStatus: decrypted.status ?? 'UNKNOWN',
      ...(decrypted.sessionId === null ? {} : { sessionId: decrypted.sessionId }),
      raw: decrypted,
    })
    return this.verify(cif, handle)
  }

  /**
   * Ask the bank what the consent actually says, and move the record to match.
   *
   * This is the only path to ACTIVE. It is safe to call as often as a screen wants: 591 is a
   * read, and re-reading it is how a consent that was revoked on the customer's phone stops
   * being one the app will pull under.
   */
  async verify(cif: string, consentHandle: string): Promise<ConsentRequestResponse> {
    const record = await this.d.store.find(consentHandle)
    if (record === null) throw new NotFound(`No consent request ${consentHandle}.`)
    if (record.cif !== '' && record.cif !== cif) {
      // The handle belongs to somebody else. Refusing rather than 404ing is deliberate: the
      // caller has a session, and telling them the handle does not exist would be a lie.
      throw new Forbidden('That consent handle belongs to another customer.')
    }

    const consents = await this.d.gateway.consents(cif)
    const matched =
      consents.find((c) => c.consentHandle === consentHandle) ??
      // The sandbox's 591 does not always echo the handle it was asked about, so an active
      // consent for this customer is accepted as the answer when there is exactly one.
      (consents.length === 1 ? consents[0] : undefined)

    if (matched === undefined) {
      this.d.log.info({ cif, consentHandle }, 'the bank reports no consent for this handle yet')
      return present(record)
    }

    const active = (matched.status ?? '').toUpperCase() === 'ACTIVE'
    return present(
      await this.d.store.update(consentHandle, {
        status: active ? 'ACTIVE' : 'CLOSED',
        consentId: matched.consentId,
        ...(matched.createdAt === null ? {} : { validFrom: matched.createdAt }),
      }),
    )
  }

  /** Every request raised for a customer, newest first. */
  async list(cif: string): Promise<ConsentRequestResponse[]> {
    return (await this.d.store.forCustomer(cif)).map(present)
  }
}
