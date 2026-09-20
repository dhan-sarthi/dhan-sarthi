/**
 * The Account Aggregator consent flow's routes, and the two webhooks IDBI calls on us.
 *
 * The four session routes drive the flow. The two webhook routes are the app's only
 * unauthenticated writes, and they are deliberately inert: each one appends what arrived to a
 * consent record and answers `{"message":"Success"}`, which is what IDBI's own 497 and 498
 * answer and therefore what their caller expects. No bank call is made from a webhook, no scope
 * is granted, and a consent cannot become active down this path — `verify` asks 591, and 591's
 * answer is the only one that counts.
 *
 * That matters because the bank has no session and cannot be given one, so anyone on the
 * internet can post here. The worst they can achieve is a spurious event in an audit trail that
 * records where it came from.
 */
import { routeById } from '@dhan/contracts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function consentAaRoutes(r: Registrar, s: AppServices): void {
  r(routeById('listConsentRequests'), async ({ session }) => s.aaConsent.list(session.cif))

  r(routeById('startConsentRequest'), async ({ session }) => s.aaConsent.start(session.cif))

  r(routeById('verifyConsentRequest'), async ({ session, params }) =>
    s.aaConsent.verify(session.cif, params.consentHandle),
  )

  r(routeById('returnFromConsent'), async ({ session, body }) =>
    s.aaConsent.returned(session.cif, body),
  )

  /* The inbound pair ------------------------------------------------- */

  r(routeById('consentNotification'), async ({ body }) => {
    await s.aaConsent.notified({
      consentHandle: body.consentHandle,
      eventType: body.eventType,
      eventStatus: body.eventStatus,
      ...(body.eventMessage === undefined ? {} : { eventMessage: body.eventMessage }),
      ...(body.consentId === undefined ? {} : { consentId: body.consentId }),
      raw: body,
    })
    // IDBI's own 497 answers exactly this, so their caller gets what it is written against.
    return { message: 'Success' }
  })

  r(routeById('dataNotification'), async ({ body }) => {
    await s.aaConsent.notified({
      consentHandle: body.consentHandle,
      eventType: body.eventType,
      eventStatus: body.eventStatus,
      ...(body.eventMessage === undefined ? {} : { eventMessage: body.eventMessage }),
      ...(body.consentId === undefined ? {} : { consentId: body.consentId }),
      ...(body.sessionId === undefined ? {} : { sessionId: body.sessionId }),
      linkRefNumbers: (body.linkRefNumbers ?? []).map((l) => l.linkRefNumber),
      raw: body,
    })
    return { message: 'Success' }
  })
}
