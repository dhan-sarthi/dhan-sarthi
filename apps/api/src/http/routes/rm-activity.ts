/**
 * Owned by the activity builder.
 *
 * The routes behind the journey, the record, notes, handoffs, reveals, refusals and the access
 * log, registered against `RmActivityService`. Each `:cif` route is checked against the caller's
 * book here, before the service is called, so a service method can assume the customer is the
 * caller's; `rmUpdateHandoff` names no cif, so its service method checks the handoff's customer.
 */
import { routeById } from '@dhan/contracts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

export function rmActivityRoutes(r: Registrar, s: AppServices): void {
  r(routeById('rmJourney'), async ({ rm, params }) => {
    await s.rmScope.assertInBook(rm, params.cif)
    return s.rmActivity.journey(rm, params.cif)
  })

  r(routeById('rmCustomerRecord'), async ({ rm, params }) => {
    await s.rmScope.assertInBook(rm, params.cif)
    return s.rmActivity.customerRecord(rm, params.cif)
  })

  r(routeById('rmVerifyCustomerRecord'), async ({ rm, params }) => {
    await s.rmScope.assertInBook(rm, params.cif)
    return s.rmActivity.verifyCustomerRecord(rm, params.cif)
  })

  r(routeById('rmAddNote'), async ({ rm, params, body }) => {
    await s.rmScope.assertInBook(rm, params.cif)
    return s.rmActivity.addNote(rm, params.cif, body)
  })

  r(routeById('rmUpdateHandoff'), async ({ rm, params, body }) =>
    s.rmActivity.updateHandoff(rm, params.handoffId, body),
  )

  r(routeById('rmReveal'), async ({ rm, params, body }) => {
    await s.rmScope.assertInBook(rm, params.cif)
    return s.rmActivity.reveal(rm, params.cif, body)
  })

  r(routeById('rmRefusals'), async ({ rm }) => s.rmActivity.refusals(rm))

  r(routeById('rmVerifyBook'), async ({ rm }) => s.rmActivity.verifyBook(rm))

  r(routeById('rmAccessLog'), async ({ rm }) => s.rmActivity.accessLog(rm))
}
